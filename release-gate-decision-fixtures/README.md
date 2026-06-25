# Release Gate Decision Fixtures

These fixtures verify that a release gate decision event matches the computed output of `policy-engine-release-integration.js`.

The event records the final append-only fact:

- authority gate result
- release review gate result
- final allow/block decision
- reasons and evidence

Run:

```bash
node run-release-gate-decision-fixtures.js
```

