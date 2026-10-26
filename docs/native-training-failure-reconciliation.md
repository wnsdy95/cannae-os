# Native Training Failure Reconciliation

## Candidate Boundary

This local candidate implements strict recovery contracts and a non-authorizing
original-evidence appraiser. It does **not** yet implement the fresh native owner
ceremony, durable receipt consumption, UI or hold discharge. Omission/analysis
reconciliation endpoints still reject native training. A signed sample or offline
audit must not be used to bypass that refusal.

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

## Contracts Are Not The Ceremony

The dedicated `OperatorNativeTrainingReconciliationAuthorization` and
`OperatorNativeTrainingReconciliationRecord` separate this purpose from other
model transfers. They bind original action/evidence/process fields, the exact
appraisal, displayed-subject digest, finite fresh owner authentication, session,
epoch, one-use nonce/sequence and explicit provider/publication/unbound-file
acknowledgments. Contradictory metadata, missing original commitments relabeled
as bound, invalid publication prefixes and authority expansion fail semantic
validation even with a new signature.

Only the future authenticated service may create or consume a live authorization.
The present schemas/signature checks do not authenticate a browser session,
reserve/consume a nonce, persist a receipt or discharge a hold. The existing
offline runner can audit a supplied public-key signature, but explicitly returns
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
node run-native-training-producer-fixtures.js
node run-operator-model-reconciliation-contract-fixtures.js
node run-operator-analysis-reconciliation-contract-fixtures.js
```

The failure matrix generates actual synthetic native rejection and failures
before authorization, before output, before result and after complete canonical
publication. `--case <name>` is a focused development selection, not a full-matrix
pass. Source-bound original-producer replay remains separate from current-source
synthetic cases. Fixtures never invoke real inference or operate the real owner.

Next implement fresh displayed-subject/password/session/epoch/nonce approval,
durable one-use reservation/receipt with crash/race/revocation checks, original
failure preservation, purpose-specific UI/history and exact new-transfer admission.
Keep missing-evidence, unknown-process and orphan ownership as distinct paths.
Then verify full hosted/source/browser acceptance and controlled installation.
Authenticated training/qualification, live grants, intent/initiative, COP/CoS,
sustainment and eventually deployed independent infrastructure remain required.

This is local engineering synthesis of the existing
[native owner contract](native-training-owner-consent.md),
[producer history](native-training-producer-history.md) and
[purpose-specific model recovery](order-analysis-reconciliation.md), not a new
military or provider-attestation claim.
