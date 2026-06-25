# Functional Domains

## 0. 목적

이 문서는 군대의 warfighting functions, 훈련관리, 지속지원, 타게팅, ROE를 LLM 운영 기능으로 번역한다.

군대는 단순히 명령을 내리는 조직이 아니다. 지휘통제, 정보, 기동, 화력, 지속지원, 방호, 정보활동 같은 기능이 함께 작동해야 실제 작전이 된다. LLM 프레임워크도 동일하다. 좋은 프롬프트 하나만으로는 장기 작업, 멀티에이전트, 검증, 권한 통제를 안정적으로 수행하기 어렵다.

핵심 문장:

```text
LLM 운영체계는 프롬프트 기술이 아니라,
지휘통제, 정보, 실행, 지속지원, 방호, 평가가 결합된 작전 시스템이다.
```

## 1. 군 전투기능을 LLM 기능으로 번역

| 군 기능 | 군대식 의미 | LLM 운영 기능 | 핵심 산출물 |
| --- | --- | --- | --- |
| Command and Control | 지휘관 의도, 권한, 통제, 보고 | 사용자 의도 보존, 에이전트 권한, 승인체계 | OPORD prompt, authority matrix |
| Intelligence | 적/환경/위험 파악 | 출처 조사, 불확실성, 환각 탐지 | research note, source map |
| Movement and Maneuver | 위치와 행동으로 우위 확보 | 작업 순서, 파일/도구 이동, 실행 경로 설계 | execution plan |
| Fires | 표적에 효과를 가함 | 특정 대상에 대한 변경, 생성, 삭제, 호출 | target-effect list |
| Sustainment | 보급, 정비, 의료, 인사 | 토큰, 시간, 도구, API, 문맥, 파일 관리 | sustainment estimate |
| Protection | 병력과 자산 보호 | 보안, 민감정보, 승인선, rollback | risk register, guardrails |
| Information | 정보환경 영향과 메시지 | 문서화, 지식관리, 사용자 커뮤니케이션 | README, compendium, SITREP |

## 2. Command and Control Domain

### 목적

사용자 의도를 작업 끝까지 보존하고, 어느 에이전트가 무엇을 결정할 수 있는지 명확히 한다.

### LLM 운영 질문

- 최종 의사결정자는 누구인가?
- 에이전트가 자율적으로 바꿔도 되는 것은 무엇인가?
- 반드시 보고해야 하는 정보는 무엇인가?
- 어느 순간 사용자 승인이 필요한가?
- mission과 intent는 어디에 기록되는가?

### 필수 장치

- OPORD prompt.
- Commander intent.
- CCIR.
- Authority matrix.
- Backbrief.
- FRAGO.
- AAR.

### 실패 양상

- 에이전트가 사용자의 목적을 자기 방식으로 재정의.
- 하위 작업은 완료됐지만 전체 목적과 불일치.
- 승인 없이 고위험 작업 수행.
- 중간 변경사항이 문서에 반영되지 않음.

## 3. Intelligence Domain

### 목적

결정과 산출물의 근거를 확보하고, 불확실성을 명시한다.

### LLM 운영 질문

- 어떤 사실이 최신 확인을 필요로 하는가?
- 어떤 출처가 1차 출처인가?
- 어떤 주장이 출처가 아니라 추론인가?
- 출처 간 충돌은 무엇인가?
- 환각 가능성이 높은 영역은 어디인가?

### 필수 장치

- PIR.
- Source reliability.
- Source map.
- Assumption list.
- Confidence rating.
- Red Team review.

### Intelligence Estimate 양식

```text
Question:
Known facts:
Sources:
Assumptions:
Uncertainties:
Implication for mission:
Recommended action:
```

## 4. Movement and Maneuver Domain

### 목적

작업이 어떤 순서와 경로로 진행되어야 가장 적은 비용으로 목적을 달성하는지 설계한다.

LLM에서는 물리적 기동 대신 다음을 다룬다.

