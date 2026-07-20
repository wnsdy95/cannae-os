# Risk Acceptance Authority

## 0. Purpose

Risk acceptance is different from execution approval. Even when an action is permitted, who may accept the residual risk that action produces is a separate question of authority.

Military-style risk management identifies, assesses, controls, and supervises risk. Risk is not something a subordinate may unilaterally judge to be "fine." Acceptance authority varies according to the level of risk.

This document links risk acceptance authority in the LLM runtime to role, severity, reversibility, scope, and readiness.

## 1. Risk acceptance principles

| Principle | Meaning | LLM application |
| --- | --- | --- |
| Right level | The appropriately positioned commander accepts the risk | Red/high risk is commander retained |
| Informed | Decisions are made with full knowledge of the risk and its controls | The decision packet includes risk/mitigation/evidence |
| Residual risk | Consider the risk that remains even after controls are applied | Data/cost/reputational risk remaining after rollback |
| Time-bound | Reassess when the situation changes | Approval expiry and FRAGO |
| Supervised | Supervision and AAR follow execution | Evidence, SITREP, readiness update |

## 2. Risk level

| Level | Example | Default acceptance authority |
| --- | --- | --- |
| Low | Local document drafting, read-only verification | role owner or CoS |
| Medium | Changes across multiple files, significant refactor, external source interpretation | CoS or Commander by policy |
| High | production target, external mutation, cost, private data handling | Commander |
| Critical | irreversible impact, legal/security exposure, credential leak | Commander plus explicit reject/FRAGO path |

A Black action is not a candidate for risk acceptance — it is prohibited outright.

## 3. Authority matrix

| Role | Low | Medium | High | Critical |
| --- | --- | --- | --- | --- |
| EXECUTOR | report only | no | no | no |
| S2/S3/S4/S6 | accept within Green local scope | recommend only | no | no |
| CoS | accept coordination risk | accept limited Amber if policy allows | recommend only | no |
| Commander | accept | accept | accept | accept or reject |
| Red Team | no acceptance authority | no | no | no |
| Evaluator | no acceptance authority | no | no | no |

Red Team and Evaluator identify and assess risk, but they do not accept it.

## 4. Risk acceptance packet

```text
RISK ACCEPTANCE PACKET:
- mission_id:
- decision_packet_id:
- risk_level:
- action/tool/target:
- hazard:
- consequence:
- likelihood:
- mitigation:
- residual_risk:
- accepting_authority:
- duration:
- evidence_required:
- supervision_plan:
- AAR_trigger:
```

## 5. Readiness and risk acceptance

When readiness is low, the same action is viewed as carrying higher risk.

| Readiness | Risk adjustment |
| --- | --- |
| T | no increase |
| P | +1 review level for Amber/Red |
| U | cannot execute; draft/report only |
| X | prohibit until trained |

Examples:

- S3 is at readiness T and executes a local validator: Low.
- S3 is at readiness U and executes a local validator: Medium or approval required.
- S3 is at readiness T and requests a production deploy: High/Red.
- EXECUTOR requests a secret dump: Black, not acceptable.

## 6. Reversibility

Risk acceptance authority is also tied to reversibility.

| Reversibility | Meaning | Handling |
| --- | --- | --- |
| Reversible | Easily restored to the original state | lower approval threshold |
| Recoverable | Recoverable, but at a cost of time/resources | rollback required |
| Compensable | Cannot be fully restored, but can be compensated | commander risk acceptance |
| Irreversible | Cannot be recovered | critical or Black |

## 7. Commander retained authority

The following are commander retained authority.

- production/external mutation.
- credential or restricted data release.
- irreversible destructive action.
- legal/financial/medical/security high-stakes decision.
- mission scope change.
- accepting high/critical residual risk.
- overriding Red Team critical finding.

## 8. Risk acceptance and AAR

Risk acceptance is always assessed after execution.

AAR questions:

- Did the anticipated risk match what actually occurred?
- Did the mitigation work?
- Was the residual risk greater than expected?
- Was the approval scope sufficiently narrow?
- Should readiness be raised or lowered?
- Should the SOP/authority matrix be revised?

## 9. Runtime gate

Execution gate:

```text
if action is Black:
  prohibit
if residual_risk is High or Critical:
  require Commander risk acceptance
if readiness below minimum:
  escalate or prohibit
if rollback missing for recoverable/irreversible action:
  reject or revise
if accepted:
  record risk acceptance event and evidence requirement
```

Implemented artifacts:

- `schema-files/risk-acceptance.schema.json`
- `sample-payloads/valid-risk-acceptance.json`
- `sample-payloads/invalid-risk-acceptance-high-by-s3.json`
- `policy-engine-authority-integration.js`
- `run-authority-integration-fixtures.js`

Implemented semantic checks:

- high/critical or irreversible residual risk requires `COMMANDER`.
- accepted risk requires expiry.
- accepted risk requires controls.
- accepted risk requires supervision and evidence.
- Red/high-risk request remains blocked unless scoped approval and risk acceptance are both valid.

## 10. Source anchors

- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf
- Joint Staff Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf

## 11. Current-stage conclusion

If the LLM runtime does not explicitly specify risk acceptance authority, the model will misinterpret "can be done" as "is permitted to be done."

Therefore, risk acceptance must be linked to the authority matrix, approval scope, readiness gate, and AAR.
