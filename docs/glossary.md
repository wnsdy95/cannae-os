# Glossary

## 0. 목적

이 문서는 군대식 LLM 프레임워크에서 사용하는 핵심 용어를 통일한다.

용어가 흔들리면 문서 하달이 흔들린다. 군대가 표준 용어를 중시하는 이유도 여기에 있다. 이 프레임워크에서는 군사용어를 그대로 숭배하지 않고, LLM 운용에서 같은 기능을 하는 개념으로 번역해 사용한다.

다국적 적용에서는 이 용어표를 원문 계급/직책표로 쓰지 않는다. `COMMANDER`, `S2`, `S3`, `S4`, `S6` 같은 이름은 내부 기능 ID이며, 실제 조직에 적용할 때는 `docs/multinational-doctrine-consistency-review.md`의 role alias map으로 현지 용어를 연결한다.

## 1. 용어 표

| 용어 | 군대식 의미 | LLM 프레임워크 의미 |
| --- | --- | --- |
| Mission | 부대가 수행해야 할 명확한 임무 | 에이전트가 달성해야 할 결과 |
| Commander's Intent | 임무의 목적, 핵심 효과, 최종 상태 | 사용자가 진짜 원하는 결과와 실패 방지 조건 |
| OPORD | 작전명령 | 복잡한 LLM 작업을 위한 구조화 프롬프트 |
| WARNO | 경고명령 | 세부 계획 전 사전 착수 지시 |
| FRAGO | 단편명령/변경명령 | 작업 중 요구사항 변경 또는 계획 수정 |
| SITREP | 상황보고 | 진행 상태, 장애, 리스크 보고 |
| AAR | 사후검토 | 결과와 의도 차이를 분석해 SOP에 반영 |
| Backbrief | 하급자가 이해한 임무를 상급자에게 설명 | 에이전트가 실행 전 이해 내용을 재진술 |
| Confirmation Brief | 명령 수령 확인 브리핑 | 에이전트가 지시사항과 제약을 확인 |
| Rehearsal | 실행 전 예행연습 | 계획, 도구, 검증 경로를 사전 점검 |
| Mission Command | 임무형 지휘 | intent와 권한 경계만 주고 방법은 위임 |
| Command and Control | 지휘통제 | 사용자 의도, 권한, 보고, 승인 체계 |
| Unity of Command | 지휘 일원화 | 최종 결정권자와 통합자가 하나로 명확함 |
| Unity of Effort | 노력 통일 | 여러 에이전트가 같은 목적을 향해 움직임 |
| Staff | 참모 | 기능별 전문 에이전트 |
| S2 | 정보 참모 | 리서치, 출처, 불확실성 담당 |
| S3 | 작전 참모 | 실행 계획, sequencing, 작업 통합 |
| S4 | 군수/지속지원 참모 | 토큰, 도구, 시간, API, 의존성 담당 |
| S6 | 통신/지식관리 참모 | 문서, 컨텍스트, 저장소, 정보 흐름 담당 |
| Red Team | 독립 검토 조직 | 오류, 환각, 리스크, 반례 검토 에이전트 |
| CCIR | 지휘관 중요정보요구 | 즉시 보고해야 하는 정보 기준 |
| PIR | 우선정보요구 | 결정을 위해 필요한 외부/상황 정보 |
| FFIR | 우군정보요구 | 내부 상태, 자원, 장애, 테스트 결과 정보 |
| EEFI | 필수우호정보 | 노출되면 안 되는 민감 정보 |
| MDMP | 군 의사결정 절차 | 복잡한 작업의 mission analysis와 COA 선택 |
| COA | 방책 | 가능한 접근법 또는 실행 대안 |
| Running Estimate | 지속 갱신되는 참모 판단 | 리스크, 출처, 상태, 의존성의 live note |
| Battle Rhythm | 회의/보고/결심 주기 | 에이전트 동기화와 decision gate 주기 |
| SOP | 표준작전절차 | 반복 작업의 표준 프롬프트/절차 |
| METL | 임무필수과업목록 | 에이전트가 반드시 수행할 수 있어야 하는 핵심 과업 |
| Readiness | 임무 수행 준비태세 | 에이전트/SOP가 실제 작업에 투입 가능한 수준 |
| Crawl-Walk-Run | 단계적 훈련 | 체크리스트 -> 감독 자율 -> 임무형 자율 |
| Sustainment | 지속지원 | 토큰, 시간, 도구, 문맥, 파일, API 지원 |
| Protection | 방호 | 보안, 민감정보, 승인, rollback, guardrail |
| Targeting | 표적화 | 어떤 대상에 어떤 효과를 낼지 정하는 과정 |
| D3A | Decide, Detect, Deliver, Assess | 결정, 확인, 실행, 평가 루프 |
| ROE | 교전규칙 | 허용/승인필요/금지 행동의 경계 |
| Risk Acceptance | 위험 수용 | 위험을 알고도 승인할 수 있는 권한 |
| MOP | 수행지표 | 작업이 수행됐는지 측정 |
| MOE | 효과지표 | 목적한 효과가 났는지 측정 |
| Indicator | 지표 | MOP/MOE를 판단하는 관찰 가능 신호 |
| Decision Point | 결심 지점 | 승인, 중단, 변경이 필요한 시점 |
| Decision Support Matrix | 결심지원표 | 조건별 결심과 조치를 연결한 표 |
| Liaison | 연락/협조 기능 | 에이전트 간 인터페이스와 정보 연결 |
| Annex | 부록 | OPORD의 세부 전문 영역 문서 |
| Overlay | 작전도식 | 작업 구조, 관계, 흐름을 시각화한 보조 자료 |

