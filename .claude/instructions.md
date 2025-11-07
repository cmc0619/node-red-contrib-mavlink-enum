# Project Rules for Claude

## Git & Release Management
- **NEVER merge PRs to main without explicit user approval**
- **NEVER push directly to main branch**
- Create PRs and STOP - let the user review and merge them
- Only commit to feature branches (must use `claude/*` prefix with session ID suffix)

## Code Restrictions
- `mavlink-msg.js` and `mavlink-comms.js` require heavy scrutiny for any changes
- Any modifications to message or communications handling need explicit user approval

## Technical Notes
- The `node-mavlink` library outputs camelCase field names (e.g., `voltageBattery`, `currentBattery`)
- The MAVLink protocol itself uses snake_case, but we use node-mavlink which converts to camelCase
- Always use camelCase when accessing MAVLink message fields in examples/flows
