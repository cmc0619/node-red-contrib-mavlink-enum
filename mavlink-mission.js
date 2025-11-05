module.exports = function(RED) {
  function MavlinkMissionNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Configuration
    node.targetSystem = parseInt(config.targetSystem) || 1;
    node.targetComponent = parseInt(config.targetComponent) || 1;
    node.timeout = parseInt(config.timeout) || 10000; // 10 second default

    // State machine
    let state = "IDLE";
    let waypoints = [];
    let currentSeq = 0;
    let timeoutTimer = null;
    let useIntVariant = false;  // Track if autopilot uses MISSION_REQUEST_INT

    function clearStateTimeout() {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    }

    function setStateTimeout(duration, onTimeout) {
      clearStateTimeout();
      timeoutTimer = setTimeout(() => {
        onTimeout();
        timeoutTimer = null;
      }, duration);
    }

    function resetState() {
      state = "IDLE";
      waypoints = [];
      currentSeq = 0;
      useIntVariant = false;
      clearStateTimeout();
      node.status({});
    }

    function sendMavlinkMessage(messageType, payload) {
      node.send([{
        payload: {
          messageType: messageType,  // mavlink-msg expects 'messageType', not 'message'
          ...payload,
          target_system: node.targetSystem,
          target_component: node.targetComponent
        }
      }, null]);
    }

    function sendStatus(success, message, details = {}) {
      node.send([null, {
        payload: {
          success,
          message,
          ...details
        }
      }]);
    }

    // Convert user-friendly waypoint to MISSION_ITEM format (float lat/lon)
    function waypointToMissionItem(wp, seq, isFirst) {
      // Default values
      const defaults = {
        frame: 3,           // MAV_FRAME_GLOBAL_RELATIVE_ALT
        command: 16,        // MAV_CMD_NAV_WAYPOINT
        current: isFirst ? 1 : 0,
        autocontinue: 1,
        param1: 0,          // Hold time (seconds)
        param2: 2,          // Acceptance radius (meters)
        param3: 0,          // Pass through waypoint
        param4: NaN,        // Yaw angle (NaN = don't change)
      };

      return {
        seq,
        frame: wp.frame !== undefined ? wp.frame : defaults.frame,
        command: wp.command !== undefined ? wp.command : defaults.command,
        current: defaults.current,
        autocontinue: wp.autocontinue !== undefined ? wp.autocontinue : defaults.autocontinue,
        param1: wp.param1 !== undefined ? wp.param1 : defaults.param1,
        param2: wp.param2 !== undefined ? wp.param2 : defaults.param2,
        param3: wp.param3 !== undefined ? wp.param3 : defaults.param3,
        param4: wp.param4 !== undefined ? wp.param4 : defaults.param4,
        x: wp.lat || wp.x || 0,
        y: wp.lon || wp.y || 0,
        z: wp.alt || wp.z || 0,
        mission_type: 0     // MAV_MISSION_TYPE_MISSION
      };
    }

    // Convert user-friendly waypoint to MISSION_ITEM_INT format (int32 lat/lon in degE7)
    function waypointToMissionItemInt(wp, seq, isFirst) {
      // Default values
      const defaults = {
        frame: 3,           // MAV_FRAME_GLOBAL_RELATIVE_ALT
        command: 16,        // MAV_CMD_NAV_WAYPOINT
        current: isFirst ? 1 : 0,
        autocontinue: 1,
        param1: 0,          // Hold time (seconds)
        param2: 2,          // Acceptance radius (meters)
        param3: 0,          // Pass through waypoint
        param4: NaN,        // Yaw angle (NaN = don't change)
      };

      // Convert float degrees to int32 degE7 (degrees * 1e7)
      const lat = wp.lat || wp.x || 0;
      const lon = wp.lon || wp.y || 0;

      return {
        seq,
        frame: wp.frame !== undefined ? wp.frame : defaults.frame,
        command: wp.command !== undefined ? wp.command : defaults.command,
        current: defaults.current,
        autocontinue: wp.autocontinue !== undefined ? wp.autocontinue : defaults.autocontinue,
        param1: wp.param1 !== undefined ? wp.param1 : defaults.param1,
        param2: wp.param2 !== undefined ? wp.param2 : defaults.param2,
        param3: wp.param3 !== undefined ? wp.param3 : defaults.param3,
        param4: wp.param4 !== undefined ? wp.param4 : defaults.param4,
        x: Math.round(lat * 1e7),     // int32 in degE7
        y: Math.round(lon * 1e7),     // int32 in degE7
        z: wp.alt || wp.z || 0,        // float altitude (meters)
        mission_type: 0                // MAV_MISSION_TYPE_MISSION
      };
    }

    node.on("input", (msg) => {
      // Handle user command to upload mission
      if (msg.topic === "upload_mission" && msg.payload && Array.isArray(msg.payload.waypoints)) {
        if (state !== "IDLE") {
          node.warn("Mission upload already in progress");
          return;
        }

        waypoints = msg.payload.waypoints;

        if (waypoints.length === 0) {
          node.error("Cannot upload empty mission");
          sendStatus(false, "Empty waypoint array");
          return;
        }

        if (waypoints.length > 255) {
          node.error("Too many waypoints (max 255)");
          sendStatus(false, "Too many waypoints");
          return;
        }

        // Validate waypoint objects to prevent crashes from invalid data
        const invalidIndex = waypoints.findIndex(wp => !wp || typeof wp !== 'object' || Array.isArray(wp));
        if (invalidIndex !== -1) {
          node.error(`Invalid waypoint at index ${invalidIndex}: expected object, got ${typeof waypoints[invalidIndex]}`);
          sendStatus(false, `Invalid waypoint data at index ${invalidIndex}`);
          return;
        }

        currentSeq = 0;
        state = "WAITING_FOR_REQUEST";

        node.status({ fill: "yellow", shape: "ring", text: `uploading (0/${waypoints.length})` });

        // Send MISSION_COUNT
        sendMavlinkMessage("MISSION_COUNT", {
          count: waypoints.length,
          mission_type: 0  // MAV_MISSION_TYPE_MISSION
        });

        // Set timeout
        setStateTimeout(node.timeout, () => {
          node.error("Mission upload timeout - no response from vehicle");
          sendStatus(false, "Timeout waiting for vehicle response");
          node.status({ fill: "red", shape: "dot", text: "timeout" });
          resetState();
        });

        return;
      }

      // Handle user command to clear mission
      if (msg.topic === "clear_mission") {
        if (state !== "IDLE") {
          node.warn("Cannot clear mission while upload in progress");
          return;
        }

        state = "CLEARING";
        node.status({ fill: "yellow", shape: "ring", text: "clearing mission" });

        sendMavlinkMessage("MISSION_CLEAR_ALL", {
          mission_type: 0  // MAV_MISSION_TYPE_MISSION
        });

        setStateTimeout(node.timeout, () => {
          node.error("Mission clear timeout");
          sendStatus(false, "Timeout clearing mission");
          node.status({ fill: "red", shape: "dot", text: "timeout" });
          resetState();
        });

        return;
      }

      // Handle incoming MAVLink messages from comms node
      // mavlink-comms sets msg.topic to the message name (e.g., "MISSION_REQUEST")
      // and msg.payload contains the decoded message fields
      const msgName = msg.topic;
      const msgPayload = msg.payload;

      // Only process MISSION_* messages
      if (msgName && msgName.startsWith("MISSION_") && msgPayload) {
        // Only process messages for our target system
        // node-mavlink uses camelCase for field names (targetSystem, not target_system)
        if (msgPayload.targetSystem && msgPayload.targetSystem !== 255 && msgPayload.targetSystem !== node.targetSystem) {
          return;
        }

        // Handle MISSION_REQUEST or MISSION_REQUEST_INT
        // Modern autopilots (ArduPilot 4.0+, PX4 1.12+) use INT variant for better precision
        const isMissionRequest = (msgName === "MISSION_REQUEST" || msgName === "MISSION_REQUEST_INT");

        if (isMissionRequest && state === "WAITING_FOR_REQUEST") {
          const requestedSeq = msgPayload.seq;

          // Track which variant the autopilot is using (for first request)
          if (currentSeq === 0) {
            useIntVariant = (msgName === "MISSION_REQUEST_INT");
            if (useIntVariant) {
              node.debug("Autopilot using MISSION_REQUEST_INT (modern/high-precision mode)");
            }
          }

          // Validate sequence number
          if (requestedSeq < 0 || requestedSeq >= waypoints.length) {
            node.error(`Invalid sequence number requested: ${requestedSeq}`);
            sendStatus(false, "Invalid sequence number", { seq: requestedSeq });
            resetState();
            return;
          }

          // We expect sequential requests, but handle out-of-order gracefully
          if (requestedSeq !== currentSeq) {
            node.warn(`Expected seq ${currentSeq}, got ${requestedSeq} - adjusting`);
            currentSeq = requestedSeq;
          }

          // Send the requested waypoint in the appropriate format
          const wp = waypoints[currentSeq];
          let missionItem;
          let messageType;

          if (useIntVariant) {
            missionItem = waypointToMissionItemInt(wp, currentSeq, currentSeq === 0);
            messageType = "MISSION_ITEM_INT";
          } else {
            missionItem = waypointToMissionItem(wp, currentSeq, currentSeq === 0);
            messageType = "MISSION_ITEM";
          }

          sendMavlinkMessage(messageType, missionItem);

          currentSeq++;
          node.status({
            fill: "yellow",
            shape: "dot",
            text: `uploading (${currentSeq}/${waypoints.length})`
          });

          // Reset timeout
          setStateTimeout(node.timeout, () => {
            node.error(`Mission upload timeout at waypoint ${currentSeq}`);
            sendStatus(false, "Timeout during upload", { seq: currentSeq });
            node.status({ fill: "red", shape: "dot", text: "timeout" });
            resetState();
          });

          return;
        }

        // Handle MISSION_ACK
        if (msgName === "MISSION_ACK" && (state === "WAITING_FOR_REQUEST" || state === "CLEARING")) {
          clearStateTimeout();

          const ackType = msgPayload.type;
          const ackTypeNames = {
            0: "ACCEPTED",
            1: "ERROR",
            2: "UNSUPPORTED_FRAME",
            3: "UNSUPPORTED",
            4: "NO_SPACE",
            5: "INVALID",
            6: "INVALID_PARAM1",
            7: "INVALID_PARAM2",
            8: "INVALID_PARAM3",
            9: "INVALID_PARAM4",
            10: "INVALID_PARAM5_X",
            11: "INVALID_PARAM6_Y",
            12: "INVALID_PARAM7_Z",
            13: "INVALID_SEQUENCE",
            14: "CANCELLED"
          };

          const ackTypeName = ackTypeNames[ackType] || `UNKNOWN(${ackType})`;

          if (ackType === 0) {
            // MAV_MISSION_ACCEPTED
            if (state === "CLEARING") {
              node.status({ fill: "green", shape: "dot", text: "mission cleared" });
              sendStatus(true, "Mission cleared successfully");
            } else {
              node.status({ fill: "green", shape: "dot", text: "upload complete" });
              sendStatus(true, "Mission uploaded successfully", {
                waypoints: waypoints.length
              });
            }

            setTimeout(() => {
              if (state !== "IDLE") {
                resetState();
              }
            }, 3000);
          } else {
            // Mission rejected
            node.status({ fill: "red", shape: "dot", text: `rejected: ${ackTypeName}` });
            node.error(`Mission ${state === "CLEARING" ? "clear" : "upload"} rejected: ${ackTypeName}`);
            sendStatus(false, `Mission rejected: ${ackTypeName}`, {
              ackType,
              ackTypeName
            });
            resetState();
          }

          return;
        }
      }
    });

    node.on("close", () => {
      clearStateTimeout();
      resetState();
    });
  }

  RED.nodes.registerType("mavlink-mission", MavlinkMissionNode);
};
