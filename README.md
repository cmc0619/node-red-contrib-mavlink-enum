# node-red-contrib-mavlink

A comprehensive Node-RED MAVLink driver with dynamic dialect support, serial/UDP/TCP communication, and intelligent message building.

## Features

- **Full MAVLink Protocol Support**: v1.0 and v2.0
- **Multiple Connection Types**: Serial, UDP, and TCP
- **Dynamic Dialect Management**: Auto-downloads all official MAVLink dialects
- **Intelligent Message Builder**: Dynamic UI based on selected message type
- **Enum Support**: Dropdowns for all enum fields with descriptions
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

The message builder node constructs MAVLink messages with a dynamic UI.

**Features:**
- Select any message from chosen dialect
- Dynamic form generation based on message fields
- Enum fields show as dropdowns with descriptions
- Support for all MAVLink field types (int, float, arrays, strings)
- Can override field values from incoming msg.payload

**Usage:**
1. Select a dialect (must match your mavlink-comms node)
2. Select a message type
3. Configure message fields
4. Send input to trigger message transmission

**Field Configuration:**

Static (in editor):
```
Set values directly in the node configuration UI
```

Dynamic (via msg.payload):
```javascript
msg.payload = {
  param1: 10.5,
  param2: 20.0,
  target_system: 1
};
return msg;
```

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

## Limitations

Currently, the message encoder only supports messages from the `common` dialect due to node-mavlink's static registry. Messages from other dialects can be parsed (received) but not yet encoded (sent).

**Workaround**: Use `common` dialect or contribute to add dynamic registry loading.

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
