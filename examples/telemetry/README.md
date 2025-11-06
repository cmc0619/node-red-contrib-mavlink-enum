# MAVLink Telemetry Dashboards

This folder contains Node-RED dashboard flows for visualizing MAVLink telemetry data from drones and flight controllers.

## Available Dashboards

### 1. Comprehensive Telemetry (`comprehensive-telemetry.json`)

**The complete all-in-one telemetry solution** - includes everything you need for monitoring your drone.

**Features:**
- **Flight Data**: Altitude (MSL/AGL), speeds, climb rate, heading, throttle
- **Battery Monitoring**: Percentage, voltage, current, power, temperature, cell voltages
- **Attitude**: Roll, pitch, yaw angles
- **GPS**: Satellite count, fix type, accuracy metrics (EPH/EPV)
- **Vibration Analysis**: X/Y/Z vibration levels with clipping detection
- **ESC Telemetry**: All 4 ESCs (RPM, voltage, current, temperature)
- **Terrain**: Terrain height, clearance, loading status
- **System Health**: EKF status, power supply voltages, wind data
- **Navigation**: Waypoint distance, crosstrack error, navigation errors
- **Environment**: Barometric pressure, temperature

**Setup:**
1. Import `comprehensive-telemetry.json` into Node-RED
2. Wire your `mavlink-comms` output → `Message Router` node
3. Deploy and open dashboard at `http://localhost:1880/ui`

**Requirements:**
- node-red-dashboard
- MAVLink connection to drone/simulator

**Best For:** Complete monitoring, autonomous missions, advanced users

---

### 2. Flight Data Gauges (`altitude-speed.json`)

**Essential flight metrics** - the basics you need for safe flying.

**Features:**
- Altitude (MSL and AGL)
- Airspeed and groundspeed
- Climb rate with visual indicators
- Heading compass
- Throttle gauge
- Battery percentage, voltage, current, power
- Altitude history chart (5 minutes)

**Setup:**
1. Import `altitude-speed.json` into Node-RED
2. Wire `mavlink-comms` output to all three filter nodes:
   - Filter VFR_HUD
   - Filter GLOBAL_POSITION_INT
   - Filter SYS_STATUS
3. Deploy and open dashboard

**Best For:** Basic flight monitoring, learning, simple missions

---

### 3. Battery Monitor (`battery-gauge.json`)

**Dedicated battery monitoring** with low battery alerts.

**Features:**
- Battery percentage gauge (color-coded)
- Voltage and current display
- Low battery alert (<20%)
- Toast notifications for critical battery

**Alert Thresholds:**
- 🔴 Critical (<20%): Land immediately!
- 🟠 Warning (20-30%): Return to launch
- 🟡 Caution (30-50%): Monitor closely
- 🟢 Good (>50%): All systems go

**Setup:**
1. Import `battery-gauge.json` into Node-RED
2. Wire `mavlink-comms` output → `Filter SYS_STATUS` node
3. Deploy and open dashboard

**Best For:** Battery-focused monitoring, endurance testing, battery health checks

---

## Dashboard Comparison

| Feature | Comprehensive | Flight Data | Battery |
|---------|--------------|-------------|---------|
| Flight Data | ✅ | ✅ | ❌ |
| Battery Basic | ✅ | ✅ | ✅ |
| Battery Advanced | ✅ | ❌ | ❌ |
| Attitude | ✅ | ❌ | ❌ |
| GPS | ✅ | ❌ | ❌ |
| Vibration | ✅ | ❌ | ❌ |
| ESC Telemetry | ✅ | ❌ | ❌ |
| Terrain | ✅ | ❌ | ❌ |
| System Health | ✅ | ❌ | ❌ |
| Navigation | ✅ | ❌ | ❌ |
| Complexity | High | Medium | Low |

## Quick Start

### Installation

1. **Install node-red-dashboard:**
   ```bash
   cd ~/.node-red
   npm install node-red-dashboard
   ```

2. **Restart Node-RED:**
   ```bash
   node-red-restart
   # or
   sudo systemctl restart nodered
   ```

3. **Import a dashboard:**
   - Open Node-RED editor
   - Menu → Import → select a JSON file
   - Deploy

4. **Connect MAVLink:**
   - Add `mavlink-comms` node
   - Configure your connection (serial/UDP/TCP)
   - Wire to dashboard input
   - Deploy

