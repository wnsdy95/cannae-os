# Requirement Inventory And Human Coverage Admission

## Boundary

This candidate adds a mandatory **human inventory and coverage review class** to
new captured-request adoption. It is not calibrated model admission, automatic
extraction, automatic planning or proof of semantic completeness. All eight
program outcomes remain open. An advisory model `complete` verdict cannot stand
in for this review, and the existing Codex collector does not acquire approval
authority. Continue using the [separate transfer ceremony](model-transfer-consent.md)
for any actual request transmission through the existing CLI login.

The motivating counterexample omitted a global prohibition from a compiled
order while retaining its unused analysis quote. Structural plan adoption could
still succeed. A model could also return `complete` after enumerating only a
subset of source requirements. Passing schema, signature and process tests
does not resolve either semantic judgement problem.

## Prepare The Actual Source Inventory

```bash
node codex-skills/controls-doctrine-operator/scripts/review_controls_requirements.js \
  template --repository <target-repository> --artifact-root <artifact-root> \
  --request-id <retained-MissionRequest-id>
```

Both skill trees provide this wrapper. The target is explicit and clock overrides,
model execution and approval operations are absent. The template preserves every
UTF-8 source byte in contiguous fragments, initially `unknown`, with no extracted
requirements. Sentence segmentation is only a drafting aid, not an atomicity or
completeness evaluator. Do not label context automatically merely to clear a gate.

Review every fragment as `operative`, `context` or `unknown`, with a rationale.
An operative fragment must map bidirectionally to one or more explicit atomic
requirements. Multiple obligations in one sentence can require multiple rows.
Keep negation, conditions, approvals, units and bounds. Global restrictions apply
to every receiver; task-specific requirements identify exact assigned task IDs.
An unknown fragment or empty requirement inventory cannot become ready.

Retain the exact `{request_ref, fragments, requirements}` input with
`retain-inventory --repository ... --artifact-root ... --input <inventory.json>`.
The controller derives scope, classification, source digest and expiry from the
verified retained request; these are not caller-set authority fields.

## Review Every Actual Target

Prepare `{inventory_ref, coverage}`. Supply exactly one row per requirement and
target: `order`, followed by each actual assigned task ID. Task targets contain
`task_order` and the corresponding `agent` from the complete proposed plan.
Unused analysis statements are never targets.

Each row identifies `requirement_id`, `target_id`, `disposition`, `pointer`,
`quote` and `rationale`. `preserved` and `contradicted` require an actual string
JSON pointer and exact nonempty substring. Other dispositions require empty
pointer and quote. `not_applicable` is forbidden for the order and global
requirements. Unknown targets, partial matrices, duplicates and invented quotes
are rejected. Retained `omitted`, `contradicted` or `uncertain` rows keep
`needs_revision`; they cannot enter adoption.

```bash
node codex-skills/controls-doctrine-operator/scripts/review_controls_requirements.js \
  retain-coverage --repository <target-repository> --artifact-root <artifact-root> \
  --input <coverage.json> --plan <complete-MissionWavePlan-v0.2.json>
```

The resulting non-authorizing proposal binds the exact request, inventory,
compiled draft, **whole plan digest**, classification, publication history and
finite lifetime. A changed agent, model, policy, budget, title or other plan field
needs a new coverage proposal and fresh plan adoption. Do not edit a plan after
review and reuse the reference, including after a revision adds its retained
reference or shortens the plan's validity. Coverage cannot predate the plan's
declared creation. A genuine paraphrase may be preserved: exact
quoting establishes the location under review, not equivalence of its meaning.

## Actual Consumers And Historical Compatibility

For [structurally generated plans](bounded-plan-synthesis.md), retain the returned
planning reference and finalize linked revisions before preparing coverage.
Generation never supplies a semantic review or USER decision. The owner preview
also contains the exact planning envelope/proposal; display and signature checks
do not attest the declared workforce, estimates or semantic correctness.

