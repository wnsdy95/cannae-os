# Commander Handbook

## 0. 목적

이 문서는 사람이 AI LLM 시스템을 지휘할 때 사용하는 실전 handbook이다.

핵심 원칙은 단순하다.

- 사람은 목적, 우선순위, 위험수용, 승인권을 맡는다.
- AI 에이전트는 분석, 초안, 실행, 검증, 보고를 맡는다.
- AI 에이전트가 자율적으로 움직일 수 있는 범위는 문서화된 authority 안에서만 허용된다.
- 위험한 행동은 능력이 아니라 승인권의 문제다.

다국적 적용에서는 `Commander`를 특정 국가의 지휘관 계급으로 읽지 않는다. 여기서는 최종 목적, 승인, 위험수용, 공개 여부를 책임지는 사람 또는 권한자를 뜻한다. 현지 군/조직의 실제 승인 체계와 충돌하면 `docs/multinational-doctrine-consistency-review.md`의 jurisdiction gate가 우선한다.

## 1. 지휘관의 5대 책임

| 책임 | 군대식 의미 | AI 운용 의미 |
| --- | --- | --- |
| Intent owner | 작전 목적과 desired end state를 정함 | 모델이 헷갈려도 유지해야 하는 목적을 고정 |
| Priority owner | main effort와 economy of force를 정함 | 어떤 작업을 먼저 하고 무엇을 포기할지 결정 |
| Risk owner | 어떤 위험을 수용할지 결정 | Red/Amber action 승인 또는 거부 |
| Boundary owner | 금지선과 승인선을 정함 | 도구, 데이터, 배포, 결제, 외부 발송 통제 |
| Assessment owner | 성공 여부를 판정함 | 산출물 존재가 아니라 효과 달성을 확인 |

지휘관은 모든 세부 절차를 직접 지시하지 않는다. 대신 의도, 경계, 정보요구, 승인기준을 명확히 한다.

## 2. 지휘관이 처음 줘야 하는 입력

작업을 시작할 때 지휘관은 아래 9개를 준다.

| 필드 | 질문 | 예시 |
| --- | --- | --- |
| Mission | 무엇을 달성해야 하는가? | 군대식 LLM 운용 프레임워크를 문서화하고 prototype화 |
| Purpose | 왜 하는가? | 환각, 무단 실행, 보고 누락을 줄이기 위해 |
| End state | 끝났다는 증거는 무엇인가? | 문서, schema, runner, dashboard가 검증됨 |
| Main effort | 가장 중요한 축은 무엇인가? | 문서화와 authority model |
| Constraints | 절대 지켜야 할 조건은? | 로컬 파일만 수정, 외부 배포 금지 |
| Authority | 무엇을 자율 실행할 수 있는가? | 문서 생성, local test run |
| Approval required | 무엇은 승인 전 대기해야 하는가? | prod deploy, credential use, 결제 |
| CCIR | 무엇이 생기면 즉시 보고해야 하는가? | 검증 실패, 범위 변경, Red action 필요 |
| Assessment | 어떻게 평가할 것인가? | validator/test 통과, source map 갱신, AAR 반영 |

## 3. 지휘관 prompt skeleton

```text
MISSION:
- 달성할 목표:
- 사용자가 원하는 최종 효과:

INTENT:
- Purpose:
- Key tasks:
- End state:
- Failure to avoid:

AUTHORITY:
- Allowed without further approval:
- Approval required:
- Prohibited:

CCIR:
- PIR: 내가 결심하려면 필요한 정보
- FFIR: 실행능력/자원/도구 문제
- EEFI: 노출되면 안 되는 정보

REPORTING:
- 언제 SITREP을 보낼지:
- 어떤 형식으로 보고할지:

ASSESSMENT:
- MOP: 수행 여부 지표
- MOE: 효과 달성 지표
- Verification commands or checks:
```

## 4. Backbrief를 강제하는 법