5. **View dashboard:**
   - Open `http://localhost:1880/ui` (or your Node-RED IP)

### Testing with Simulator

**ArduPilot SITL (Software In The Loop):**
```bash
# Start SITL
sim_vehicle.py -v ArduCopter --console --map

# Connect Node-RED mavlink-comms to:
# UDP: localhost:14550
```

**QGroundControl Simulator:**
- QGC → Application Settings → Comm Links → Add
- Type: UDP, Port: 14550
- Connect Node-RED to same port

## Understanding the Data

### Battery Voltage Conversion

The formula `voltage_battery / 1000` is **correct**:
- MAVLink sends voltage in **millivolts** (mV)
- Dividing by 1000 converts to volts (V)
- Example: 12600 mV → 12.6 V (fully charged 3S LiPo)

**Typical Battery Voltages:**
- **3S LiPo**: 9.0V (empty) to 12.6V (full), nominal 11.1V
- **4S LiPo**: 12.0V (empty) to 16.8V (full), nominal 14.8V
- **6S LiPo**: 18.0V (empty) to 25.2V (full), nominal 22.2V

### Altitude Types

- **MSL (Mean Sea Level)**: Absolute altitude above sea level
  - Useful for terrain clearance
  - From barometer + GPS

- **AGL (Above Ground Level)**: Relative altitude from takeoff point
  - Your actual flight height
  - What you set in mission planner

### GPS Fix Types

- **No Fix (0-1)**: No GPS lock - DO NOT FLY!
- **2D Fix (2)**: Latitude/longitude only - not safe
- **3D Fix (3)**: Full position lock - safe to fly
- **DGPS (4)**: Differential GPS - enhanced accuracy
- **RTK Float (5)**: Real-Time Kinematic float - very accurate
- **RTK Fixed (6)**: RTK fixed - centimeter accuracy

### Vibration Levels

Good vibration levels are typically:
- **< 15 m/s²**: Excellent
- **15-30 m/s²**: Acceptable
- **30-60 m/s²**: High - check prop balance, motor mounts
- **> 60 m/s²**: Critical - land immediately

**Clipping** indicates accelerometer saturation - always bad!

### EKF Status

The Extended Kalman Filter (EKF) fuses sensor data. Health indicators:
- **✓ Healthy**: All systems nominal
- **⚠️ Degraded**: Reduced performance, monitor closely
- **❌ Poor**: Major issues - may lose position hold

## Customization

### Changing Units

Edit the parsing functions to change units:

**Speed Units:**
```javascript
// Current: km/h
const speedKmh = speed * 3.6;

// For mph:
const speedMph = speed * 2.237;

// For knots:
const speedKnots = speed * 1.944;
```

**Altitude Units:**
```javascript
// Current: meters
const altitude = vfr.alt;

// For feet:
const altitudeFeet = vfr.alt * 3.281;
```

### Adjusting Alert Thresholds

Edit the `parse_sys_status` function:

```javascript
// Change from 20% to 30%:
const lowBatteryAlert = batteryPercent < 30;

// Add medium battery alert:
const mediumBatteryAlert = batteryPercent >= 30 && batteryPercent < 50;
```

### Gauge Ranges

Edit gauge node properties:
- `min`: Minimum value
- `max`: Maximum value
- `seg1`, `seg2`: Color segment boundaries

Example: Increase altitude gauge max to 1000m for high-altitude flights.

### Chart History

Edit chart node `removeOlder` property:
- `"1"` = 1 minute
- `"5"` = 5 minutes (default)
- `"60"` = 1 hour

## Troubleshooting

### No Data Displayed

1. **Check MAVLink connection:**
   - Verify `mavlink-comms` node is connected
   - Check connection parameters (IP, port, baud rate)
   - Look for "connected" status

2. **Check message types:**
   - Add `debug` node after `mavlink-comms`
   - Verify messages are arriving
   - Check dialect selection (use `ardupilotmega` for ArduPilot)

3. **Check wiring:**
   - Ensure `mavlink-comms` output connects to dashboard input
   - Verify all wires are connected
   - Look for disconnected nodes (orange triangle)

### Gauges Not Updating

1. **Check message rate:**
   - Most MAVLink messages send at 1-5 Hz
   - Low rates normal for some messages (TERRAIN_REPORT, etc.)
   - Increase stream rates in flight controller if needed

