# Complete Ground Control Station

A full-featured ground control station built entirely in Node-RED, combining all capabilities into one comprehensive dashboard.

## 🎯 What Is This?

This is a **complete, working GCS** that provides:
- ✅ Full flight control (arm, disarm, takeoff, land, RTL)
- ✅ Flight mode switching
- ✅ Real-time telemetry display
- ✅ GPS position tracking
- ✅ Battery monitoring
- ✅ Altitude and speed gauges
- ✅ Attitude display (roll, pitch, yaw)
- ✅ Automatic safety alerts
- ✅ Professional dashboard UI

All in **one importable flow** that works right out of the box!

## 🚀 Quick Start

### Installation

1. **Import the flow:**
   - Open Node-RED
   - Menu (☰) → Import → Clipboard
   - Paste contents of `full-ground-station.json`
   - Click Import

2. **Add your mavlink-comms node:**
   - Drag a mavlink-comms node onto the flow
   - Configure your connection (serial/UDP/TCP)
   - Set dialect to "ardupilotmega" (or your dialect)

3. **Wire it up:**
   - Connect mavlink-comms output → "MAVLink Hub" junction
   - Connect "Command Output" junction → mavlink-msg node
   - Set mavlink-msg to "None (Dynamic)" mode

4. **Deploy:**
   - Click the Deploy button
   - Wait for mavlink-comms to show "connected"

5. **Open the dashboard:**
   - Navigate to http://localhost:1880/ui
   - Your complete GCS is ready!

## 📊 Dashboard Layout

### Flight Controls (Left Column)
**Quick action buttons:**
- 🔴 **ARM** - Arm motors (red = danger!)
- 🟢 **DISARM** - Disarm motors (green = safe)
- 🔵 **TAKEOFF** - Automated takeoff to 10m
- 🟠 **LAND** - Land at current position
- 🟣 **RTL** - Return to launch point

**Mode selector:**
- Dropdown to change flight modes
- STABILIZE, ALT_HOLD, GUIDED, LOITER, RTL, AUTO, LAND, POSHOLD

### Status Panel (Top Right)
**Real-time status:**
- **Armed State** - Red "ARMED" or Green "DISARMED"
- **Flight Mode** - Current mode (GUIDED, AUTO, etc.)
- **GPS Status** - Fix type and satellite count with color coding

### Position Data
**Location information:**
- Latitude (decimal degrees)
- Longitude (decimal degrees)
- GPS Altitude (meters MSL)

### Telemetry Gauges
**Visual indicators:**
- 🔋 **Battery** - Percentage gauge (red < 20%, yellow < 50%, green > 50%)
- ⚡ **Voltage** - Battery voltage in volts
- 🔌 **Current** - Current draw in amps
- 📏 **Altitude** - Height above ground level (meters)

### Flight Data
**Movement information:**
- 🏃 **Groundspeed** - Speed over ground (km/h)
- 🧭 **Heading** - Compass direction (0-360°)
- 🎚️ **Throttle** - Motor power (0-100%)
- ⬆️ **Climb Rate** - Vertical speed (m/s)

### Attitude
**Aircraft orientation:**
- **Roll** - Bank angle (degrees)
- **Pitch** - Nose up/down (degrees)
- **Yaw** - Heading angle (degrees)

### Safety Alerts
**Automatic warnings:**
- 🔴 Low battery alerts (<20%)
- ⚠️ GPS signal loss
- Pop-up toast notifications
- Color-coded status

## 🛫 Using the GCS

### Pre-Flight Checklist

Before arming:

1. ✅ **GPS Status** - Verify "3D FIX" or better with 6+ satellites
2. ✅ **Battery** - Check >80% and voltage is normal
3. ✅ **Armed State** - Confirm shows "DISARMED" (green)
4. ✅ **Position** - Verify lat/lon look reasonable
5. ✅ **Flight Mode** - Set to appropriate mode (STABILIZE, LOITER, etc.)

### Arming and Takeoff

**Method 1: Automated**
1. Click ARM button
2. Wait for "ARMED" status (red)
3. Click TAKEOFF button
4. Vehicle climbs to 10m automatically

**Method 2: Manual Mode**
1. Click ARM button
2. Use RC transmitter for manual takeoff
3. Monitor dashboard during ascent

### During Flight

**Monitor these continuously:**
- 🔋 Battery percentage - Land before 20%!
- 📡 GPS status - Maintain 3D fix
- 📏 Altitude - Stay within safe limits
- 🧭 Heading - Verify flight path
- ⬆️ Climb rate - Check during altitude changes

