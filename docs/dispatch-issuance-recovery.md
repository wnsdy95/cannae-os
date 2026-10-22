# Dispatch Issuance Recovery

## Local Boundary

Every new dispatch lease uses a manifest-backed issuance transaction. This
reference controls local issuance and covered tool calls; it is not native
client attestation, protected key custody, an exclusive execution path or an
operated production deployment. Deployment selection remains deferred.

`DispatchLeaseIssuanceRequest` freezes one exact lease ID, nonce, session/agent,
policy, plan, context, repository state, issuance time and expiry before any
predecessor supersession. A reviewed method channel also binds its actual
retained session observation and cannot outlive the original channel deadline.
The request carries no execution, continuation or release authority.

The controller appraises the exact introduction prefix and publishes, in order:
the request, an optional frozen predecessor supersession, lease v0.2, its real
baseline checkpoint and one `DispatchLeaseIssuanceResolution`. Only a committed
resolution permits that lease to enter the ordinary dispatch consumer. Discovery,
a request, an isolated lease or a baseline alone is not usable authority.

Repository issuance and predecessor locks cover the operation. Every guarded
publication rechecks the exact manifest, current repository state, finite time,
runtime source-entry digest and held locks. Concurrent history, stop, changed
scope, unknown effects and gateway obligations cannot be repaired by choosing
another session or nonce. The actual tool gate still performs its own checks.

Resume and publication preserve specific stop, terminated-wave, reconciled
failure and gateway/effect holds before generic state conflicts. The
gateway/effect checks are repository-wide, including obligations introduced in
another wave immediately before publishing a new lease. A new wave or session
does not discharge those obligations; a denied publication retains no grant.
Historical legacy contexts can still settle already-admitted results and be revoked;
they never bypass the current mandatory-context guard for new calls or resume.
An active/interrupted legacy lease with a reconciled failure still reports that
specific failure and required revocation before the generic result-only guard.
Result-only migration status never conceals or clears retained failure markers.
Unobserved startup and known unknown effects deny before a successor is frozen.
Tests must prove that early denial publishes nothing, not force an unsafe old
sequence merely to reach its former downstream guard.

## Inspect And Recover

Preserve partial publications and inspect the exact repository first:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  status --repository /absolute/target --mission MIS-EXACT --wave W1

node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  recover-issuance --repository /absolute/target --issuance DLI-EXACT
```

Use the equivalent Claude skill wrapper when appropriate. `issuances` reports
the actual request/resolution references and which publications exist.
`unresolved_issuances` remains a repository hold even after expiry. It is not
hidden because the successor lease or baseline is absent.

If verification instead reports `PENDING_TRANSACTION`, stop affected dispatch
and inspect the artifact-store journal first. From the doctrine repository,
recover only its valid retained transaction:

```bash
node repository-artifact-verify.js --repository /absolute/target \
  --artifact-root /absolute/target/.cannae/artifacts --recover
```

Require `valid: true` before inspecting dispatch status and recovering the exact
issuance ID. A prepared journal without candidate bytes can roll back; a valid
candidate can finish publication. Recovery of the final resolution can restore
a committed issuance record; that historical state is not current execution
eligibility and never replays a task. Conflicting bytes, history or locks require operator review;
never delete the journal, invent a missing artifact or bypass verification.
A genuinely missing namespace may be initialized by an ordinary first wave;
an existing invalid or journaled store is not an empty namespace. Never seed
invented evidence to bypass the first-wave boundary.

Recovery accepts only the retained request ID. It never accepts replacement
bindings, a clock, nonce, budget or caller-created lease. Each retry uses the
same frozen bytes and finishes only missing publications. Already committed or
cancelled records are reported historically; they do not reactivate expired,
completed, revoked, superseded or otherwise blocked authority. Task execution
is never replayed. Check current lease status and ordinary tool gates separately.

Every actual new-call gate and its final allow-publication guard compares the
lease's retained runtime source-entry digest with current bytes, including after
generic journal recovery. `runtime_source_current` in issuance status is only
one eligibility condition, never a grant. Changed source returns
`DISPATCH_ISSUANCE_RUNTIME_CHANGED`; retain the diagnostic, settle already
admitted results and explicitly revoke unused authority before a newly reviewed
runtime/wave. This current-source denial is not an automatic persistent
revocation or isolated execution attestation. Restoring bytes cannot clear
recorded revocation, stop, expiry or other retained holds.

An active method channel still needs its exact enrollment. The issuance
transaction does not rebind its private file or attest native startup. Follow
the [channel continuation procedure](method-control-channel.md) for a separately
reviewed channel policy v0.2; keep its budgets, reports and root deadline.

## Cancel An Unused Issuance

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  cancel-issuance --repository /absolute/target --issuance DLI-EXACT \
  --reason "Cancel the exact unused successor after inspection."
```

Cancellation records only actual published references. It does not fabricate a
baseline, restore the predecessor or erase failure/expiry. An unfinished lease
cannot have covered admissions; unexpected admissions or extra checkpoints are
an integrity failure, not permission to assert cancellation. A committed grant
requires normal interruption/revocation instead. An exact cancellation retry
preserves its original reason; a different reason is a different request.

Cancellation can retain a terminal denial after expiry or repository drift
because it grants nothing. It does not settle another tool/gateway effect or
authorize a successor wave. Pending issuance must be recovered or cancelled
before report/closeout, wave termination, order supersession or campaign terminal
settlement can claim a settled dispatch boundary.

## Upgrade And Legacy Evidence

Lease v0.1 remains readable for admitted-result settlement, inspection and
revocation, but cannot authorize a new covered call. New leases require v0.2 and
their complete issuance chain; changing a version cannot bypass that gate.
Do not hot-swap runtime code during an admitted call or silently edit a reviewed
method context. Settle results and delivery before upgrading; a changed method
fingerprint needs a newly reviewed plan and channel.

The transaction can recover only records it actually retained. An older core
resume that superseded its predecessor without retaining an issuance request
has no frozen successor to recover. Preserve that history and obtain separately
reviewed successor scope; never reconstruct a nonce, backdate a request or insert
a missing checkpoint. A source-entry digest is not proof of isolated execution.

## Validation

Run `node run-dispatch-issuance-contract-fixtures.js` for strict non-authorizing
contracts and `node run-dispatch-issuance-fixtures.js` for actual local consumer
and publication-failure cases. Run `node run-dispatch-issuance-store-fixtures.js`
for empty, journaled and corrupt-store regressions. It also changes an actual
covered source entry in a disposable runtime copy and preserves the denied
recovery and one task read. Required broader checks include legacy/current
dispatch, method channel continuation, intent, mission lifecycle, terminal/order
consumers, metadata/work-evidence, schema samples, both skills and full CI.
Passing a selected fixture set does not close any of the eight overall outcomes.
