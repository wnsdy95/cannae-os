# Force Structure Change Fixtures

These fixtures exercise force structure change policy.

- `sample-payloads/valid-force-structure-change-order.json` should validate and project `ready`.
- `sample-payloads/invalid-force-structure-change-order-unjustified.json` should fail validation and project `blocked`.

Regression intent:

- New roles, departments, units, task forces, runners, or dashboard panels require capability-gap evidence.
- Organizational change must consider non-organization alternatives first.
- DOTMLPF-P, Commander approval, resources, readiness, transition, documentation, assessment, and sunset controls must be explicit.
- Expansion must not add executors without protection, recorder, fallback, validation, and commander-retained authority.
