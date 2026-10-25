# Readiness Gate Prototype

Local reference prototype using the repository validator to combine an authority matrix with declared role/task readiness. It is not authenticated qualification or a dispatch grant.

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

Readiness is task-specific. An unmet minimum, U/X execution, any matching
prohibition or expired restriction, unmatched Black request, malformed matrix
or missing exact scope prohibits execution; approval cannot repair it. Matching
rules intersect independently of array order. Scope strings are exact and
case-sensitive except an explicitly declared `any` entry. Blocked CLI results
exit nonzero. See [the corrective boundary](../docs/readiness-authority-intersection.md)
for subject binding, migration and remaining qualification/supervision limits.
