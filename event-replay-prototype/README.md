# Event Replay Prototype

Dependency-free event replay prototype.

Usage:

```bash
node event-replay-prototype/replay.js event-fixtures/demo-events.json
```

Run fixture checks:

```bash
node event-replay-prototype/run-event-fixtures.js
```

The script produces simple projections:

- mission state
- task status
- tool request status
- pending approvals
- latest SITREP
- evidence count
- AAR count
- readiness summary
