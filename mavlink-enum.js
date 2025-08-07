module.exports = function(RED) {
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");

  // Simple in-memory cache: { headerPathHash: { mtimeMs, enums: Map<EnumName, Array<{key, value, comment}>> } }
  const ENUM_CACHE = new Map();

  function hashPath(p) {
    return crypto.createHash("sha1").update(path.resolve(p)).digest("hex");
  }

  function parseEnumsFromHeaderText(text) {
    // Find typedef enum blocks. We’ll accept with or without "typedef" up front, but expect ending NAME;
    // Examples:
    // typedef enum MAV_MODE_FLAG { MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 1, ... } MAV_MODE_FLAG;
    // enum MAV_SEVERITY { MAV_SEVERITY_EMERGENCY=0, ... };
    const results = new Map();

    // 1) Remove C block comments and line comments to simplify parsing, but capture trailing comments on members first.
    // We'll do two passes: extract enums with bodies as-is (to retain trailing comments), then parse entries line by line.
    const enumRegex = /(?:typedef\s+)?enum\s+(?:[A-Za-z_][A-Za-z0-9_]*)?\s*\{([\s\S]*?)\}\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/g;

    let match;
    while ((match = enumRegex.exec(text)) !== null) {
      const body = match[1];
      const name = match[2];

      // Split by commas that end members (tolerate trailing commas/newlines)
      const rawMembers = body.split(",").map(s => s.trim()).filter(Boolean);

      const members = [];
      let nextAutoValue = 0;
      for (let raw of rawMembers) {
        // Strip block comments mid-line for parsing value, but keep // trailing as "comment".
        let comment = "";
        const lineNoBlock = raw.replace(/\/\*[\s\S]*?\*\//g, "");

        const slashes = lineNoBlock.indexOf("//");
        let before = lineNoBlock;
        if (slashes >= 0) {
          comment = lineNoBlock.slice(slashes + 2).trim();
          before = lineNoBlock.slice(0, slashes).trim();
        }

        if (!before) continue;

        // Allow forms: KEY = value, or just KEY (auto-increment)
        const m = before.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*([^]+))?$/);
        if (!m) continue;
        const key = m[1];
        let valueStr = (m[2] || "").trim();

        let value;
        if (valueStr) {
          // Evaluate simple integer expressions: hex, dec, shifts, ORs
          // Sanitize: allow digits, hex, (), <<, >>, |, &, +, -, ~
          if (!/^[0-9xXa-fA-F\(\)\s\<\>\|\&\+\-\~]+$/.test(valueStr)) {
            // If too hairy, skip eval and try parseInt
            value = parseInt(valueStr, 10);
          } else {
            try {
              // eslint-disable-next-line no-new-func
              value = Function(`return (${valueStr})|0;`)();
            } catch {
              value = parseInt(valueStr, 10);
            }
          }
          if (!Number.isInteger(value)) value = nextAutoValue;
        } else {
          value = nextAutoValue;
        }
        nextAutoValue = value + 1;

        members.push({ key, value, comment });
      }

      if (members.length) {
        results.set(name, members);
      }
    }
    return results;
  }

  function getEnumsForHeader(headerPath) {
    const full = path.resolve(headerPath);
    if (!fs.existsSync(full)) {
      throw new Error(`mavlink-enum: header not found at ${full}`);
    }

    const stat = fs.statSync(full);
    const hpHash = hashPath(full);
    const cached = ENUM_CACHE.get(hpHash);

    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.enums;
    }

    const text = fs.readFileSync(full, "utf8");
    const enums = parseEnumsFromHeaderText(text);

    ENUM_CACHE.set(hpHash, { mtimeMs: stat.mtimeMs, enums });

    // also set a watcher to invalidate cache if changed later
    try {
      fs.watch(full, { persistent: false }, () => {
        ENUM_CACHE.delete(hpHash);
      });
    } catch (_) { /* ignore on some FS */ }

    return enums;
  }

  // Admin endpoint for editor: list enums or enum members
  // GET /mavlink-enum/enums?headerPath=/abs/path/to/mavlink.h
  // GET /mavlink-enum/members?headerPath=...&enumName=...
  RED.httpAdmin.get("/mavlink-enum/enums", (req, res) => {
    try {
      const headerPath = req.query.headerPath || "";
      const enums = getEnumsForHeader(headerPath);
      res.json({ ok: true, enums: Array.from(enums.keys()).sort() });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  RED.httpAdmin.get("/mavlink-enum/members", (req, res) => {
    try {
      const headerPath = req.query.headerPath || "";
      const enumName = req.query.enumName || "";
      const enums = getEnumsForHeader(headerPath);
      const members = enums.get(enumName) || [];
      res.json({
        ok: true,
        members: members.map(m => ({ key: m.key, value: m.value, comment: m.comment }))
      });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  function MavlinkEnumNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.headerPath = config.headerPath || "";
    node.enumName   = config.enumName || "";
    node.enumKey    = config.enumKey || "";
    node.keySource  = config.keySource || "config"; // "config" | "msg" | "flow" | "global"
    node.keyField   = config.keyField || "payload"; // when not "config"

    node.on("input", (msg, send, done) => {
      try {
        const headerPath = node.headerPath || msg.headerPath || msg.mavlinkHeader;
        if (!headerPath) throw new Error("No mavlink headerPath provided.");

        const enums = getEnumsForHeader(headerPath);
        const enumName = node.enumName || msg.enumName;
        if (!enumName || !enums.has(enumName)) {
          throw new Error(`Enum "${enumName}" not found in ${headerPath}`);
        }

        let enumKey = node.enumKey;
        if (node.keySource !== "config") {
          // Resolve from msg/flow/global
          const ctx = node.keySource === "flow" ? node.context().flow
                     : node.keySource === "global" ? node.context().global
                     : null;
          if (ctx) {
            enumKey = ctx.get(node.keyField);
          } else {
            enumKey = RED.util.getMessageProperty(msg, node.keyField);
          }
        }
        if (!enumKey) throw new Error("No enum key provided.");

        const members = enums.get(enumName);
        const match = members.find(m => m.key === enumKey);
        if (!match) throw new Error(`Key "${enumKey}" not found in enum "${enumName}".`);

        msg.mavlink = msg.mavlink || {};
        msg.mavlink.enum = enumName;
        msg.mavlink.key = enumKey;
        msg.mavlink.value = match.value;
        msg.payload = match.value;

        send(msg);
        done();
      } catch (err) {
        node.status({ fill: "red", shape: "dot", text: err.message });
        done(err);
      }
    });
  }

  RED.nodes.registerType("mavlink-enum", MavlinkEnumNode);
};

