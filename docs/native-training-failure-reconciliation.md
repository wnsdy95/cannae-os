# Native Training Failure Reconciliation

## Candidate Boundary

This local candidate implements original-evidence appraisal and a dedicated
authenticated owner ceremony, durable one-use receipt consumer and Model Actions
UI for appraisable native failures. Omission/analysis endpoints still reject this
purpose. A signed sample or offline audit is not the private-history consumer.
Missing evidence, uncertain termination and orphan ownership remain held; this
does not implement every native uncertainty class or establish deployed acceptance.

This advances the recovery prerequisites for goals 3/5/7. It does not qualify a
performer, admit task output, settle publication artifacts, grant tools/release
or close any full program outcome. Real-model/human acceptance and rollout remain
separate. Installed skills and the existing service are unchanged.

## Original Evidence Appraisal

`operator-native-training-failure.js` is a trusted-host library, not an
agent-facing signing/settlement endpoint. Its `appraiseFailure` takes the actual
held action, original local database handle, pinned configuration/state root and
trusted public key. Do not export auth rows or private keys into a JSON bundle.

The appraiser verifies:

1. Original signed native transfer authorization, consent and failure, original
   request/review/registry history and recognized producer/profile commitments.
   Fresh execution stays current-only; no old code is executed for appraisal.
2. The exact signed journal commitment and its original invocation/consent.
   Original collection identity, reservation mapping, pre-start authorization,
   bounded transfer validity and terminal stdout/stderr commitments must agree.
3. Recorded successful local child close and group absence, plus fresh absence
   observations for that exact PID and process group. A live/reused PID or
   `EPERM` is not absence. This is a local reference observation, not protected
   process identity, native account, model-weight or independent host attestation.
4. Original native JSONL bytes against both journal and stdout hashes, one ordered
   native thread/turn/completion, event counts and final agent-message payload.
   Unknown events, malformed final JSON and changed original bytes fail.
5. The current response file's canonical equality to that original final payload.
   If the original journal has a response-file hash, exact bytes must match too.
   If assessment threw before that hash was recorded, the original commitment is
   explicitly null: a freshly observed file digest is not original byte proof.
6. Exact publication prefixes and retained references, then rechecks of original
   files, reservation, local action/authorization, manifest and process absence.
   It does not regenerate a response/product, invoke a model, publish or settle.

Local reservation contents/times and PID absence are reference-host observations,
not independently attested chronology. Missing original files, unknown process
identity, incomplete native streams, orphan ownership and integrity failures
remain separate held classes; no permissive fallback manufactures proof.

## Response And Publication Classes

`NativeTrainingFailureAppraisal` distinguishes:

- `rejected_response`: the original journal's exact bounded rejection is
  reproduced from the original final payload. No canonical publication is
  permitted in this class. Raw output stays private.
- `accepted_native_product`: the existing strict successful-product reader
  replays original response-file bytes, native events and task appraisal. This
  can explain a later publication failure; it is not a grade or acceptance.

Accepted-product publication has four explicit states: `none`,
`authorization_only`, `authorization_and_output` and `complete`. The appraiser
derives the three original deterministic IDs, reads the actual verified manifest
and checks original mission/wave, authorization body, exact output bytes and
signed collected-result bindings. It does not infer absence from a null database
reference. Non-prefix writes, foreign identities, substituted bytes or changed
retained references fail.

`none` means no matching canonical entry in that verified snapshot, not proof
that no staging file or external effect ever existed. Even `complete` is only
an observed canonical candidate while the original local action remains held.
Artifact settlement, task admission, provider billing/cancellation, grading and
independent publication finality are not established.

For an originally unbound response file, a whitespace-only rewrite can keep the
same canonical payload but produces a different current observation/appraisal ID.
A later owner review must freeze that exact observation and reject drift; do not
pretend whitespace violated a nonexistent original file commitment, or ignore a
changed review-time digest. Bound original files reject even whitespace changes.

## Contracts And The Owner Ceremony

