# Alert Router Prototype

Dependency-free prototype that converts mission event logs into CCIR alert projections.

Usage:

```bash
node alert-router-prototype/route-alerts.js event-fixtures/demo-events.json
node alert-router-prototype/run-alert-fixtures.js
```

Current routing rules:

- blocked policy decision -> Red `DECISION_POINT`
- evidence record -> Amber `PIR`
- possible secret exposure in tool request -> Black `EEFI`
- failed or blocked SITREP -> Amber `FFIR`

The output is shaped to match `schema-files/ccir-alert.schema.json`.
