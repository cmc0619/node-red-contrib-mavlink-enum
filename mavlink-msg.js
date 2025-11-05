module.exports = function(RED) {
  const fs = require("fs");
  const path = require("path");
  const xml2js = require("xml2js");

  const XML_DIR = path.join(RED.settings.userDir, "mavlink-xmls");

  // Cache for parsed XML definitions (keyed by dialect name)
  const definitionsCache = Object.create(null);  // Prevent prototype pollution

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

    const enums = Object.create(null);  // Prevent prototype pollution
    const messages = Object.create(null);  // Prevent prototype pollution

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
      const xmlPath = path.resolve(XML_DIR, `${dialect}.xml`);
      if (!xmlPath.startsWith(path.resolve(XML_DIR) + path.sep)) {
        return res.status(400).json({ ok: false, error: "Invalid path" });
      }

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
      const xmlPath = path.resolve(XML_DIR, `${dialect}.xml`);
      if (!xmlPath.startsWith(path.resolve(XML_DIR) + path.sep)) {
        return res.status(400).json({ ok: false, error: "Invalid path" });
      }

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
        // Detect mode.  The previous implementation treated any string payload (or
        // `msg.topic`) that looked like a message name as an instruction to send
        // a packet.  That worked for simple flows but broke once we started
        // piping parsed telemetry back through the node – message names that
        // contain digits (e.g. ArduPilot's `GPS2_RAW`) or `msg.payload` objects
        // with MAVLink headers would be mis-read as outbound requests.  The
        // revised ordering leans on the parser metadata first and only falls back
        // to the dynamic/topic/static send modes when we are sure the message did
        // not originate from the comms node.
        const payloadIsObject = msg.payload && typeof msg.payload === "object" && !Buffer.isBuffer(msg.payload);
        const hasMessageType = payloadIsObject && typeof msg.payload.messageType === "string" && msg.payload.messageType.trim() !== "";
        const payloadMessageId = payloadIsObject ? msg.payload.messageId : undefined;
        const hasMessageId = (payloadMessageId != null && payloadMessageId !== "") || (msg.messageId != null && msg.messageId !== "");
        const hasMavlinkHeader = msg.header && typeof msg.header === "object" && Number.isInteger(msg.header.messageId);
        const mavlinkPayloadId = (msg.mavlink && typeof msg.mavlink === "object")
          ? (msg.mavlink.messageId ?? msg.mavlink?.header?.msgid)
          : undefined;
        const normalisedMavlinkPayloadId =
          typeof mavlinkPayloadId === "string" && mavlinkPayloadId.trim() !== ""
            ? Number.parseInt(mavlinkPayloadId, 10)
            : mavlinkPayloadId;
        const hasMavlinkPayload = Number.isInteger(normalisedMavlinkPayloadId);
        const topicLooksLikeMavlink = typeof msg.topic === "string" && /^[A-Z0-9_]+$/i.test(msg.topic.trim());

        const messageTypeFromPayload = hasMessageType ? msg.payload.messageType.trim().toUpperCase() : null;
        const topicCandidate = topicLooksLikeMavlink ? msg.topic.trim().toUpperCase() : null;
        const messageTypeFromTopic = !hasMavlinkHeader && topicCandidate && topicCandidate !== "MAVLINK_OUTGOING"
          ? topicCandidate
          : null;

        const isParseMode = hasMavlinkHeader || hasMavlinkPayload;
        const isDynamicMode = !isParseMode && Boolean(messageTypeFromPayload);
        const isTopicMode = !isParseMode && !isDynamicMode && Boolean(messageTypeFromTopic);
        const isStaticMode = !isParseMode && !isDynamicMode && !isTopicMode && node.messageType;

        // MODE 1: Parse incoming MAVLink message from comms
        if (isParseMode) {
          // Just pass through the parsed data, maybe add formatting later
          send({
            ...msg,
            mavlink: msg.mavlink || msg.payload
          });
          node.status({ fill: "blue", shape: "dot", text: `parsed: ${msg.topic}` });
          done();
          return;
        }

        // For send modes, determine message type
        let messageType;
        let fieldValues = {};
        const parseInteger = value => {
          if (value === undefined || value === null || value === "") {
            return null;
          }
          const parsed = parseInt(value, 10);
          return Number.isNaN(parsed) ? null : parsed;
        };

        const normaliseMessageType = value => (typeof value === "string" ? value.trim().toUpperCase() : "");

        if (isDynamicMode) {
          // MODE 2: Dynamic send from msg.payload
          messageType = normaliseMessageType(messageTypeFromPayload);
          fieldValues = { ...msg.payload };
          if (Object.prototype.hasOwnProperty.call(fieldValues, "messageType")) delete fieldValues.messageType;
          if (Object.prototype.hasOwnProperty.call(fieldValues, "messageId")) delete fieldValues.messageId;
        } else if (isTopicMode) {
          // MODE 3: Dynamic send using msg.topic as the message name
          messageType = normaliseMessageType(messageTypeFromTopic);
          fieldValues = payloadIsObject ? { ...msg.payload } : {};
          if (Object.prototype.hasOwnProperty.call(fieldValues, "messageType")) delete fieldValues.messageType;
          if (Object.prototype.hasOwnProperty.call(fieldValues, "messageId")) delete fieldValues.messageId;
        } else if (isStaticMode) {
          // MODE 3: Static send from config
          messageType = normaliseMessageType(node.messageType);
          fieldValues = { ...node.fields };

          // Allow override from msg.payload
          if (msg.payload && typeof msg.payload === "object") {
            Object.assign(fieldValues, msg.payload);
          }
          if (Object.prototype.hasOwnProperty.call(fieldValues, "messageType")) delete fieldValues.messageType;
          if (Object.prototype.hasOwnProperty.call(fieldValues, "messageId")) delete fieldValues.messageId;
        } else {
          throw new Error("No message type configured or provided");
        }

        let systemId = parseInteger(msg.systemId);
        if (systemId === null && Object.prototype.hasOwnProperty.call(fieldValues, "systemId")) {
          systemId = parseInteger(fieldValues.systemId);
          delete fieldValues.systemId;
        }
        if (systemId === null) {
          systemId = node.systemId;
        }

        let componentId = parseInteger(msg.componentId);
        if (componentId === null && Object.prototype.hasOwnProperty.call(fieldValues, "componentId")) {
          componentId = parseInteger(fieldValues.componentId);
          delete fieldValues.componentId;
        }
        if (componentId === null) {
          componentId = node.componentId;
        }

        // Load message definition
        const xmlPath = path.join(XML_DIR, `${node.dialect}.xml`);
        if (!fs.existsSync(xmlPath)) {
          throw new Error(`Dialect not found: ${node.dialect}`);
        }

        const { messages, enums } = await parseXMLDefinitions(xmlPath);
        let msgDef = messages[messageType];

        if (!msgDef && hasMessageId) {
          const candidates = [payloadMessageId, msg.messageId].filter(v => v !== undefined && v !== null && v !== "");
          for (const candidate of candidates) {
            const targetId = parseInt(candidate, 10);
            if (!Number.isNaN(targetId)) {
              const found = Object.values(messages).find(def => def.id === targetId);
              if (found) {
                msgDef = found;
                messageType = normaliseMessageType(found.name);
                break;
              }
            }
          }
        }

        if (!msgDef) {
          throw new Error(`Message type not found: ${messageType}`);
        }

        // Build message payload with type conversion
        const payload = {};

        const parseNumericExpression = raw => {
          if (typeof raw === "number" && Number.isFinite(raw)) {
            return raw;
          }
          if (typeof raw !== "string") {
            return NaN;
          }
          const trimmed = raw.trim();
          if (trimmed === "") {
            return NaN;
          }
          if (/^[-+]?\d+(\.\d+)?$/.test(trimmed) || /^0x[0-9a-f]+$/i.test(trimmed)) {
            return Number(trimmed);
          }
          const shiftMatch = trimmed.match(/^([-+]?\d+)\s*<<\s*([-+]?\d+)$/);
          if (shiftMatch) {
            return Number(shiftMatch[1]) << Number(shiftMatch[2]);
          }
          return NaN;
        };

        const enumValueFor = (enumName, raw) => {
          if (!enumName || !enums[enumName]) {
            return { matched: false };
          }
          const candidates = enums[enumName];
          const normalised = typeof raw === "string" ? raw.trim() : raw;

          if (typeof normalised === "string" && normalised !== "") {
            const byName = candidates.find(entry => entry.name === normalised);
            if (byName) {
              const numeric = parseNumericExpression(byName.value);
              return {
                matched: true,
                value: Number.isNaN(numeric) ? byName.value : numeric,
              };
            }

            const byValue = candidates.find(entry => entry.value === normalised);
            if (byValue) {
              const numeric = parseNumericExpression(byValue.value);
              return {
                matched: true,
                value: Number.isNaN(numeric) ? byValue.value : numeric,
              };
            }
          }

          const numeric = parseNumericExpression(normalised);
          if (!Number.isNaN(numeric)) {
            return { matched: true, value: numeric };
          }

          return { matched: false };
        };

        const defaultForField = field => {
          const typeLower = field.type.toLowerCase();
          const arrayMatch = field.type.match(/^([^[]+)\[(\d+)\]$/);
          if (arrayMatch) {
            const baseType = arrayMatch[1].toLowerCase();
            if (baseType.includes("char")) {
              return "";
            }
            const length = parseInt(arrayMatch[2], 10);
            const filler = baseType.includes("float") || baseType.includes("double") ? 0.0 : 0;
            return Array.from({ length }, () => filler);
          }
          if (typeLower.includes("float") || typeLower.includes("double")) {
            return 0.0;
          }
          if (typeLower.includes("int") || typeLower.includes("uint") || typeLower === "bool") {
            return 0;
          }
          if (typeLower.includes("char")) {
            return "";
          }
          return 0;
        };

        const coerceScalar = (field, rawValue) => {
          if (rawValue === undefined || rawValue === null || rawValue === "") {
            return defaultForField(field);
          }

          const enumResult = enumValueFor(field.enum, rawValue);
          if (enumResult.matched) {
            return enumResult.value;
          }

          const typeLower = field.type.toLowerCase();
          if (typeLower === "bool") {
            if (typeof rawValue === "boolean") {
              return rawValue ? 1 : 0;
            }
            if (typeof rawValue === "number") {
              return rawValue ? 1 : 0;
            }
            if (typeof rawValue === "string") {
              const trimmed = rawValue.trim().toLowerCase();
              if (["true", "1", "yes", "on"].includes(trimmed)) return 1;
              if (["false", "0", "no", "off"].includes(trimmed)) return 0;
            }
            return defaultForField(field);
          }

          if (typeLower.includes("int") || typeLower.includes("uint")) {
            const parsed = parseNumericExpression(rawValue);
            if (!Number.isNaN(parsed)) {
              return Math.trunc(parsed);
            }
            return defaultForField(field);
          }

          if (typeLower.includes("float") || typeLower.includes("double")) {
            // Preserve NaN if explicitly provided (e.g., for "don't change" yaw in missions)
            if (typeof rawValue === "number" && Number.isNaN(rawValue)) {
              return rawValue;
            }
            const parsed = parseNumericExpression(rawValue);
            if (!Number.isNaN(parsed)) {
              return parsed;
            }
            return defaultForField(field);
          }

          if (typeLower.includes("char")) {
            return String(rawValue);
          }

          return rawValue;
        };

        const coerceArray = (field, rawValue) => {
          const arrayMatch = field.type.match(/^([^[]+)\[(\d+)\]$/);
          if (!arrayMatch) {
            return coerceScalar(field, rawValue);
          }
          const baseType = arrayMatch[1].toLowerCase();
          const expectedLength = parseInt(arrayMatch[2], 10);
          if (baseType.includes("char")) {
            if (rawValue === undefined || rawValue === null) {
              return "";
            }
            return String(rawValue);
          }

          let values;
          if (Array.isArray(rawValue)) {
            values = rawValue;
          } else if (typeof rawValue === "string") {
            values = rawValue.split(",").map(v => v.trim()).filter(v => v !== "");
          } else {
            values = [rawValue];
          }

          const coerced = values
            .slice(0, expectedLength)
            .map(entry => coerceScalar({ ...field, type: baseType }, entry));

          if (coerced.length < expectedLength) {
            const fillerField = { ...field, type: baseType };
            while (coerced.length < expectedLength) {
              coerced.push(defaultForField(fillerField));
            }
          }

          return coerced;
        };

        msgDef.fields.forEach(field => {
          const value = fieldValues[field.name];
          payload[field.name] = coerceArray(field, value);
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

        // Push to queue to support multiple msg nodes sending simultaneously
        // NOTE: Theoretical race condition if flow.get() returns copies:
        //   Two nodes could get->modify->set concurrently and lose one message
        // In practice: Node.js is single-threaded so race window is tiny (same tick)
        // Node-RED context store behavior:
        //   - If get() returns reference: no race (both modify same array)
        //   - If get() returns copy: rare race exists but requires perfect timing
        // Mitigation: Event-driven processing drains queue within ~1-2ms of append
        // True atomics would require external lock library (redis, etc) - not worth complexity
        const queue = node.context().flow.get("mavlink_outgoing_queue") || [];
        queue.push({
          message: messageType,
          messageId: msgDef.id,
          payload,
          dialect: node.dialect,
          systemId,
          componentId,
          timestamp: Date.now(),
        });
        node.context().flow.set("mavlink_outgoing_queue", queue);

        // Emit event to trigger immediate processing by comms nodes
        RED.events.emit("mavlink:outgoing", { flowId: node.z });

        // Also output the message data for debugging/logging
        send({
          payload: {
            message: messageType,
            messageId: msgDef.id,
            fields: payload,
            systemId,
            componentId,
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
