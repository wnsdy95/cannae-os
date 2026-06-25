# Readiness Gate Prototype

Dependency-free prototype that combines an authority matrix with role/task readiness to decide whether a tool action can proceed.

Usage:

```bash
node readiness-gate-prototype/readiness-gate.js sample-payloads/valid-authority-matrix.json '{"role":"S3","task":"runtime prototype","tool":"validator-cli-prototype/validate.js","target":"local workspace","roe_class":"Green","readiness":"P"}'
node readiness-gate-prototype/run-readiness-fixtures.js
```

Decision meanings:

- `allow`: may execute within the matched rule scope.
- `report_required`: may continue but must appear in SITREP or event log.
- `approval_required`: execution is blocked until scoped approval.
- `prohibit`: execution is blocked and cannot be approved.

Readiness is task-specific. A role with insufficient readiness is escalated to `approval_required` even if the authority rule would otherwise allow execution.
