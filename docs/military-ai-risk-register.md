# Military AI Risk Register

## 0. 목적

이 문서는 군대식 LLM 운용에서 반복적으로 관리해야 할 위험 목록과 통제책을 정의한다.

군대식 위험관리는 위험을 없애는 절차가 아니라, 위험을 식별하고 누가 수용할 수 있는지 명확히 하는 절차다. LLM 에이전트는 위험 수용자가 아니라 위험 보고자다.

## 1. Risk Register 필드

```yaml
risk:
  id:
  category:
  description:
  trigger:
  likelihood:
  impact:
  level:
  controls:
  owner:
  ccir:
  residual_risk:
  review_cycle:
```

## 2. 위험 등급

| Level | 의미 | 처리 |
| --- | --- | --- |
| Low | 가역적이고 영향 작음 | 에이전트 자율 |
| Medium | 제한된 영향, 검증 필요 | backbrief와 기록 |
| High | 외부 상태/데이터/비용 영향 | 사용자 승인 |
| Critical | 민감정보, 파괴, 허위, 법적 위험 | 중단 또는 금지 |

## 3. Core Risk Register

| ID | Category | Risk | Trigger | Level | Controls |
| --- | --- | --- | --- | --- | --- |
| R-001 | Intent | 사용자 의도 왜곡 | mission/intent 분리 없음 | High | OPORD, backbrief |
| R-002 | Hallucination | 출처 없는 주장 | 리서치 task에 evidence 없음 | High | evidence-first, source map |
| R-003 | Authority | 승인 없는 고위험 행동 | Red tool action | Critical | tool gateway, approval UI |
| R-004 | Security | 민감정보 출력 | EEFI 발견 | Critical | masking, no-output rule |
| R-005 | Data | 사용자 파일 손상 | overwrite/delete | High | backup, diff, approval |
| R-006 | External | 외부 API 상태 변경 | API write | High | approval, dry-run |
| R-007 | Cost | 예상치 못한 비용 | paid API, bulk call | Medium/High | budget check |
| R-008 | Coordination | 멀티에이전트 산출물 충돌 | CoS 부재 | Medium | task order, integrator |
| R-009 | Evidence | 출처와 해석 혼합 | claim/interpretation 구분 없음 | Medium | evidence schema |
| R-010 | Overcontrol | 모든 행동 승인 요구 | ROE 과도 | Medium | risk-based delegation |
| R-011 | Undercontrol | 도구 직접 실행 | gateway 우회 | Critical | no direct tool access |
| R-012 | Context | 장기 작업 문맥 손실 | state 저장 없음 | Medium | SITREP, runtime state |
| R-013 | Evaluation | 산출물만 보고 성공 처리 | MOP only | Medium | MOE requirement |
| R-014 | Red Team | 독립 검토 약화 | Red Team이 작성자 겸임 | Medium | role separation |
| R-015 | Korean Context | 한국 조직문화의 질문 회피 | backbrief 없음 | Medium | Korean backbrief template |
| R-016 | Legal/Policy | 고위험 도메인 단정 | 법률/의료/금융/보안 판단 | High | escalation, disclaimer |
| R-017 | Deployment | production 장애 | deploy action | High | preview, rollback |
| R-018 | Dependency | 패키지/환경 파손 | package install/update | Medium | lockfile review |
| R-019 | Audit | 실행 기록 없음 | tool log 누락 | High | audit store |
| R-020 | Learning | 같은 실패 반복 | AAR 미반영 | Medium | readiness ledger update |

## 4. CCIR 연결

즉시 보고해야 하는 위험:

- R-003 승인 없는 고위험 행동.
- R-004 민감정보 출력.
- R-011 gateway 우회.
- R-016 고위험 도메인 단정.
- R-017 production 장애.

보고 양식:

```text
Risk CCIR

Risk ID:
What happened:
Affected mission/task:
Immediate control:
Decision required:
Recommended action:
```

## 5. 위험 통제 유형

| Control | 설명 | 예 |
| --- | --- | --- |
| Prevent | 발생 전 차단 | validator, ROE |
| Detect | 발생 탐지 | source check, audit log |
| Contain | 확산 제한 | pause task, revoke tool |
| Recover | 복구 | rollback, restore |
| Learn | 재발 방지 | AAR, SOP update |

## 6. 위험 소유권

| Risk type | Identifier | Router | Acceptor |
| --- | --- | --- | --- |
| Low execution | Agent | CoS | AI Commander |
| Medium quality | S2/S3/Red Team | CoS | AI Commander |
| High external impact | Any agent | AI Commander | Human User |
| Critical prohibited | Tool Gateway | AI Commander | Not acceptable |

## 7. Review Cycle

| 주기 | 대상 |
| --- | --- |
| 매 task | tool-use, authority, evidence |
| 매 mission | risk register deltas |
| 매 AAR | recurring risk |
| 매 release | high/critical controls |
| 월간 | risk taxonomy update |

## 8. 관련 문서

- `decision-risk-assessment.md`
- `tool-use-roe.md`
- `approval-ui-patterns.md`
- `agent-runtime-playbook.md`
- `agent-readiness-ledger.md`
