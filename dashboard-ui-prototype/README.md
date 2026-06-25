# Dashboard UI Prototype

Static command post dashboard prototype.

Open `index.html` directly in a browser. No server or build step is required.

The UI reads `dashboard-state.json` when available. To render dashboard state from the event log:

```bash
node dashboard-ui-prototype/render-state.js event-fixtures/demo-events.json
```

Additional projection states:

- `working-group-projection-dashboard-state.json`
- `authority-delegation-projection-state.json`
- `release-gate-dashboard-state.json`
- `maintenance-readiness-dashboard-state.json`

The prototype is intentionally dense and operational:

- mission and intent pinned at top
- approval queue
- CCIR alerts
- active risks
- evidence viewer
- readiness board
- SITREP panel
