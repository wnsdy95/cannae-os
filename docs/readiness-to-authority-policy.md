# Readiness-to-Authority Policy

## 0. Purpose

An agent with low readiness does not gain automatic execution authority. It holds only draft and report authority until evidence says otherwise. This is the training-to-authority linkage: the readiness rating earned under `training-progression-model.md` sets a ceiling on the authority any other mechanism may delegate to the agent.

`agent-metl.md` section 3 states the readiness-by-ROE table; `agent-readiness-ledger.md` defines the ledger; the readiness gate prototype already enforces a per-rule readiness minimum. This document is the policy layer that binds them: it defines the readiness bands, the authority ceiling each band maps to, the rule that readiness is necessary but never sufficient, what readiness can never unlock, and what happens to delegated authority when readiness drops.

## 1. Doctrinal Basis

- `Claim`: ADP 7-0 ties a unit's employability to demonstrated training proficiency on its mission essential tasks; readiness reporting exists so that commanders assign missions the unit can actually perform.
- `Claim`: FM 7-0 requires proficiency to be evaluated against task standards before a unit is certified for less supervised, more complex conditions.
- `Claim`: The Joint Staff Authorities Focus Paper holds that authority is explicitly delegated, bounded in scope, and never assumed from capability or position alone.
- `Claim`: ATP 5-19 places risk decision authority at the appropriate level; a subordinate's willingness to act does not confer the authority to accept the risk of the action.
- `Interpretation`: Capability, readiness, and authority are three different things for an LLM agent. The model being capable does not make the agent ready; the agent being ready does not make it authorized. Readiness qualifies an agent to receive delegation; delegation still has to happen through the authority matrix and approval mechanisms.
- `Application`: Readiness maps to an authority ceiling only. Every actual grant is computed as the most restrictive of readiness ceiling, authority matrix rule, approval scope, mission scope, and risk acceptance.
- `Research Gap`: Doctrine assumes readiness assessments are periodic and human-judged. How often an agent's readiness must be re-confirmed to keep its ceiling trustworthy under model drift has no doctrinal answer; the revocation triggers in section 5 approximate it.

## 2. Readiness Bands and Authority Ceilings

Ratings are per task, so a ceiling is per role/task pair, never per agent.

| Band | Rating | Authority ceiling | Meaning of the ceiling |
| --- | --- | --- | --- |
| Untrained | X, U | Draft-only | May produce drafts, reports, and recommendations. No tool execution with effects beyond its own workspace. X additionally excludes the task from assignment except as training |
| Practiced | P | Supervised execution | May execute Green actions and, where the authority matrix allows, Amber actions — only with a prior backbrief and a supervising role, and with verification attached |
| Qualified | T | Scoped autonomous execution | May execute Green actions autonomously and Amber actions per the authority matrix (report or approval as the rule states), within mission scope and ROE |

Ceiling rules:

- No band's ceiling includes Red execution. At every band, a Red action is at most an approval request, decided under `risk-acceptance-authority.md` and `approval-scope-policy.md`.
- No band's ceiling includes Black. Black is prohibited outright at every readiness level; readiness is not a variable in that decision.
- The ceiling is a maximum, not a grant. Holding rating T confers nothing by itself; it makes the agent eligible for the delegations the authority matrix defines for that band.

## 3. Readiness Is Necessary, Never Sufficient

Effective authority for a requested action is the most restrictive of:

1. The readiness ceiling for the role/task pair (this policy, read from the ledger projection).
2. The matching authority matrix rule, including its `readiness_min` (the readiness gate already forces `approval_required` when the actual rating is below the rule minimum, and `prohibit` for Black).
3. Any approval scope covering the action, with its target, expiry, and consumption state per `approval-scope-policy.md`.
4. The mission scope of the current order — rating T confers no authority outside it.
5. Risk acceptance at the right level per `risk-acceptance-authority.md`, which also treats low readiness as raising the effective risk of the same action.

Consequences:

