# Model Force Assignment Fixtures

These fixtures verify that mission-based model allocation remains separate from role authority and fails closed when readiness, context eligibility, assurance independence, or PACE continuity is missing.

Run:

```bash
node run-model-force-assignment-fixtures.js
```

Coverage:

- `sample-payloads/valid-model-force-assignment-plan.json` assigns distinct line, specialist, command, assurance, router, and reserve profiles with task evidence.
- `sample-payloads/invalid-model-force-assignment-plan-monoculture.json` proves that an unready floating-version model cannot route, execute, review, and inherit human authority for a high-impact mission.