명령을 내린 뒤 바로 실행시키지 말고, 에이전트에게 먼저 재진술하게 한다.

```text
실행 전에 backbrief 하라.
1. 네가 이해한 mission
2. commander's intent
3. 네가 자율 실행할 수 있는 행동
4. 승인 없이는 멈춰야 하는 행동
5. 예상 산출물
6. 실패 가능성과 stop condition
7. 첫 번째 실행 단계
```

승인 기준:

- mission과 purpose를 혼동하지 않아야 한다.
- output과 effect를 구분해야 한다.
- Red/Amber action을 스스로 식별해야 한다.
- 모르는 것을 아는 척하지 않아야 한다.

## 5. 권한 등급

| 등급 | 의미 | 예시 | 지휘관 행동 |
| --- | --- | --- | --- |
| Green | 안전하고 되돌릴 수 있으며 범위 안에 있음 | 로컬 문서 초안, 읽기 전용 검색, local test | 자율 허용 |
| Amber | 영향이 있지만 제한적으로 되돌릴 수 있음 | 같은 파일의 구조 변경, 외부 자료 인용, 큰 리팩터 | 사전 보고 또는 묵시 승인 범위 필요 |
| Red | 외부 영향, 비용, 배포, 데이터 변경, 보안 위험 | prod deploy, credential use, DB mutation, 이메일 발송 | 명시 승인 필요 |
| Black | 금지 | secret 노출, 법 위반, 사용자 의도 위반 | 거부 및 대안 제시 |

권한은 role만으로 정하지 않는다.

```text
권한 = role + mission + task + target + tool + risk + readiness + time limit
```

따라서 S3 에이전트가 local validator를 실행하는 것은 Green일 수 있지만, 같은 S3가 production deployment를 요청하면 Red다.

## 6. 승인 request 형식

Red 또는 중요한 Amber action은 아래 형식으로 올라와야 한다.

```text
APPROVAL REQUEST:
- Requested action:
- Tool:
- Target:
- Mission/task link:
- Why needed:
- Risk:
- Mitigation:
- Rollback:
- Scope:
- Expiry:
- Evidence required after execution:
- Recommended decision: approve / approve with constraints / revise / reject
```

지휘관은 다음 중 하나로만 답한다.

- `Approve once`: 지정 scope 안에서 1회만 허용.
- `Approve with constraints`: 조건부 허용.
- `Revise`: 계획 수정 후 재상신.
- `Reject`: 실행 금지.
- `Issue FRAGO`: mission 자체의 범위나 우선순위 변경.

## 7. 보고 범위

보고는 많을수록 좋은 것이 아니다. 지휘관의 결심을 바꾸는 정보만 우선 보고한다.

즉시 보고:

- Red action 필요.
- validator/test/replay 실패.
- source가 불확실한데 결론에 영향을 줌.
- 기존 intent와 충돌하는 요구가 생김.
- 예상보다 큰 파일/범위/위험 변경.
- 사용자의 최신 지시와 기존 계획이 충돌.

정기 보고:

- 30분 이상 긴 작업의 진행상황.
- 큰 단계 완료 후 산출물/검증 요약.
- AAR와 readiness 변경 필요.

보고하지 않아도 되는 것:

- 이미 승인된 Green 작업의 세부 진행.
- 단순 파일 읽기.
- 기존 패턴 안에서 작은 문구 조정.

## 8. 단일 에이전트 운용법

단일 에이전트는 한 사람이 commander, staff, executor를 모두 겸하는 구조가 되기 쉽다. 그래서 반드시 역할을 시간 순서로 분리한다.

절차:

1. Mission intake: 사용자 요청을 mission statement로 변환.
2. Mission analysis: 모르는 것, risk, constraints, CCIR 확인.
3. Draft OPORD: 실행 계획과 authority boundary 작성.
4. Backbrief: 이해한 내용과 stop condition 재진술.
5. Execute Green: 승인된 범위 안에서 실행.
6. Escalate Amber/Red: 승인 필요 시 멈춤.
7. SITREP: 진행상황과 장애 보고.
8. AAR: 결과, 차이, 학습, 다음 SOP 수정.

