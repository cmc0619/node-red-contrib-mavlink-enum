module.exports = function(RED) {
  const fs = require("fs");
  const path = require("path");
  const xml2js = require("xml2js");

  const XML_DIR = path.join(RED.settings.userDir, "mavlink-xmls");

  // Cache for parsed XML definitions (keyed by dialect name)
  const definitionsCache = {};

  // Parse XML to get message and enum definitions (with caching)
  async function parseXMLDefinitions(xmlPath) {
    // Check cache first
    const cacheKey = path.basename(xmlPath);
    if (definitionsCache[cacheKey]) {
      return definitionsCache[cacheKey];
    }
    const xml = await fs.promises.readFile(xmlPath, "utf8");
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
              index: parseInt(p.$.index || "0", 10),
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
            value: entry.$.value || "0",  // Keep as string to preserve hex/bitshift expressions
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
          id: parseInt(m.$.id, 10),
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

    const defs = { enums, messages };

    // Store in cache
    definitionsCache[cacheKey] = defs;

    return defs;
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

  RED.httpAdmin.get("/mavlink-msg/dialects", async (req, res) => {
    try {
      const files = await fs.promises.readdir(XML_DIR);
      const dialects = files
        .filter(f => f.endsWith(".xml") && !f.includes("_"))
        .map(f => f.replace(".xml", ""));
      res.json({ ok: true, dialects });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Load node-mavlink and build registry map once at module level
  const mavlinkMappings = require("node-mavlink");
  const { minimal, common, ardupilotmega, uavionix, icarous, asluav, development, ualberta, storm32 } = mavlinkMappings;

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

  // Use Object.create(null) to prevent prototype pollution
  const registryCache = Object.create(null);
  function getRegistry(dialect) {
    if (!registryCache[dialect]) {
      const builder = DIALECT_REGISTRY_BUILDERS[dialect] || DIALECT_REGISTRY_BUILDERS.common;
      registryCache[dialect] = builder();
    }
    return registryCache[dialect];
  }

  function MavlinkMsgNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.dialect = config.dialect || "common";
    node.messageType = config.messageType || "";
    node.fields = config.fields || {};
    node.systemId = parseInt(config.systemId || "1", 10);
    node.componentId = parseInt(config.componentId || "1", 10);

    node.on("input", async (msg, send, done) => {
      try {
        // Detect mode
        const isParseMode = msg.topic && typeof msg.topic === "string" && msg.topic.match(/^[A-Z_]+$/);
        const isDynamicMode = !isParseMode && msg.payload && typeof msg.payload.messageType === "string";
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
              const parsed = parseInt(value, 10);
              payload[field.name] = isNaN(parsed) ? 0 : parsed;
            } else if (field.type === "float" || field.type === "double") {
              const parsed = parseFloat(value);
              payload[field.name] = isNaN(parsed) ? 0.0 : parsed;
            } else if (field.type.includes("char[")) {
              payload[field.name] = String(value);
            } else if (field.type.includes("[")) {
              // Array type
              if (Array.isArray(value)) {
                payload[field.name] = value;
              } else if (typeof value === "string") {
                payload[field.name] = value.split(",").map(v => v.trim());
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

        const registry = getRegistry(node.dialect);

        // Find message class in registry
        const messageClass = registry[msgDef.id];

        if (!messageClass) {
          const supportedDialects = Object.keys(DIALECT_REGISTRY_BUILDERS).join(', ');
          throw new Error(`Message ${messageType} (id=${msgDef.id}) not found in ${node.dialect} registry. Supported dialects: ${supportedDialects}`);
        }

        const message = new messageClass();

        if (Array.isArray(messageClass.FIELDS)) {
          messageClass.FIELDS.forEach(field => {
            const sourceName = field.source;
            if (Object.prototype.hasOwnProperty.call(payload, sourceName)) {
              message[field.name] = payload[sourceName];
            }
          });
        }

        node.context().flow.set("mavlink_outgoing", {
          message: messageType,
          messageId: msgDef.id,
          payload,
          dialect: node.dialect,
          systemId: node.systemId,
          componentId: node.componentId,
          timestamp: Date.now(),
        });

        // Also output the message data for debugging/logging
        send({
          payload: {
            message: messageType,
            messageId: msgDef.id,
            fields: payload,
            systemId: node.systemId,
            componentId: node.componentId,
            mavlink: message
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