**Change modes as needed:**
- Use dropdown to switch between LOITER, GUIDED, AUTO, etc.
- Mode changes reflected immediately in status

### Landing

**Option 1: Automatic Land**
- Click LAND button
- Vehicle descends at current position
- Monitor descent until touchdown

**Option 2: Return to Launch**
- Click RTL button
- Vehicle returns to launch point
- Automatically lands at home

**Option 3: Mode Change**
- Select LAND from dropdown
- Same as LAND button

### Post-Flight

After landing:
1. ✅ Verify vehicle on ground
2. ✅ Click DISARM button
3. ✅ Wait for "DISARMED" status (green)
4. ✅ Power down systems

## ⚙️ Customization

### Change Takeoff Altitude

Edit the TAKEOFF button payload:

```json
{
  "messageType": "COMMAND_LONG",
  "command": 22,
  "param7": 20,  // Change this value (meters)
  "target_system": 1,
  "target_component": 1
}
```

### Add More Flight Modes

Edit `ui_mode_selector` options:

```javascript
{"label": "ACRO", "value": 1},
{"label": "SPORT", "value": 13},
// etc.
```

### Adjust Gauge Ranges

Edit gauge nodes (battery, altitude, etc.):
- Change `max` value for upper limit
- Adjust `seg1` and `seg2` for color thresholds

### Add Custom Commands

Copy any button node and change the payload to your desired MAVLink command.

## 🔧 Advanced Features

### Safety Monitoring

Built-in safety checks:
- **Battery <20%** - Critical alert
- **GPS <3D fix** - Warning alert
- Automatic pop-up notifications

### Telemetry Filtering

Optimized message routing:
- Only processes needed message types
- Efficient parsing functions
- Minimal CPU overhead

### Command Validation

All commands logged to debug panel for verification.

## 📡 Telemetry Requirements

For full functionality, vehicle must send:

| Message | Rate | Purpose |
|---------|------|---------|
| HEARTBEAT | 1 Hz | Armed status, flight mode |
| SYS_STATUS | 1 Hz | Battery, sensors |
| GPS_RAW_INT | 1-5 Hz | GPS status, position |
| GLOBAL_POSITION_INT | 5 Hz | Relative altitude |
| VFR_HUD | 4 Hz | Speed, heading, climb |
| ATTITUDE | 10 Hz | Roll, pitch, yaw |

**Most ArduPilot vehicles send these by default.**

If you're missing telemetry, check your stream rates:
- Mission Planner: Config → Planner → Telemetry Rates
- MAVProxy: `set streamrate -1`

## 🐛 Troubleshooting

### No Telemetry Data

**Symptoms:** Blank gauges, no status updates

**Solutions:**
1. ✅ Check mavlink-comms node shows "connected"
2. ✅ Verify wiring to MAVLink Hub junction
3. ✅ Look for messages in debug panel
4. ✅ Confirm vehicle is powered and transmitting
5. ✅ Check telemetry link (cable, radio, WiFi)

### Commands Don't Work

**Symptoms:** Buttons don't affect vehicle

**Solutions:**
1. ✅ Verify Command Output → mavlink-msg wiring
2. ✅ Check mavlink-msg set to "None (Dynamic)"
3. ✅ Look in debug panel for outgoing commands
4. ✅ Confirm vehicle is receiving (check flight controller logs)
5. ✅ Verify system ID matches (usually 1)

### Dashboard Blank

**Symptoms:** http://localhost:1880/ui shows nothing

**Solutions:**
1. ✅ Install node-red-dashboard (Palette Manager)
2. ✅ Open /ui not the editor (/editor)
3. ✅ Check browser console for errors (F12)
4. ✅ Verify all dashboard nodes have group assigned
5. ✅ Try refreshing page (Ctrl+F5)

### Gauges Not Updating

**Symptoms:** Dashboard shows but data doesn't change

**Solutions:**
1. ✅ Check message routing in "Route by Message Type"
2. ✅ Verify parse functions return correct format
3. ✅ Watch debug panel for parsing errors
4. ✅ Confirm messages arriving at hub
5. ✅ Check vehicle is sending required message types

### Slow/Laggy Dashboard

**Symptoms:** Updates delayed, UI sluggish

