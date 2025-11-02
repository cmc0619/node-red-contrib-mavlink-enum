module.exports = function(RED) {
  const fs = require("fs");
  const path = require("path");
  const xml2js = require("xml2js");

  const XML_DIR = path.join(RED.settings.userDir, "mavlink-xmls");

  // Parse XML to get message and enum definitions
  async function parseXMLDefinitions(xmlPath) {
    const xml = fs.readFileSync(xmlPath, "utf8");
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xml);

    const enums = {};
    const messages = {};

    // Extract enums
    if (result.mavlink?.enums?.[0]?.enum) {
      result.mavlink.enums[0].enum.forEach(e => {
        const enumName = e.$.name;
        enums[enumName] = (e.entry || []).map(entry => {
          // Parse param definitions for MAV_CMD entries
          const params = (entry.param || [])
            .map(p => ({
              index: parseInt(p.$.index || "0"),
              label: p.$.label || "",
              units: p.$.units || null,
              description: (p._ || "").trim()
            }))
            .filter(p => {
              // Filter out empty/unused params
              const desc = p.description.toLowerCase();
              return p.description && desc !== "empty" && desc !== "unused" && desc !== "reserved";
            });

          return {
            name: entry.$.name,
            value: parseInt(entry.$.value || "0"),
            description: entry.description?.[0] || "",
            params: params.length > 0 ? params : null  // Only include if params exist
          };
        });
      });
    }

    // Extract messages
    if (result.mavlink?.messages?.[0]?.message) {
      result.mavlink.messages[0].message.forEach(m => {
        const msgName = m.$.name;
        messages[msgName] = {
          id: parseInt(m.$.id),
          description: m.description?.[0] || "",
          fields: (m.field || []).map(f => ({
            name: f.$.name,
            type: f.$.type,
            enum: f.$.enum || null,
            units: f.$.units || null,
            description: f._ || ""
          }))
        };
      });
    }

    return { enums, messages };
  }

  // Admin endpoints
  RED.httpAdmin.get("/mavlink-msg/messages", async (req, res) => {
    try {
      const dialect = req.query.dialect || "common";
      const xmlPath = path.join(XML_DIR, `${dialect}.xml`);

      if (!fs.existsSync(xmlPath)) {
        return res.status(404).json({ ok: false, error: "Dialect not found" });
      }

      const { messages } = await parseXMLDefinitions(xmlPath);
      res.json({ ok: true, messages });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  RED.httpAdmin.get("/mavlink-msg/enums", async (req, res) => {
    try {
      const dialect = req.query.dialect || "common";
      const xmlPath = path.join(XML_DIR, `${dialect}.xml`);

      if (!fs.existsSync(xmlPath)) {
        return res.status(404).json({ ok: false, error: "Dialect not found" });
      }

      const { enums } = await parseXMLDefinitions(xmlPath);
      res.json({ ok: true, enums });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  RED.httpAdmin.get("/mavlink-msg/dialects", (req, res) => {
    try {
      const files = fs.readdirSync(XML_DIR)
        .filter(f => f.endsWith(".xml") && !f.includes("_"))
        .map(f => f.replace(".xml", ""));
      res.json({ ok: true, dialects: files });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  function MavlinkMsgNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.dialect = config.dialect || "common";
    node.messageType = config.messageType || "";
    node.fields = config.fields || {};
    node.systemId = parseInt(config.systemId || "1");
    node.componentId = parseInt(config.componentId || "1");

    node.on("input", async (msg, send, done) => {
      try {
        // Detect mode
        const isParseMode = msg.topic && typeof msg.topic === "string" && msg.topic.match(/^[A-Z_]+$/);
        const isDynamicMode = !isParseMode && msg.payload && msg.payload.messageType;
        const isStaticMode = !isParseMode && !isDynamicMode && node.messageType;

        // MODE 1: Parse incoming MAVLink message from comms
        if (isParseMode) {
          // Just pass through the parsed data, maybe add formatting later
          send({
            payload: msg.payload,
            topic: msg.topic,
            mavlink: msg.mavlink || msg.payload
          });
          node.status({ fill: "blue", shape: "dot", text: `parsed: ${msg.topic}` });
          done();
          return;
        }

        // For send modes, determine message type
        let messageType;
        let fieldValues = {};

        if (isDynamicMode) {
          // MODE 2: Dynamic send from msg.payload
          messageType = msg.payload.messageType;
          fieldValues = msg.payload;
        } else if (isStaticMode) {
          // MODE 3: Static send from config
          messageType = node.messageType;
          fieldValues = { ...node.fields };

          // Allow override from msg.payload
          if (msg.payload && typeof msg.payload === "object") {
            Object.assign(fieldValues, msg.payload);
          }
        } else {
          throw new Error("No message type configured or provided");
        }

        // Load message definition
        const xmlPath = path.join(XML_DIR, `${node.dialect}.xml`);
        if (!fs.existsSync(xmlPath)) {
          throw new Error(`Dialect not found: ${node.dialect}`);
        }

        const { messages, enums } = await parseXMLDefinitions(xmlPath);
        const msgDef = messages[messageType];

        if (!msgDef) {
          throw new Error(`Message type not found: ${messageType}`);
        }

        // Build message payload with type conversion
        const payload = {};

        msgDef.fields.forEach(field => {
          let value = fieldValues[field.name];

          // Type conversion
          if (value !== undefined && value !== null && value !== "") {
            if (field.type.includes("int") || field.type.includes("uint")) {
              payload[field.name] = parseInt(value);
            } else if (field.type === "float" || field.type === "double") {
              payload[field.name] = parseFloat(value);
            } else if (field.type.includes("char[")) {
              payload[field.name] = String(value);
            } else if (field.type.includes("[")) {
              // Array type
              if (Array.isArray(value)) {
                payload[field.name] = value;
              } else {
                payload[field.name] = String(value).split(",").map(v => v.trim());
              }
            } else {
              payload[field.name] = value;
            }
          } else {
            // Default values
            if (field.type.includes("int") || field.type.includes("uint")) {
              payload[field.name] = 0;
            } else if (field.type === "float" || field.type === "double") {
              payload[field.name] = 0.0;
            } else if (field.type.includes("char[")) {
              payload[field.name] = "";
            } else {
              payload[field.name] = 0;
            }
          }
        });

        // Use node-mavlink to encode the message - import all available dialects
        const mavlinkMappings = require("node-mavlink");
        const { minimal, common, ardupilotmega, uavionix, icarous, asluav, development, ualberta, storm32 } = mavlinkMappings;

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

        // Find message class in registry
        const messageClass = registry[msgDef.id];

        if (!messageClass) {
          const supportedDialects = Object.keys(dialectRegistries).join(', ');
          throw new Error(`Message ${messageType} (id=${msgDef.id}) not found in ${node.dialect} registry. Supported dialects: ${supportedDialects}`);
        }

        // Create message instance
        const message = new messageClass(
          node.systemId,
          node.componentId
        );

        // Set fields
        Object.keys(payload).forEach(key => {
          if (message[key] !== undefined) {
            message[key] = payload[key];
          }
        });

        // Serialize to bytes
        const bytes = message.serialize();

        // Publish to internal bus for mavlink-comms to send
        node.context().flow.set("mavlink_outgoing", {
          message: messageType,
          payload,
          bytes: Array.from(bytes)
        });

        // Also output the message data for debugging/logging
        send({
          payload: {
            message: messageType,
            fields: payload,
            systemId: node.systemId,
            componentId: node.componentId
          },
          topic: "mavlink_outgoing"
        });

        node.status({ fill: "green", shape: "dot", text: `sent: ${messageType}` });
        done();

      } catch (err) {
        node.status({ fill: "red", shape: "dot", text: err.message });
        done(err);
      }
    });
  }

  RED.nodes.registerType("mavlink-msg", MavlinkMsgNode);
};
