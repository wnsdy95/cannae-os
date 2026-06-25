# Agent Battle Rhythm

## 0. 목적

이 문서는 군대의 battle rhythm을 LLM 단일/멀티에이전트 운용 주기로 번역한다.

Battle rhythm은 회의를 많이 하자는 개념이 아니다. 지휘관의 판단이 필요한 순간, 참모가 정보를 모아야 하는 순간, 실행 부대가 보고해야 하는 순간을 시간표와 산출물로 고정하는 체계다.

LLM 운용에서 battle rhythm은 다음을 해결한다.

- 에이전트가 오래 작업하다가 사용자 의도에서 이탈.
- 리서치, 실행, 검증이 서로 다른 속도로 진행.
- 중요 변경사항이 최종 답변 전까지 보고되지 않음.
- 문서화와 사후학습이 누락.
- 멀티에이전트 결과가 하나의 방향으로 통합되지 않음.

핵심 원칙:

```text
보고 주기는 감시 장치가 아니라,
의도 보존과 결심 속도를 동시에 확보하는 장치다.
```

## 1. Battle Rhythm 구성 요소

| 요소 | 군대식 의미 | LLM 운용 의미 |
| --- | --- | --- |
| Event | 회의, 보고, 업데이트 시점 | 에이전트 상태 동기화 |
| Input | 회의 전 필요한 정보 | 파일, 출처, 테스트 결과, 리스크 |
| Output | 회의 후 남는 산출물 | 결정, FRAGO, 수정 계획 |
| Owner | 주관 참모 또는 지휘관 | 책임 에이전트 |
| Frequency | 주기 | 작업 단계 또는 시간 기준 |
| Decision Link | 결심 지점과 연결 | 승인, 중단, 방향 전환 |

## 2. 기본 주기

### 2.1 Short Task Rhythm

짧은 단일 작업에 사용한다.

```text
Receive mission
-> Backbrief
-> Execute
-> Verify
-> Report
-> AAR note
```

적용 예:

- 작은 문서 수정.
- 단일 코드 버그 수정.
- 짧은 리서치 요약.
- 템플릿 하나 작성.

필수 산출물:

- 작업 이해 요약.
- 변경 파일 또는 조사 출처.
- 검증 결과.
- 남은 리스크.

### 2.2 Standard Task Rhythm

중간 규모 작업에 사용한다.

```text
Intent brief
-> WARNO
-> Mission analysis
-> COA / plan
-> Execution
-> SITREP
-> Verification
-> Final report
-> AAR
```

적용 예:

- 여러 문서 생성.
- 기능 구현과 테스트.
- 프레임워크 설계.
- 여러 출처를 포함한 리서치.

### 2.3 Deep Research Rhythm

장기 리서치에 사용한다.

```text
Research mission
-> PIR definition
-> Source collection
-> Source validation
-> Synthesis
-> Red Team review
-> Source map update
-> Compendium update
-> AAR
```

적용 예:

- 군 교리 전체 조사.
- 학술 논문 비교.
- AI 프레임워크 근거 수집.
- 환각 방지 방법론 정리.

### 2.4 High Risk Rhythm

승인과 중단 기준이 중요한 작업에 사용한다.

```text
Intent brief
-> Risk assessment
-> Authority check
-> Decision gate
-> Controlled execution
-> Frequent SITREP
-> Independent verification
-> Commander approval
-> Release
```

적용 예:

- 실제 시스템 변경.
- 비용 발생 API 사용.
- 보안 설정 변경.
- 외부 공개 문서.
- 법률, 의료, 금융 등 고위험 판단.

## 3. Battle Rhythm Events

| Event | Owner | Trigger | Input | Output |
| --- | --- | --- | --- | --- |
| Intent Brief | Commander | 작업 시작 | 사용자 요청 | mission, intent, constraints |
| WARNO | Chief of Staff | 작업 착수 전 | intent, known facts | 초기 경고명령, 예상 작업 |
| Mission Analysis | S2/S3 | 계획 전 | 파일, 출처, 제약 | 핵심 질문, 리스크, 범위 |
| COA Review | S3 | 실행 전 | 대안, 비용, 위험 | 선택된 접근법 |
| Sustainment Check | S4 | 실행 전/중 | 도구, 시간, 토큰, 의존성 | 병목과 우회책 |
| Knowledge Sync | S6 | 문서 변경 전/후 | 문서 세트, 링크 | 색인, 저장 위치 |
| Red Team Review | Red Team | 주요 산출 전 | 초안, 근거, 테스트 | findings, residual risk |
| SITREP | 실행 에이전트 | 진행 중 | 완료/미완료/이슈 | 상태 보고, CCIR |
| FRAGO | Commander/S3 | 변경 발생 | 새 요구, 장애, 리스크 | 변경명령 |
| Decision Board | Commander | 승인 필요 | 권고안, 리스크 | approve, modify, stop |
| Assessment | S3/S2 | 완료 전 | MOP, MOE, indicators | 성공/미달 판단 |
| AAR | 전체 | 완료 후 | 결과, 차이, 원인 | SOP/프롬프트 개선 |

## 4. 보고 주기 설계

보고 주기는 시간만으로 정하지 않는다. 다음 네 가지 기준을 함께 쓴다.

