# MAVLink Node-RED Testing Suite

Comprehensive automated test suite for MAVLink GCS nodes with simulated drone responses.

## Test Flows

1. **test-dashboard.json** - 🎯 **START HERE** - Unified control panel for all tests
2. **simulated-drone-test.json** - Complete GCS + simulated drone with 3 test modes
3. **telemetry-test.json** - Telemetry streaming and validation (ATTITUDE, GPS, BATTERY, etc.)
4. **command-test.json** - Command protocol testing (ARM, TAKEOFF, LAND, RTL)
5. **parameter-test.json** - Parameter read/write protocol

## Quick Start with Dashboard

**Easiest way to run all tests:**

1. Import all 5 test flow JSON files into Node-RED
2. Deploy all flows
3. Open the **MAVLink Test Dashboard** tab
4. Click **RUN ALL TESTS** button for automated full suite
5. Or use individual test buttons for targeted testing
6. Click **Show Test Summary** to see aggregated results

The dashboard provides:
- Single control panel for all test suites
- One-click execution of individual tests or full suite
- Centralized results collection and monitoring
- Real-time status indicators for each test type
- Test sequence coordination (runs tests with appropriate delays)

## Overview

This test suite validates that Node-RED GCS nodes correctly handle:
- Mission uploads with edge cases (scientific notation, NaN, extreme coordinates)
- Various drone response patterns (success, random valid data, failures)
- Protocol timeouts and error handling

## Architecture

```
┌─────────────────────────────────────┐
│  Node-RED GCS (under test)          │
│  - MAVLink Mission Manager          │
│  - MAVLink Msg Nodes                │
│  - MAVLink Comms (UDP:14550)        │
└──────────┬──────────────────────────┘
           │ (UDP localhost)
┌──────────▼──────────────────────────┐
│  Simulated Drone (test fixture)     │
│  - MAVLink Comms (UDP:14551)        │
│  - Mode-driven behavior             │
│  - Response generator               │
└─────────────────────────────────────┘
```

## Installation

**Option 1: Quick Start with Dashboard (Recommended)**
1. Import all 5 test flow JSON files into Node-RED:
   - `test-dashboard.json` (control panel)
   - `simulated-drone-test.json`
   - `telemetry-test.json`
   - `command-test.json`
   - `parameter-test.json`
2. Deploy all flows
3. Open the "MAVLink Test Dashboard" tab
4. Click buttons to run tests

**Option 2: Individual Test Flows**
1. Import specific test flow(s) you want to use
2. Deploy the flow(s)
3. Each flow has its own inject buttons for test scenarios
4. All flows use localhost UDP (GCS:14550, Drone:14551)

## Test Modes

### 1. Happy Path
**Purpose**: Validate normal successful operation

**Drone Behavior**:
- Responds to HEARTBEAT with valid HEARTBEAT
- Accepts MISSION_COUNT and requests each waypoint in sequence
- Sends MISSION_ACK(ACCEPTED) after final waypoint

**Expected Result**: Mission upload completes successfully with green status

### 2. Chaos
**Purpose**: Validate robustness against valid but unexpected responses

**Drone Behavior**:
- Random system IDs (0, 1, 255) in responses
- Random delays (0-500ms) before responding
- Occasional duplicate MISSION_REQUEST for same waypoint
- Random but valid parameter values

**Expected Result**: GCS handles gracefully, either completes or times out cleanly

### 3. Failure
**Purpose**: Validate error handling

**Drone Behavior**:
- Responds to MISSION_COUNT with MISSION_ACK(DENIED)
- Rejects all commands with COMMAND_ACK(FAILED)
- No responses to param requests

**Expected Result**: GCS displays error messages, doesn't hang, fails cleanly

## Running Tests

### 1. Set Test Mode
Click one of the mode inject buttons:
- **Mode: Happy Path** - Test normal success flow
- **Mode: Chaos** - Test with random valid responses
- **Mode: Failure** - Test rejection handling

### 2. Run Test Scenario
Click a test scenario inject button:
- **Test: Heartbeat** - Basic connectivity test
- **Test: Mission Upload** - Full mission protocol with edge cases

