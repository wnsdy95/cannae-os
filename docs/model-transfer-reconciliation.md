# Failed Model Transfer Reconciliation

## Boundary

Use this local owner ceremony after [model transfer](model-transfer-consent.md)
fails. It acknowledges one verifiable failed local invocation; it never turns
that evaluation into success, reruns the model, cancels provider billing, clears
another ownership domain or grants task execution/release. All eight program
outcomes remain open, including semantic calibration and mandatory consumers.

The original `operator_model_actions` row, signed failure, invocation, consent and
collector journal are preserved byte-for-byte. A separate signed authorization
and receipt explain why the local model-domain hold can be acknowledged. A new
evaluation still requires a new exact-packet preview and owner consent.

## Owner Procedure

1. Open the exact held entry in Model Evaluations. Review its original failure.
   Use **Review Model Hold**, not another evaluation or a database edit.
2. The server requires a valid pinned-key failure and exact retained invocation,
   consent and bounded collector journal. Both signed result and journal must
   record child close and group absence. It separately probes the original PID
   and negative process-group ID now: only `ESRCH` establishes absence. `EPERM`,
   PID reuse, a live process, a symlink, missing proof or an active collector denies.
3. Review the exact action, journal, source/repository/manifest/key and previous
   attempt digests. The two-minute nonce binds the actual stored owner session
   and account epoch, not a cached role or caller-provided `USER` field.
4. Acknowledge that prior transmission, provider billing and cancellation remain
   unverified; enter a rationale and current owner password. This is acceptance
   of that limited local acknowledgment, not proof that the provider stopped.
5. The server durably reserves a one-use signed
   `OperatorModelReconciliationAuthorization`, rechecks the complete subject and
   process absence, then atomically retains the signed
   `OperatorModelReconciliationRecord` and audit entry. It verifies the saved
   receipt rather than trusting an update request or terminal status string.
6. Inspect the result. The original evaluation still reads `held` and retains its
   failed signed result; the separate reconciliation state is
   `acknowledged_failed_transfer`. No model process is launched. Only an exact,
   cryptographically and historically verified receipt excludes this original
   failure from the local model hold check.

An expired original request or transfer consent is not renewed by this ceremony.
The current acknowledgment has its own finite window. It is possible to review
old local failures without enabling the host's model configuration; new transfers
still require that explicit configuration and all original checks.

## Failure And History

Missing/changed signatures, a missing signed result, incomplete termination or
corrupt journals are not automatically repairable through this path. Keep those
holds; they need a separate integrity/unknown-process recovery contract. A timeout
or clean Git status never proves process exit. This reference does not establish
containment after SIGKILL/host failure or provider-side cancellation.

Failed receipt publication preserves the signed reservation and original action.
Inspect its history, then obtain a fresh acknowledgment; never resume the old
nonce or manufacture a successful receipt. Restart invalidates pending previews
and marks reserved unfinished attempts failed. It never replays a transfer or
finishes a reserved acknowledgment automatically. A completed receipt survives
restart only when its signatures, original-row digest and ordered prior-attempt
inventory and original journal/invocation/consent still verify. Mutated/missing receipts or predecessors reinstate the
hold even if private state says `committed`. A different original action cannot
borrow the receipt.

Monotonic private reservation sequences, not timestamp strings or preview order,
identify prior consumed attempts. Multiple pending previews do not reserve
authority. At most 20 are pending, 100 attempts exist per action and 1,000 exist
in this private domain. Limits deny rather than silently deleting history; a
reviewed archival/retention workflow remains open.

Original model consent/result presence also fences model admission if someone
changes only its private state label. This is corruption detection, not security
against the same OS user who can replace both code and local keys/state.

## Interfaces And Audit

| Endpoint | Access and body |
| --- | --- |
| `POST /api/model-evaluations/:id/reconciliation/preview` | Actual owner session, CSRF; empty object |
| `POST /api/model-reconciliations/commit` | Owner/session/CSRF/throttle; reconciliation ID, nonce, password, rationale and exact provider-uncertainty acknowledgment |
| `GET /api/model-evaluations/:id/reconciliations` | Owner-only complete bounded attempt history |

HTTP callers cannot choose actor, resolution, subject, key, process ID, time or
authority. Raw password, nonce and session ID never enter signed records. The
known-secret rationale check is not a general third-party secret detector.
Browser state clears secret/subject fields on logout and fences delayed owner
previews by principal, view and generation. Lost commit responses trigger an
inspection, never an automatic repeat.

For offline cryptographic audit only:

```bash
node operator-model-reconciliation-runner.js <record.json> \
  --public-key <independently-pinned-public-key.json>
```

The key file has only `public_key_pem`. This runner verifies signatures and exact
contract bindings, not issuer trust, private history or actual process absence.
It cannot discharge a hold or contact the model. The generic validator similarly
returns `can_execute: false`, never cryptographic or operational approval.

Both records are control metadata at the actual wave-report consumer, including
whole JSON copies reordered or labeled as text/binary. They are not task outputs.
The catalog is measured in issuance/channel runtime bindings; only synthetic
structural samples may be regenerated after a binding change.

## Verification And Limits

Run `node run-operator-model-reconciliation-fixtures.js`, the original semantic
API/collector suites, validator, control-evidence, routing and both skill checks.
Use `operator-semantic-fixtures/reconciliation-browser-check.js --output <dir>`
for actual desktop/mobile HTTP flows and delayed-account-response tests. Fixtures
use separate synthetic repositories/accounts and measured fake provider processes;
they make zero actual model calls and never script the real owner account.

Local password authentication and one mutable local signing key are not protected
human presence, an independent quorum, trusted time or distributed fencing. This
does not settle order decisions, tool/gateway effects, campaign stops, remote
billing or release obligations. Independent monitoring, protected hosts/keys,
unknown-provider recovery, hard cost cancellation and deployment remain required.
