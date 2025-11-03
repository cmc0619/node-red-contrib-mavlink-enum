module.exports = function(RED) {
  const fs = require("fs");
  const path = require("path");
  const https = require("https");
  const { SerialPort } = require("serialport");
  const dgram = require("dgram");
  const net = require("net");
  const { execSync } = require("child_process");
  const xml2js = require("xml2js");
  const { common: mavlinkCommon } = require("node-mavlink");

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

    let connection = null;
    let heartbeatTimer = null;
    let parser = null;
    let splitter = null;

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

        // Load dialect-specific registry
        const mavlinkMappings = require("node-mavlink");
        const { MavLinkPacketSplitter, MavLinkPacketParser, minimal, common, ardupilotmega, uavionix, icarous, asluav, development, ualberta, storm32 } = mavlinkMappings;

        // Build registry map for all supported dialects
        const dialectRegistries = {
          'minimal': minimal.REGISTRY,
          'common': common.REGISTRY,
          'ardupilotmega': ardupilotmega.REGISTRY,
          'uavionix': uavionix.REGISTRY,
          'icarous': icarous.REGISTRY,
          'asluav': asluav.REGISTRY || asluav.ASLUAV?.REGISTRY,
          'development': development.REGISTRY,
          'ualberta': ualberta.REGISTRY,
          'storm32': storm32.REGISTRY,
        };

        const registry = dialectRegistries[node.dialect] || common.REGISTRY;

        parser = new MavLinkPacketParser(registry, node.mavlinkVersion === "2.0" ? 2 : 1);

        // Create single packet splitter instance and set up event listener once
        splitter = new MavLinkPacketSplitter();
        splitter.on("data", (packet) => {
          try {
            const message = parser.parse(packet);

            // Publish to internal bus
            node.context().flow.set("mavlink_last_received", {
              name: message.name,
              type: message.type,
              systemId: message.header.systemId,
              componentId: message.header.componentId,
              payload: message
            });

            // Output to Node-RED flow
            node.send({
              payload: message,
              topic: message.name
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

        if (outgoing && Array.isArray(outgoing.bytes)) {
          // Send the message
          if (connection) {
            if (node.connectionType === "serial") {
              connection.write(Buffer.from(outgoing.bytes));
            } else if (node.connectionType === "udp") {
              connection.send(Buffer.from(outgoing.bytes), node.port, node.host);
            } else if (node.connectionType === "tcp") {
              connection.write(Buffer.from(outgoing.bytes));
            }
          }

          // Clear from context
          node.context().flow.set("mavlink_outgoing", null);
        }

        // Send HEARTBEAT message (MAVLink protocol requirement)
        try {
          // Create HEARTBEAT message (using cached mavlinkCommon from module level)
          // System ID 255 = Ground Control Station
          // Component ID 190 = Generic companion computer
          const heartbeat = new mavlinkCommon.HeartbeatMessage(
            255,  // system_id (GCS)
            190   // component_id (companion computer)
          );

          // Configure heartbeat fields
          heartbeat.type = 6;              // MAV_TYPE_GCS
          heartbeat.autopilot = 0;         // MAV_AUTOPILOT_GENERIC
          heartbeat.baseMode = 0;          // No specific mode
          heartbeat.customMode = 0;        // No custom mode
          heartbeat.systemStatus = 4;      // MAV_STATE_ACTIVE
          heartbeat.mavlinkVersion = 3;    // MAVLink v2

          // Serialize to bytes
          const bytes = heartbeat.serialize();

          // Send heartbeat
          if (connection) {
            if (node.connectionType === "serial") {
              connection.write(Buffer.from(bytes));
            } else if (node.connectionType === "udp") {
              connection.send(Buffer.from(bytes), node.port, node.host);
            } else if (node.connectionType === "tcp") {
              connection.write(Buffer.from(bytes));
            }
          }
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

      // Remove splitter event listeners to prevent leaks
      if (splitter) {
        splitter.removeAllListeners();
        splitter = null;
      }

      // Null out parser
      parser = null;

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
