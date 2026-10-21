# Order Revision And Supersession

## Contract

For an opened adopted wave, capture the change request in a new wave and compile
its complete draft through [request intake](request-order-intake.md). A revision
connects that draft and full proposed plan to exact prior plan/adoption references.
The `OrderRevisionProposal` retains original request provenance, a deterministic
field comparison, the observed manifest and finite validity. Arrays are compared
as complete values; this does not prove semantic completeness.
The full comparison keeps the parent's handling label. This initial adapter
requires the new draft to use that same label; classification changes require
the existing handling/releasability workflow rather than an implicit downgrade.
Legacy `frago` and `frago-scope-change` payloads remain readable descriptive
contracts with `can_execute: false`; they cannot substitute for linked review
and actual dispatch admission.

Use `scripts/revise_controls_order.js` from either provider skill:

```bash
node codex-skills/controls-doctrine-operator/scripts/revise_controls_order.js \
  propose --repository <repo> --input <revision-request.json>
node codex-skills/controls-doctrine-operator/scripts/revise_controls_order.js \
  inspect --repository <repo> --proposal-id <proposal-id>
```

Both commands require an explicit repository. They use its artifact namespace and
the live clock; `--artifact-root` may select the existing proof store. Duplicate
options, clock overrides and a different request in an already proposed wave fail.
Exact retries retain the original lifetime.

The [request sample](../sample-payloads/valid-order-revision-request.json) and
[proposal sample](../sample-payloads/valid-order-revision-proposal.json) are
synthetic contract examples. Replace their references with actual store entries.
The retained proposal compares the full proposed template. Review the returned
`successor_plan` and `effective_changes` too: these include the derived revision
reference and shorter validity. The later adoption hash binds that full final plan.

## Procedure

1. Prepare `OrderRevisionRequest` with exact prior `parent_plan_ref` and
   `parent_adoption_ref`, the new `change_request_ref` and full `successor_plan`.
   The parent must be an opened, adopted plan in the same repository and mission,
   in a different wave, without a terminal record or closeout. A revision parent
   must already have completed its own predecessor handoff.
2. Run `propose`. Inspect every retained, changed, added and removed field,
   including constraints, authority, tasks, models and dispatch policies. The
   returned `successor_plan` adds the exact `order_binding.revision_ref` and caps
   validity to the review window. Use this returned plan unchanged for adoption.
   The proposal does not grant execution, continuation or release authority.
3. Perform the existing [complete-plan adoption](order-adoption-and-plan-binding.md)
   ceremony: every agent backbriefs, the full team rehearses, and the actual USER
   reviews the complete linked scope. Store their exact decision and run `decide`.
   A reference or prose claim alone is insufficient. Fixtures use synthetic data.
4. Open the successor's routing and context packs. Preparation can be ready while
   tool dispatch is held. Once the revision is adopted, further predecessor tool
   calls, policy authorization and resume are held too. Already-admitted results,
   containment, reconciliation and revocation remain available.
   Inspect the result checkpoint separately from lease state: a succeeded tool
   can leave its lease `active` while further execution is unauthorized. Settle
   and explicitly revoke that lease before handoff.
5. Settle prior callbacks and unknown tool/gateway effects, preserving original
   failures, and perform required post-settlement revocation. Obtain the existing
   exact USER supersession decision over both plan digests; terminate the prior
   wave with `status: superseded` and the prepared successor plan reference.
6. Reinspect the revision. Its prerequisite result is only eligibility for the
   ordinary policy/lease/admission gates. Those gates recheck exact termination
   history and settlement, current adoption, stop/supervisor, routing, models and
   repository state before permitting the first new tool call.

The successor cannot authorize a policy, issue/resume a lease or admit a covered
tool before this exact handoff. Supersession replays the existing termination
verifier and rejects a successor that exercised tool authority before the parent
terminated. Failed, expired or fabricated history cannot become success by
changing a flag. Metadata is excluded from report work evidence.

## Retry And Expiry

At most one current adopted successor may select a given parent. A competing
candidate can be prepared for review but cannot win adoption concurrently. A
later conflicting USER decision still holds the selected scope. Its presence
does not silently restore the old agent's authority.

Each revision wave has one immutable proposal. Before handoff, if cleanup outlives
review validity, use a fresh wave, complete draft and USER review. Existing
admitted results can still settle. Expiry permits a fresh reviewed candidate,
not restoration of predecessor tool authority: historical adoption keeps that
predecessor fenced. After handoff, a later change must name the
selected successor as its parent, retaining the earlier lineage. Never refresh
timestamps or reuse the prior decision to extend authority.

## Scope And Verification

This first path covers explicitly linked revisions within one repository and
mission and handling level. A parent already terminated as expired/aborted or successfully closed
requires a different lifecycle disposition; it is not rewritten as superseded.
Campaign restart still uses its separate successor contract. Local USER logs do
not authenticate humans; semantic equivalence of renamed missions, trusted clocks,
automatic planning and externally protected deployment remain separate work.

Run `node run-order-revision-fixtures.js`, validator and routing fixtures, then
the repository aggregate. Test actual old/new leases and callbacks, unresolved
effects, expiry during cleanup, competing adoption, changed references/plans,
historical replay, publication races and both wrappers outside the checkout.
This is engineering integration of existing adoption/lifecycle contracts and
[orders production](orders-production-pipeline.md), without new external doctrine
claims. The broader request compiler and disciplined-initiative roadmap remain
partial.
