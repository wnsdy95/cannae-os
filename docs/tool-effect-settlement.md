# Tool Effect Settlement

## Boundary

This controller resolves one retained unknown **hook** outcome, not a gateway
transaction, failed campaign, or authority grant. It appends `ToolEffectSettlement`
without changing the failed checkpoint. The lease remains blocked until explicit
revocation; settlement cannot make a failed agent successful. Release and new
tool execution remain false.

It combines [Tool Effect Review](tool-effect-review.md) with an exact retained USER
scope decision and the inspection campaign's verifier policy. Trust policy v0.4
or newer is required: static verifier keys alone are insufficient. Workload
identity, runtime profile, exact signed execution evidence and receipt quorum are
checked. When v0.5, v0.6, or v0.7 is selected, the existing supervisor additionally
requires fresh challenges, computed failure domains, and transparency evidence.
Those stronger requirements are never downgraded by this controller.

## Procedure

1. Keep the failed invocation blocked. Obtain separate USER authorization for
   inspection, its finite campaign and verifier policy; never resume the stopped
   campaign under a new ID. A dedicated inspection campaign is permissible only
   as separately authorized scope, not as a continuation bypass.
2. Freeze and retain the effect scope and source observations as described in
   the review procedure. Before running its plan, retain a ready supervisor
   cycle order from that inspection campaign. The settlement gate reconstructs
   this order against its exact historical manifest and issue time, and requires
   the same campaign transition to remain ready at settlement.
3. Execute the plan in the authorized verifier environment. Persist its actual
   receipt, `VerifierExecutionEvidence`, and signed `VerificationAttestation`s.
   Each execution record must bind the exact receipt reference, repository
   identity/state, selected authenticated workload-evidence reference, and
   verification target `{name: scope.id, digest: {sha256: canonicalScopeDigest}}`.
   Its invocation interval must contain the receipt's real execution interval.
   The evidence and signatures must satisfy the campaign and trust-policy quorum.
4. Retain an `evidence_bound` review. Fill a
   [ToolEffectSettlementRequest](../sample-payloads/valid-tool-effect-settlement-request.json)
   with exact manifest references. `scope_coverage_accepted` and
   `inspection_method_accepted` are proposed USER judgements, not facts inferred
   from passing checks. To prepare the decision option, use a concrete placeholder
   reference for `decision_ref`, which is deliberately excluded from that option's
   hash to avoid a circular reference:

   ```bash
   node codex-skills/controls-doctrine-operator/scripts/settle_tool_effects.js \
     decision-option --request <request.json>
   ```

5. Present the scope, checker adequacy, known limits and exact option to the USER.
   Only after the actual decision, retain a `DecisionLogEntry` in `decision-logs`
   under the same mission/wave. Require `decision_maker: USER`, `decision_type:
   scope`, `status: complete`, `authority_basis.basis_type: retained_authority`,
   and `authority_basis.reference` equal to the scope ID. Use the returned
   `settle-effects:<digest>` as `chosen_option` and one `options_considered` entry.
   `affected_artifacts` must contain exactly the manifest paths of the review,
   campaign, cycle order, scope, plan, receipt, and every attestation. The decision
   must follow the review and attestations and be less than one hour old.
   Another completed USER decision for that scope at the same or a later time
   blocks reuse of the earlier decision. Resolve contradictory scope decisions
   explicitly; do not select an older favorable record.
6. Replace only `decision_ref` with the retained decision reference and run:

   ```bash
   node codex-skills/controls-doctrine-operator/scripts/settle_tool_effects.js \
     settle --repository <repo> --artifact-root <root> --request <request.json>
   ```

   Claude uses the corresponding `.claude/skills/controls-doctrine-operator`
   script. These wrappers resolve the installed doctrine independently of the
   target repository. `decision-option` is preparation, never approval.
7. Inspect dispatch status and verify the artifact store. Only this checkpoint's
   `unresolved_tool_effects` hold is removed. Explicitly revoke the old lease;
   obtain any successor wave/campaign scope separately. Settlement does not renew
   expired authority, close a campaign, report agent success, or resume work.

## Integrity And Replay

The request's canonical digest determines the settlement ID. The checkpoint,
USER decision, and cycle order are consumed once. Exact byte-equivalent canonical
request retries return the existing record only after validating all retained
settlements. Different requests cannot reuse those inputs.

Publication rechecks the manifest revision/digest, live Git state, proof readiness,
decision and expiry under the artifact-store publication guard. A concurrent
write, changed repository or elapsed proof window denies publication. Historical
status replay uses the manifest immediately before settlement, the original
repository-state evidence and settlement time, and checks first publication in
the next manifest revision. Later expiry or legitimate repository edits do not
erase a completed settlement. Corrupt or fabricated retained proof fails closed.

Gateway decisions **and requests without a decision** are rejected. A gateway's
cleanup, production coordinator, execution receipt and terminal transaction need
a separate settlement contract; hook settlement cannot discharge those duties.

## Limits And Verification

The USER decision is a retained local workflow record, not cryptographic user
authentication (`user_identity_authenticated: false`). Its writer must have
actually received the decision. `scope_completeness_basis: exact_user_judgement`
does not prove the absence of arbitrary external effects. Provider evidence is
appraised against the selected trusted policy; the controller does not deploy or
independently measure infrastructure beyond those adapters. v0.4 retains declared
independence groups; computed failure-domain assurance requires v0.6+.

Manifest replay assumes cooperating local writers and a trustworthy system clock;
it is not remote tamper-proof storage or a trusted timestamp service. Full
campaign stop/restart, gateway settlement and production operations remain in the
[completion backlog](completion-backlog.md).

Run `node run-tool-effect-settlement-fixtures.js` and
`node validator-cli-prototype/run-fixtures.js`. Fixtures execute a real local
checker and real ephemeral signatures. USER decisions, provider identity and
isolation claims are explicitly synthetic; passing them is not production
deployment or live independent-operator evidence. This design is local
engineering synthesis, not a new military-source claim.
