# Orders Production Pipeline

## 0. 목적

이 문서는 군대의 명령 생산 절차를 LLM 단일 에이전트와 멀티에이전트 runtime의 prompt/order pipeline으로 변환한다.

핵심 관점은 단순하다.

- 사용자 요청은 곧바로 실행 프롬프트가 아니다.
- 요청은 mission analysis를 거쳐 명령으로 바뀐다.
- 명령은 task order, backbrief, rehearsal, execution, SITREP, FRAGO, AAR로 이어진다.
- 각 단계는 왜곡을 줄이는 통제점을 가진다.

## 1. 군 개념

군은 큰 임무를 한 문장 지시로 처리하지 않는다. 계획, 준비, 실행, 평가를 순환시키고, 명령은 표준 양식으로 만든다. OPORD/WARNO/FRAGO는 시간이 지나며 명령을 보강하고 수정하는 문서 체계다.

이 체계의 강점은 "위에서 말한 것을 그대로 복사"하는 데 있지 않다. 상위 의도와 제약은 보존하되, 하위 단위가 자기 상황에 맞게 실행 가능한 명령으로 재작성하게 만드는 데 있다.

## 2. LLM 변환 원칙

| 군 명령 생산 원리 | LLM 적용 |
| --- | --- |
| Mission analysis before order | 사용자 요청을 mission, constraints, risks, CCIR로 먼저 분석 |
| WARNO before full order | 긴 작업은 준비 가능한 정보부터 사전 하달 |
| OPORD as execution contract | 실행 프롬프트는 OPORD형 계약으로 고정 |
| Annex for specialist detail | 출처, 도구, 보안, 검증, rollback은 annex로 분리 |
| Confirmation/backbrief | 에이전트가 이해한 임무를 실행 전 재진술 |
| Rehearsal | tool 실행 전 dry run으로 충돌과 누락 확인 |
| FRAGO | 변경은 새 대화가 아니라 변경명령으로 기록 |
| AAR | 실행 후 SOP/readiness/authority를 갱신 |

## 3. End-to-End Pipeline

```text
User Request
-> Mission Intake
-> Mission Analysis
-> WARNO when preparation can start early
-> COA / Option Development
-> Commander Decision or Auto-Green Decision
-> OPORD
-> Annex Pack
-> Task Orders
-> Backbrief
-> Rehearsal / Dry Run
-> Tool / Agent Execution
-> SITREP / CCIR Alert
-> FRAGO if scope, priority, authority, or plan changes
-> Evidence / Verification
-> AAR
-> SOP, readiness, source-map, and policy update
```

## 4. 단계별 산출물

| 단계 | 산출물 | 목적 | 실행 전 gate |
| --- | --- | --- | --- |
| Mission Intake | mission object | 사용자의 목적과 종료조건 고정 | intent 누락 금지 |
| Mission Analysis | assumptions, constraints, CCIR | 모호성 제거 | 질문/가정 분리 |
| WARNO | preparation order | 긴 작업의 준비 시작 | 준비만 허용, 실행 금지선 명시 |
| OPORD | execution order | 실행 계약 | authority, assessment, reports 필수 |
| Annex | specialist plans | 세부 위험/도구/검증 분리 | 각 annex owner 지정 |
| Task Order | role-level task | 하위 에이전트 과업화 | assigned_to, purpose, verification 필수 |
| Backbrief | restated understanding | 하달 왜곡 탐지 | stop condition, approval boundary 필수 |
| Rehearsal | dry-run sequence | 실행 전 충돌 탐지 | unresolved change가 있으면 execute 금지 |
| SITREP | current state report | 결심에 필요한 변화 보고 | blocked item은 CCIR 연결 |
| FRAGO | changed order | 변경 범위 통제 | parent order와 unchanged intent 필수 |
| AAR | learning record | 사후관리 | SOP/readiness update 판단 |

## 5. 왜곡 방지 장치

| 왜곡 유형 | 군대식 방지 장치 | LLM control |
| --- | --- | --- |
| 목적 오해 | commander intent | `intent.purpose`, `key_tasks`, `failure_to_avoid` |
| 범위 확대 | OPORD/FRAGO 구분 | scope change는 FRAGO event로만 허용 |
| 하위 과업 누락 | task order | OPORD task를 role별 payload로 분해 |
| 암묵적 승인 | command and signal | allowed/approval/prohibited를 명시 |
| 실행 전 오류 | confirmation brief/backbrief | `BACKBRIEF` schema 검증 |
| 실행 순서 충돌 | rehearsal | `REHEARSAL` sequence 검증 |
| 보고 과다 | CCIR | decision-changing information만 alert |
| 기억 손실 | event log/handoff | source-of-truth files와 projection 유지 |

