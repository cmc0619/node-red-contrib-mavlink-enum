# MAVLink Node-RED Testing Suite

Automated test suite for validating MAVLink GCS nodes with a simulated drone.

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

1. Import `simulated-drone-test.json` into Node-RED
2. Deploy the flow
3. Both GCS and Drone comms nodes will start on localhost UDP

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

## Future Enhancements

- [ ] Add parameter request/set tests
- [ ] Test command (MAV_CMD_*) protocol
- [ ] Add telemetry stream tests (position, attitude, etc)
- [ ] Export test results to JSON/CSV for CI/CD
- [ ] Add performance metrics (latency, throughput)
- [ ] Create dashboard UI for test control
