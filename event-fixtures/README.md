# Event Fixtures

Sample event log for the event-sourcing model.

Use with:

```bash
node event-replay-prototype/replay.js event-fixtures/demo-events.json
```

To verify expected projection and dashboard conversion behavior:

```bash
node event-replay-prototype/run-event-fixtures.js
```

The event stream represents the same runtime demo mission used in `runtime-demo-payloads/`.

Replay and alert routing must sort by parsed absolute timestamp, not timestamp string order. Fixtures include mixed `Z` and `+09:00` offsets and reject invalid timestamps.