New `OrderAdoptionProposalRequest` v0.2 requires `semantic_review_ref`.
The proposal, decision request and adoption record preserve that version.
The existing [owner approval ceremony](operator-consent-and-adoption.md) presents
the full inventory and coverage in its exact preview and binds their reference
transitively through the signed proposal/decision subject. It still requires
fresh password, stored session and one-use nonce checks. Review source fragments,
requirement instructions, applicability and actual target quotes before adopting.
No signature can prove that a human made the right semantic judgement.

The owner's decision preview now compares requirements and exact source quotes
with each actual order/task/agent target, JSON pointer, proposed disposition and
rationale. The Source view includes operative, context and unknown fragments
with byte positions and authored classification, not just extracted requirements.
The Plan view preserves the full compiled order and complete proposed plan;
the expandable Exact Approval Subject also retains backbriefs, rehearsal and
every other original preview field. No view describes this as proven completeness.

Receiver/disposition filters and 25-row pagination affect presentation only.
Visible counts always retain the unfiltered denominator; global restrictions
and not-applicable rows remain available. No filter changes the prepared subject,
nonce, expiry or commit request. A malformed/incomplete new-version display
cannot become an actionable preview; genuine legacy review uses the raw subject.
Closing, selection/view changes and session replacement erase matrix, source,
plan, filters and hidden raw content. Delayed owner responses cannot restore them
in a viewer session. These browser checks do not replace server authentication,
signature/binding validation or actual semantic judgement.

The actual proposal, approval, context opening, policy/lease issuance and covered
next-call paths require the exact ready review. Publication rechecks it. Receiver
contexts carry only applicable requirement instructions/IDs, exact inventory and
review references, review class and plan digest; they do not copy every raw
source fragment. Contradictory or stripped receiver assignments are rejected.

Immutable replay work is shared only within one synchronous operation and exact
retained history/reference/plan/draft. Freshness is checked for each use, returned
values cannot mutate cached proof, and publication starts a fresh appraisal.
This avoids repeated history traversal exhausting the existing short repository
lease; it does not lengthen that lease or cache authority across operations.

Version 0.1 proposals/decisions/adoptions remain readable and replay at their
original retained prefix/time. They cannot be newly proposed, approved or used
to open a captured-request wave or admit its next tool call. Existing admitted
results retain their settlement path; the gate does not rerun or erase them.
An exact retry of an already recorded disposition is historical inspection, not
renewed authority. Previously supported no-intake legacy waves remain a separate
reference path, not semantic-coverage assurance.

The trusted-local CLI still consumes a retained `DecisionLogEntry` naming USER;
that is not browser authentication or a protected trust root. The real console
provides its separate authentication. Local artifact stores, keys and processes
are not a non-bypassable deployed gateway. Inventory, coverage and assignments
remain control metadata, including copied/reordered/renamed JSON, never work.

## Verification And Remaining Work

Run `node run-requirement-inventory-fixtures.js`,
`node run-operator-coverage-ui-fixtures.js`, adoption/consent/dispatch
regressions, metadata-boundary fixtures and the validator. The fixtures use
authored synthetic requirements and zero actual model calls. They are not an
independent held-out calibration dataset or a claim about model quality.

The real `operator-consent-fixtures/browser-check.js --output <directory>`
checks synthetic authenticated desktop adoption/mobile rejection, actual
source/receiver/plan projection, filter-invariant one-use consent, display-only
pagination/inert markup, malformed response denial and delayed owner preview
delivery after viewer login. Synthetic browser decisions are never real USER
consent. The presentation projection does not independently verify signatures or
cryptographic bindings; the existing server/controller remains authoritative.

Remaining work includes independently sealed requirement/applicability labels,
denominator-separated held-out evaluator calibration, extraction beyond a human
inventory, bounded automatic plan/replan generation, actual owner review of
those proposals, broad legacy migration and protected deployment. A human can
misclassify a prohibition as context or accept an unrelated quoted paraphrase;
the mechanical gate alone cannot discover that error. `semantic_completeness_proven`
and `model_calibrated_for_admission` therefore remain false even when ready.
