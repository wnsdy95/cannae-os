# Intent Continuity Runtime

Every newly opened wave emits context v0.4 with one plan-digest-bound intent
assignment per agent. A plan without `intent_continuity` receives a deterministic
USER-rooted flat tree; an explicit tree may delegate through multiple rostered
agents. This is a mandatory context and covered-tool admission check, not an
optional standalone lint. An intent projection never grants execution or release.

## Invariants

- Root purpose, end state, failures, constraints and authority derive from the
  exact complete plan. A captured order still preserves its separate original
  commander's-intent/backbrief binding through order adoption.
- Every plan task has one owner and a digest commitment. Every echelon carries
  the complete commitments, while each receiving context identifies its own task.
  Other agents' task text is not copied into that context merely for continuity.
- Each rostered agent has one intent and one delegation, reaching the single
  USER root without missing parents, cycles, substituted identities or aliases.
- Each child preserves purpose and all task commitments. End state, failure and
  constraint requirements cannot be removed. An authored hierarchy must agree
  with each agent's exact allowed, approval-required and prohibited action lists.
- Boundaries use explicit Green/Amber/Red/Black action identifiers. Absent actions
  are prohibited. A child cannot lower a parent's grade or unlock its Black action.
  Covered local tool policy requires Green at every node and delegation; approval
  is never inferred from an intent record or opportunity.

The root is the union of individually declared plan scopes at their least
restrictive declared grade; each branch then narrows it. It is not a new grant:
the existing USER adoption, role, policy-digest, session, tool-class, stop, budget,
model, repository-state and release gates remain independent requirements.
Contradictory allowed/approval/prohibited declarations fail rather than silently
choosing the convenient permission.

## Operation

Use the normal full-plan adoption and `operate_controls_mission.js open` flow.
For nested delegation, prepare a deterministic default tree, change the child
parent and corresponding exact delegation, and keep each parent capable of
delegating its child's actions. Review the complete resulting plan before adoption.
Never amend a retained tree, task or context under an old adoption decision.
The [nested-plan sample](../sample-payloads/valid-mission-wave-plan-intent.json)
and [context sample](../sample-payloads/valid-agent-context-pack-intent.json) show
the complete non-authorizing wire format; their fixture references are not consent.

For diagnosis, both skills include:

```bash
node codex-skills/controls-doctrine-operator/scripts/check_controls_intent.js \
  <mission-wave-plan.json> [agent-context-pack.json]
```

The standalone projection checks structure and binding, not USER authentication,
manifest provenance or current tool authority. The lifecycle validates every agent;
policy compilation, issuance and covered-call admission reload the exact retained
plan/context before continuing. Report admission checks the same assignment, so
a dropped task or substituted context cannot become a completed result.

## Historical Contexts And Settlement

Context v0.2/v0.3 remains schema-readable and usable for historical appraisal.
It cannot receive new covered-tool authority: admission returns
`INTENT_CONTEXT_UPGRADE_REQUIRED`. Prepare a newly reviewed wave, preserve old
contexts unchanged, settle admitted old callbacks/effects and explicitly revoke
where required. Do not regenerate a context in place or backdate its version.
Result settlement, failure preservation and reconciliation are not new execution
authority and must remain possible after an upgrade hold.

## Remaining Scope

These are mechanical commitments over the plan's declared scope, not proof that
the plan interpreted the original request correctly or that two purpose strings
mean the same thing. Explicit approval-bearing delegation adapters, role-default
semantic reconciliation, method deviation/report-before/report-after, continuous
drift response, semantic omission checks and automatic planning/replanning remain
separate required work. Local USER records do not authenticate a human. Project
hooks still do not form a non-bypassable production boundary.

Run `node run-intent-continuity-fixtures.js`, the validator, both routing/skill
checks and the full aggregate. Include nested scopes, missing or changed tasks,
cycles, role/action substitution, widened authority, legacy upgrade holds,
actual policy/lease/tool admission, report binding and late-result settlement.
