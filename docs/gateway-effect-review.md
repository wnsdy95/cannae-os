# Gateway Effect Intake And Review

When OCI containment observations exist, `GatewayEffectSubject` v0.2 binds
their complete path-sorted reference digest, count, and newest observation
reference. All original records remain in the manifest; repeated collection
does not overflow the separate execution-chain reference limit. Selection of
the newest observation uses parsed timestamps with a deterministic path tie
break. Any added record changes the subject digest, even when it is older than
the selected observation. The subject does not verify containment signatures
or clear effects; use the OCI evidence appraiser separately.

## Purpose

Prepare an exact, non-authorizing review of a retained gateway transaction.
This is a dependency of future gateway settlement, not the settlement itself.
It is an engineering synthesis of the existing
[gateway](protected-tool-gateway-contract.md),
[dispatch](enforced-dispatch-and-resume.md), and
[inspection review](tool-effect-review.md) contracts, not a new military claim.

## Intake First

Run the installed skill wrapper against the affected repository and artifact root:

```bash
node codex-skills/controls-doctrine-operator/scripts/review_gateway_effects.js \
  subject --transaction GTX-EXAMPLE --repository <repo> --artifact-root <root>
```

Claude Code exposes the same command under
`.claude/skills/controls-doctrine-operator/scripts/`.
The reader verifies retained bytes, schema, namespace, identifiers, lease
checkpoint lineage, transaction transitions, invocation bindings, and available
process/OCI execution records. It does not execute, cancel, repair, or clean up
anything. A malformed chain fails before producing a subject.

| Subject class | Next action | Operational meaning |
| --- | --- | --- |
| `unstarted` | `recover` | Request-only, received, or authorized transaction has no execution event. Use the existing gateway recovery path with exact input when available; the intake does not grant execution authority. |
| `unknown_execution` | `recover` | Execution began but recovery has not retained its terminal unknown-outcome receipt. Preserve the original invocation and run bounded recovery, not the target again. |
| `unknown_execution` | `review` | Recovery retained an unknown outcome. Inspect effects and containment separately. |
| `committed_unknown_effects` | `review` | A committed receipt still reports unknown effects. Committed is a transaction state, not successful effect settlement. |
| `orphan_admission` | `review` | Recovery denied a transaction but could not cancel its allow admission. Preserve its absent execution-event/receipt references as exact none sentinels. |
| `settled` | `none` | The existing gateway lifecycle already considers the transaction safe. This reader did not settle it and cannot renew its lease. |

The subject includes the latest lease checkpoint even when it is terminal.
Its canonical digest determines its ID. New history changes that ID, so an old
scope cannot silently migrate to a different checkpoint or transaction.
All subject authority fields, including `effects_settled`, remain false.

## Freeze The Inspection Scope

1. Preserve the original request, decision, admission, execution event, receipt,
   checkpoint lineage, and any retained execution evidence. Do not manufacture
   a success callback or receipt for an orphan admission.
2. Build a `GatewayEffectScope` with the complete current subject and exact
   repository state. Use at most one hour of validity.
3. Include each intake-derived `required_targets` boundary/target pair, then
   add all other potentially affected resources. The minimum set does not
   establish complete effect scope.
4. Collect manifest-backed `gateway-effect-observations` in the same
   mission/wave after `observed_after` and before scope creation. These are
   application-specific observations, not automatically trusted provider claims.
5. Persist the scope as `gateway-effect-scopes`. Freeze it before executing a
   verification plan whose candidate ID/revision bind the exact scope ID/digest.
   Each resource must name the checks that inspect it; every check must be used.
6. Actually run verification through the existing verification workflow.
   Every check must receive exactly one `--effect-scope <relative-path>` and
   `--effect-scope-sha256 <canonical-digest>` pair. Retain the exact plan and
   receipt as `verification-plans` and `verification-receipts`.

Minimum boundaries distinguish unresolved admission, external effects,
containment, and managed-production coordination. An OCI target names the
retained container; process targets bind the retained envelope; absent
envelopes bind the execution event rather than inventing a process identity.
Container absence alone does not establish external effect completeness or
coordinator settlement.

## Review

The references JSON has exactly `scope_ref`, `verification_plan_ref`, and
`verification_receipt_ref`, each an exact manifest reference.

```bash
node codex-skills/controls-doctrine-operator/scripts/review_gateway_effects.js \
  review --references <references.json> --repository <repo> \
  --artifact-root <root> --write-artifact
```

The reader reconstructs the live subject, requires a review-eligible state,
checks all required boundaries, and verifies plan/receipt identity, canonical
digests, complete check sets, argv, exit status, finite numeric chronology,
observations, and unchanged repository state. Optional publication repeats
the appraisal under the artifact-store publication guard. Drift cannot publish
the earlier positive result. CLI exits: 0 for a subject or evidence-bound
review, 1 for blocked review, 2 for invalid input/history. Exit 0 is not authority.

`GatewayEffectReview.status: evidence_bound` means internal evidence
consistency only. It cannot prove genuine execution, authenticated verifier
identity, complete effect coverage, provider containment, production
coordination, or USER consent. All corresponding verification and authority
flags remain false. The review itself never runs the inspection command.

## Remaining Settlement Boundary

The [hook settlement controller](tool-effect-settlement.md) still excludes
gateway transactions, including request-only ownership. Gateway review does
not discharge a pending admission, mutate historical failures, clear gateway
obligations, revoke a lease, permit resume/report/closeout, or authorize release.
Do not feed this review into hook settlement or remove its gateway exclusion.

A future gateway-specific controller must consume this exact scope, authenticated
execution-bound proof, independent containment/coordination evidence where
required, and a fresh exact USER decision. It must discharge only the exact
admission, preserve the failed agent result, and separate revocation and future
mission authority. These are open completion criteria in
[the completion backlog](completion-backlog.md), not implemented capabilities.

## Validation

```bash
node run-gateway-effect-review-fixtures.js
node run-protected-tool-gateway-fixtures.js
node run-tool-effect-review-fixtures.js
node run-tool-effect-settlement-fixtures.js
node validator-cli-prototype/run-fixtures.js
```

Examples: [subject](../sample-payloads/valid-gateway-effect-subject.json),
[scope](../sample-payloads/valid-gateway-effect-scope.json), and
[review](../sample-payloads/valid-gateway-effect-review.json).
Samples and fixture observations are synthetic; they are not deployment proof.
