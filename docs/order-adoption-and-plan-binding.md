# Exact Order Adoption And Plan Binding

## Boundary

This extends [request intake](request-order-intake.md) with a finite, exact USER
review contract. Adoption records scope, not permission to call tools, continue a
stopped campaign, publish a repository or release information. Every adoption
artifact has execution, continuation and release authority fixed to false.

```text
Retained request + analysis -> ready OrderDraft
Ready draft + complete MissionWavePlan v0.2 -> OrderAdoptionProposal
Each assigned agent -> OrderBackbrief (full task acknowledgement)
All agents + exact backbriefs -> OrderRehearsal
Exact proposal + briefs + rehearsal + USER scope decision -> OrderAdoptionRecord
Current adopted plan + existing lifecycle gates -> AgentContextPack v0.3
Exact policy + lease + current adoption + other admission gates -> covered tool call
```

`IO-*` is an issued-scope identity inside the adoption record, not a freely
executable legacy OPORD. The embedded source tasks remain `TASK_ORDER_DRAFT`.
Do not remove draft markers to manufacture authority.

## Operator Procedure

Use `scripts/adopt_controls_order.js` from either installed provider skill. Every
store operation requires `--repository <target-repo>`. Pass the same optional
`--artifact-root` used for intake; the default is the target's `.cannae/artifacts`.
CLI operations use the live clock and reject clock overrides.

1. Inspect the complete original request, typed analysis and ready draft. Quote
   fidelity does not establish truth or completeness. Resolve unknowns first.
2. Prepare the entire `MissionWavePlan` v0.2 before review, including models,
   adaptive limits, all authority boundaries and exact dispatch-policy hashes.
   `order_binding` cites the retained draft and assigns every task to exactly one
   distinct agent. Preserve objective, outcomes, constraints, failure conditions,
   role/task text, handling level and retained decisions. Allowed actions must be
   a subset of the draft's proposed actions, not newly invented permissions.
3. Wrap that plan in `OrderAdoptionProposalRequest`; run `propose`. It freezes
   the complete request/plan digest, observed manifest and lifetime. The lifetime
   is at most one hour and never exceeds the draft or plan. An opened or terminated
   wave cannot be re-proposed. Exact retry cannot refresh time or expand scope.
4. Give each assigned agent the exact proposal and its task. Retain one
   `OrderBackbrief` per agent with `backbrief`. Restate intent, purpose, outcomes,
   constraints, stops, approvals, prohibitions and assumptions, and acknowledge
   the full task including deliverables, verification, CCIR and retained decisions.
   Outstanding questions, low confidence and unapproved actions block adoption.
5. Run `rehearse` with an `OrderRehearsal` containing all agent IDs and exact
   backbrief references. Each ordered step must reproduce that agent's task,
   newline-joined deliverables and required verification. High/critical unresolved
   friction and required changes block this reference adoption path. It cannot
   accept risk for the USER.
6. Prepare `OrderAdoptionDecisionRequest` with `approve`, `reject` or `revise`.
   Approval requires all exact backbriefs and the corresponding rehearsal;
   rejection/revision may precede them. Use an all-`none` decision reference while
   running `decision-option` to compute the exact `review-order:<digest>` option.
7. Present the complete proposal and evidence to the actual USER. Record their
   decision as a manifest-backed `DecisionLogEntry`, not an AI-created assertion
   of consent. Require decision maker `USER`, type `scope`, status `complete`,
   retained-authority reference equal to the proposal ID, the exact chosen option
   among considered options, and exactly the proposal/brief/rehearsal paths in
   `affected_artifacts`. The decision must follow retention of every subject.
8. Put that concrete decision reference into the unchanged decision request and
   run `decide`. A decision and proposal are consumed once. Changing even the
   request ID changes the reviewed option. Reject/revise is terminal for that
   proposal; prepare a new proposal and obtain a new decision for another attempt.
9. Open only the identical adopted plan through `operate_controls_mission.js`.
   Give each agent its generated context pack, not a hand-built task. The context
   carries exact adoption, proposal, draft, agent-backbrief and rehearsal references,
   full assigned task, intent, end state, constraints and assessment. Its validity
   ends at the shorter adoption lifetime, and its creation time cannot precede
   adoption or exceed the current clock. Retrying open preserves retained time.