단일 에이전트 prompt:

```text
너는 단일 agent지만 내부적으로 Commander / S2 / S3 / S6 / Evaluator 역할을 분리해 사고하라.
출력에서는 역할별 추론 전체를 장황하게 쓰지 말고, 결심에 필요한 요약만 보고하라.
실행 전 backbrief를 하고, Green action만 수행하라.
Amber/Red action은 approval request로 멈춰라.
```

## 9. 멀티 에이전트 운용법

멀티 에이전트는 성능보다 조정 비용이 먼저 문제다. 지휘관은 "누가 누구에게 보고하는가"를 먼저 정해야 한다.

기본 구조:

| 역할 | 기능 | 자율 실행 | 보고 대상 |
| --- | --- | --- | --- |
| Commander | intent, priority, risk acceptance | 결심만 | 사용자 |
| CoS | 통합, battle rhythm, tasking | Green coordination | Commander |
| S2 | research, evidence, uncertainty | 읽기/요약 | CoS |
| S3 | execution plan, current ops | local Green execution | CoS |
| S4 | resource, token, tool availability | resource estimate | CoS |
| S6 | knowledge, docs, state, automation | docs/state updates | CoS |
| Red Team | contradiction, risk, adversarial review | review only | Commander/CoS |
| Evaluator | MOP/MOE/AAR/readiness | assessment draft | Commander |

멀티 에이전트 원칙:

- 모든 에이전트가 사용자에게 직접 길게 보고하지 않는다.
- CoS가 중복, 충돌, 누락을 정리한다.
- Red Team은 실행권을 갖지 않는다.
- Evaluator는 산출물 완료와 효과 달성을 분리한다.
- S6는 문서와 event log를 source of truth로 유지한다.

## 10. 왜곡 없는 하달 체크리스트

명령을 내리기 전:

- mission과 purpose가 분리되어 있는가?
- end state가 관찰 가능한가?
- forbidden action이 명시되어 있는가?
- CCIR가 3개 이하의 중요한 결심정보로 정리되어 있는가?
- 하급 에이전트가 방법을 선택할 여지가 있는가?

하달 직후:

- backbrief를 받았는가?
- 에이전트가 승인 필요 행동을 식별했는가?
- 산출물과 검증 방법이 연결되어 있는가?
- 보고 시점이 정해져 있는가?

실행 중:

- SITREP이 CCIR 중심인가?
- 위험이 증가하면 멈추는가?
- source와 interpretation이 분리되는가?
- event log 또는 문서에 남는가?

종료 후:

- MOP/MOE를 둘 다 평가했는가?
- AAR가 교훈으로 끝나지 않고 SOP/readiness 수정으로 이어졌는가?
- 다음 작전자가 chat history 없이 이어받을 수 있는가?

## 11. 지휘관 결심 매트릭스

| 상황 | 결심 | 이유 |
| --- | --- | --- |
| 목표는 명확하지만 방법이 여러 개 | intent와 constraints만 주고 위임 | disciplined initiative 확보 |
| 정보가 부족하지만 위험이 낮음 | Green reconnaissance 허용 | 결심 전 정보수집 |
| 정보가 부족하고 위험이 높음 | PIR 발령, 실행 보류 | 잘못된 조기 실행 방지 |
| 산출물은 완성됐지만 효과 불확실 | Evaluator에게 MOE 평가 지시 | output/effect 분리 |
| 에이전트가 승인선을 인식 못함 | 즉시 중단, authority 재교육 | 무단행동 위험 |
| scope가 바뀜 | FRAGO 발령 | 기존 OPORD 왜곡 방지 |
| 같은 문제가 반복됨 | SOP와 schema 수정 | AAR 환류 |