- 어떤 파일을 먼저 읽을지.
- 어떤 에이전트를 먼저 투입할지.
- 리서치와 구현을 병렬화할지 순차화할지.
- 변경을 어느 모듈부터 적용할지.
- 검증을 언제 실행할지.

### Maneuver Plan 양식

```text
Objective:
Entry point:
Main effort:
Supporting efforts:
Sequence:
Decision points:
Fallback path:
Verification:
```

### 실패 양상

- 먼저 읽어야 할 문서를 건너뜀.
- 병렬화하면 안 되는 일을 병렬화.
- 검증 전에 너무 많은 파일 변경.
- 전체 구조 없이 산출물을 계속 추가.

## 5. Fires / Effects Domain

### 목적

무엇을 바꿔서 어떤 효과를 낼 것인지 명확히 한다.

군 타게팅의 핵심은 "무엇을 공격할까"가 아니라 "어떤 효과가 필요한가"다. LLM 작업에서도 "문서를 만든다", "코드를 수정한다"보다 "어떤 상태 변화를 만들 것인가"가 먼저다.

### Target-Effect 양식

```text
Target:
Desired effect:
Means:
Constraints:
Collateral risk:
Assessment method:
```

### 예시

| Target | Desired effect | Means | Assessment |
| --- | --- | --- | --- |
| README | 새 문서 탐색 가능 | 링크와 읽기 순서 추가 | 사용자가 문서 세트를 찾을 수 있음 |
| prompt template | 환각 감소 | OPORD 구조와 source requirement 추가 | 출처 없는 주장 감소 |
| agent authority | 무단 변경 방지 | approval matrix 추가 | high-risk action 전 보고 |
| research compendium | 지식 축적 | 출처별 요약 추가 | 다음 에이전트가 근거 재사용 |

## 6. Sustainment Domain

### 목적

작업을 끝까지 지속할 수 있도록 자원, 도구, 시간, 문맥을 관리한다.

LLM 지속지원은 다음을 포함한다.

- 컨텍스트 예산.
- 토큰 예산.
- 파일 접근.
- 브라우징 가능 여부.
- API 키와 권한.
- 테스트 도구.
- 장기 작업의 체크포인트.
- 출처와 문서 저장 위치.

### Sustainment Estimate 양식

```text
Task:
Required tools:
Required context:
Time risk:
Token risk:
External dependencies:
Fallback:
Checkpoint:
```

### 지속지원 원칙의 적용

| 원칙 | LLM 적용 |
| --- | --- |
| Anticipation | 긴 작업 전 필요한 파일, 도구, 출처를 예상 |
| Responsiveness | 사용자 변경 요청과 실패에 빠르게 대응 |
| Simplicity | 도구 체인과 문서 구조를 단순하게 유지 |
| Economy | 고비용 모델/도구를 필요한 곳에만 사용 |
| Survivability | 컨텍스트 손실에 대비해 문서와 summary 유지 |
| Continuity | 중간 결과를 계속 저장 |
| Improvisation | 도구 실패 시 대체 경로 준비 |

## 7. Protection Domain

### 목적

사용자 자산, 데이터, 보안, 작업 안정성을 보호한다.

LLM 보호는 단순한 "안전 필터"가 아니다. 권한, 승인, 위험관리, 비밀 보호, 롤백 가능성까지 포함한다.

### 보호 대상

- 사용자 파일.
- 비밀키와 토큰.
- 개인 정보.
- 회사 기밀.
- 사용자 의도.
- 기존 작업물.
- 외부 시스템 상태.

### Protection Control 예시

| 위험 | 통제 |
| --- | --- |
| 사용자 변경사항 되돌림 | 변경 전 diff 확인, explicit approval |
| 비밀키 노출 | EEFI로 즉시 보고, 출력 금지 |
| 출처 없는 주장 | source requirement |
| 고위험 작업 자동 실행 | authority gate |
| 컨텍스트 손실 | 문서화와 checkpoint |
| 모델 환각 | Red Team, source map, verification |

## 8. Information Domain

### 목적

사용자와 에이전트가 같은 상황 인식을 유지하게 하고, 지식이 사라지지 않게 한다.

Information domain은 커뮤니케이션과 지식관리의 결합이다.

