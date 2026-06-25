# Release Integration Fixtures

These bundles test the combined execution gate:

- authority/policy/readiness/scoped approval/risk acceptance
- release review and context filter output

The goal is to keep tool execution approval separate from information release approval, then require both when a task produces final or external output.

Release review target is part of the approval boundary. A review for `internal_handoff` must not authorize `FINAL_OUTPUT` or other release targets.

Run:

```bash
node run-release-integration-fixtures.js
```
