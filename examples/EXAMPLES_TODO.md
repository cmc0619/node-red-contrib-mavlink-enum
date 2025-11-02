# Examples TODO - Remaining Flows to Build

## ✅ Completed (Tier 1: Basic Commands)
- arm-disarm.json
- takeoff-land.json
- set-flight-mode.json
- emergency-controls.json

---

## 📊 Tier 2: Telemetry Display (Requires node-red-dashboard)

### gps-display.json
**Real-time GPS monitoring**

**What it does:**
- Receives GPS_RAW_INT messages from mavlink-comms
- Displays latitude, longitude, altitude
- Shows GPS fix type and satellite count
- Optional: Worldmap widget showing drone position

**Nodes:**
- mavlink-comms output → mavlink-msg (parse mode)
- Switch node to filter GPS_RAW_INT
- Function to extract lat/lon/alt/sats
- Dashboard gauges for each value
- Optional: ui_worldmap for position display

---

### battery-gauge.json
**Battery monitoring with alerts**

**What it does:**
- Receives SYS_STATUS messages
- Shows battery percentage, voltage, current
- Color-coded gauge (green >50%, yellow 30-50%, red <30%)
- Alert when below 20%

**Nodes:**
- mavlink-comms → filter SYS_STATUS
- Extract battery_remaining, voltage_battery, current_battery
- Dashboard gauges with thresholds
- Notification node for low battery alert

---

### status-panel.json
**Vehicle status dashboard**

**What it does:**
- Armed/disarmed indicator
- Current flight mode
- GPS fix status
- System health
- Connection status

**Nodes:**
- HEARTBEAT → armed status, flight mode
- GPS_RAW_INT → GPS fix
- SYS_STATUS → system health
- Dashboard text/LED widgets
- Color coding for status

---

### altitude-speed.json
**Flight data gauges**

**What it does:**
- Altitude (relative and absolute)
- Airspeed and groundspeed
- Vertical speed (climb/descent rate)
- Heading

**Nodes:**
- VFR_HUD message → extract all flight data
- Dashboard gauges for each metric
- Chart showing altitude over time
- Compass widget for heading

---

## 🔧 Tier 3: Advanced Tools

### parameter-tool.json
**Read and write vehicle parameters**

**What it does:**
- Text input for parameter name
- Button to read current value
- Input to set new value
- Button to write parameter
- Display parameter list

**Nodes:**
- PARAM_REQUEST_READ command builder
- PARAM_SET command builder
- PARAM_VALUE message parser
- Dashboard form for input
- Table showing parameters

**Example use:**
- Read RTL_ALT parameter
- Set new value
- Confirm write successful

---

### safety-monitor.json
**Automated safety alerts**

**What it does:**
- Monitor battery < 20% → alert
- GPS fix lost → warning
- Geofence breach → alarm
- Mode change → notification
- Connection lost → critical alert

**Nodes:**
- Multiple message filters
- Switch nodes for conditions
- Notification nodes (email, pushover, etc.)
- Dashboard alert banner
- Audio alerts via TTS

**Configurable thresholds:**
- Battery warning level
- GPS sat count minimum
- Altitude limits
- Distance from home

---

### mission-uploader.json
**Upload waypoint missions**

**What it does:**
- Load mission from CSV/JSON
- Parse waypoint data
- Send MISSION_COUNT
- Upload each MISSION_ITEM
- Verify upload complete

**Example CSV:**
```
seq,lat,lon,alt,command
0,47.123,-122.456,10,16
1,47.124,-122.457,20,16
2,47.125,-122.458,15,21
```

**Nodes:**
- File read node
- CSV parser
- Mission upload sequence
- MISSION_ITEM builder
- Progress indicator

---

### data-logger.json
**Record all MAVLink traffic**

**What it does:**
- Log all messages to file
- Timestamp each message
- Filter by message type (optional)
- Export to CSV
- Replay capability

**Nodes:**
- mavlink-comms output → file write
- JSON formatting
- Timestamp injection
- File rotation (daily/hourly)
- Replay inject from file

**Output format:**
```json
{"timestamp": "2025-01-01T12:00:00Z", "message": "HEARTBEAT", "data": {...}}
```

---

## 🎮 Tier 4: Complete Ground Station

### full-ground-station.json
**Everything combined**

**What it includes:**
- Left panel: Commands (arm, takeoff, land, RTL, modes)
- Center: Map with drone position
- Right panel: Telemetry (battery, GPS, altitude, speed)
- Bottom: Status indicators
- Top: Connection status, alerts

**Dashboard tabs:**
- Flight Control
- Telemetry
- Mission Planning
- Parameters
- Logs

**Full featured GCS in Node-RED!**

---

## 🎯 Priority Order

**Build next:**
1. gps-display.json (most useful telemetry)
2. battery-gauge.json (safety critical)
3. status-panel.json (situational awareness)
4. parameter-tool.json (essential for tuning)
5. safety-monitor.json (automated safety)
6. mission-uploader.json (mission planning)
7. altitude-speed.json (flight data)
8. data-logger.json (debugging)
9. full-ground-station.json (combines everything)

**Estimated time:**
- Each telemetry example: 30-45 mins
- Advanced tools: 1-2 hours each
- Full GCS: 3-4 hours

**Total remaining: ~10-12 hours of work**

---

## 📝 Notes for Implementation

**Dashboard widgets to use:**
- ui_gauge - For numeric displays with thresholds
- ui_chart - For time series data
- ui_text - For status displays
- ui_led - For boolean indicators
- ui_button - For command triggers
- ui_form - For parameter input
- ui_table - For parameter lists
- ui_worldmap - For GPS position (requires extra install)

**Message types needed:**
- HEARTBEAT (0) - Armed state, flight mode
- SYS_STATUS (1) - Battery, system health
- GPS_RAW_INT (24) - GPS position, fix, sats
- ATTITUDE (30) - Roll, pitch, yaw
- GLOBAL_POSITION_INT (33) - Lat/lon/alt
- VFR_HUD (74) - Airspeed, groundspeed, heading, altitude
- PARAM_VALUE (22) - Parameter responses

**Common patterns:**
1. mavlink-comms → filter specific message → extract fields → dashboard
2. dashboard input → build command → mavlink-msg → drone
3. Condition check → notification → dashboard alert

---

Ready to build these when you are! Just pick one and I'll create it. 🚁
