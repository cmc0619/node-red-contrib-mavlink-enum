# Project Rules for Claude

## Git & Release Management
- **NEVER merge PRs to main without explicit user approval**
- **Main branch is protected - cannot push directly or use gh CLI to modify it**
- Create PRs and STOP - let the user review and merge them
- Only commit to feature branches (must use `claude/*` prefix with session ID suffix)

## Code Review Process (Codex)
- Codex automatically reviews every PR on initial push
- Subsequent pushes to the same PR require a comment: `@codex review`
- Review status emojis:
  - 👀 = Codex is reviewing
  - 👍 = Passed review
  - Comments = Issues found, needs fixes
- Check PR comments yourself to see Codex feedback before asking user

## GitHub Access
- If you need to check PRs/issues/comments, you need a GitHub personal access token
- **DO NOT store tokens in files** - they are session-specific
- If you don't have a token (e.g., after context reset), ask the user for it
- Use curl with GitHub API for PR operations (gh CLI doesn't work with protected main)

## Code Restrictions
- `mavlink-msg.js` and `mavlink-comms.js` require heavy scrutiny for any changes
- Any modifications to message or communications handling need explicit user approval

## Technical Notes
- The `node-mavlink` library outputs camelCase field names (e.g., `voltageBattery`, `currentBattery`)
- The MAVLink protocol itself uses snake_case, but we use node-mavlink which converts to camelCase
- Always use camelCase when accessing MAVLink message fields in examples/flows
