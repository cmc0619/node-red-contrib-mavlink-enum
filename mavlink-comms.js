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
    MavLinkPacketSplitter,
    MavLinkPacketParser,
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

    node.connectionType = config.connectionType || "udp"; // udp, tcp, serial
    node.host = config.host || "127.0.0.1";
    node.port = config.port || 14550;
    node.serialPort = config.serialPort || "";
    node.baudRate = config.baudRate || 115200;
    node.dialect = config.dialect || "common";
    node.mavlinkVersion = config.mavlinkVersion || "2.0";
    node.filterHeartbeat = config.filterHeartbeat || false;

    let connection = null;
    let heartbeatTimer = null;
    let splitter = null;
    let parser = null;
    let activeRegistry = null;
    let sequence = 0;

    function nextSequence() {
      const current = sequence;
      sequence = (sequence + 1) & 0xff;
      return current;
    }

    function buildProtocol(sysId, compId) {
      if (node.mavlinkVersion === "2.0") {
        return new MavLinkProtocolV2(sysId, compId);
      }
      return new MavLinkProtocolV1(sysId, compId);
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

    // Load MAVLink parser for selected dialect
    async function initParser() {
      try {
        const xmlPath = path.join(XML_DIR, `${node.dialect}.xml`);

        if (!fs.existsSync(xmlPath)) {
          throw new Error(`Dialect XML not found: ${node.dialect}.xml`);
        }

        // Parse definitions for UI
        const defs = await parseXMLDefinitions(xmlPath);
        node.context().global.set(`mavlink_defs_${node.id}`, defs);

        activeRegistry = getRegistryForDialect(node.dialect);
        sequence = 0;

        if (splitter && parser) {
          splitter.unpipe(parser);
        }

        if (splitter) {
          splitter.removeAllListeners();
        }

        if (parser) {
          parser.removeAllListeners();
        }

        splitter = new MavLinkPacketSplitter();
        parser = new MavLinkPacketParser();

        splitter.on("error", (err) => {
          node.warn(`Splitter error: ${err.message}`);
        });

        parser.on("error", (err) => {
          node.warn(`Parser error: ${err.message}`);
        });

        splitter.pipe(parser);

        parser.on("data", (packet) => {
          try {
            if (!activeRegistry) {
              return;
            }

            const messageClass = activeRegistry[packet.header.msgid];

            if (!messageClass) {
              node.debug(`Unhandled MAVLink message id ${packet.header.msgid} for dialect ${node.dialect}`);
              return;
            }

            const message = packet.protocol.data(packet.payload, messageClass);
            const topic = messageClass.MSG_NAME || `MSG_${packet.header.msgid}`;
            const headerInfo = {
              systemId: packet.header.sysid,
              componentId: packet.header.compid,
              sequence: packet.header.seq,
              messageId: packet.header.msgid,
              timestamp: packet.header.timestamp,
              protocol: packet.protocol.constructor.NAME || "unknown",
            };

            node.context().flow.set("mavlink_last_received", {
              name: topic,
              id: packet.header.msgid,
              systemId: headerInfo.systemId,
              componentId: headerInfo.componentId,
              payload: message,
              header: headerInfo,
            });

            // Filter HEARTBEAT messages if configured
            if (node.filterHeartbeat && packet.header.msgid === 0) {
              // Still store in context, just don't output to flow
              return;
            }

            node.send({
              payload: message,
              topic,
              header: headerInfo,
            });
          } catch (e) {
            node.warn(`Parse error: ${e.message}`);
          }
        });

        node.status({ fill: "green", shape: "dot", text: `ready (${node.dialect})` });
        return true;
      } catch (err) {
        node.error(`Parser init failed: ${err.message}`);
        node.status({ fill: "red", shape: "dot", text: "parser error" });
        return false;
      }
    }

    // Handle incoming MAVLink data
    function handleIncomingData(buffer) {
      try {
        if (!parser || !splitter) return;

        // Reuse the single splitter instance created in initParser
        splitter.write(buffer);
      } catch (err) {
        node.warn(`Data handling error: ${err.message}`);
      }
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

              const sysId = Number.isInteger(outgoing.systemId) ? outgoing.systemId : 255;
              const compId = Number.isInteger(outgoing.componentId) ? outgoing.componentId : 190;
              const protocol = buildProtocol(sysId, compId);
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
        try {
          const heartbeat = new minimal.Heartbeat();
          heartbeat.type = 6;              // MAV_TYPE_GCS
          heartbeat.autopilot = 0;         // MAV_AUTOPILOT_GENERIC
          heartbeat.baseMode = 0;          // No specific mode
          heartbeat.customMode = 0;        // No custom mode
          heartbeat.systemStatus = 4;      // MAV_STATE_ACTIVE
          heartbeat.mavlinkVersion = 3;    // MAVLink v2 indicator

          const heartbeatProtocol = buildProtocol(255, 190);
          const buffer = heartbeatProtocol.serialize(heartbeat, nextSequence());
          transmitBuffer(buffer);
        } catch (hbErr) {
          node.warn(`HEARTBEAT creation failed: ${hbErr.message}`);
        }

      } catch (err) {
        node.warn(`Heartbeat timer error: ${err.message}`);
      }
    }

    // Setup connection
    async function connect() {
      const parserReady = await initParser();
      if (!parserReady) return;

      try {
        if (node.connectionType === "serial") {
          connection = new SerialPort({
            path: node.serialPort,
            baudRate: parseInt(node.baudRate, 10)
          });

          connection.on("data", handleIncomingData);
          connection.on("error", (err) => {
            node.error(`Serial error: ${err.message}`);
            node.status({ fill: "red", shape: "dot", text: "serial error" });
          });

          node.status({ fill: "green", shape: "dot", text: `serial: ${node.serialPort}` });

        } else if (node.connectionType === "udp") {
          connection = dgram.createSocket("udp4");

          connection.on("message", (msg) => {
            handleIncomingData(msg);
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

          connection.on("data", handleIncomingData);

          connection.on("error", (err) => {
            node.error(`TCP error: ${err.message}`);
            node.status({ fill: "red", shape: "dot", text: "tcp error" });
          });

          connection.on("close", () => {
            node.status({ fill: "red", shape: "ring", text: "disconnected" });
          });
        }

        // Start heartbeat/outgoing message checker (1Hz)
        heartbeatTimer = setInterval(sendHeartbeat, 1000);

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

      if (splitter && parser) {
        splitter.unpipe(parser);
      }

      if (splitter) {
        splitter.removeAllListeners();
        splitter = null;
      }

      if (parser) {
        parser.removeAllListeners();
        parser = null;
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
