# Gateway Effect Settlement

## Boundary

This controller appends an exact gateway reconciliation record. It discharges
the bound admission and unknown-effect checkpoint without manufacturing a tool
result, successful receipt, terminal transaction event, or new execution grant.
The original denied, recovered, or failed transaction remains unchanged.

It composes [gateway review](gateway-effect-review.md), the shared
[execution-bound proof appraisal](tool-effect-settlement.md), and separately
verified [OCI containment evidence](oci-linux-sandbox-provider.md). This is local
engineering synthesis, not a new military-source claim.

Supported subjects are an unstarted orphan allow admission and recovered or
committed-unknown OCI reference execution with a signed fresh containment
observation. Managed production requires a separately contracted external
coordination/fencing proof and is rejected here. Bounded-process, fixture and
external-adapter execution cannot substitute arbitrary observations for provider
containment. Those adapters, legacy unbound OCI envelopes, independent
infrastructure and full campaign restart remain open work.

## Procedure

1. Inspect gateway and dispatch status together. `effects_reconciled` cites the
   retained `settlement_ref`; it is not successful execution. Otherwise perform
   recovery first and read the exact raw subject. Raw intake deliberately
   preserves original history even after reconciliation.
2. For executed OCI reference transactions, collect signed containment before
   freezing the scope. Bind the latest exact observation reference in the subject.
   Signature, original daemon, target, envelope, policy, terminal event and finite
   validity must verify. Absence alone does not prove complete external effects.
3. Obtain separately authorized inspection scope, campaign and verifier policy.
   Freeze the subject and affected resources, retain a ready supervisor order,
   execute its exact plan and retain the receipt, execution evidence, workload
   identity and quorum as in [hook settlement](tool-effect-settlement.md).
   Trust policy v0.4 or stronger is mandatory. Stronger selected challenge,
   independence and transparency requirements are not downgraded.
4. Persist an evidence-bound gateway review. Fill a
   [GatewayEffectSettlementRequest](../sample-payloads/valid-gateway-effect-settlement-request.json).
   Orphans use an exact all-none `containment_observation_ref`, never an invented
   execution event or receipt. OCI uses the latest signed observation reference.
5. Prepare the option with the command below, then present scope completeness,
   checker adequacy, containment limits and that exact option to the USER.
   Preparation is not consent.
6. Retain an actual USER `DecisionLogEntry` in the same mission/wave, `scope`
   decision type, `complete` status and retained authority over the scope ID.
   Use `settle-gateway-effects:<digest>` as chosen option. `affected_artifacts`
   must exactly list the review, campaign, cycle order, scope, plan, receipt,
   attestations and containment observation when required. The decision must
   follow review and attestations, be less than one hour old and have no
   equal-or-later conflicting completed USER scope decision.
7. Replace only `decision_ref` and invoke `settle`. Verify store and exact discharge.
   Only the bound admission and unknown checkpoint leave unresolved counts.
   The same agent remains a reconciled failure across all its lease lineages.
8. Explicitly revoke affected leases after settlement. A prior revocation is
   insufficient, even at the same timestamp. Completion, resume and successful
   reporting remain prohibited for the failed agent after revocation. Obtain
   successor scope separately; reconciliation is not campaign restart.

```bash
node codex-skills/controls-doctrine-operator/scripts/settle_gateway_effects.js \
  decision-option --request <request.json>
node codex-skills/controls-doctrine-operator/scripts/settle_gateway_effects.js \
  settle --request <request.json> --repository <repo> --artifact-root <root>
```

Claude exposes the equivalent script below `.claude/skills/`. Never use the hook
controller, raw artifact insertion or modified signed evidence to bypass a gate.

## Integrity

The controller replays original review and current raw subject, then independently
validates containment and exact USER/execution-bound proof. Decisions and orders
are consumed once across both settlement families. Different requests cannot
reuse an admission. Exact retries validate retained records before returning the
same reference. Publication rechecks manifest, current repository state, proof
readiness, consent and deadlines under the store's read-only publication guard.

Historical replay verifies the pre-publication manifest, first appearance in its
immediate successor, original time and repository state. It uses raw gateway and
checkpoint history, never the settlement-aware obligation projection. Later
expiry or legitimate repository changes do not erase verified reconciliation.

`checkpoint_ref` preserves the failed-agent marker. `effect_checkpoint_ref` is
all-none when no unknown post-tool checkpoint exists; an orphan cannot create
one. The independent marker still requires revocation and prohibits success
reporting. Gateway status preserves original state/event/receipt references;
`effects_reconciled` is an additional projection, not a replacement history.

## Limits And Validation

The local USER record is not cryptographic user authentication. Provider evidence
is checked against selected policy; externally operated infrastructure is not
supplied here. Completeness remains USER judgement. Daemon-reported identity is
not independent host attestation. Cooperating local writers and local time are
assumptions, not hostile-writer isolation or a trusted timestamp service.

Run `node run-gateway-effect-settlement-fixtures.js`,
`CANNAE_REQUIRE_LIVE_OCI=1 node run-oci-linux-sandbox-provider-fixtures.js`,
`node run-tool-effect-settlement-fixtures.js` and the complete repository gate.
Fixtures run real local checks, ephemeral signatures and live Docker where
required. Their USER decisions and verifier isolation/provider claims remain
synthetic and cannot authorize real operational reconciliation.