## 2. 혼동하면 안 되는 쌍

### Mission vs Intent

Mission은 해야 할 일이다. Intent는 왜 해야 하는지와 어떤 상태가 성공인지다.

LLM 프롬프트에서 mission만 주면 모델은 활동을 수행하지만, intent가 없으면 사용자의 진짜 목적과 어긋날 수 있다.

### MOP vs MOE

MOP는 수행 여부다. MOE는 효과 여부다.

예:

- MOP: `source-map.md` 파일을 만들었다.
- MOE: 다음 에이전트가 주장별 근거를 추적할 수 있다.

### Authority vs Responsibility

Responsibility는 맡은 일이다. Authority는 결정하거나 실행할 수 있는 권한이다.

에이전트는 어떤 작업을 맡을 수 있지만, 그 작업의 위험을 수용할 권한은 없을 수 있다.

### Autonomy vs Independence

Autonomy는 정해진 intent와 ROE 안에서 자유롭게 수행하는 능력이다. Independence는 상위 의도와 무관하게 행동하는 것이 아니다.

멀티에이전트에서 하위 에이전트는 자율성을 가질 수 있지만, mission을 재정의할 독립성은 없다.

### Red Team vs Editor

Red Team은 고치는 사람이 아니라 문제를 드러내는 사람이다. Red Team이 직접 수정까지 맡으면 독립성이 약해진다.

## 3. LLM 프롬프트에서 고정해야 할 용어

프롬프트에는 아래 용어를 일관되게 쓴다.

```text
Mission:
Intent:
Situation:
Execution:
Constraints:
Authority:
CCIR:
Sustainment:
Verification:
Deliverable:
Backbrief:
```

다른 표현으로 바꾸지 않는 것이 좋다. 용어가 고정되면 에이전트가 출력 구조를 안정적으로 학습한다.

## 4. 권장 한국어 번역

| English | Korean |
| --- | --- |
| Mission | 임무 |
| Commander's Intent | 지휘관 의도 |
| Operations Process | 작전수행과정 |
| Mission Command | 임무형 지휘 |
| Command and Control | 지휘통제 |
| Staff | 참모 |
| Sustainment | 지속지원 |
| Protection | 방호 |
| Targeting | 표적화 |
| Rules of Engagement | 교전규칙 |
| Battle Rhythm | 작전/보고 주기 |
| Running Estimate | 지속 판단자료 |
| After Action Review | 사후검토 |
| Measure of Performance | 수행지표 |
| Measure of Effectiveness | 효과지표 |

## 5. 관련 문서

- `military-llm-framework-v0.1.md`
- `prompt-templates.md`
- `agent-roles-and-authority.md`
- `source-map.md`
- `research-compendium.md`