## 12. Hallucination 통제

지휘관은 "정답을 말해라"보다 "출처와 판단을 분리하라"고 명령해야 한다.

프롬프트:

```text
모든 주장을 세 종류로 분리하라.
1. Source-backed claim: 출처가 있는 사실
2. Inference: 출처에서 내가 추론한 해석
3. Open question: 아직 검증되지 않은 부분

Source-backed claim 없이 정책/법/최신 사실을 단정하지 마라.
불확실하면 CCIR 또는 PIR로 올려라.
```

환각 방지 장치:

- source map.
- evidence record.
- quote limit and citation rule.
- Red Team review.
- validator/schema.
- AAR correction.

## 13. 지휘관이 하지 말아야 할 것

- "알아서 잘해"라고만 지시하지 않는다.
- output 형식만 정하고 authority를 빼먹지 않는다.
- Red action을 편의상 한 번 승인한 뒤 계속 허용하지 않는다.
- 모든 에이전트에게 동시에 같은 일을 시키지 않는다.
- 불확실한 최신 정보를 브라우징 없이 단정하게 하지 않는다.
- AAR를 작성하고도 SOP나 readiness를 갱신하지 않는 상태로 끝내지 않는다.

## 14. 빠른 명령 템플릿

문서화 임무:

```text
MISSION: 주어진 주제를 군대식 LLM 운용 프레임워크 문서로 정리하라.
INTENT: 다음 작업자가 실행 가능한 수준으로 authority, reporting, SOP, verification을 남겨라.
AUTHORITY: 로컬 문서 생성/수정은 Green. 외부 배포, credential, 비용 발생은 Red.
CCIR: 출처 불확실, 사용자 지시 충돌, schema/test 실패, 범위 확대.
ASSESSMENT: README/source-map/compendium 갱신, link check, AAR note.
```

코드 구현 임무:

```text
MISSION: 지정 기능을 기존 코드베이스 패턴에 맞게 구현하고 검증하라.
INTENT: 작은 범위의 동작 가능한 변경을 만들고, 회귀검증을 남겨라.
AUTHORITY: 파일 읽기, scoped edit, local test는 Green. destructive command, prod deploy, secret use는 Red.
CCIR: 테스트 실패, 설계 불일치, user 변경과 충돌, 권한 밖 행동 필요.
ASSESSMENT: 관련 test 통과, 변경 파일 요약, 남은 risk 보고.
```

리서치 임무:

```text
MISSION: 지정 군사 개념의 공식/학술 출처를 조사해 LLM 적용 원리로 변환하라.
INTENT: claim과 interpretation을 분리하고, source-map에 연결하라.
AUTHORITY: 공개 웹 검색과 로컬 문서 작성은 Green. 유료/비공개 자료 접근은 Red.
CCIR: 공식 출처 부재, 최신성 불확실, 상충되는 자료, 법/정책 단정 필요.
ASSESSMENT: 출처 등급, 핵심 원리, 적용 규칙, research gap.
```

## 15. 출처 앵커

이 handbook은 다음 군사 운영 원리를 LLM 운용으로 옮긴 것이다.

- Mission command: 명확한 의도, mission orders, disciplined initiative, prudent risk.
- Operations process: plan, prepare, execute, assess loop.
- OPORD/WARNO/FRAGO/SITREP/AAR: 표준 문서로 하달과 환류를 구조화.
- CCIR: 지휘관 결심에 필요한 정보만 우선 보고.
- Authorities: 권한은 명시적으로 위임되고 제한된다.
- Rehearsal/backbrief: 실행 전 이해와 계획을 검증한다.
- Knowledge management: source of truth를 대화 기억이 아니라 공유 저장소에 둔다.
- AAR/readiness: 실행 후 교훈을 훈련과 권한 조정에 반영한다.

주요 참고:

- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- Joint Staff CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- Joint Staff Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507