**Solutions:**
1. ✅ Reduce telemetry stream rates on vehicle
2. ✅ Use Chrome/Chromium browser (fastest)
3. ✅ Close other browser tabs
4. ✅ Check network latency (ping test)
5. ✅ Reduce ATTITUDE update rate (most frequent message)

## ⚠️ Safety Warnings

### This is a TOOL, not a replacement for safe practices!

**ALWAYS:**
- ✅ Maintain visual line of sight
- ✅ Have manual RC override ready and tested
- ✅ Know how to disarm quickly (button + RC)
- ✅ Follow all local aviation regulations
- ✅ Fly only in safe, authorized areas
- ✅ Monitor battery level constantly
- ✅ Have emergency landing plan

**NEVER:**
- ❌ Fly beyond visual range without authorization
- ❌ Rely solely on automation
- ❌ Ignore safety alerts
- ❌ Fly with battery <30% unless landing
- ❌ Fly in bad weather (wind, rain, fog)
- ❌ Fly near people/airports without permission
- ❌ Test new features over unsafe terrain

### Emergency Procedures

**Lost telemetry link:**
1. Don't panic - vehicle continues last command
2. Switch to manual RC control
3. Land as soon as safe
4. Check connection before next flight

**Low battery during flight:**
1. Immediately click RTL or LAND
2. Do NOT continue mission
3. Monitor descent, be ready to take manual control
4. Land ASAP, even if not at home

**GPS signal loss:**
1. Expect vehicle to switch to failsafe (usually LAND)
2. Take manual RC control if possible
3. Land immediately in safe area
4. Do NOT attempt to fly without GPS in AUTO/GUIDED modes

**Unexpected behavior:**
1. Switch to STABILIZE mode (manual control)
2. Take over with RC transmitter
3. Land as soon as safe
4. DISARM after landing
5. Review logs before next flight

## 🎓 Learning More

### Understanding Flight Modes

- **STABILIZE** - Manual flight, self-levels when sticks centered
- **ALT_HOLD** - Holds altitude automatically, manual horizontal
- **LOITER** - GPS position hold, manual inputs move position
- **GUIDED** - Accepts external navigation commands (from GCS)
- **AUTO** - Follows pre-programmed waypoint mission
- **RTL** - Returns to launch point, then lands
- **LAND** - Descends and lands at current position
- **POSHOLD** - Aggressive position hold (brake, then hold)

### Reading the Gauges

**Battery Gauge:**
- Green (>50%) - Normal operation
- Yellow (30-50%) - Start thinking about landing
- Orange (20-30%) - Head back to landing zone
- Red (<20%) - Land immediately!

**Altitude Gauge:**
- Shows height above ground level (AGL)
- Not same as GPS altitude (MSL)
- Based on barometer + GPS

**Heading Compass:**
- 0° = North
- 90° = East
- 180° = South
- 270° = West

**Throttle:**
- 0% = Motors idle (or off if disarmed)
- 50% = Hovering (typical for multirotor)
- 100% = Full power

## 🚀 Next Steps

### Enhance Your GCS

Add more features:
1. **Mission Planning** - Import mission-uploader.json
2. **Parameter Tuning** - Import parameter-tool.json
3. **Data Logging** - Import data-logger.json
4. **Safety Monitoring** - Import safety-monitor.json (more detailed)

### Build Custom Flows

Extend with your own:
- Video feed integration
- Voice alerts (text-to-speech)
- SMS notifications
- Geofence visualization
- Flight path recording/replay
- Custom button panels

### Integration Ideas

Connect to other systems:
- Database logging
- Cloud dashboards
- Mobile app backend
- Voice control (Alexa, Google)
- Automation triggers

## 📚 Additional Resources

- **ArduPilot Docs**: https://ardupilot.org/copter/
- **MAVLink Protocol**: https://mavlink.io/
- **Node-RED Dashboard**: https://flows.nodered.org/node/node-red-dashboard
- **This Package Docs**: See main README.md

## 🤝 Contributing

Improvements welcome!

Ideas for enhancements:
- Video stream embedding
- Map view with flight path
- Vibration level display
- Wind speed/direction
- Better mobile layout
- Dark mode theme

Submit a pull request!

## 📄 License

Same as parent project.

---

## 🎉 Congratulations!

You now have a fully functional ground control station!

**Remember:**
- Start simple (test on ground)
- Learn gradually (one feature at a time)
- Stay safe (monitor everything)
- Have fun (it's amazing what you can build!)

**Happy Flying!** 🚁✨

---

*This GCS was built with ❤️ using Node-RED and MAVLink*