- Readiness never substitutes for approval. A qualified agent still requests approval for everything the matrix marks approval-required.
- Approval never substitutes for readiness. An approval scope naming an agent whose rating is below the band the action requires must be refused at consumption time and flagged to the issuing authority; approving an untrained agent into execution is an issuing error, not a promotion.
- Delegation never substitutes for either. Under `approval-scope-policy.md`, delegated approval authority moves the decider; it does not raise the executing agent's ceiling.

## 4. Interaction with the Authority Matrix and Approval Scopes

- The authority matrix expresses this policy per rule through `readiness_min`. Rule minimums must be consistent with section 2: any rule whose decision is `allow` must require at least P for supervised-style actions and T for autonomous ones; a rule that would allow execution at U is a policy defect.
- Preflight for a mission wave checks the ledger projection for every role/task pair the wave plan assigns. A pair below the band its assigned actions require is a preflight block, not a runtime surprise.
- Approval scope issuance records the executing agent's rating at issuance time. If the rating at consumption time is lower than at issuance, the consumption is refused and routed back to the issuing authority (section 5).
- Supervised execution at band P is itself an authority relationship: the supervising role must hold at least band P on the same task and must be named before execution, in the backbrief.

## 5. Revocation on Readiness Drop

A readiness drop is effective immediately upon the `ReadinessUpdated` event; authority consequences follow from it, not from a separate decision.

| Situation at the time of the drop | Consequence |
| --- | --- |
| Active approval scopes naming the demoted role/task pair | Revoked via approval revocation events citing the readiness event; not consumable from the moment of the drop |
| In-flight task running at the old ceiling | Paused at the next stop condition; resumes only at the new ceiling (typically under supervision) or is reassigned |
| Standing delegations that presumed the old band | Reviewed by the delegating authority; revoked where the band was a stated premise |
| Queued assignments in the current wave plan | Re-gated at preflight standards before dispatch |
| Drop to X (unreported Red action, concealment, exposure) | All of the above, plus the task is unassignable except as training, and the drop is reported as an FFIR |

Restoration is never automatic and never by lapse of time: the agent re-earns the band through the evidence requirements of `training-progression-model.md`, and prior scopes are not resurrected — new ones are issued if still needed.

## 6. What Readiness Never Unlocks

- Red execution without a scoped approval and risk acceptance at the right level.
- Black actions, at any rating, under any approval.
- Commander retained authority items listed in `risk-acceptance-authority.md` section 7.
- Authority outside the current mission scope.
- Risk acceptance itself: readiness qualifies an agent to execute, never to accept the residual risk of its own actions.

## 7. Runtime Gate

```text
on action request:
  if roe_class is Black:
    prohibit
  ceiling = band(ledger_rating(role, task))
  if ceiling is draft_only and action has external effect:
    return draft_or_report_only
  if ceiling is supervised and no supervisor is bound:
    block until backbrief names a supervisor
  apply authority matrix rule (including readiness_min)
  apply approval scope state (issuance rating vs current rating)
  apply mission scope and risk acceptance
  effective_authority = most restrictive of all of the above
  record the decision and the ledger rating it was computed from
```

## 8. Prompt Guard

```text
Before executing, compute authority, not confidence.
- What is my ledger rating for this task, and which band is that?
- Does the band's ceiling even permit this class of action?
- Which matrix rule, approval scope, and mission scope apply, and which is most restrictive?
- If my rating changed since the approval was issued, stop and report.
```

## 9. Source Anchors

- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716
- FM 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335
- Joint Staff Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf

## 10. Implementation Candidates

The [implementation registry](implementation-candidate-registry.md) tracks these requirements, equivalent paths, checks, and remaining work. A proposed filename is not proof of completion.

schema:

- `readiness-band-policy.schema.json`
- `readiness-revocation-event.schema.json`

prototype:

- `readiness-authority-ceiling-runner.js`
- `run-readiness-ceiling-fixtures.js`
- `readiness-drop-revocation-runner.js`
