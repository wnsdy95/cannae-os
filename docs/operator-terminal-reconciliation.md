# Authenticated Local Order Terminal Reconciliation

## Scope

This is the local owner's terminal ceremony for one exact interrupted order
decision. It does not replay adoption, grant new tools or release, terminate
agents, reconcile a campaign/gateway effect, or prove protected production
operation. Use [owner outcome inspection](operator-consent-and-adoption.md)
first. The [eight-part completion backlog](completion-backlog.md) remains open;
deployment selection is deferred, not removed from scope.

## Protocol

1. Select the exact held action in Decisions and use Inspect Outcome. Require
   a verified repository manifest and an exact replayed outcome, not a timeout,
   chat claim or private status alone. The worker queue must confirm the old
   worker's exit before another job; service restart first proves the old PID
   absent and never resumes its writes.
2. Review Terminal Outcome appraises current original consent/decision/adoption
   history, previous terminal attempts, exact cancellations and receipts.
   Unknown signatures, scopes, journals or competing USER decisions block it.
3. The server derives one precise resolution and binds it to a random one-use
   nonce, owner/session/epoch, original action-row digest, prior-attempt digest,
   source/repository state, pinned key and verified manifest. The new ceremony
   lasts at most two minutes, independently of the old consent's expiry.
4. The owner enters a rationale and current password. The private transaction
   consumes this nonce and durably signs an `OperatorReconciliationAuthorization`
   in a separate outbox, preserving the original row including its failure.
   No agent-authored USER log or caller-provided actor/authorization is accepted.
5. Under every publication guard, recheck actual history, current owner/session,
   expiry, key, source, repository, original action and old-attempt inventory.
   Publish the necessary cancellation, then a signed
   `OperatorDecisionReconciliationRecord`, then atomically update the private
   projection and terminal-attempt state. No receipt means no hold discharge.

| Resolution | Durable effects | What remains unchanged |
| --- | --- | --- |
| `acknowledge_recorded` | Record the exact already replayed adoption/rejection/revision; repair its local projection | Original consent and adoption expiry, later USER scope changes and all ordinary tool gates |
| `cancel_unconsumed` | Retain a fresh exact USER scope cancellation before the receipt and projection | Original failure/signed consent/decision history; no original adoption is executed |
| `acknowledge_prior_cancellation` | Verify the exact old signed outbox and already retained cancellation; retain a fresh acknowledgment receipt | The old cancellation is not repeated; old nonces remain consumed |

The cancellation covers preexisting unconsumed decisions for the exact proposal.
The original adoption controller's `assertDecisionCurrent` rejects their later
consumption, including a retained decision appended after cancellation with a
backdated timestamp. A genuinely new complete review and fresh USER decision
can still proceed when the proposal and normal gates permit. Do not interpret
that separate later decision as reopening the old nonce or as invalidating its
historical cancellation.

Conflicting or unverifiable inspection conservatively displays a retained hold,
even when an untrusted private projection claims a terminal state. Inspection
does not rewrite that row or repair its proof; do not treat its label as release
of the hold.

## Interruption Rules

- Original consent missing, partial, or unconsumed: preserve the hold until the
  new cancellation and receipt are both durable.
- Original adoption already recorded but private response/projection missing:
  acknowledge the actual historical result; never invoke `decideOrder` again.
- Cancellation durable, receipt/projection missing: inspect again and obtain
  new terminal consent. Verify the earlier signed outbox and reuse its exact
  cancellation reference, not its nonce or mutation.
- Receipt durable, projection missing: a new authenticated ceremony may retain
  another acknowledgment and repair the projection. Preserve earlier attempts,
  receipts and failures; do not silently resume the old execution.
- Logout, expiry, changed source/repository/key/manifest, conflicting new scope,
  incomplete outbox, or unconfirmed worker execution: stop and preserve holds.
- Invalid artifact journals: do not automatically recover an operation that
  might finish an unknown adoption. Establish the exact operation and its
  outcome through the separately applicable repair/review procedure first.

Pending terminal previews are invalidated on restart. Reserved unfinished
attempts become `reconciliation_required`; a live prior service or executing
attempt cannot be replaced using a timeout, row edit or force flag. Original
rows are archived before projection changes and original failure codes remain
available through owner-only terminal history.

After terminal cancellation, Inspect Outcome verifies the signed receipt,
exact cancellation, private outbox and archived row before displaying
`cancelled`. It remains a historical action result even if a separate fresh
decision later adopts the same proposal. Inspection never renews authority.

## API And Offline Audit

| Endpoint | Contract |
| --- | --- |
| `POST /api/order-decisions/:id/reconciliation/preview` | Owner/session/CSRF; body contains only the exact inspected manifest digest |
| `POST /api/reconciliations/commit` | Owner password, one-use terminal nonce and rationale; no actor, scope, key, authorization, expiry or resolution override |
| `GET /api/order-decisions/:id/reconciliations` | Owner-only bounded attempt history and preserved original failure codes; no raw credential, session or nonce |

For offline signature/cancellation-payload audit only:

```bash
node operator-reconciliation-runner.js <record.json> \
  --public-key <independently-pinned-key.json> \
  --cancellation <retained-cancellation.json>
```

For an authorization or recorded-result acknowledgment, omit `--cancellation`.
The key file contains only `public_key_pem`. A cancellation file must match both
the signed reference's byte digest and the exact bound decision payload.
The runner explicitly returns `artifact_history_verified: false`: it does not
load a manifest, establish issuer trust, mutate state, repair an outbox, grant
execution or discharge a hold. The live service separately verifies history and
its private authenticated reservation. Generic schema validity also never
verifies a signature or grants execution.

Both new contracts are non-authorizing audit metadata. Reject them as agent
work evidence even if copied under another artifact kind or reformatted. Keep
passwords, raw session IDs and nonces out of records; reject the supplied known
secrets if repeated in the rationale. This check is not a general third-party
secret detector. Evidence remains restricted under the configured repository's
access grants and is not externally releasable merely because it is signed.

## Validation And Limits

Use `run-operator-reconciliation-fixtures.js`, both consent/outcome suites,
original adoption/revision and worker/console suites, validator, routing,
inventory, source map and browser flows. Exercise original and terminal write
boundaries, nonce/session/expiry/replay, old-decision rejection, fresh legitimate
review, preserved failures, concurrent publication/revocation and metadata
aliases. Browser fixtures belong in synthetic repositories and accounts only.

Local password authentication is not independent human-presence proof. The same
OS user can read or replace local code/state/key material and legacy CLI/file
paths still exist. Multiple signatures by this same local key are not an
independent quorum or protected execution evidence. This contract does not
operate a remote coordinator, hardened host, KMS/HSM, trusted clock, exclusive
gateway or independently retained monitor. Those production requirements and
the broader approval/COP work remain required.
