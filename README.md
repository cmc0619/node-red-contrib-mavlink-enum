# node-red-contrib-mavlink-enum

A Node-RED node that parses a `mavlink.h` and lets you pick a **MAVLink enum** and **key** from dropdowns. It outputs the numeric value and a convenient object.

## Why
Sometimes you just want to select `MAV_FRAME`, `MAV_SEVERITY`, `MAV_CMD` keys (etc.) from the real header used by your firmware/toolchain, without hardcoding or copying tables.

## Install
1. Place this folder under your Node-RED user dir, e.g. `~/.node-red/node-red-contrib-mavlink-enum/`
2. `cd ~/.node-red/node-red-contrib-mavlink-enum`
3. `npm install` (nothing required, but keeps Node happy)
4. Restart Node-RED

Or publish to npm and install via the Palette Manager later.

## Usage
- In the node edit dialog:
  - **Mavlink header**: absolute path to your generated header (e.g. `/home/pi/mavlink/include/mavlink/v2.0/common/mavlink.h`)
  - **Enum**: populated from the header.
  - **Key source**:
    - **Pick in editor**: choose a key from dropdown; the node outputs its numeric value.
    - **From msg/flow/global**: provide the key name (e.g. `MAV_FRAME_GLOBAL_RELATIVE_ALT`) in the given property (default `payload`).
- Output:
  - `msg.payload` → numeric enum value
  - `msg.mavlink` → `{ enum, key, value }`

## Notes
- Parser supports reasonably standard `enum` and `typedef enum` blocks, with:
  - `KEY = value` (decimal or hex; supports `|`, `&`, `+`, `-`, `~`, `<<`, `>>`)
  - auto-increment when value omitted
  - trailing `// comment` captured and shown in the UI
- Results are cached per header path and invalidated on file changes.

## Example Flow
Inject → `mavlink-enum` (Enum=`MAV_FRAME`, Key=`MAV_FRAME_GLOBAL`) → Debug

Outputs:
```json
{
  "payload": 0,
  "mavlink": {
    "enum": "MAV_FRAME",
    "key": "MAV_FRAME_GLOBAL",
    "value": 0
  }
}

