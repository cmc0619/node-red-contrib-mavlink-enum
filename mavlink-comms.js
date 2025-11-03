module.exports = function(RED) {
  const fs = require("fs");
  const path = require("path");
  const https = require("https");
  const { SerialPort } = require("serialport");
  const dgram = require("dgram");
  const net = require("net");
  const { execSync } = require("child_process");
  const xml2js = require("xml2js");
  const mavlinkLib = require("node-mavlink");
  const {
    MavLinkProtocolV1,
    MavLinkProtocolV2,
    minimal,
    common,
    ardupilotmega,
    uavionix,
    icarous,
    asluav,
    development,
    ualberta,
    storm32,
  } = mavlinkLib;

  function mergeRegistries(...registries) {
    return registries
      .filter(Boolean)
      .reduce((acc, registry) => Object.assign(acc, registry), {});
  }

  const DIALECT_REGISTRY_BUILDERS = {
    minimal: () => mergeRegistries(minimal.REGISTRY),
    common: () => mergeRegistries(minimal.REGISTRY, common.REGISTRY),
    ardupilotmega: () => mergeRegistries(minimal.REGISTRY, common.REGISTRY, ardupilotmega.REGISTRY),
    uavionix: () => mergeRegistries(minimal.REGISTRY, common.REGISTRY, uavionix.REGISTRY),
    icarous: () => mergeRegistries(minimal.REGISTRY, common.REGISTRY, icarous.REGISTRY),
    asluav: () => mergeRegistries(
      minimal.REGISTRY,
      common.REGISTRY,
      asluav.REGISTRY || (asluav.ASLUAV ? asluav.ASLUAV.REGISTRY : null)
    ),
    development: () => mergeRegistries(minimal.REGISTRY, common.REGISTRY, development.REGISTRY),
    ualberta: () => mergeRegistries(minimal.REGISTRY, common.REGISTRY, ualberta.REGISTRY),
    storm32: () => mergeRegistries(minimal.REGISTRY, common.REGISTRY, storm32.REGISTRY),
  };

  const registryCache = {};
  function getRegistryForDialect(dialect) {
    if (!registryCache[dialect]) {
      const builder = DIALECT_REGISTRY_BUILDERS[dialect] || DIALECT_REGISTRY_BUILDERS.common;
      registryCache[dialect] = builder();
    }
    return registryCache[dialect];
  }

  // Global storage for XML definitions and generated classes
  const XML_DIR = path.join(RED.settings.userDir, "mavlink-xmls");
  const GENERATED_DIR = path.join(RED.settings.userDir, "mavlink-generated");

  // Ensure directories exist
  if (!fs.existsSync(XML_DIR)) fs.mkdirSync(XML_DIR, { recursive: true });
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });

  // Auto-download XMLs on first run (if directory is empty)
  const xmlFiles = fs.readdirSync(XML_DIR).filter(f => f.endsWith('.xml'));
  if (xmlFiles.length === 0) {
    RED.log.info("MAVLink: No dialect XMLs found, downloading from GitHub...");
    updateXMLs().then(result => {
      if (result.ok) {
        RED.log.info(`MAVLink: Downloaded ${result.count} dialect(s)`);
      } else {
        RED.log.warn(`MAVLink: Failed to auto-download XMLs: ${result.error}`);
      }
    }).catch(err => {
      RED.log.warn(`MAVLink: Auto-download error: ${err.message}`);
    });
  }

  // Download XML file from GitHub
  function downloadXML(url, outputPath) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // Follow redirect
          const redirectUrl = res.headers.location;
          if (!redirectUrl) {
            return reject(new Error("Redirect without location header"));
          }
          return downloadXML(redirectUrl, outputPath).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const file = fs.createWriteStream(outputPath);
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      }).on("error", reject);
    });
  }

  // Get list of available dialect XMLs from GitHub
  async function fetchDialectList() {
    const baseURL = "https://api.github.com/repos/ArduPilot/mavlink/contents/message_definitions/v1.0";
    return new Promise((resolve, reject) => {
      https.get(baseURL, {
        headers: { "User-Agent": "node-red-contrib-mavlink" }
      }, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const files = JSON.parse(data);
            const xmlFiles = files
              .filter(f => f.name.endsWith(".xml"))
              .map(f => ({ name: f.name, url: f.download_url }));
            resolve(xmlFiles);
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", reject);
    });
  }

  // Download and store XML with versioning
  async function updateXMLs() {
    try {
      const dialects = await fetchDialectList();
      const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");

      for (const dialect of dialects) {
        const filename = dialect.name.replace(".xml", `_${dateStr}.xml`);
        const filepath = path.join(XML_DIR, filename);

        // Check if already exists
        if (fs.existsSync(filepath)) continue;

        // Download
        await downloadXML(dialect.url, filepath);

        // Also keep a "latest" copy without date
        const latestPath = path.join(XML_DIR, dialect.name);
        fs.copyFileSync(filepath, latestPath);
      }

      return { ok: true, count: dialects.length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // List available XMLs in storage
  function listXMLs() {
    const files = fs.readdirSync(XML_DIR).filter(f => f.endsWith(".xml"));
    const dialectMap = new Map();

    files.forEach(file => {
      const match = file.match(/^(.+?)(?:_(\d{8}))?\.xml$/);
      if (match) {
        const name = match[1];
        const date = match[2] || "latest";
        if (!dialectMap.has(name)) dialectMap.set(name, []);
        dialectMap.get(name).push({ file, date });
      }
    });

    return Array.from(dialectMap.entries()).map(([name, versions]) => ({
      name,
      versions: versions.sort((a, b) => b.date.localeCompare(a.date))
    }));
  }

  // Parse XML to extract enum and message definitions
  async function parseXMLDefinitions(xmlPath) {
    const xml = await fs.promises.readFile(xmlPath, "utf8");
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xml);

    const enums = {};
    const messages = {};

    // Extract enums
    if (result.mavlink?.enums?.[0]?.enum) {
      result.mavlink.enums[0].enum.forEach(e => {
        const enumName = e.$.name;
        enums[enumName] = (e.entry || []).map(entry => ({
          name: entry.$.name,
          value: entry.$.value || "0",  // Keep as string to preserve hex/bitshift expressions
          description: entry.description?.[0] || ""
        }));
      });
    }

    // Extract messages
    if (result.mavlink?.messages?.[0]?.message) {
      result.mavlink.messages[0].message.forEach(m => {
        const msgName = m.$.name;
        messages[msgName] = {
          id: parseInt(m.$.id, 10),
          description: m.description?.[0] || "",
          fields: (m.field || []).map(f => ({
            name: f.$.name,
            type: f.$.type,
            enum: f.$.enum || null,
            description: f._ || ""
          }))
        };
      });
    }

    return { enums, messages };
  }

  // Generate TypeScript definitions using mavgen
  function generateDefinitions(xmlPath, outputDir) {
    try {
      // Check if node-mavlink's mavgen is available
      const mavgenPath = path.join(__dirname, "node_modules", "node-mavlink", "cli.js");

      if (!fs.existsSync(mavgenPath)) {
        // Try global node-mavlink
        execSync(`npx mavgen --lang=TypeScript --output=${outputDir} ${xmlPath}`, {
          stdio: "inherit",
          cwd: __dirname
        });
      } else {
        execSync(`node ${mavgenPath} generate --lang=TypeScript --output=${outputDir} ${xmlPath}`, {
          stdio: "inherit"
        });
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // Admin endpoints
  RED.httpAdmin.get("/mavlink-comms/dialects", async (req, res) => {
    try {
      const dialects = listXMLs();
      res.json({ ok: true, dialects });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  RED.httpAdmin.post("/mavlink-comms/update-xmls", async (req, res) => {
    try {
      const result = await updateXMLs();
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  RED.httpAdmin.get("/mavlink-comms/definitions", async (req, res) => {
    try {
      const dialect = req.query.dialect;
      const xmlPath = path.join(XML_DIR, `${dialect}.xml`);

      if (!fs.existsSync(xmlPath)) {
        return res.status(404).json({ ok: false, error: "Dialect not found" });
      }

      const defs = await parseXMLDefinitions(xmlPath);
      res.json({ ok: true, ...defs });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  RED.httpAdmin.delete("/mavlink-comms/xml/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const filepath = path.join(XML_DIR, filename);

      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        res.json({ ok: true });
      } else {
        res.status(404).json({ ok: false, error: "File not found" });
      }
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  function MavlinkCommsNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    // Two outputs:
    //  [0] RAW MAVLink frames (Buffer)
    //  [1] STATUS events (JSON), e.g. { event: 'HEARTBEAT_SEEN', ts: <epoch_ms> }
    node.outputs = 2;

    node.connectionType = config.connectionType || "udp"; // udp, tcp, serial
    node.host = config.host || "127.0.0.1";
    node.port = config.port || 14550;
    node.serialPort = config.serialPort || "";
    node.baudRate = config.baudRate || 115200;
    node.dialect = config.dialect || "common";
    node.mavlinkVersion = config.mavlinkVersion || "2.0";

    const sysId = Number.isInteger(Number(config.systemId))
      ? Number(config.systemId)
      : 1;
    const compId = Number.isInteger(Number(config.componentId))
      ? Number(config.componentId)
      : 190;

    let connection = null;
    let heartbeatTimer = null;
    let activeRegistry = null;
    let sequence = 0;
    let lastHeartbeatTs = 0;

    function nextSequence() {
      const current = sequence;
      sequence = (sequence + 1) & 0xff;
      return current;
    }

    function buildProtocol(targetSysId, targetCompId) {
      if (node.mavlinkVersion === "2.0") {
        return new MavLinkProtocolV2(targetSysId, targetCompId);
      }
      return new MavLinkProtocolV1(targetSysId, targetCompId);
    }

    function transmitBuffer(buffer, targetHost, targetPort) {
      if (!connection || !buffer) {
        return;
      }

      const output = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

      if (node.connectionType === "serial" || node.connectionType === "tcp") {
        try {
          connection.write(output);
        } catch (writeErr) {
          node.error(`Write error: ${writeErr.message}`);
        }
      } else if (node.connectionType === "udp") {
        const host = targetHost || node.host;
        const port = targetPort || node.port;
        connection.send(output, port, host, (err) => {
          if (err) {
            node.error(`UDP send error: ${err.message}`);
          }
        });
      }
    }

    // Prepare registry and cached definitions for the configured dialect
    async function prepareDialect() {
      try {
        const xmlPath = path.join(XML_DIR, `${node.dialect}.xml`);

        if (!fs.existsSync(xmlPath)) {
          throw new Error(`Dialect XML not found: ${node.dialect}.xml`);
        }

        const defs = await parseXMLDefinitions(xmlPath);
        node.context().global.set(`mavlink_defs_${node.id}`, defs);

        activeRegistry = getRegistryForDialect(node.dialect);
        sequence = 0;
        return true;
      } catch (err) {
        node.error(`Dialect preparation failed: ${err.message}`);
        node.status({ fill: "red", shape: "dot", text: "dialect error" });
        return false;
      }
    }

    // Minimal frame sniffer to detect HEARTBEAT (msg id 0) without full decode
    function isHeartbeat(buffer) {
      if (!Buffer.isBuffer(buffer)) {
        return false;
      }

      for (let i = 0; i < buffer.length; i++) {
        const stx = buffer[i];

        if (stx === 0xFD && i + 10 < buffer.length) { // MAVLink v2
          const msgId = buffer[i + 7] | (buffer[i + 8] << 8) | (buffer[i + 9] << 16);
          if (msgId === 0) {
            return true;
          }

          const payloadLength = buffer[i + 1];
          i += 10 + payloadLength;
        } else if (stx === 0xFE && i + 6 < buffer.length) { // MAVLink v1
          const msgId = buffer[i + 5];
          if (msgId === 0) {
            return true;
          }

          const payloadLength = buffer[i + 1];
          i += 6 + payloadLength;
        }
      }

      return false;
    }

    function emitRawBuffer(buffer, meta) {
      const heartbeatDetected = isHeartbeat(buffer);

      if (heartbeatDetected) {
        lastHeartbeatTs = Date.now();
      }

      node.context().flow.set("mavlink_last_raw", {
        ts: Date.now(),
        length: Buffer.isBuffer(buffer) ? buffer.length : 0,
        meta,
      });

      node.send([
        { payload: buffer, topic: "RAW", meta },
        heartbeatDetected
          ? { payload: { event: "HEARTBEAT_SEEN", ts: lastHeartbeatTs, meta } }
          : null,
      ]);
    }

    // Send heartbeat and check for outgoing messages
    function sendHeartbeat() {
      try {
        // Get pending outgoing message from context
        const outgoing = node.context().flow.get("mavlink_outgoing");

        if (outgoing && outgoing.messageId !== undefined && outgoing.payload) {
          try {
            const targetDialect = outgoing.dialect || node.dialect;
            const registryForMessage = getRegistryForDialect(targetDialect);
            const messageClass = registryForMessage[outgoing.messageId];

            if (!messageClass) {
              node.warn(`Outgoing message id ${outgoing.messageId} not found for dialect ${targetDialect}`);
            } else {
              const messageInstance = new messageClass();

              if (Array.isArray(messageClass.FIELDS)) {
                messageClass.FIELDS.forEach((field) => {
                  const sourceName = field.source;
                  if (Object.prototype.hasOwnProperty.call(outgoing.payload, sourceName)) {
                    messageInstance[field.name] = outgoing.payload[sourceName];
                  }
                });
              }

              const targetSysId = Number.isInteger(outgoing.systemId) ? outgoing.systemId : sysId;
              const targetCompId = Number.isInteger(outgoing.componentId) ? outgoing.componentId : compId;
              const protocol = buildProtocol(targetSysId, targetCompId);
              const buffer = protocol.serialize(messageInstance, nextSequence());
              transmitBuffer(buffer, outgoing.host, outgoing.port);
            }
          } catch (sendErr) {
            node.warn(`Failed to serialize outgoing MAVLink message: ${sendErr.message}`);
          } finally {
            node.context().flow.set("mavlink_outgoing", null);
          }
        }

        // Send HEARTBEAT message (MAVLink protocol requirement)
        if (config.sendHeartbeat !== false) {
          try {
            const heartbeat = new minimal.Heartbeat();
            heartbeat.type = 6;              // MAV_TYPE_GCS
            heartbeat.autopilot = 0;         // MAV_AUTOPILOT_GENERIC
            heartbeat.baseMode = 0;          // No specific mode
            heartbeat.customMode = 0;        // No custom mode
            heartbeat.systemStatus = 4;      // MAV_STATE_ACTIVE
            heartbeat.mavlinkVersion = 3;    // MAVLink v2 indicator

            const heartbeatProtocol = buildProtocol(sysId, compId);
            const buffer = heartbeatProtocol.serialize(heartbeat, nextSequence());
            transmitBuffer(buffer);
          } catch (hbErr) {
            node.warn(`HEARTBEAT creation failed: ${hbErr.message}`);
          }
        }

      } catch (err) {
        node.warn(`Heartbeat timer error: ${err.message}`);
      }
    }

    // Setup connection
    async function connect() {
      const dialectReady = await prepareDialect();
      if (!dialectReady) return;

      try {
        if (node.connectionType === "serial") {
          connection = new SerialPort({
            path: node.serialPort,
            baudRate: parseInt(node.baudRate, 10)
          });

          connection.on("data", (buf) => {
            emitRawBuffer(buf, { from: "serial", port: node.serialPort });
          });
          connection.on("error", (err) => {
            node.error(`Serial error: ${err.message}`);
            node.status({ fill: "red", shape: "dot", text: "serial error" });
          });

          node.status({ fill: "green", shape: "dot", text: `serial: ${node.serialPort}` });

        } else if (node.connectionType === "udp") {
          connection = dgram.createSocket("udp4");

          connection.on("message", (msg, rinfo) => {
            emitRawBuffer(msg, { from: "udp", rinfo });
          });

          connection.on("error", (err) => {
            node.error(`UDP error: ${err.message}`);
            node.status({ fill: "red", shape: "dot", text: "udp error" });
          });

          // Use bind callback to ensure port is actually bound before showing success
          node.status({ fill: "yellow", shape: "ring", text: "binding..." });
          connection.bind(node.port, () => {
            node.status({ fill: "green", shape: "dot", text: `udp: ${node.host}:${node.port}` });
          });

        } else if (node.connectionType === "tcp") {
          connection = new net.Socket();

          node.status({ fill: "yellow", shape: "ring", text: "connecting..." });

          connection.connect(node.port, node.host, () => {
            node.status({ fill: "green", shape: "dot", text: `tcp: ${node.host}:${node.port}` });
          });

          connection.on("data", (buf) => {
            emitRawBuffer(buf, { from: "tcp", host: node.host, port: node.port });
          });

          connection.on("error", (err) => {
            node.error(`TCP error: ${err.message}`);
            node.status({ fill: "red", shape: "dot", text: "tcp error" });
          });

          connection.on("close", () => {
            node.status({ fill: "red", shape: "ring", text: "disconnected" });
          });
        }

        // Start heartbeat/outgoing message checker (1Hz)
        const hbInterval = Number.isFinite(Number(config.heartbeatMs))
          ? Number(config.heartbeatMs)
          : 1000;
        heartbeatTimer = setInterval(sendHeartbeat, hbInterval > 0 ? hbInterval : 1000);

      } catch (err) {
        node.error(`Connection failed: ${err.message}`);
        node.status({ fill: "red", shape: "dot", text: "connection error" });
      }
    }

    // Cleanup
    node.on("close", (done) => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      activeRegistry = null;
      sequence = 0;

      if (connection) {
        if (node.connectionType === "serial") {
          // Check if connection has close method before checking isOpen
          if (typeof connection.close === "function") {
            connection.close(() => {
              connection = null;
              done();
            });
          } else {
            connection = null;
            done();
          }
        } else if (node.connectionType === "udp") {
          connection.close(() => {
            connection = null;
            done();
          });
        } else if (node.connectionType === "tcp") {
          connection.destroy();
          connection = null;
          done();
        } else {
          connection = null;
          done();
        }
      } else {
        done();
      }
    });

    // Start connection
    connect();
  }

  RED.nodes.registerType("mavlink-comms", MavlinkCommsNode);
};