### 3. View Results
- Watch the debug panel for real-time test results
- Click **Show All Results** to see summary
- Click **Clear Results** to reset for new test run

## Test Scenarios

### Heartbeat Test
- Sends HEARTBEAT from GCS
- Expects HEARTBEAT response from drone
- **Pass**: Response received
- **Fail**: No response within 10 seconds

### Mission Upload Test
Tests mission upload with edge cases:

**Waypoint 1** (Home):
- Standard waypoint at Australian coordinates
- Tests basic protocol

**Waypoint 2** (Edge cases):
- `param1`: `1e-3` - Tests scientific notation parsing
- `param4`: `NaN` - Tests NaN preservation (don't change yaw)

**Waypoint 3** (Extremes):
- `lat`: 89.999999, `lon`: -179.999999 - Tests int32 overflow clamping
- `param2`: `2.5e6` - Tests large scientific notation

**Pass Conditions**:
- Happy mode: MISSION_ACK(ACCEPTED) received
- Failure mode: MISSION_ACK(DENIED) received and GCS shows error
- Chaos mode: Protocol completes or times out gracefully

**Fail Conditions**:
- Unexpected ACK type for the mode
- Timeout (>10 seconds)
- GCS hangs or crashes

## Interpreting Results

Results are logged to debug panel with structure:
```json
{
  "test": "Mission Upload (3 waypoints)",
  "mode": "happy",
  "elapsed": 1234,
  "message": "MISSION_ACK",
  "status": "PASS",
  "details": "Mission accepted (expected in happy mode)"
}
```

Summary format:
```json
{
  "total": 5,
  "passed": 4,
  "failed": 1,
  "results": [...]
}
```

## Expected Test Matrix

| Test Scenario      | Happy Mode | Chaos Mode | Failure Mode |
|-------------------|------------|------------|--------------|
| Heartbeat         | PASS       | PASS       | FAIL*        |
| Mission Upload    | PASS       | PASS       | PASS**       |

\* Failure mode: Drone doesn't respond to heartbeat
\*\* Failure mode: Should PASS if GCS correctly handles rejection

## Troubleshooting

**No responses from drone**:
- Check both comms nodes are deployed and connected
- Verify UDP ports 14550 and 14551 aren't in use
- Check Node-RED logs for connection errors

**Tests always timeout**:
- Ensure "Set Test Mode" was clicked before running test
- Check flow context isn't corrupted (restart Node-RED)
- Verify localhost UDP works: `nc -u 127.0.0.1 14550`

**Results show all FAIL**:
- Check test verifier logic matches your expectations
- Verify mode is set correctly (check status on "Set Test Mode" node)
- Review debug logs for unexpected message types

## Extending Tests

To add new test scenarios:

1. Add inject node with test trigger
2. Create function node to build test message
3. Wire to appropriate GCS node (msg/mission/comms)
4. Update test verifier to check for new success/fail conditions
5. Document expected behavior in this README

---

## Test Flow 1: Test Dashboard (Control Panel)

**File**: `test-dashboard.json`

### Purpose
Provides a unified control panel for running and monitoring all MAVLink test suites from a single interface. This is the recommended starting point for testing.

### Features
- **Centralized Test Execution** - All test types accessible from one dashboard
- **Results Collection** - Aggregates results from all test flows in real-time
- **Test Sequencing** - "RUN ALL TESTS" button executes full suite with proper timing
- **Individual Test Controls** - Buttons for each test scenario
- **Summary Reports** - View aggregated statistics and recent results
- **Clear Results** - Reset result history between test runs

### Test Categories on Dashboard

**Mission Upload Tests:**
- Mission: Happy Path
- Mission: Chaos
- Mission: Failure

**Telemetry Streaming:**
- Start Telemetry Stream
- Stop Telemetry Stream

**Command Protocol:**
- CMD: ARM
- CMD: TAKEOFF
- CMD: LAND
- CMD: RTL
- Full Flight Sequence

**Parameter Operations:**
- Request All Params
- Set Parameter

### Usage

**Quick Test (Full Suite):**
1. Import all 5 test flows into Node-RED
2. Deploy all flows
3. Open "MAVLink Test Dashboard" tab
4. Click **RUN ALL TESTS**
5. Watch debug panel for results
6. Click **Show Test Summary** for overview

**Individual Test:**
1. Click any specific test button (e.g., "Mission: Happy Path")
2. Results appear in debug panel
3. Node status indicators show real-time progress

**Managing Results:**
- **Show Test Summary** - Display aggregated statistics and recent results
- **Clear Results** - Reset the results buffer (keeps last 100 results)

### How It Works

The dashboard uses function nodes as "coordinators" that:
1. Receive test triggers from inject buttons
2. Format test messages with timestamps
3. Route to centralized results collector
4. Update node status indicators

The **Results Collector** maintains a circular buffer of the last 100 test results and can generate summaries showing:
- Total number of results collected
- Number of unique test types run
- Count per test type
- First and last execution time for each test type
- Latest 10 results

The **RUN ALL TESTS** sequencer executes tests with appropriate delays:
- Mission test (immediate)
- Telemetry start (3s delay)
- Telemetry stop (8s - allowing 5s of streaming)
- Commands in sequence (9-12s)
- Parameter operations (14-16s)

### Integration Notes

This dashboard flow is designed to complement the other test flows, not replace them. It provides:
- **Coordination layer** - Triggers tests in other flows
- **Results aggregation** - Collects outputs from all flows
- **Convenience controls** - One-click access to all tests

For the dashboard to work effectively, all underlying test flows must be imported and deployed. The dashboard buttons trigger the same test scenarios as clicking buttons in individual test flows.

---

## Test Flow 2: Telemetry Test

**File**: `telemetry-test.json`

### Purpose
Validates telemetry message handling with realistic simulated drone streaming common telemetry at 10Hz.

### Features
- **Simulated drone telemetry generator** - Streams at 10Hz with realistic flight motion
- **Message types tested**:
  - `HEARTBEAT` - Connection and system status
  - `ATTITUDE` - Roll/pitch/yaw with rates (±15° roll, ±10° pitch)
  - `GLOBAL_POSITION_INT` - GPS lat/lon/alt with movement
  - `VFR_HUD` - Airspeed, groundspeed, heading, throttle, climb
  - `SYS_STATUS` - Battery voltage, current, % remaining
  - `GPS_RAW_INT` - GPS fix type, satellites, HDOP/VDOP
- **Verification nodes** - Each message type has validator checking ranges and values
- **Visual indicators** - Node status shows real-time values (altitude, battery %, etc.)

### Usage
1. Import `telemetry-test.json`
2. Deploy flow
3. Click **"Start Telemetry Stream"**
4. Watch debug panel for PASS/FAIL results
5. Verify node status indicators update in real-time
6. Click **"Stop Telemetry Stream"** when done
7. Click **"Show Test Summary"** for instructions

### What's Tested
- Telemetry parsing and field extraction
- Value range validation (e.g., roll ±20°, battery 10-13V)
- Message frequency (10Hz = 100ms intervals)
- Coordinate system conversions (degE7 to degrees, etc.)
- Scientific notation handling (battery current, speeds)

### Expected Results
All verifier nodes should show **green status** with values updating in real-time.

---

## Test Flow 3: Command Test

**File**: `command-test.json`

### Purpose
Tests MAVLink command protocol with `COMMAND_LONG` messages and `COMMAND_ACK` responses.

### Features
- **Commands tested**:
  - `MAV_CMD_COMPONENT_ARM_DISARM` (ARM/DISARM)
  - `MAV_CMD_NAV_TAKEOFF` (with altitude parameter)
  - `MAV_CMD_NAV_LAND`
  - `MAV_CMD_NAV_RETURN_TO_LAUNCH`
- **Simulated drone handler** - Responds to commands with realistic ACKs
- **Result validation** - Verifies correct command ID and ACK result
- **Sequence runner** - Automated full flight sequence

### Usage

**Individual Command Tests:**
1. Import `command-test.json`
2. Deploy flow
3. Click any command inject: **Test: ARM**, **Test: TAKEOFF**, **Test: LAND**, **Test: RTL**, **Test: DISARM**
4. Watch debug panel for COMMAND_ACK verification
5. Verify node status shows PASS/FAIL

**Automated Sequence:**
1. Click **"Run Full Sequence"**
2. Watches ARM → TAKEOFF (2s) → LAND (5s) → RTL (8s) → DISARM (10s) automatically
3. All results appear in debug panel

### What's Tested
- Command message formatting
- Parameter passing (e.g., TAKEOFF altitude)
- COMMAND_ACK parsing
- Result codes (0=ACCEPTED, 1=TEMP_REJECTED, 2=DENIED, 3=UNSUPPORTED)
- Round-trip timing

### Expected Results
All commands should receive **COMMAND_ACK with result=0** (ACCEPTED).

---

## Test Flow 4: Parameter Test

**File**: `parameter-test.json`

### Purpose
Tests parameter read/write protocol with simulated drone parameter storage.

### Features
- **Simulated drone parameters**:
  - `TEST_PARAM_1` = 42.5 (scientific notation test)
  - `TEST_PARAM_2` = 1e-3 (small scientific notation)
  - `TEST_PARAM_3` = 2.5e6 (large scientific notation)
  - `ARMING_CHECK` = 1 (UINT8)
  - `BATT_CAPACITY` = 5000 (UINT16)
- **Operations tested**:
  - `PARAM_REQUEST_LIST` - Request all parameters
  - `PARAM_SET` - Write parameter value
  - `PARAM_REQUEST_READ` - Read single parameter (by ID or index)
- **Verification** - Validates PARAM_VALUE responses

### Usage

**Request All Parameters:**
1. Import `parameter-test.json`
2. Deploy flow
3. Click **"Request All Parameters"**
4. Watch debug panel - should receive 5 PARAM_VALUE messages
5. Verify all parameters received (index 0-4 of 5)

**Set Parameter:**
1. Click **"Set Parameter"** (sets TEST_PARAM_1 to 99.5)
2. Verify PARAM_VALUE response confirms new value
3. Click "Request All Parameters" again to verify persistence

### What's Tested
- PARAM_REQUEST_LIST protocol
- PARAM_VALUE parsing
- Parameter ID string handling (16 chars max)
- Parameter types (REAL32, UINT8, UINT16, etc.)
- Scientific notation in parameter values
- PARAM_SET confirmation

### Expected Results
- Request all: Receive 5 parameters (0/5, 1/5, 2/5, 3/5, 4/5)
- Set param: Receive confirmation with new value
- All should show **green PASS status**

---

## Connection Architecture

All test flows use localhost UDP for communication:

```
GCS Nodes (under test)        Simulated Drone
  UDP:14550               ↔      UDP:14551
```

This allows multiple test flows to run simultaneously since each flow has its own comms nodes.

---

## Tips for Testing with Navio2

When you're ready to test with real hardware:

1. **Change connection in GCS comms node:**
   - For **Serial/UART**: `connectionType: "serial"`, `serialPort: "/dev/ttyAMA0"`
   - For **ArduPilot UDP**: `udpBindHost: "127.0.0.1"`, `udpBindPort: "14550"` (default)

2. **Remove simulated drone comms** - Navio2 runs real ArduPilot

3. **Adjust validation ranges** - Real telemetry will differ from simulated values

4. **Monitor at lower rate** - Real drones may stream at 4Hz or adjustable rates

## Future Enhancements

**Completed:**
- [x] Add parameter request/set tests (parameter-test.json)
- [x] Test command (MAV_CMD_*) protocol (command-test.json)
- [x] Add telemetry stream tests (telemetry-test.json - 6 message types)
- [x] Create dashboard UI for test control (test-dashboard.json)
- [x] Add mission protocol tests (simulated-drone-test.json - 3 test modes)

**Potential Future Work:**
- [ ] Export test results to JSON/CSV for CI/CD integration
- [ ] Add performance metrics (latency, throughput tracking)
- [ ] Test fence and rally point protocols (FENCE_POINT, RALLY_POINT)
- [ ] Add data stream request tests (REQUEST_DATA_STREAM, SET_MESSAGE_INTERVAL)
- [ ] Mission download protocol testing (MISSION_REQUEST_LIST, MISSION_REQUEST_INT)
- [ ] Geofence violation simulation and handling
- [ ] Battery failsafe testing scenarios
