# Exact Campaign Successor Admission

## Purpose

`campaign-successor-controller.js` admits one exact USER-approved successor after
[known-obligation terminal reconciliation](campaign-terminal-reconciliation.md).
The predecessor remains stopped. Admission satisfies only the mission stop fence;
normal supervisor budgets, trust, routing and tool-dispatch gates still apply.
This is local engineering synthesis, not a new external doctrine claim.

## Procedure

1. Settle every registered predecessor wave, admission, unknown effect and
   post-settlement failed-agent revocation, then retain a current terminal record.
2. Draft a `CampaignSuccessorProposalRequest` containing that exact terminal,
   the complete future `SelfImprovementCampaign`, and the target repository's
   `repository-state` result. Use a new campaign ID in the same mission,
   the current baseline, finite budgets and USER final authority. The candidate
   creation time must follow terminal reconciliation. This draft grants nothing.
3. Run `propose`. It replays terminal evidence, requires an unchanged repository
   and no unaccounted mission history, and retains a non-authorizing proposal.
   Its expiry is the earlier of one hour and the candidate campaign deadline.
4. Prepare a `CampaignSuccessorActivationRequest` with the exact proposal and a
   three-field `none` decision reference. Run `decision-option`. Present the
   proposal, terminal and full candidate scope to the actual USER.
5. Retain that USER's complete scope `DecisionLog`. Its retained-authority basis
   names the predecessor campaign, its chosen option equals the generated option,
   and its affected artifacts are exactly the proposal and terminal paths. It
   must be recorded after the proposal and less than one hour before activation.
   Replace only the draft's decision reference with the exact retained decision.
6. Run `activate`. The controller retains the exact candidate and then a separate
   admission. A crash between these writes leaves `candidate_held`, not a runnable
   campaign. Verify/recover valid artifact journals, inspect status and retry the
   same request; never insert an admission through the raw artifact store.
7. Use the ordinary supervisor and adaptive wave lifecycle with that exact new
   campaign ID. Admission is not a ready cycle order, context pack, tool policy,
   lease or release grant. Non-adaptive waves and ordinary campaign init cannot
   bypass the original same-mission fence.

```bash
node codex-skills/controls-doctrine-operator/scripts/activate_controls_successor.js \
  repository-state --repository <repo>
node codex-skills/controls-doctrine-operator/scripts/activate_controls_successor.js \
  propose --request <proposal-request.json> --repository <repo> --artifact-root <root>
node codex-skills/controls-doctrine-operator/scripts/activate_controls_successor.js \
  decision-option --request <activation-request.json>
node codex-skills/controls-doctrine-operator/scripts/activate_controls_successor.js \
  activate --request <activation-request.json> --repository <repo> --artifact-root <root>
node codex-skills/controls-doctrine-operator/scripts/activate_controls_successor.js \
  status --mission <mission-id> --campaign <successor-id> --repository <repo> --artifact-root <root>
```

The Claude wrapper accepts the same arguments. CLI clocks are live and have no
override. A generated decision option is never a USER decision.

Keep request files and redirected output outside the target worktree or in its
ignored artifact area before capturing repository state. Creating an untracked
request file after capture changes the fingerprint and correctly blocks proposal.
To cancel a pending proposal, retain the USER's superseding scope decision; it
is unexpected ceremony history and blocks activation. After admission, use the
exact successor campaign's stop intake. A generic decision alone is not a stop.

## Exact History And Recovery

The terminal publication is the ceremony baseline. Only the exact proposal,
exact USER decision and byte-equivalent successor candidate may follow it before
admission. There is no generic exclusion for approval, note or proposal kinds.
Unexpected history, repository drift, substitution, conflicting consent, expired
budgets or another stop require a new reconciliation/proposal/decision. Never
renew `created_at` or silently widen the payload under an existing approval.

Each publication rechecks current state under the repository namespace lease.
Admission consumes one decision and one exact stop set. A second successor cannot
use that same stop set even after another terminal record. A later USER stop adds
a new fence; the prior admission cannot override it. A subsequent successor needs
the newly stopped campaign's terminal record and another exact decision.

Exact retry of a retained admission reports historical admission separately from
current `stop_fence_satisfied`. Neither value asserts present budget/trust/tool
readiness. A previously admitted campaign can be `stopped_again`; a held candidate
must never be resumed through ordinary init, disabled adaptation or a new session.
The stop controller continues reporting immutable stop history after admission;
use successor status for the exact new campaign and then its normal readiness gates.

Historical replay uses the exact recorded manifest prefix. It replays proposal,
decision order, candidate publication and terminal obligations without importing
later work or comparing an old repository baseline to today's HEAD. Live proposal
and activation separately compare the complete repository fingerprint captured
in the proposal request. Returned status is snapshot-bound and must be rechecked
at the consuming publication boundary.

## Limits

All proposal/admission/status results keep execution, continuation and release
authorization false. Only the ordinary supervisor can issue a current cycle order,
and dispatch still needs its own exact policy and lease. Historical local records
do not independently attest controller execution or authenticate the person who
created a USER log. Fingerprints bind retained local state; they do not reconstruct
unretained historical worktree bytes or supply a trusted clock. No process kill,
cross-mission semantic-equivalence detection, undisclosed-effect completeness,
unsupported containment or managed production infrastructure is provided here.

## Contracts And Checks

- [Proposal request](../schema-files/campaign-successor-proposal-request.schema.json)
- [Proposal](../schema-files/campaign-successor-proposal.schema.json)
- [Activation request](../schema-files/campaign-successor-activation-request.schema.json)
- [Admission](../schema-files/campaign-successor-admission.schema.json)
- [Controller](../campaign-successor-controller.js)
- [Fixtures](../run-campaign-successor-fixtures.js)

Run successor, terminal, supervisor, dispatch and settlement fixtures, validator
fixtures, both skill coverage checks and the complete aggregate gate after changes.
