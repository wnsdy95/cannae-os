# Backbrief and Rehearsal SOP

## 0. 목적

이 문서는 명령이 하달된 뒤 실행 전에 왜곡을 잡는 절차를 LLM runtime SOP로 정의한다.

군대식 하달은 "상급자가 자세히 말했기 때문에" 왜곡이 줄어드는 것이 아니다. 하급자가 이해한 임무를 다시 말하고, 실행 순서를 rehearsal로 검증하고, 문제가 있으면 명령을 수정하거나 commander decision을 받기 때문에 왜곡이 줄어든다.

## 1. 용어

| 용어 | 의미 | LLM 적용 |
| --- | --- | --- |
| Confirmation brief | 명령 수령 직후 이해 확인 | 에이전트가 받은 임무와 제약을 짧게 재진술 |
| Backbrief | 하급자가 실행계획을 상급자에게 보고 | agent가 planned actions, risks, stop conditions를 제출 |
| Rehearsal | 실행 전 순서와 전환점 예행 | tool call/dry run/sequence simulation |
| Decision point | 지휘관 결심이 필요한 지점 | approve, revise, reject, FRAGO 중 하나 |
| Stop condition | 즉시 멈추고 보고할 조건 | validator fail, Red action, source conflict 등 |

## 2. SOP 요약

```text
Receive OPORD / Task Order
-> Confirmation Brief
-> Backbrief
-> CoS Integration Check
-> Rehearsal / Dry Run
-> Commander or Policy Disposition
-> Execute / Revise / Request Approval / Abort
```

## 3. Backbrief 필수 필드

Backbrief는 다음을 반드시 포함한다.

| 필드 | 질문 |
| --- | --- |
| commander_intent | 상위 의도를 어떻게 이해했는가? |
| assigned_task | 내가 맡은 과업은 무엇인가? |
| purpose | 이 과업이 전체 임무에 왜 필요한가? |
| end_state | 완료 상태는 무엇인가? |
| constraints | 무엇을 하면 안 되는가? |
| planned_actions | 어떤 순서로 실행할 것인가? |
| risk_controls | 어떤 위험 통제를 적용할 것인가? |
| stop_conditions | 어떤 경우 즉시 멈출 것인가? |
| approval_required_actions | 어떤 행동은 승인 없이는 못 하는가? |
| prohibited_actions | 절대 하지 않을 행동은 무엇인가? |
| assumptions | 어떤 가정을 두고 있는가? |
| requested_clarifications | 무엇을 물어봐야 하는가? |
| confidence | 이해 수준은 low/medium/high 중 무엇인가? |

저장소 구현:

- `schema-files/backbrief.schema.json`
- `sample-payloads/valid-backbrief.json`
- `runtime-demo-payloads/backbrief.json`

## 4. Backbrief 판정 규칙

| 상태 | 판정 |
| --- | --- |
| planned_actions 없음 | 실행 금지 |
| stop_conditions 없음 | 실행 금지 |
| low confidence인데 질문 없음 | 보완 요구 |
| commander decision 필요하지만 질문 없음 | 보완 요구 |
| approval boundary 없음 | 경고, 고위험 작업이면 보완 요구 |
| prohibited action 재진술 없음 | 경고, OPSEC/Red action이면 보완 요구 |

## 5. Rehearsal 필수 필드

Rehearsal은 실행 순서를 검증한다.

| 필드 | 질문 |
| --- | --- |
| backbriefs | 어떤 backbrief를 근거로 하는가? |
| facilitator | 누가 통합 확인을 하는가? |
| rehearsal_type | confirmation/backbrief/dry_run/full_dress 중 무엇인가? |
| sequence | 실행 순서와 expected result는 무엇인가? |
| friction_points | 어디서 실패할 수 있는가? |
| decision_points | 어떤 지점에서 결심이 필요한가? |
| required_changes | 실행 전 고쳐야 할 것은 무엇인가? |
| disposition | execute/revise_order/request_approval/abort 중 무엇인가? |

