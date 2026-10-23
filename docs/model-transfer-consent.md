# Authenticated Model Transfer Review

## Scope

The local console can now approve one exact semantic-evaluation packet for the
existing Codex CLI account. This is an opt-in local candidate, not automatic
model access, semantic admission, task execution, release or planning authority.
It supplies the human ceremony around the
[source-bound collector](semantic-omission-evaluation.md).

The human still creates the real owner account. Never script a real owner's
password, setup token or consent. Fixtures use separate synthetic accounts and
repositories. Native CLI authentication is separate from the console owner;
the local host does not attest their account relationship.

## Configure The Trusted Host

```bash
node codex-skills/controls-doctrine-operator/scripts/serve_controls_operator.js \
  --repository <target-repository> --state-dir <private-directory-outside-git> \
  --semantic-executable <absolute-installed-codex-path> \
  --semantic-model <explicit-model-alias> --port 4317
```

Supply both semantic options together. Without them, history remains inspectable
but new evaluations are disabled. HTTP callers cannot choose a model, executable,
prompt, key, environment, authority or replacement reference. The collector
requires its reviewed CLI version; configuration is not proof of model access.
No new API key or public-CI login is used. Use HTTP, not `file://`: the console
requires its authenticated loopback API. Existing origin/host, CSP, CSRF, strict
body schemas, account permissions and auth throttles apply to these routes.

## Owner Procedure

1. In Evidence, inspect an actual `order-drafts` artifact and select **Evaluate
   Omissions**. Preparation verifies the selected manifest, replays the draft,
   checks handling/OPSEC/EEFI and measures the fixed profile. It transmits nothing.
2. Review the complete transmitted text, model, executable/invocation digests,
   handling, duration and one-call bound. Native context/model snapshot and
   provider billing caps remain explicitly unattested/unenforced.
3. Check the exact-transfer acknowledgment, enter a rationale and reauthenticate
   with the owner password. The two-minute nonce binds this owner, account epoch
   and actual stored browser session. Another owner browser cannot consume it;
   caller `USER`, old order consent or a development key is insufficient.
4. The server rechecks source/profile/repository/manifest, reserves the action
   atomically and signs `SemanticEvaluationTransferConsent` for this invocation
   only. The owning main service launches the bounded collector, not a worker
   thread that could terminate while leaving an OS child running. HTTP 202 is
   not a completed result or execution grant.
5. Inspect Model Evaluations. The signed `OperatorSemanticEvaluation` binds
   consent, invocation, rationale digest, model response and collection evidence.
   Bounded response reads must match the collector's exact byte digest before signing.
   Pinned-key verification is required before display. Model verdicts remain
   advisory; a changed/missing result is unverifiable, never a clear successful row.

Rationales remain in private audit state and are not transmitted. The service
rejects the supplied password, nonce and session ID in a rationale; this is not
a general third-party-secret detector. Raw nonce/password/session ID are absent
from signed audit payloads. Internal handling is not consent: only the exact
approved packet may be sent. Restricted or detected EEFI/OPSEC content still
fails without an owner-flag bypass.

## Stop, Interruptions And History

One model collection may run per private state. The same nonce cannot run twice,
even after a lost HTTP response; query its action instead. Stop Evaluation
requests cancellation, not billing cancellation or hold discharge. Logout checks
the actual stored session, not a cached user object, and aborts its collection.

Graceful shutdown starts both model and worker-queue closing fences before
awaiting either. It waits for both observed exits, including independent native
process-group absence, before releasing ownership or closing SQLite. A slow or
failed model close cannot leave the other queue open for new work. Signal errors and
private diagnostic/final-journal write failures remain failed results.
Malformed/non-object JSONL and invalid UTF-8 are rejected inside the collector;
they cannot throw an uncaught stream callback in the owning HTTP service.
Unconfirmed exit retains the shutdown fence. SIGKILL/host failure is not a hard
provider deadline or guaranteed orphan containment; external supervision remains
open. An exit request or clean Git status never proves termination.

Failed, cancelled, interrupted or changed actions are held. Restart invalidates
pending previews and preserves holds without replay. A model hold or unverifiable
signed history fences another transfer in this local model domain. No model-hold
discharge ceremony exists yet. Do not delete rows/journals, edit statuses or rotate
keys to retry. This does not settle tool/gateway/campaign obligations or undo
earlier transmission. Twenty pending and 1,000 retained actions are fail-closed
capacity limits, not an automatic archive/retention workflow.

Owner-only list/detail/cancel APIs live at `/api/model-evaluations`. Viewers cannot
access them even with the same mission permission. Diagnostics stay private.
Previews, consents, collections and signed results are control metadata, including
copied/reordered/text/binary forms; the actual wave-report consumer rejects them
as work. Both issuance/channel source bindings measure this type catalog. Only
synthetic examples are regenerated; historical producer evidence stays immutable.

The UI fences lists, previews and polling by principal/view/request ownership and
clears hidden packet/credential fields on logout. It never replays discarded
approvals. Browser tests delay real authenticated responses, not business mocks.

## Verification And Remaining Work

Run `node run-operator-semantic-fixtures.js`,
`node run-semantic-evaluation-fixtures.js`,
`node run-skill-control-evidence-fixtures.js` and existing console/consent suites.
`operator-semantic-fixtures/browser-check.js --output <directory>` uses Playwright
for desktop/mobile approval and account-switch flows. Default fixtures use a
measured fake provider and zero actual model calls. Separate native probes must
identify exact source and synthetic scope.

Remaining: held-out calibration; mandatory versioned adoption/receiver/dispatch
consumers; bounded planning/replanning with USER revision; model-hold reconciliation;
trusted time/hard billing cancellation; protected keys/hosts, external fencing and
independent monitoring. This UI does not close any of the eight full outcomes.