The dedicated `OperatorNativeTrainingReconciliationAuthorization` and
`OperatorNativeTrainingReconciliationRecord` separate this purpose from other
model transfers. They bind original action/evidence/process fields, the exact
appraisal, displayed-subject digest, finite fresh owner authentication, session,
epoch, one-use nonce/sequence and explicit provider/publication/unbound-file
acknowledgments. Contradictory metadata, missing original commitments relabeled
as bound, invalid publication prefixes and authority expansion fail semantic
validation even with a new signature.

Only the authenticated service creates and consumes a live authorization. In
Model Actions, open the retained native failure and choose Review Model Hold.
The service freshly appraises original evidence and all deterministic publication
IDs. Review the complete displayed subject, the original-versus-observed response
commitment and publication state. Independently acknowledge provider uncertainty,
native publication and response-proof limits, give a rationale and reauthenticate
the exact owner session. The browser hashes its displayed native subject; the
server independently matches that hash to its retained preview before signing.

The native-only API is:

```text
POST /api/training-products/:id/reconciliation/preview
POST /api/native-training-reconciliations/commit
GET  /api/training-products/:id/reconciliations
```

Preview/commit bind the principal, epoch, stored session, nonce, sequence, exact
source/repository/manifest state and original action. A reserved attempt is
durable before receipt publication. Consumption rereads actual evidence and the
persisted signed receipt; an ignored/failed write cannot return success. Process
death leaves a reserved attempt failed on restart, while a committed receipt is
verified from original private history. Pending reviews are invalidated. A retry
needs fresh approval, never model replay or deletion of the failed attempt.

The original action stays `held` with the original signed failure and journal.
Only a currently verified native acknowledgment removes that transfer's hold on
a separately approved future transfer. New source packets still need their own
fresh consent and collection identity. Receipt history reappraises original bytes,
process absence and exact publications; drift restores the hold. An unrelated
manifest append after consumption does not rewrite the acknowledged publication,
but a changed original publication invalidates it. Read-only history remains
available with model execution disabled; that does not enable a new transfer.

The existing offline runner audits a supplied public-key signature but returns
`private_history_verified: false` and `hold_discharged: false`.

All three wrappers are control metadata, including nested copies, never work.
Both validator APIs return `can_execute: false`. Native method, channel and
issuance fingerprints measure the appraisal/contract/schema bytes. After code
changes, regenerate only current synthetic issuance/channel/session examples,
never old operational leases, signatures, catalog bytes or approval expiry.

## Validation And Remaining Work

Run the full validator before expensive acceptance, then:

```bash
node run-native-training-reconciliation-contract-fixtures.js
node run-native-training-failure-fixtures.js
node run-native-training-reconciliation-fixtures.js
node run-native-training-reconciliation-crash-fixtures.js
node run-native-training-producer-fixtures.js
node run-operator-model-reconciliation-contract-fixtures.js
node run-operator-analysis-reconciliation-contract-fixtures.js
```

The failure matrix generates actual synthetic native rejection and failures
before authorization, before output, before result and after complete canonical
publication. `--case <name>` is a focused development selection, not a full-matrix
pass. Source-bound original-producer replay remains separate from current-source
synthetic cases. Fixtures never invoke real inference or operate the real owner.

Run `native-training-reconciliation-fixtures/browser-check.js --output <directory>`
with the supported Playwright runtime for actual desktop/mobile, malformed and
changed displayed subjects, lost receipt delivery and delayed owner-to-viewer
responses. API and process-death fixtures are separate evidence classes, not a
substitute for browser inspection or actual-owner acceptance.

Keep missing-evidence, unknown-process and orphan ownership as distinct paths.
Full hosted/source acceptance, personally approved actual-model/human calibration
and controlled installation remain separate. The generic contracts and appraiser
still grant no task admission, artifact settlement, grading or authority.
Authenticated training/qualification, live grants, intent/initiative, COP/CoS,
sustainment and eventually deployed independent infrastructure remain required.

This is local engineering synthesis of the existing
[native owner contract](native-training-owner-consent.md),
[producer history](native-training-producer-history.md) and
[purpose-specific model recovery](order-analysis-reconciliation.md), not a new
military or provider-attestation claim.