10. Keep the adopted scope immutable. Changed analysis requires a new draft;
    changed plan requires a new proposal and USER decision. After wave opening,
    use the existing stop, FRAGO, termination and new-wave procedures. Do not
    strip `order_binding` or change IDs to escape review.

```bash
node codex-skills/controls-doctrine-operator/scripts/adopt_controls_order.js \
  propose --repository <repo> --input <proposal-request.json>
node codex-skills/controls-doctrine-operator/scripts/adopt_controls_order.js \
  backbrief --repository <repo> --input <agent-backbrief.json>
node codex-skills/controls-doctrine-operator/scripts/adopt_controls_order.js \
  rehearse --repository <repo> --input <order-rehearsal.json>
node codex-skills/controls-doctrine-operator/scripts/adopt_controls_order.js \
  decision-option --input <decision-request.json>
node codex-skills/controls-doctrine-operator/scripts/adopt_controls_order.js \
  decide --repository <repo> --input <decision-request-with-user-reference.json>
node codex-skills/controls-doctrine-operator/scripts/adopt_controls_order.js \
  inspect --repository <repo> --proposal-id <proposal-id>
```

Samples are synthetic contract examples. Their references are not usable approval
in a real store. No command manufactures a USER decision or signs on their behalf.

## Replay And Consumption

Proposals and records replay against the exact manifest prefix before their
publication. Backbriefs and rehearsal similarly replay against retained input
history. Store identity, hashes, mission/wave scope and finite timestamps are
checked separately from schema shape. Publication holds the namespace guard and
requires the same verified manifest and a non-rollback, unexpired clock.

`MissionWavePlan` v0.1 and context v0.2 remain available for legacy waves without
intake. A captured request, proposal or adoption record in the same mission/wave
fences that downgrade. Bound plans require a unique current adopted record whose
complete plan hash matches. A later conflicting USER scope disposition blocks
new work, including a disposition inserted later with an older timestamp.

Wave opening/publication, policy compilation, lease issuance/resume and covered
tool admission recheck the adopted scope. Context consumers compare the complete
assignment, not just its ID. Schema validity alone reports `can_execute: false`
for adoption artifacts and bound plan/context versions. Intake/adoption metadata
cannot stand in for execution evidence in a wave report.

The separately rendered context role, department, task, handling level, capability
query and complete authority boundary must also match the adopted plan. A matching
adoption reference does not excuse contradictory `allowed_actions`. Model fields
must equal the exact agent/billet row of the plan's retained ready integrated
preflight; a profile name cannot be substituted or treated as authority.

Expiry denies new work, not retention of an already admitted tool result.
Containment, result settlement, revocation and historical inspection remain
separate. Exact decision retry can return an expired historical record without
renewing it; inspect is historical evidence, not current dispatch admission.

## Limits And Verification

This is a local reference guardrail. A `USER` field does not authenticate the
human; filesystem writers can modify code or construct other contracts. The
runtime cannot recognize a semantically identical task renamed into a different
mission/wave. Trusted time, authenticated approval transport, complete semantic
interpretation, automatic execution and non-bypassable process isolation remain
separate requirements. The plan does not gain broader authority from a capable
model, source quotation, backbrief, rehearsal or successful test.

Use `node run-order-adoption-fixtures.js`, the validator and document-routing
fixtures, then the aggregate gate. Include exact retry, nested semantic rules,
source/plan/agent substitutions, scope decisions, expiration, publication races,
downgrade attempts and real lifecycle/dispatch consumers. Both installed wrappers
must also be exercised from outside the doctrine checkout.

This is engineering synthesis of [orders production](orders-production-pipeline.md),
[backbrief and rehearsal](backbrief-and-rehearsal-sop.md) and the existing
[mission lifecycle](skill-operational-mission-lifecycle.md), not a new military
source claim. Phase 2 remains partial pending semantic-completeness evaluation and
broader approved-edit/FRAGO integration.