저장소 구현:

- `schema-files/rehearsal.schema.json`
- `sample-payloads/valid-rehearsal.json`
- `runtime-demo-payloads/rehearsal.json`
- `rehearsal-to-ccir-router.js`
- `run-rehearsal-to-ccir-fixtures.js`

## 6. Rehearsal 판정 규칙

| 상태 | 판정 |
| --- | --- |
| referenced backbrief 없음 | 실행 금지 |
| sequence 없음 | 실행 금지 |
| required_changes가 남았는데 execute | 실행 금지 |
| high/critical friction인데 decision point 없음 | 실행 금지 |
| approval disposition인데 decision point 없음 | 보완 요구 |

## 7. Commander Disposition

Rehearsal 이후 commander 또는 policy engine은 네 가지 중 하나를 선택한다.

| Disposition | 의미 | 다음 조치 |
| --- | --- | --- |
| Execute | 실행 가능 | tool/readiness gate 통과 후 실행 |
| Revise Order | 명령 수정 필요 | OPORD 또는 task order 수정 |
| Request Approval | 승인 필요 | approval request 또는 decision packet 생성 |
| Abort | 실행 중지 | SITREP/AAR에 사유 기록 |

중요: `execute`는 "모든 것이 완벽하다"가 아니라 "남은 위험이 권한 범위 안에서 통제 가능하다"는 뜻이다.

## 8. 단일 에이전트용 짧은 Backbrief Prompt

```text
BACKBRIEF:
- I understand the commander's intent as:
- My assigned task is:
- Purpose:
- End state:
- Constraints:
- Planned actions:
- Risk controls:
- Stop conditions:
- Approval-required actions:
- Prohibited actions:
- Assumptions:
- Clarifications needed:
- Confidence:
```

## 9. 멀티에이전트용 Rehearsal Prompt

```text
REHEARSAL:
- Parent OPORD:
- Referenced backbriefs:
- Facilitator:
- Sequence:
  1. Actor / action / expected result / evidence
  2. Actor / action / expected result / evidence
- Friction points:
- Decision points:
- Required changes:
- Disposition: execute | revise_order | request_approval | abort
```

## 10. Runtime Gate

실행 전 다음 명령을 통과해야 한다.

```bash
node validator-cli-prototype/validate.js runtime-demo-payloads/backbrief.json backbrief
node validator-cli-prototype/validate.js runtime-demo-payloads/rehearsal.json rehearsal
node orders-dissemination-runner.js
node rehearsal-to-ccir-router.js runtime-demo-payloads/rehearsal.json
```

이 gate는 다음 연결을 확인한다.

- backbrief가 현재 OPORD를 참조하는가?
- backbrief가 같은 mission 안에 있는가?
- backbrief task가 OPORD에 실제 존재하는가?
- actor가 task assignee와 일치하는가?
- commander intent와 assigned task를 재진술하는가?
- stop condition과 approval boundary를 보존하는가?
- rehearsal이 backbrief를 참조하는가?
- execute disposition에 unresolved change가 남아 있지 않은가?
- friction point와 decision point가 CCIR alert 또는 decision packet으로 routed 되는가?

## 11. Anti-Patterns

피해야 할 패턴:

- "이해했습니다"만 말하고 planned actions를 내지 않음.
- stop condition 없이 바로 tool call.
- rehearsal이 실제 실행 순서가 아니라 요약문으로 끝남.
- high-risk friction을 적고도 decision point를 만들지 않음.
- required_changes가 남았는데 "실행 가능"으로 판정.
- approval needed를 "나중에 사용자에게 말하겠다"로 처리.

## 12. 출처 앵커

- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf

## 13. 관련 문서

- `orders-production-pipeline.md`
- `opord-annex-model.md`
- `prompt-templates.md`
- `agent-runtime-playbook.md`
- `approval-scope-policy.md`
- `risk-acceptance-authority.md`