2. **Check dashboard:**
   - Refresh browser page
   - Clear browser cache
   - Try different browser

### Incorrect Values

1. **Battery voltage too high/low:**
   - Check battery sensor calibration in flight controller
   - Verify battery type settings (cell count)
   - Measure actual voltage with multimeter

2. **Altitude jumping:**
   - Normal during GPS acquisition
   - Check barometer calibration
   - Ensure proper ventilation of flight controller

3. **GPS accuracy poor:**
   - Check antenna placement (clear sky view)
   - Verify GPS is locked before arming
   - Consider GPS module upgrade

### ESC Telemetry Not Showing

ESC telemetry requires:
- ESCs with telemetry capability (BLHeli_S/BLHeli_32)
- Telemetry wired to flight controller
- ESC telemetry enabled in flight controller parameters
- Not all ESCs support this feature

## Message Reference

### Messages Used by Each Dashboard

**Comprehensive:**
- VFR_HUD, GLOBAL_POSITION_INT, SYS_STATUS
- BATTERY_STATUS, ATTITUDE, GPS_RAW_INT
- VIBRATION, ESC_TELEMETRY_1_TO_4
- TERRAIN_REPORT, EKF_STATUS_REPORT
- WIND, POWER_STATUS
- NAV_CONTROLLER_OUTPUT, SCALED_PRESSURE

**Flight Data Gauges:**
- VFR_HUD, GLOBAL_POSITION_INT, SYS_STATUS

**Battery Monitor:**
- SYS_STATUS

### Typical Message Rates

| Message | Rate | Purpose |
|---------|------|---------|
| HEARTBEAT | 1 Hz | System status |
| VFR_HUD | 4 Hz | Flight data |
| GLOBAL_POSITION_INT | 10 Hz | GPS position |
| ATTITUDE | 10 Hz | Orientation |
| SYS_STATUS | 1 Hz | Battery, errors |
| GPS_RAW_INT | 1 Hz | GPS details |
| VIBRATION | 1 Hz | Vibration levels |
| BATTERY_STATUS | 1 Hz | Advanced battery |
| ESC_TELEMETRY | 5 Hz | ESC data |

## Safety Notes

### Critical Warnings

⚠️ **NEVER rely solely on telemetry dashboards for flight safety**

- Always maintain visual line of sight
- Monitor RC transmitter battery level indicator
- Set RTL (Return To Launch) failsafes
- Pre-flight check all systems
- Land with 20%+ battery when possible

### Battery Safety

🔋 **LiPo Battery Rules:**

1. **Never fully drain** - Land at 20% minimum
2. **Monitor voltage sag** - High current causes voltage drop
3. **Account for return trip** - Save battery for return
4. **Cold weather** - Capacity reduced significantly
5. **Cell balance** - Check individual cell voltages
6. **Storage voltage** - 3.8V per cell when not flying

### Flight Planning

✈️ **Pre-Flight Checklist:**

- [ ] Battery fully charged and balanced
- [ ] GPS 3D fix with 8+ satellites
- [ ] EKF status healthy
- [ ] Barometer reading correct altitude
- [ ] Compass calibrated
- [ ] Vibration levels normal
- [ ] ESC telemetry (if available) all responding
- [ ] Dashboard displaying all expected data
- [ ] Failsafes configured (battery, GPS, RC loss)

## Support & Resources

### Documentation

- **Node-RED Dashboard**: https://flows.nodered.org/node/node-red-dashboard
- **MAVLink Protocol**: https://mavlink.io/en/
- **ArduPilot**: https://ardupilot.org/
- **node-mavlink**: https://www.npmjs.com/package/node-mavlink

### Getting Help

If you have issues:
1. Check Node-RED debug panel for errors
2. Verify MAVLink messages with debug node
3. Check flight controller parameters
4. Review ArduPilot/PX4 logs
5. Open issue on GitHub repository

### Contributing

Found a bug? Have an improvement?
- Open an issue with details
- Submit a pull request
- Share your custom dashboards!

## License

These examples are part of node-red-contrib-mavlink-aigen.
See main repository for license information.

---

**Happy Flying! 🚁**

*Remember: Safety first, telemetry second. Never fly beyond your capabilities.*
