# Authenticated Local Order Decisions

## Boundary

The local owner can now adopt, reject or request revision of one exact retained
order proposal through the actual order-adoption controller. This is not a
tool-action approval, release approval, universal authenticated CLI, production
identity boundary or complete operational COP. Legacy CLI USER logs are not
retroactively authenticated. The existing order record keeps execution,
continuation and release false; normal lifecycle, stop, readiness, lease and
gateway admission remain necessary.

## Decision Protocol

1. Inspect a real retained proposal and its complete plan in Order Proposals.
   Select the disposition explicitly. Adoption also requires an explicitly
   selected matching retained rehearsal and all its valid per-agent backbriefs.
2. Preview replays the existing controller's actual preconditions without
   publishing a decision. The server binds the complete request, exact plan,
   evidence, verified manifest, repository state and running-source state to
   one owner, account epoch and browser session. The nonce is random, one-use
   and valid for at most two minutes, never beyond the proposal expiry.
3. The owner supplies a rationale and current password. The service checks
   the same live account/session and atomically reserves the nonce. HTTP
   callers cannot supply actor, principal, decision log, consent, authority,
   raw references or a replacement plan.
4. A finite worker rechecks the source, repository, manifest, owner, session,
   expiry and exact review subject under every artifact publication guard.
   It retains a signed consent record, the exact bound USER scope decision,
   and the actual adoption-controller result in that order. Intervening
   changes stop publication, not silently refresh the approved subject.
5. Decisions shows the retained action state. Retry does not execute twice.
   After a lost response, inspect this state; do not turn uncertainty into
   a new automatic approval.

`OperatorConsentRecord` is non-authorizing audit metadata. Its Ed25519 signature
binds the repository, exact decision payload digest, proposal/evidence request,
plan hash, owner/epoch, hashed session/nonce, finite validity and source state.
The private signing key stays in the external private authentication database.
Verification requires a separately trusted public key; the consent does not
self-establish issuer trust or prove the verifier code ran in isolation. It is
forbidden as agent work evidence. No password, raw session ID or nonce is
retained in its payload. The chosen rationale is retained in the decision log
and must not contain credentials. The service rejects the supplied password,
raw nonce or session ID if repeated in the rationale; this is not a general
detector for every possible third-party secret.

## Interruptions And Trust Limits

Pending previews are invalidated on service restart. Reserved but unfinished
actions become `reconciliation_required`; the service never resumes their writes
automatically. A second live decision service cannot claim the same private
state directory. A publication attempt with an unknown outcome holds the exact
proposal against another local decision. Completed records are not undone by
logout, and login never renews their validity.

The console's bounded worker queue holds both its response and the next job
until it observes the current worker's actual `exit` event. A success message
is provisional until then; a worker error can still invalidate it. Timeout,
`terminate()` invocation, a failed termination request or an unconfirmed promise
never proves stopped. Termination failure retains queue capacity and the
shutdown fence, rather than opening a parallel decision path. Shutdown rejects
unstarted jobs and waits for the active worker's exit before releasing the
private decision-service ownership or closing its database. No hard wall-clock
exit bound is claimed when the runtime cannot confirm termination.

Worker exit proves only that this local worker no longer runs. It does not
establish which consent, decision or adoption publications became durable,
settle external effects, clear a reconciliation hold or renew approval. A
timeout after publication can coexist with a retained `applied` action; inspect
its actual state and history rather than infer failure or replay the decision.

This increment exposes those holds but does not yet supply an administrative
discharge operation. Inspect the real manifest and controller outcome; do not
edit the database, clear the hold, replay a retained nonce or infer nonexecution
from a missing HTTP response. A later reconciliation contract must distinguish
an already retained adoption from a decision never consumed.

The service is still a local reference boundary. The same OS user can replace
code or database contents and legacy filesystem/CLI paths remain available.
Private local key storage is not protected production custody or independently
retained authentication evidence. Deployment selection remains deferred; goal 8
and the other outcomes in the completion backlog remain required.

## Validation

For non-authorizing offline audit, run
`node operator-consent-runner.js <record.json> --public-key <pinned-public-key.json> --decision <decision-log.json>`.
The key file contains `public_key_pem` and must be trusted independently of the
record being verified. A passing audit does not publish, renew or consume consent.

Use `node run-operator-consent-fixtures.js`, the original order-adoption,
order-revision and console suites, validator, both provider routing/skill checks
and browser flows. Exercise actual controller/lifecycle consumption, unselected
or mismatched rehearsal, stale source/repository/manifest, wrong owner/session,
expired or replayed nonce, reauthentication, simultaneous submission and partial
publication. Do not create a real owner's account or decide real work in tests.

Run `node run-operator-console-worker-fixtures.js` for real-thread exit and
timeout checks plus controlled message/error/exit ordering, termination
failure, capacity and shutdown tests. Controlled promises intentionally model
misleading termination results; the console's real workers use Node's `Worker`
and release only from its observed exit event, not the fixture's assertions.
The fixture runner has a separate completion watchdog: an unfinished async test
must exit nonzero, not silently pass because its remaining promise is unresolved.
This test-only watchdog is not a production termination or reconciliation claim.

The underlying lifecycle behavior is documented in the versioned
[Node.js worker API](https://nodejs.org/download/release/v22.22.3/docs/api/worker_threads.html#workerterminate).
The queue's stricter observed-exit and hold rules are this project's engineering
policy, not a guarantee of process isolation or protected custody from Node.

This is an integration of [order adoption](order-adoption-and-plan-binding.md)
and the [local console](local-operator-console.md), using the existing native
Ed25519/canonical evidence primitives. It makes no new military-source claim.