### LLM 운영 질문

- 현재 상태를 사용자가 이해하고 있는가?
- 다음 에이전트가 이어받을 수 있는가?
- 어떤 판단이 어디에 기록됐는가?
- 문서 이름과 위치가 직관적인가?
- 보고가 결심을 돕는가, 방해하는가?

### 필수 장치

- README.
- Research compendium.
- Source map.
- SITREP.
- Decision log.
- AAR.
- Glossary.

## 9. Training and Readiness Domain

### 목적

에이전트가 맡은 임무를 반복적으로 안정 수행할 수 있는지 평가한다.

군대는 전투를 잘하기 위해 평시에 훈련 과제를 관리한다. LLM 프레임워크도 자주 수행하는 임무를 METL처럼 정의해야 한다.

### AI METL 예시

| Mission essential task | 평가 기준 |
| --- | --- |
| 사용자 의도 OPORD 변환 | mission, intent, constraints 누락 없음 |
| 출처 기반 리서치 | 핵심 주장마다 출처 연결 |
| 문서 세트 갱신 | README, source map, compendium 동시 반영 |
| 고위험 변경 통제 | authority gate와 CCIR 작동 |
| 멀티에이전트 통합 | 역할별 산출물이 하나의 결론으로 통합 |
| AAR 반영 | SOP 또는 템플릿에 교훈 반영 |

### Readiness Rating

| 등급 | 의미 | 운용 방식 |
| --- | --- | --- |
| T | Trained | 자율 수행 가능 |
| P | Practiced | 감독 아래 수행 |
| U | Untrained | 체크리스트와 승인 필요 |
| X | Unknown | 평가 전까지 제한 운용 |

## 10. Targeting Domain

### 목적

LLM 작업을 "활동 목록"이 아니라 "목표와 효과의 연쇄"로 설계한다.

### D3A 번역

| 단계 | 군 타게팅 | LLM 작업 |
| --- | --- | --- |
| Decide | 어떤 표적과 효과가 중요한지 결정 | 어떤 문서/코드/판단을 바꿀지 결정 |
| Detect | 표적 위치와 상태 확인 | 현재 파일, 출처, 결함 확인 |
| Deliver | 수단 적용 | 수정, 생성, 도구 호출 |
| Assess | 효과 평가 | 테스트, 리뷰, 사용자 목표 달성 확인 |

### 적용 예

```text
Decide: source map이 없어 근거 추적이 어렵다.
Detect: 현재 문서 세트에 source-map.md가 없다.
Deliver: source-map.md 작성, README 연결.
Assess: rg와 wc로 존재 및 링크 확인.
```

## 11. ROE Domain

### 목적

에이전트가 할 수 있는 행동, 하면 안 되는 행동, 승인이 필요한 행동을 명확히 한다.

LLM용 ROE는 다음 세 층이다.

| 층 | 의미 | 예 |
| --- | --- | --- |
| Always allowed | 자율 수행 가능 | 읽기, 요약, 초안 작성, 로컬 검증 |
| Approval required | 승인 후 가능 | 외부 배포, 비용 발생, 데이터 변경 |
| Prohibited | 수행 금지 | 비밀 유출, 사용자 변경 무단 되돌림, 허위 출처 생성 |

### ROE Card 양식

```text
Mission:
Allowed:
Requires approval:
Prohibited:
Immediate report:
Fallback:
```

## 12. 통합 운영 모델

각 기능영역은 독립 문서가 아니라 하나의 작전 루프로 연결된다.

```text
Command and Control
-> Intelligence
-> Maneuver Plan
-> Target/Effect
-> Sustainment Check
-> Protection Gate
-> Execution
-> Information Update
-> Assessment
-> Training/AAR Update
```

## 13. 관련 문서

- `military-llm-framework-v0.1.md`
- `military-operating-system.md`
- `agent-roles-and-authority.md`
- `decision-risk-assessment.md`
- `prompt-templates.md`
- `sop-library.md`
- `agent-battle-rhythm.md`
- `source-map.md`
- `research-compendium.md`
