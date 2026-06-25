# Approval Consumption Fixtures

These fixtures test the transition from a scoped approval to an audit event that consumes that approval.

The runner verifies:

- the approval was active before consumption
- the event matches mission, actor, action, tool, and target
- the event happened inside the approval window
- `approve_once` is consumed exactly once
- executed events include evidence
- the approval status after execution is `consumed`

Run from the repository root:

```bash
node run-approval-consumption-fixtures.js
```
