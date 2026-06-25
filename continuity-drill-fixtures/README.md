# Continuity Drill Fixtures

These fixtures verify that the runtime can survive role loss or planned rotation without relying on chat memory or a single agent.

Run:

```bash
node run-continuity-drill-fixtures.js
```

Covered cases:

- Commander unavailable activates CoS as acting successor and pauses commander-retained decisions.
- S6 rotation activates Recorder, requires handoff/backbrief/rehearsal, and keeps release authority bounded.
