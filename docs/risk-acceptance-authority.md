# Risk Acceptance Authority

## 0. 목적

위험 수용은 실행 승인과 다르다. 어떤 action을 허용하더라도, 그 action이 가져올 잔여위험을 누가 받아들일 수 있는지는 별도의 권한 문제다.

군대식 risk management는 위험을 식별, 평가, 통제, 감독한다. 위험은 하급자가 임의로 "괜찮다"고 결정하지 않는다. 위험 수준에 따라 수용권한이 달라진다.

이 문서는 LLM runtime에서 risk acceptance authority를 role, severity, reversibility, scope, readiness와 연결한다.

## 1. 위험 수용 원칙

| 원칙 | 의미 | LLM 적용 |
| --- | --- | --- |
| Right level | 적절한 수준의 지휘관이 위험을 수용 | Red/high risk는 commander retained |
| Informed | 위험과 통제책을 알고 결정 | decision packet에 risk/mitigation/evidence 포함 |
| Residual risk | 통제 후에도 남는 위험을 본다 | rollback 후 남는 데이터/비용/평판 위험 |
| Time-bound | 상황이 바뀌면 다시 평가 | approval expiry and FRAGO |
| Supervised | 실행 후 감독과 AAR | evidence, SITREP, readiness update |

## 2. Risk level

| Level | 예시 | 기본 수용권한 |
| --- | --- | --- |
| Low | 로컬 문서 초안, 읽기 전용 확인 | role owner or CoS |
| Medium | 여러 파일 변경, significant refactor, external source interpretation | CoS or Commander by policy |
| High | production target, external mutation, cost, private data handling | Commander |
| Critical | irreversible impact, legal/security exposure, credential leak | Commander plus explicit reject/FRAGO path |

Black action은 위험 수용 대상이 아니라 금지 대상이다.

## 3. Authority matrix

| Role | Low | Medium | High | Critical |
| --- | --- | --- | --- | --- |
| EXECUTOR | report only | no | no | no |
| S2/S3/S4/S6 | accept within Green local scope | recommend only | no | no |
| CoS | accept coordination risk | accept limited Amber if policy allows | recommend only | no |
| Commander | accept | accept | accept | accept or reject |
| Red Team | no acceptance authority | no | no | no |
| Evaluator | no acceptance authority | no | no | no |

Red Team과 Evaluator는 위험을 발견하고 평가하지만 수용하지 않는다.

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

## 5. Readiness와 위험 수용

readiness가 낮으면 같은 action도 더 높은 위험으로 본다.

| Readiness | Risk adjustment |
| --- | --- |
| T | no increase |
| P | +1 review level for Amber/Red |
| U | cannot execute; draft/report only |
| X | prohibit until trained |

예:

- S3가 T이고 local validator를 실행: Low.
- S3가 U이고 local validator를 실행: Medium or approval required.
- S3가 T이고 production deploy 요청: High/Red.
- EXECUTOR가 secret dump 요청: Black, not acceptable.

## 6. Reversibility

위험 수용권한은 reversibility와도 연결된다.

| Reversibility | 의미 | 처리 |
| --- | --- | --- |
| Reversible | 쉽게 원복 가능 | lower approval threshold |
| Recoverable | 비용/시간 들지만 복구 가능 | rollback required |
| Compensable | 완전복구 불가, 보상 가능 | commander risk acceptance |
| Irreversible | 복구 불가 | critical or Black |

## 7. Commander retained authority

아래는 commander retained authority다.

- production/external mutation.
- credential or restricted data release.
- irreversible destructive action.
- legal/financial/medical/security high-stakes decision.
- mission scope change.
- accepting high/critical residual risk.
- overriding Red Team critical finding.

## 8. Risk acceptance and AAR

위험 수용은 실행 후 반드시 평가된다.

AAR 질문:

- 예상한 위험이 맞았는가?
- mitigation이 작동했는가?
- residual risk가 더 컸는가?
- approval scope가 충분히 좁았는가?
- readiness를 올리거나 낮춰야 하는가?
- SOP/authority matrix를 수정해야 하는가?

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

## 10. 출처 앵커

- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf
- Joint Staff Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf

## 11. 현 단계 결론

LLM runtime에서 위험 수용권한을 명시하지 않으면 모델은 "할 수 있음"을 "해도 됨"으로 오해한다.

따라서 위험 수용은 authority matrix, approval scope, readiness gate, AAR와 연결되어야 한다.
