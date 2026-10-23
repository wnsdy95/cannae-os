# Bounded Structural Plan Synthesis

## Scope

This local candidate constructs complete `MissionWavePlan` v0.2 proposals and
deny-by-default policy drafts from an actual retained ready OPORD plus a finite
roster, declared estimates and policy/control envelope. The input contains no
whole hand-authored plan. The generator derives actual task text, assignments,
success/failure conditions, restrictions, classification and a USER-rooted intent
tree. It does not extract source requirements or invent strategy. The generation
class is `bounded_structural_synthesis_v1`, with zero model invocations. This is
a component of automatic planning, not completion of semantic planning/replanning
or any of the eight program outcomes.

The envelope is proposed configuration, not an authenticated authority grant,
verified cross-mission readiness registry or hard provider cost cap. Estimates
are abstract declared units, not measured tokens, currency or actual availability.
Saved CLI login does not grant transfer consent. Keep the existing Codex collector
and exact authenticated transfer ceremony separate; native/model strategy
generation and independent held-out calibration remain unfinished.

## Initial Construction

Prepare `BoundedPlanningRequest` with the exact draft reference, `mode: initial`
and exact none parent references. Supply enabled agent candidates with exact
allowed task IDs/roles, non-command identity, capability/approval/prohibition
lists, model billet and policy template. Supply explicit model/adaptive controls
and optional method baseline. Unknown roles/risks, duplicate identities/rules,
unrecognized fields, conflicting permissions and weakened repository controls
fail. Inputs are bounded to 1 MiB, 64 candidates/tasks and 4,096 search states.

```bash
node codex-skills/controls-doctrine-operator/scripts/plan_controls_mission.js \
  generate --repository <target-repository> --artifact-root <artifact-root> \
  --input <bounded-planning-request.json>
```

The Claude skill exposes the same wrapper. Neither wrapper provides clock,
model-execution, approval or release options. The library permits an explicit
fixture clock; the CLI does not. No configuration comes from a production sample.

Search considers every actual task in order, with one distinct declared candidate
per task. It deterministically minimizes the sum of declared estimates within
the envelope. An incomplete search returns `blocked`, not a supposedly optimal
incumbent. Budget/roster failures never shorten the task list. Never enlarge the
search or budget automatically merely to clear a denial. A ready record still
has execution/release, semantic proof, readiness attestation and hard cost-cap
flags false. Publication rechecks the actual store, source scope and clock.

The immutable proposal stores its complete request, unbound generated plan,
policy drafts, search evidence, estimates and original manifest. The returned
plan adds the exact `order_binding.planning_ref`; this finalization changes the
whole-plan digest. Use that returned plan when preparing fresh requirement
coverage, adoption, backbriefs and rehearsal. Never edit it or discard provenance.
The actual owner preview includes the full planning envelope/search/proposal in
its exact raw subject, in addition to source coverage and the complete plan.
Human review/adoption, integrated model preflight, tool policy authorization,
issuance and dispatch remain independent mandatory gates.

## Bounded Replanning

Use a newly captured change request and its compiled successor OPORD with
`mode: revision`, the exact retained parent plan and actual adopted-record
references. The parent must still be open/current, in the same mission and a
different wave. The OPORD's higher-level intent purpose and mission profile must
remain equal; parent success/failure conditions and restrictions are retained.
The new lifetime cannot outlive the parent. The lineage walk is bounded to 32
generated ancestors. A scope expansion requires a separately designed USER
decision, not an automatic wider envelope or relabeled initial plan.

Agent identity, role, department, billet and delegation cannot be promoted.
Allowed actions may narrow; prior approval/prohibition lists survive. Policy
rules retain their exact action/tool/input match and may only narrow counts and
lease duration. Parent policy bytes must match the exact draft digest already
bound by its adopted plan, from a prior retained generated proposal or supplied
original `parent_policy_drafts` whose complete preimage matches that hash.
An actual compiled policy changes `approved_at`; do not mistake a reconstructed
current timestamp for the originally approved draft. Its other fields and exact
authorization are matched before counting admissions. Caller-supplied assertions
without the adopted digest are insufficient. Missing policy
proof blocks generation. Method/adaptive controls cannot be stripped or changed;
required model binding cannot be disabled. A fresh integrated preflight must
still satisfy the actual downstream consumer. Custom intent hierarchies require
separate review rather than silently becoming a weaker direct tree.

Generation subtracts actual retained parent `allow` admissions, globally per
policy and per rule, and narrows emitted counts to the remaining allowance.
Exhausted candidates cannot acquire fresh capacity through a new wave name.
The record binds that remaining-budget snapshot to its original history. Fresh
review/adoption and live consumers recheck actual remaining allowance: further
parent expenditure invalidates an over-budget candidate instead of replenishing
it. Prepare a new bounded proposal/wave when necessary; never edit the old one
or discard spent history. This is an admission-count limit, not provider billing.

```bash
node codex-skills/controls-doctrine-operator/scripts/plan_controls_mission.js \
  prepare-revision --repository <target-repository> --artifact-root <artifact-root> \
  --proposal-id <retained-BoundedPlanningProposal-id>
```

This calls the actual revision controller and returns its finalized successor
with both planning and revision references and any shortened expiry. Only then
prepare fresh source coverage and obtain a fresh full-plan decision. Generation
does not mutate the old wave, settle unknown effects or supersede it. The real
successor policy/lease/next-call paths remain fenced until actual predecessor
settlement and exact USER-authorized supersession. Do not rerun prior tools to
manufacture a clean successor. `inspect --proposal-id ...` is read-only; retries
return the exact retained proposal without renewing its lifetime.

## Consumption And Limits

Proposal replay recomputes structural synthesis from actual retained source and
parent history. New adoption and live order/context/policy/lease/next-call
consumers require the exact finalized generated plan and revision link. Stripped
or substituted bindings fail. Legacy manual plans without planning records keep
their existing gates; this does not turn them into automatically generated plans.
New initial generation cannot be injected into an already committed/open wave.
The proposal/request and copied or reordered versions remain control metadata,
never task deliverables. Both issuance/channel source commitments include this
runtime. Historical producer evidence is not rewritten to match new source.

`generate`, `inspect` and `prepare-revision` return non-authorizing
`BoundedPlanningOperation` envelopes. A reproduced initial candidate admitted
its raw untyped CLI envelope as a data-only wave's work even though the enclosed
proposal was control metadata. Earlier positive structural/browser/schema checks
did not cover that case. The report consumer now rejects semantic/planning control
records at any JSON object/array depth, including old untyped operation envelopes
and generated plans. MIME changes and key order do not alter the boundary.
Reference-only independently authored work remains eligible for its actual gates.
This is a structured packet guard, not semantic detection of arbitrary encodings,
proof of native task execution or a non-bypassable host boundary.

Run `node run-bounded-planning-fixtures.js`,
`node run-bounded-planning-metadata-fixtures.js`, the compiler/adoption/revision,
metadata/issuance/channel, authenticated consent/browser suites and validator.
Synthetic decisions exercise actual consumers, not real USER approval. They are
not semantic calibration. Remaining work includes model-authored strategic
generation through a purpose-bound authenticated collector, calibrated omission
consumers, independently labeled applicability, actual resource/readiness truth,
hierarchical method-plan adaptation, broader scope-change review and protected
deployment. Do not claim these from successful structural synthesis.