## 6. Order State Machine

```text
draft
-> analyzed
-> warned
-> ordered
-> acknowledged
-> rehearsed
-> executing
-> changed
-> complete
-> reviewed
```

권장 상태 전환:

| From | To | 조건 |
| --- | --- | --- |
| draft | analyzed | mission intent, constraints, CCIR가 채워짐 |
| analyzed | warned | 일부 준비를 먼저 시작할 가치가 있음 |
| analyzed/warned | ordered | OPORD가 validator를 통과 |
| ordered | acknowledged | 각 task owner가 backbrief 제출 |
| acknowledged | rehearsed | rehearsal disposition이 `execute` |
| rehearsed | executing | policy/readiness gate 통과 |
| executing | changed | scope/priority/authority 변화 발생 |
| changed | executing | FRAGO가 parent order와 연결 |
| executing | complete | MOP/MOE/evidence 충족 |
| complete | reviewed | AAR와 readiness update 검토 |

## 7. 자동화 규칙

실행 전 runtime은 최소한 다음을 확인한다.

1. OPORD가 mission_id와 commander intent를 갖는가?
2. OPORD task가 task order와 연결되는가?
3. 각 task owner가 backbrief를 냈는가?
4. backbrief가 stop condition과 approval boundary를 재진술하는가?
5. rehearsal이 execution sequence와 decision point를 포함하는가?
6. rehearsal required_changes가 남았는데 execute하려 하지 않는가?
7. tool request가 authority/readiness/release policy를 통과하는가?
8. blocked item은 SITREP 또는 CCIR alert로 올라가는가?

이 저장소의 구현 연결:

- `schema-files/opord.schema.json`
- `schema-files/task-order.schema.json`
- `schema-files/backbrief.schema.json`
- `schema-files/rehearsal.schema.json`
- `runtime-demo-payloads/backbrief.json`
- `runtime-demo-payloads/rehearsal.json`
- `orders-dissemination-runner.js`

## 8. 단일 에이전트에서의 적용

단일 에이전트는 내부적으로 여러 참모를 흉내내되, 사용자에게는 commander-facing packet만 보여준다.

```text
S2: 출처와 불확실성 정리
S3: 실행 단계와 task order 작성
S4/S6: 도구, 토큰, context, fallback 확인
Red Team: 실패 모드와 권한 초과 탐지
CoS: OPORD와 decision packet 통합
Commander: approve, revise, reject, FRAGO
```

단일 에이전트라도 실행 전에는 반드시 짧은 backbrief를 만든다. 이것은 내부 사고 노출이 아니라, 이해한 임무와 stop condition을 검증하기 위한 외부 계약이다.

## 9. 멀티에이전트에서의 적용

멀티에이전트는 더 엄격해야 한다.

- Orchestrator는 OPORD owner다.
- 각 role agent는 task order owner다.
- 각 role agent는 자기 task에 대한 backbrief를 낸다.
- CoS/Orchestrator는 backbrief 간 충돌을 rehearsal에서 찾는다.
- Red Team은 execute 권한을 갖지 않는다. risk finding과 mitigation option만 낸다.
- Recorder/S6는 OPORD, FRAGO, SITREP, AAR, evidence, event log를 source of truth로 저장한다.

## 10. Anti-Patterns

피해야 할 패턴:

- 사용자 요청을 그대로 system prompt로 넣고 장기 실행.
- OPORD 없이 여러 에이전트를 동시에 호출.
- task owner가 자기 임무를 재진술하지 않은 채 실행.
- "승인 받음"을 모든 tool action에 적용하는 blanket approval.
- 변경 요청을 기존 OPORD에 조용히 섞음.
- 실패 후 AAR 없이 다음 작업으로 넘어감.

## 11. 출처 앵커

- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- STANAG 2014, Formats for Orders: https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf
- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf

## 12. 관련 문서

- `opord-annex-model.md`
- `backbrief-and-rehearsal-sop.md`
- `prompt-templates.md`
- `prompt-dsl.md`
- `agent-runtime-playbook.md`
- `event-sourcing-model.md`
