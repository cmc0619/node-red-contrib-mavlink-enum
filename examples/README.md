# MAVLink Node-RED Examples

Ready-to-use flow examples for common MAVLink operations. Import these flows into your Node-RED instance to get started quickly!

## 📥 How to Import

1. Copy the contents of any `.json` file
2. In Node-RED, click the menu (☰) → Import → Clipboard
3. Paste the JSON
4. Click "Import"
5. Deploy!

## 📚 Example Categories

### Basic Commands (`basic-commands/`)
Essential drone control operations - perfect for getting started.

- **arm-disarm.json** - Toggle switch to arm/disarm the vehicle
- **takeoff-land.json** - Automated takeoff and landing controls
- **set-flight-mode.json** - Change flight modes (GUIDED, AUTO, LOITER, etc.)
- **emergency-controls.json** - Return to launch and emergency stop

### Telemetry Display (`telemetry/`)
Monitor your drone's status in real-time with Dashboard widgets.

- **gps-display.json** - Live GPS position and satellite count
- **battery-gauge.json** - Battery percentage and voltage monitoring
- **status-panel.json** - Armed state, flight mode, GPS fix status
- **altitude-speed.json** - Real-time altitude and airspeed gauges

### Advanced Tools (`advanced/`)
Power user features for mission planning, parameter tuning, and safety.

- **parameter-tool.json** - Read and write vehicle parameters
- **safety-monitor.json** - Automated safety alerts and warnings
- **mission-uploader.json** - Upload waypoint missions from CSV/JSON
- **data-logger.json** - Record all MAVLink traffic to file

### Complete Ground Station (`complete-gcs/`)
Full-featured ground control station in a single flow.

- **full-ground-station.json** - Everything combined into one comprehensive dashboard

## 🔧 Requirements

Most examples require:
- ✅ `node-red-contrib-mavlink` (this package)
- ✅ A mavlink-comms node configured and connected

Dashboard examples additionally require:
- 📊 `node-red-dashboard` - Install via Palette Manager

## 🚁 Quick Start

**Simplest setup:**

1. Import `basic-commands/arm-disarm.json`
2. Add your own mavlink-comms node
3. Wire it up (or leave unwired - they use internal bus!)
4. Deploy and click the inject button to arm

## 💡 Tips

- **No wired connections needed!** Most flows use the internal message bus
- **Mix and match** - Import multiple flows to build your custom GCS
- **Customize freely** - All flows are fully editable
- **Dashboard Port** - Dashboard UI available at `http://localhost:1880/ui`

## 🆘 Troubleshooting

**Flow doesn't work:**
- ✅ Check mavlink-comms node is deployed and shows "ready"
- ✅ Verify dialect matches (usually "common" or "ardupilotmega")
- ✅ Check Node-RED debug panel for errors

**Dashboard is blank:**
- ✅ Install `node-red-dashboard` from Palette Manager
- ✅ Go to `http://localhost:1880/ui` (not the editor)
- ✅ Check Dashboard tab is configured in flow

## 📖 Learning Resources

Each example folder has its own README with:
- Detailed explanations
- Customization instructions
- MAVLink command references
- Troubleshooting tips

Start with `basic-commands/README.md` for beginner-friendly guides!

## 🤝 Contributing

Have a useful flow to share?
1. Export your flow
2. Add it to the appropriate folder
3. Include a README explaining what it does
4. Submit a pull request!

---

Happy Flying! 🚁
