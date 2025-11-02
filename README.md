# node-red-contrib-mavlink

A comprehensive Node-RED MAVLink driver with dynamic dialect support, serial/UDP/TCP communication, and intelligent message building.

## Features

- **Full MAVLink Protocol Support**: v1.0 and v2.0
- **Multiple Connection Types**: Serial, UDP, and TCP
- **Dynamic Dialect Management**: Auto-downloads all official MAVLink dialects
- **Complete Dialect Support**: Send and receive messages from any dialect (common, ardupilotmega, storm32, etc.)
- **Intelligent Message Builder**: Dynamic UI based on selected message type
- **Three Operating Modes**: Static send, dynamic send, and incoming message parsing
- **Enum Support**: Dropdowns for all enum fields with descriptions
- **Auto-HEARTBEAT**: Automatic heartbeat generation (MAVLink protocol compliant)
- **No Wired Connections**: Nodes communicate via internal message bus
- **XML Versioning**: Keeps historical versions of dialect definitions

## Nodes

### mavlink-comms

The communication node handles all I/O operations and dialect management.

**Features:**
- Downloads MAVLink XML definitions from ArduPilot repository
- Supports UDP, TCP, and Serial connections
- Automatically manages heartbeat
- Parses incoming MAVLink messages
- Outputs parsed messages as JSON
- Listens for outgoing messages from mavlink-msg nodes

**Connection Types:**
- **UDP**: Typical for SITL and ground station connections (default port 14550)
- **TCP**: For TCP-based telemetry links
- **Serial**: For direct serial connections (USB, UART)

**Dialects:**
Click "Update XMLs" to download all available dialects:
- common.xml - Basic MAVLink messages
- ardupilotmega.xml - ArduPilot-specific messages
- minimal.xml - Minimal message set
- And many more...

**Output:**
```json
{
  "payload": {
    "name": "HEARTBEAT",
    "type": 0,
    "systemId": 1,
    "componentId": 1,
    ...
  },
  "topic": "HEARTBEAT"
}
```

### mavlink-msg

A bidirectional message builder that can send commands and parse incoming telemetry.

**Three Operating Modes:**

#### 1. Static Send (Message selected from dropdown)
Configure a specific message type (e.g., COMMAND_LONG) and set field values in the UI.
```
[Inject] → [mavlink-msg: COMMAND_LONG] → comms → drone
```

#### 2. Dynamic Send (Message = "None")
Build messages dynamically from your flow:
```javascript
msg.payload = {
  messageType: "COMMAND_LONG",
  command: 400,  // MAV_CMD_COMPONENT_ARM_DISARM
  param1: 1,     // 1=arm, 0=disarm
  param2: 0
};
return msg;
```
```
[Function] → [mavlink-msg: None] → comms → drone
```

#### 3. Parse Incoming (Auto-detect from comms)
Automatically parses and passes through telemetry messages:
```
[mavlink-comms] → [mavlink-msg] → [Debug GPS data]
                   ↑ Auto-detects GPS_RAW_INT, SYS_STATUS, etc.
```

**Features:**
- Dynamic form generation based on message fields
- Enum fields show as dropdowns with descriptions
- Support for all MAVLink field types (int, float, arrays, strings)
- Works with any dialect (common, ardupilotmega, etc.)

## Installation

### From Local Directory

```bash
cd ~/.node-red
git clone https://github.com/your-username/node-red-contrib-mavlink.git
npm install ./node-red-contrib-mavlink
node-red-restart
```

### From npm (when published)

```bash
cd ~/.node-red
npm install node-red-contrib-mavlink
node-red-restart
```

## Quick Start

1. **Add mavlink-comms node**
   - Configure connection (UDP/TCP/Serial)
   - Click "Update XMLs" to download dialects
   - Select dialect (e.g., "common" or "ardupilotmega")
   - Deploy

2. **Add mavlink-msg node**
   - Select same dialect as mavlink-comms
   - Choose message type (e.g., "COMMAND_LONG")
   - Fill in required fields
   - Connect an inject node to trigger

3. **Add debug nodes**
   - Connect to mavlink-comms output to see incoming messages
   - Connect to mavlink-msg output to see outgoing messages

## Example Flow

```
[Inject] → [mavlink-msg: COMMAND_LONG] → [Debug]
                                ↓ (internal bus)
[mavlink-comms: UDP] → [Debug]
```

No wired connection needed between mavlink-msg and mavlink-comms!

## Architecture

### Internal Message Bus

Nodes communicate via Node-RED flow context:
- **Outgoing**: `mavlink-msg` writes to `flow.mavlink_outgoing`
- **Incoming**: `mavlink-comms` writes to `flow.mavlink_last_received`

This allows multiple mavlink-msg nodes to share a single mavlink-comms connection without wiring.

### Dialect Storage

XMLs are stored in `~/.node-red/mavlink-xmls/`:
- `common.xml` - Latest version (symlink)
- `common_20250101.xml` - Versioned copy
- Delete old versions via "Manage XMLs" button

## Supported Dialects

All dialects are fully supported for both sending and receiving:

- **minimal** - Minimal MAVLink message set
- **common** - Standard MAVLink messages (COMMAND_LONG, SET_MODE, etc.)
- **ardupilotmega** - ArduPilot-specific messages (gimbal, camera, fence, rally points)
- **uavionix** - uAvionix ADS-B messages
- **icarous** - NASA ICAROUS messages
- **asluav** - ASLUAV fixed-wing UAV messages
- **development** - Development/experimental messages
- **ualberta** - University of Alberta messages
- **storm32** - STorM32 gimbal controller messages

Simply select your dialect in the node configuration - both parsing (receiving) and encoding (sending) will use the correct message definitions automatically.

## Dependencies

- `node-mavlink` - MAVLink protocol implementation
- `serialport` - Serial communication
- `xml2js` - XML parsing

## License

MIT

## Contributing

Pull requests welcome! Please ensure:
- Code follows existing style
- Test with real MAVLink devices/SITL
- Update README for new features

## Support

- Issues: https://github.com/your-username/node-red-contrib-mavlink/issues
- MAVLink Protocol: https://mavlink.io/
- ArduPilot: https://ardupilot.org/
