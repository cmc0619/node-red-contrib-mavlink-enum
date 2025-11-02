# Basic Commands

Essential drone control operations - perfect for getting started!

## Examples

### arm-disarm.json
**Simple arm and disarm controls**

Toggle switch to arm/disarm your vehicle. Uses MAV_CMD_COMPONENT_ARM_DISARM (400).

**How to use:**
1. Import the flow
2. Ensure mavlink-comms is configured and connected
3. Click ARM to arm, DISARM to disarm
4. Watch debug output for confirmation

**Safety:** Always check GPS lock and battery before arming!

---

### takeoff-land.json
**Automated takeoff and landing**

Set altitude and execute automated takeoff, or land at current position.

**How to use:**
1. Edit TAKEOFF inject node to set desired altitude (default 10m)
2. ARM the vehicle first (use arm-disarm flow)
3. Ensure flight mode is GUIDED
4. Click TAKEOFF
5. Click LAND when ready to descend

**Commands used:**
- MAV_CMD_NAV_TAKEOFF (22)
- MAV_CMD_NAV_LAND (21)

**Safety:** Start with low altitudes (2-3m) for testing!

---

### set-flight-mode.json
**Change flight modes**

Quick buttons to switch between common flight modes.

**Modes included:**
- GUIDED - Accept commands from GCS
- AUTO - Execute pre-programmed mission
- LOITER - Hold position with GPS
- RTL - Return to launch
- STABILIZE - Manual RC control with stabilization

**How to use:**
1. Import the flow
2. Click any mode button
3. Vehicle will switch to that mode

**Note:** Mode numbers are for ArduPilot Copter. Plane/Rover have different numbers!

---

### emergency-controls.json
**Emergency return to launch and motor kill**

🚨 **USE WITH EXTREME CAUTION** 🚨

**RETURN TO LAUNCH (Safe)**
- Vehicle climbs to RTL altitude
- Returns to launch point
- Lands automatically

**EMERGENCY MOTOR STOP (Dangerous)**
- Kills motors IMMEDIATELY
- Vehicle will FALL
- Only use as absolute last resort (collision imminent, fire, etc.)

**Safety:**
- Test RTL at safe altitude first
- Emergency stop causes crash - only for emergencies!
- Keep RC transmitter ready for manual override

---

## Customization Tips

**Change target system ID:**
All function nodes have `target_system: 1`. Change this if using multiple vehicles.

**Add confirmation dialogs:**
Insert a ui_confirm node before the function node to prevent accidental commands.

**Combine flows:**
Import multiple flows and wire them together for a complete control panel.

**Add Dashboard buttons:**
Replace inject nodes with ui_button nodes for a web-based control interface.

---

## Troubleshooting

**Command not working:**
- ✅ Check mavlink-comms node is connected (status should show "ready")
- ✅ Verify vehicle is in correct mode (GUIDED for most commands)
- ✅ Check debug output for errors
- ✅ Ensure vehicle is armed (for movement commands)

**Mode change fails:**
- ✅ Some modes require GPS lock
- ✅ Some modes require specific sensors
- ✅ Check vehicle pre-arm checks are passing

**Motors won't arm:**
- ✅ GPS lock required
- ✅ IMU calibration required
- ✅ Battery voltage sufficient
- ✅ No pre-arm check failures

---

## Next Steps

Once comfortable with basic commands, try:
- **Telemetry examples** - Monitor battery, GPS, attitude
- **Advanced examples** - Parameter management, missions
- **Dashboard integration** - Build a web UI for your GCS

Happy flying! 🚁
