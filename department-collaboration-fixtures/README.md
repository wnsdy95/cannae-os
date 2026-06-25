# Department Collaboration Fixtures

These fixtures exercise interdepartment collaboration policy.

- `sample-payloads/valid-department-collaboration-charter.json` should validate and project `ready`.
- `sample-payloads/invalid-department-collaboration-charter-siloed.json` should fail validation and project `blocked`.

Regression intent:

- Department collaboration must be more than parallel work.
- Every supported/supporting relationship needs required outputs, quality gate, handoff interface, escalation trigger, and liaison.
- Commander-retained decisions must route through Commander/CoS decision packet flow.
- Source-map, shared glossary, handoff, AAR, and EEFI controls must remain explicit.
