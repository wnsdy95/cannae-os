# Readiness And Authority Intersection

## Corrective Boundary

This local reference correction follows actual function probes against source
`26660c3`. A valid Red matrix with minimum T still returned
`allow_scoped_execution` for P when approval and risk acceptance were supplied.
A separate schema-valid Green prohibition became approval-required at P and
was also allowed. Direct gate probes admitted a tool-name suffix and returned
report-required for an unmatched Black request. These are synthetic reference
consumer results, not a protected gateway or deployed-owner exploit.

The correction implements the existing rule that approval does not replace
readiness. It does not introduce a new military-source claim, authenticated
training, positive qualification or a new execution grant. All eight full program
outcomes remain open.

## Reference Consumer Rules

The readiness gate validates the complete matrix and required request fields.
Unknown ratings, malformed scopes, duplicate rule IDs and invalid time deny.
Black denies before looking for a rule. No matching explicit rule denies:
`default_decision: report_required` is not permission for unlisted execution.

Scope entries are case-sensitive exact strings; only an explicitly declared
`any` entry is a wildcard. Substrings, prefixes, whitespace normalization and
human-readable target shorthand do not establish identity. Overlapping matching
rules intersect instead of selecting the first array row. Any prohibition,
expired matching rule or unmet minimum denies. An expired restriction is not
silently removed to expose a weaker allow. Conflicting approvers hold for policy
review. U and X remain non-executing even under an erroneously low rule minimum.

The combined authority consumer validates the actual ToolRequest and binds the
matrix mission plus role, task ID, tool, target and computed ROE to it. A supplied
`authority_request` cannot substitute another subject. Missing readiness is not
implicitly P; missing/unknown risk is not implicitly low. Approved scopes must
also name the actual request/task and the matrix's required approving role.
An explicit `ToolRequest.approval_required: true` also survives computed Green
and an allow rule. Risk classification cannot erase a stricter request control.
The reference release integrator consumes this same denial; a valid release
review cannot repair a failed execution prerequisite.

The three synthetic authority bundles now declare exact `T-DEMO-001` task and
`prod.command-post-dashboard` target scopes rather than a separate deployment
label and production category. This is a test-input migration, not permission
to rewrite immutable operational history. Existing caller shorthand now needs
a separately reviewed exact policy; never strip bindings, guess aliases or
silently rewrite a real approval.

## Verification

```bash
node readiness-gate-prototype/run-readiness-fixtures.js
node run-authority-integration-fixtures.js
node run-release-integration-fixtures.js
node validator-cli-prototype/run-fixtures.js
```

Both readiness and integrated CLI commands exit nonzero for blocked execution.
Fixtures retain positive qualified Red composition separately from below-minimum,
prohibition, exact-scope, overlap, expiry, malformed-input and subject-substitution
denials. These trusted local scripts are not a hostile-code sandbox.

## Remaining Work

The reference input still declares readiness and approving-role strings. It does
not authenticate an evaluator, prove task performance or supervision, consume a
stable performer/configuration qualification, attest time or durably consume an
approval. P-stage supervision, report acknowledgments and matrix conditions need
their own verified consumers. A successful reference result is not a dispatch
lease, native tool authorization, execution proof or release consent.

The separate [retained-drop consumer](readiness-drop-reconciliation.md) continues
to fence actual leases/gateway calls and preserve admitted-result settlement.
This correction neither changes that immutable history nor restores old grants.
Full [training progression](training-progression-model.md), authenticated
qualification, fresh USER scope, registry-bound grant reconciliation, organization
lifecycle, CoS/COP integration and controlled rollout remain required for goal 5.