| 기준 | 보고 트리거 |
| --- | --- |
| 시간 | 30분 이상 지속되는 작업 |
| 단계 | 계획, 실행, 검증, 완료 전환 |
| 사건 | 장애, 출처 충돌, 테스트 실패, 요구 변경 |
| 위험 | 비가역 변경, 보안, 비용, 법률성 판단 |

LLM 작업에서 가장 유용한 보고 단위는 "의미 있는 상태 변화"다.

나쁜 보고:

```text
계속 작업 중입니다.
```

좋은 보고:

```text
공식 교리 출처는 확보했고, 지금은 훈련/지속지원/타게팅 축을 LLM 운영기능으로 매핑하고 있습니다. 다음 단계는 SOP 문서화입니다.
```

## 5. SITREP 표준 양식

```text
SITREP

Mission:
Current status:
Completed:
In progress:
Blocked:
CCIR:
Risk:
Next action:
ETA / next report:
```

SITREP에는 해결되지 않은 문제를 숨기지 않는다. 군대식 보고의 핵심은 상급자가 제때 결심할 수 있게 하는 것이다.

## 6. Decision Board

Decision Board는 모든 일을 승인받는 회의가 아니다. 하위 에이전트가 권한 밖으로 나가는 순간을 다루는 결심 지점이다.

### Decision Board 트리거

- mission 또는 intent 변경.
- 출처 간 핵심 충돌.
- 사용자 승인 필요 작업.
- 위험도 high 이상.
- 비용, 보안, 데이터 삭제 가능성.
- 산출물 공개 여부.
- SOP에 없는 새 절차 도입.

### Decision Memo 양식

```text
Decision required:
Context:
Options:
Recommendation:
Risk:
What happens if no decision:
Required authority:
```

## 7. CCIR와 Battle Rhythm 연결

CCIR는 보고 주기를 압축한다. 정해진 주기까지 기다리지 않고 즉시 보고해야 한다.

| CCIR 유형 | LLM 예시 | 조치 |
| --- | --- | --- |
| PIR | 핵심 출처가 기존 결론과 충돌 | 리서치 중단 후 보고 |
| FFIR | 테스트 실패, 파일 누락, 도구 장애 | 실행 계획 수정 |
| EEFI | 비밀키, 개인 정보, 민감 자료 발견 | 노출 중단 및 보호 |
| Decision Point | 승인 없는 변경 필요 | Decision Board |

## 8. 에이전트별 참석 이벤트

| Event | Commander | CoS | S2 | S3 | S4 | S6 | Red Team |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Intent Brief | A | R | C | C | C | C | I |
| WARNO | A | R | C | C | C | C | I |
| Mission Analysis | C | A | R | R | C | C | I |
| COA Review | A | R | C | R | C | C | C |
| Execution | I | A | C | R | C | C | I |
| SITREP | A | R | C | R | C | C | I |
| Red Team Review | I | C | C | C | I | C | R |
| Assessment | A | R | R | R | C | C | C |
| AAR | A | R | R | R | R | R | R |

범례:

- R: Responsible.
- A: Accountable.
- C: Consulted.
- I: Informed.

## 9. 단일 에이전트용 경량 Battle Rhythm

에이전트 하나만 쓸 때도 아래 리듬은 유지한다.

```text
1. 이해한 임무를 한 문장으로 재진술한다.
2. 변경 전 관련 파일/출처를 확인한다.
3. 실행 범위를 보고한다.
4. 작업한다.
5. 검증한다.
6. 변경사항과 남은 리스크를 보고한다.
7. 반복 가능한 교훈을 SOP에 반영한다.
```

단일 에이전트에서는 역할을 실제로 나누지 않고, 한 에이전트가 순서대로 관점을 바꾼다.

```text
S2 관점: 근거가 맞는가?
S3 관점: 실행 순서가 맞는가?
S4 관점: 자원이 충분한가?
S6 관점: 문서와 기록이 남는가?
Red Team 관점: 어디서 틀릴 수 있는가?
```

## 10. Anti-Patterns

| Anti-pattern | 문제 | 교정 |
| --- | --- | --- |
| 회의형 과잉 보고 | 실행보다 동기화가 많음 | decision-linked event만 유지 |
| 최종 일괄 보고 | 중간 이탈을 늦게 발견 | CCIR 즉시 보고 |
| 역할 없는 병렬화 | 결과 통합 실패 | CoS 또는 S3가 통합 책임 |
| 출처 후첨부 | 주장이 먼저 생기고 근거를 끼움 | S2가 먼저 source map 작성 |
| 검증 생략 | 산출물은 있으나 효과 불명 | MOP/MOE 분리 |
| AAR 누락 | 같은 실패 반복 | SOP update를 완료 조건에 포함 |

## 11. 작업 규모별 권장 리듬

| 작업 규모 | 권장 리듬 | 최소 보고 |
| --- | --- | --- |
| 5분 이내 | Short Task | 완료 보고 |
| 30분 이내 | Short Task + verification | 시작, 완료 |
| 2시간 이내 | Standard Task | 계획, 중간, 완료 |
| 장기 리서치 | Deep Research | 출처 묶음 단위 |
| 고위험 작업 | High Risk | decision gate마다 |

## 12. 관련 문서

- `sop-library.md`
- `agent-roles-and-authority.md`
- `decision-risk-assessment.md`
- `prompt-templates.md`
- `military-operating-system.md`
- `research-compendium.md`
