# Failed Request Analysis Reconciliation

## Boundary

This local candidate acknowledges one verifiable failed
[request-analysis transfer](native-order-analysis.md). Its own purpose, typed
authorization/receipt and endpoints are separate from
[omission acknowledgment](model-transfer-reconciliation.md). It never changes the
original failure into success, reruns a model/compiler, adopts or deletes a draft,
settles another ownership domain or grants execution/release. Unknown/integrity
recovery, independent calibration and complete orchestration remain open.

Analysis result v0.1 already binds its original collector journal. This is not
permission to upgrade unbound historical omission v0.1 results; omission still
requires its journal-bound v0.2 producer. Shared verification mechanics do not
make the purposes or their signatures interchangeable.

## Owner Procedure

1. Inspect the exact held analysis in Model Actions and any related draft in
   Evidence. Select Review Model Hold. Do not retry the transfer or edit private
   rows, signatures, journal hashes or state labels.
2. The server verifies the original action, purpose, consent, signed failure,
   exact collector-returned journal and source/request. It requires recorded
   child close/group absence and separately observes the original PID/group
   absent now. A live/reused PID, `EPERM`, missing result, altered body, symlink,
   corrupt journal or unknown termination remains held.
3. Review its exact publication observation. `no_accepted_response` means the
   original collector did not accept a response. For an accepted response, the
   server checks original response-file bytes, materializes its typed analysis
   without tools and derives the deterministic expected draft. It inspects any
   matching draft through the existing actual compiler reader, including source,
   analysis, scope, status and false authority flags. It does not call compilation.
4. `published` binds the exact retained draft reference/status.
   `not_in_verified_manifest` means precisely that no matching entry was observed
   in that verified manifest at review time, not proof that no file/effect ever
   existed. Both explicitly deny draft adoption and artifact settlement. Keep
   unknown external/other-domain obligations separately accountable.
5. Check both acknowledgments: remote transmission/billing/cancellation remain
   unverified, and the observed draft publication has been reviewed without
   adoption, deletion or execution. Enter the current owner password and rationale.
   A two-minute nonce binds the actual session/account epoch and exact subject.
6. The server reserves one signed `OperatorAnalysisReconciliationAuthorization`,
   rechecks current subject/manifest/process observations, and atomically persists
   and verifies `OperatorAnalysisReconciliationRecord` with its audit entry.
7. Inspect the result after delivery loss. Original state/result still read
   `held`; the separate acknowledgment can discharge only that exact local
   model-domain hold. No invocation or compiler replay occurs. Another call
   needs a fresh, explicitly configured, exact-packet owner transfer approval;
   an existing draft still needs human coverage and USER adoption.

Recovery can inspect authentic old/expired transfers without enabling model
execution or renewing request/transfer validity. After completed acknowledgment,
later independently approved work may publish the same deterministic draft.
The original signed observation of absence stays unchanged. An already-observed
published reference must still match exactly, and changed response/journal/receipt
or prior consumed-attempt history reinstates the hold. Never re-sign that history.

## Failure And Restart

Failed/ignored receipt publication preserves the signed reservation and original
failure. Inspect it, then obtain fresh consent. Restart invalidates pending
previews and marks interrupted reservations failed; it does not finish old
consent automatically. A committed exact receipt survives restart only after
cryptographic/private-history/publication replay. Actual synthetic process-death
fixtures target both the reserved receipt boundary and the completed database
commit. They are not protected-host or native startup attestation.

Only a completely verified receipt affects the local hold check. Missing or
changed proof, unknown processes and unsigned/legacy journals are not repaired
by a clean Git status, timeout, current hash or caller `USER` label. Provider
cancellation, hard billing limits, protected keys/hosts and unknown-effect
recovery need separate evidence/contracts. All eight program outcomes stay open.

## Interfaces

| Endpoint | Access and body |
| --- | --- |
| `POST /api/order-analyses/:id/reconciliation/preview` | Actual owner/session/CSRF; empty object |
| `POST /api/analysis-reconciliations/commit` | Owner password/session/CSRF/throttle; exact ID, nonce, rationale, both fixed-true acknowledgment fields |
| `GET /api/order-analyses/:id/reconciliations` | Owner-only bounded complete attempt history |

The commit fields are `reconciliation_id`, `nonce`, `password`, `rationale`,
`acknowledge_provider_uncertainty` and `acknowledge_analysis_publication`. Callers
cannot choose subject, purpose, actor, scope, resolution, key, process or clock.
Omission endpoints refuse these analysis actions and vice versa before reservation.
Raw password/nonce/session credentials never enter the signed records. Late
owner responses cannot restore hidden publication/password/approval fields after
a viewer sign-in or view/generation change.

The existing offline `operator-model-reconciliation-runner.js` also recognizes
the two analysis record tags with an independently pinned public key. It verifies
contract/signatures only, never current process absence, private history, issuer
trust or hold discharge. Generic validation always returns `can_execute: false`.
Both records, including nested or MIME-relabelled copies, are control metadata,
not task work. Issuance/channel bindings measure the new contract/publication core.

## Validation

Run the validator CLI first, then:

```bash
node run-operator-analysis-reconciliation-contract-fixtures.js
node run-operator-analysis-reconciliation-fixtures.js
node run-operator-model-reconciliation-contract-fixtures.js
node run-operator-model-reconciliation-fixtures.js
```

Use `order-analysis-fixtures/reconciliation-browser-check.js --output <dir>` for
the actual synthetic authenticated desktop/mobile path, explicit publication
acknowledgment, malformed purpose/publication rejection, lost commit delivery and
late owner-to-viewer response. Keep the existing omission browser, collector,
native analysis, invocation integrity, metadata-report and both-provider routing
regressions. Focused development cases are not the full suite. Fixtures make zero
actual model calls and never script the real owner. Source-bound local evidence
and required hosted CI precede acceptance; publication is not an installed-skill
or operational-daemon upgrade.

A retained first browser ladder stopped after a valid acknowledgment because
the Evidence view briefly exposed its old list during full manifest refresh.
The server correctly rejected the stale snapshot; it was not an authorization
bypass. Full refresh now removes old evidence actions/counts before awaiting the
new list and retains unavailable state on failure. A delayed real list response
tests that fence. Preserve the original timeout/screenshot and unexecuted suffix;
do not weaken snapshot checks, silently retry approval or turn observed browser
subscenarios into a suite pass.
