# SOF TF Fixtures

These fixtures exercise AI Special Operations Task Force activation.

- `sample-payloads/valid-sof-tf-charter.json` should validate and project a `go` activation.
- `sample-payloads/invalid-sof-tf-charter-unbounded.json` should fail validation and project `no_go` because it collapses executor, reviewer, red team, enabler, and recorder into one role.

Regression intent:

- SOF TF activation must not reduce controls.
- Red Team and release review must stay independent from execution.
- Source-map, release review, maintenance readiness, fallback, backbrief, rehearsal, dry run, abort, and handoff controls must be explicit.
