# Campaign Terminal Reconciliation

## Scope

After an [explicit USER stop](bounded-self-improvement-operations.md#210-explicit-user-stop-intake),
`campaign-terminal-controller.js` can retain a non-authorizing inventory proving
that the known, registered mission obligations are settled. It does not rewrite
the stop, mark failed work successful, kill a process, or authorize a successor.
This is local engineering synthesis of the existing artifact, dispatch, wave,
USER-decision and effect-settlement contracts, not a new military-source claim.

## Procedure

1. Inspect stop status and preserve already-admitted results. Finish each
   gateway-owned operation through its gateway, not through a direct hook.
2. Reconcile unknown effects using the separate hook or supported gateway
   settlement procedure. Explicitly revoke failed agents after settlement.
   A legacy terminal lease or zero pending callbacks is insufficient.
3. Account for every registered operational wave, including partial opens and
   disabled adaptation. Preserve an existing closeout, including a blocked
   closeout. Otherwise use the wave-termination controller with an exact plan.
   Expiry does not claim success; early abort or supersession still needs its
   own exact USER decision. A campaign stop decision is not that decision.
4. Create a `CampaignTerminalRequest` naming the exact campaign and stop
   references. Do not supply your own wave list or `settled` assertions.
5. Run the terminal wrapper and retain its exact manifest reference:

```bash
node codex-skills/controls-doctrine-operator/scripts/reconcile_controls_campaign.js \
  reconcile --request <campaign-terminal-request.json> \
  --repository <repo> --artifact-root <artifact-root>
node codex-skills/controls-doctrine-operator/scripts/reconcile_controls_campaign.js \
  status --request <campaign-terminal-request.json> \
  --repository <repo> --artifact-root <artifact-root>
```

The Claude wrapper has the same arguments. CLI evaluation uses the live local
clock and has no clock override. Any unresolved or invalid obligation exits
nonzero; never reinterpret an error as an empty inventory.

## Replayed Evidence

`CampaignTerminalRecord` v0.1 records the exact request, observed manifest,
all same-mission retained references except earlier terminal records, all stop
references, and one disposition per registered wave. It is stored under `C0`.
Its ID binds the canonical request and observed manifest; its request and
inventory have separate canonical digests.

The controller derives wave ownership from the retained wave/routing/context,
dispatch and gateway control families, including integrated preflight and effect
settlement. A control artifact without a corresponding plan blocks reconciliation.
Arbitrary notes alone do not register an operational wave; tools outside these
registered paths are not observed by this inventory.

- Terminations are replayed against their actual publication prefix, complete
  retained wave references, request digest, expiry or exact USER consent, and
  then-settled dispatch. Supersession also checks its then-ready successor.
- Closeouts preserve exact plan/report/AAR/readiness/campaign references and
  deterministic disposition. Reports replay routing bundles and retained
  receipts, context/evidence bindings and report-bound mandatory control
  receipts. Historical controls are not rerun against today's changed code.
- Dispatch reads every lease and checkpoint lineage. Pending admissions,
  unknown effects, gateway transactions and post-settlement failed-agent
  revocation remain independent obligations. Orphan checkpoints, admissions and
  requests cannot disappear merely because there is no lease row.
- New leases, policies, contexts or allow admissions retained after a wave's
  disposition invalidate closure even when later callbacks claim completion.
  Result settlement and explicit revocation are not new work authority.
- Hook and gateway settlement replay is limited to the exact verified manifest
  prefix. Later settlement does not retroactively clear an earlier obligation.
  The read-only historical API does not relax live issuance/admission checks;
  an unbranded stale live view still fails closed.

Publication repeats the entire appraisal under the artifact namespace lease
and requires the exact observed snapshot. Concurrent history growth rejects
initial publication. After a crash, verify/recover the valid artifact journal
before retrying; a durable record may already exist. Byte-equivalent inventory
and request reuse the existing record. Changed retained mission history needs
fresh appraisal and a new immutable record, never an edited old record.

`status: known_obligations_settled` with `settlement_complete: true` is a current
match to a replayed terminal record. `ready_for_reconciliation` means the current
predicate passed but no record covers this exact inventory yet. Both leave
`execution_completion_claimed`, `execution_authorized`,
`continuation_authorized` and `release_authorized` false.

Status returns its exact `observed_manifest` and checks that the live manifest
still matches after replay. Concurrent publication during that read rejects the
status instead of returning a stale positive result. This is a snapshot, not a
lasting clearance; any consumer must reappraise at its own publication boundary.

## Boundaries And Remaining Work

The same-mission stop remains enforced after terminal reconciliation. The
separate [successor admission controller](campaign-successor-admission.md)
requires a bound full proposal, fresh exact USER decision, unchanged repository
and crash-safe candidate/admission publication. Normal budget/trust/routing
gates still apply. A generic approval, another campaign ID, another mission
namespace or a terminal record is not restart authority.

This appraises retained local records; it does not authenticate the person who
created a USER log, independently attest historic controller execution, prove
that all external effects were disclosed, or establish trusted time. Unsupported
containment and managed coordination stay blocked. Hard process isolation,
external durable custody and independent trust infrastructure remain separate.

## Contracts And Checks

- [Request schema](../schema-files/campaign-terminal-request.schema.json)
- [Record schema](../schema-files/campaign-terminal-record.schema.json)
- [Request example](../sample-payloads/valid-campaign-terminal-request.json)
- [Record example](../sample-payloads/valid-campaign-terminal-record.json)
- [Controller](../campaign-terminal-controller.js)
- [Terminal fixtures](../run-campaign-terminal-fixtures.js)
- [Hook replay fixtures](../run-tool-effect-settlement-fixtures.js)
- [Gateway replay fixtures](../run-gateway-effect-settlement-fixtures.js)

Run those three fixture suites, the validator fixtures, both routing coverage
checks and the aggregate regression gate when changing this boundary.
