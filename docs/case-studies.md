# Case Studies

## 0. 목적

이 문서는 군대식 LLM 운용 프레임워크를 실제 작업에 적용하는 사례집이다.

개념 문서는 "무엇을 해야 하는가"를 설명한다. 사례 문서는 "어떻게 굴러가는가"를 보여준다. 각 사례는 OPORD, WARNO, execution, SITREP, FRAGO, assessment, AAR 순서로 정리한다.

## 1. 사례 작성 표준

모든 사례는 아래 구조를 따른다.

```text
Case:
Mission:
Commander's intent:
Situation:
Execution:
Authority:
CCIR:
Sustainment:
Assessment:
AAR:
SOP update:
```

핵심은 결과물만 기록하지 않는 것이다. 왜 그런 결정을 했는지, 어떤 위험을 보고했는지, 무엇을 다음 SOP로 되돌렸는지까지 남긴다.

## 2. Case 01: 군대식 LLM 프레임워크 문서화

### Mission

군대의 지휘통제, 문서 하달, 승인 범위, 보고 체계, 사후관리 방식을 조사해 AI LLM 운용 프레임워크로 문서화한다.

### Commander's intent

사용자는 단순 아이디어 메모가 아니라 장기적으로 확장 가능한 개념 프레임워크를 원한다. 군대식 체계가 왜 왜곡 없이 하달되고 실행되는지 이해하고, 이를 LLM 단일/멀티에이전트 운용법으로 전환해야 한다.

성공 조건:

- 리서치 자료와 해석이 한곳에 축적된다.
- 지위별 승인, 보고, 자율 범위가 문서화된다.
- OPORD, WARNO, FRAGO, SITREP, AAR 템플릿이 생긴다.
- SOP, battle rhythm, source map이 생긴다.
- 다음 작업자가 이어서 확장할 수 있다.

실패 방지 조건:

- 군대식 표현만 빌리고 실제 작동원리를 놓치지 않는다.
- 출처 없는 일반론을 핵심 근거처럼 쓰지 않는다.
- 모든 것을 하나의 프롬프트 요령으로 축소하지 않는다.

### Situation

초기 상태:

- 로컬 프로젝트에 문서 없음.
- 사용자는 한국어로 개념 방향을 제시.
- 리서치 대상은 군 문서 체계, 권한, 보고, 작전, 실행, 사후관리.
- 최신성과 공식 출처 확인이 필요.

제약:

- 공개 자료 중심.
- 실제 군사 작전 조언이 아니라 AI LLM 운용 프레임워크로 번역.
- 문서화가 우선.

### Execution

1. 전체 프레임워크 문서 작성.
2. 군대식 운영체계 문서 작성.
3. agent roles and authority 문서 작성.
4. decision, risk, assessment 문서 작성.
5. prompt templates 문서 작성.
6. research compendium에 모든 리서치와 해석 축적.
7. SOP library, battle rhythm, source map, functional domains 추가.
8. README와 상위 문서에 색인 연결.

### Authority

에이전트 자율 수행 가능:

- 공개 자료 검색.
- 문서 생성.
- 로컬 markdown 파일 수정.
- 출처 요약.
- 프레임워크 해석.

승인 필요:

- 실제 군사/법률 조언으로 전환.
- 외부 배포.
- 사용자의 기존 변경사항 되돌림.

금지:

- 확인하지 않은 출처를 공식 출처처럼 단정.
- 기밀 또는 비공개 자료 사용.

### CCIR

PIR:

- 군 문서가 왜 하달 중 왜곡을 줄이는가?
- 권한 위임과 보고 기준은 어떻게 설계되는가?
- 훈련과 readiness를 LLM에 어떻게 적용할 수 있는가?

FFIR:

- 문서 세트가 README에 연결됐는가?
- 파일 수와 라인 수가 검증됐는가?
- 로컬 작업공간이 git 저장소인가?

EEFI:

- 민감한 군 정보 또는 비공개 문서 사용 여부.
- 외부에 공개하면 안 되는 사용자 정보.

### Sustainment

사용 자원:

- 웹 리서치.
- 로컬 markdown 문서.
- `rg`, `wc`, `sed` 기반 검증.
- 공식 ArmyPubs, JCS, DoD 계열 출처.

병목:

- 일부 공식 PDF는 직접 링크보다 상세 페이지가 안정적.
- ROE 원문은 최신 공식 배포본 확인이 까다로움.
- 한국군 공개 자료는 추가 탐색 필요.

### Assessment

MOP:

- 문서 세트 생성.
- README 링크 업데이트.
- source map 추가.
- research compendium 확장.
- SOP와 battle rhythm 작성.

MOE:

- 다음 작업자가 문서 세트만 보고 프레임워크를 이어갈 수 있는가?
- 군 개념과 LLM 적용점이 연결되어 있는가?
- 승인/보고/자율성 기준이 실제 프롬프트 운용에 쓸 수 있는가?

### AAR

잘 된 점:

- 프레임워크를 개념, 역할, 절차, 근거로 분리했다.
- research compendium와 source map으로 자료 추적성을 확보했다.
- SOP와 battle rhythm을 추가해 실행 체계가 생겼다.

개선할 점:

- 실제 작업 실험이 아직 부족하다.
- 한국군 문서 체계 리서치가 더 필요하다.
- 프레임워크 성능을 측정할 평가 지표가 더 필요하다.

SOP update:

- 새 리서치 축이 생기면 `research-compendium.md`와 `source-map.md`를 동시에 갱신한다.
- 새 운영 문서가 생기면 README와 `military-llm-framework-v0.1.md`에 연결한다.

## 3. Case 02: 환각 방지 리서치 에이전트 운용

### Mission

LLM 에이전트가 특정 주제에 대해 환각 없이 출처 기반 리서치를 수행하게 한다.

### Commander's intent

핵심은 답을 빨리 내는 것이 아니라, 어떤 주장이 어떤 출처에서 왔는지 추적 가능하게 만드는 것이다. 불확실한 내용은 결론이 아니라 PIR로 남긴다.

### Situation

예시 주제:

- "군대의 문서 하달 체계가 왜 왜곡을 줄이는가?"

위험:

- 모델이 군사용어를 그럴듯하게 지어냄.
- 2차 자료를 공식 교리처럼 오인.
- 출처 요약과 해석이 섞임.

### OPORD형 프롬프트

```text
Mission:
군대의 문서 하달 체계가 왜 왜곡을 줄이는지 공개 공식 자료 중심으로 조사하라.

Intent:
목표는 군 문서 체계를 LLM 프롬프트/에이전트 체계로 전환할 근거를 확보하는 것이다.
출처 없는 주장은 결론으로 쓰지 않는다.

Execution:
1. 공식 교리 문서와 표준 양식을 먼저 찾는다.
2. 각 출처에서 핵심 개념, 원문 맥락, LLM 적용점을 분리한다.
3. 충돌하거나 불확실한 내용은 unresolved PIR로 기록한다.
4. source map 형식으로 정리한다.

CCIR:
- 공식 출처를 찾지 못함.
- 출처 간 충돌.
- 최신성 확인 필요.

Deliverable:
출처별 요약, LLM 적용, 남은 질문.

Backbrief:
실행 전 네가 이해한 mission과 검증 기준을 5줄로 보고하라.
```

### Assessment

MOP:

- 최소 3개 이상의 공식 출처 확인.
- 각 주장에 링크 연결.
- 불확실성 표시.

MOE:

- 다른 에이전트가 같은 출처를 재검증할 수 있음.
- 리서치가 프롬프트 템플릿이나 SOP로 전환 가능.

### AAR

교훈:

- 리서치 에이전트는 "답변 작성자"가 아니라 "근거 생산자"로 운용해야 한다.
- 출처 없는 주장은 삭제보다 "가설"로 격리하는 편이 이후 연구에 유리하다.

## 4. Case 03: 멀티에이전트 코드 수정

### Mission

기존 코드베이스에서 버그를 수정하고 테스트로 회귀를 방지한다.

### Commander's intent

최소 변경으로 사용자 문제를 해결한다. 기존 사용자 변경사항을 되돌리지 않는다. 테스트 또는 재현 절차를 남긴다.

### 역할 배치

| 역할 | 임무 |
| --- | --- |
| Commander | 사용자 요청과 성공 조건 확정 |
| S2 | 버그 원인과 관련 파일 조사 |
| S3 | 수정 계획과 sequencing |
| S4 | 테스트 도구, 의존성, 실행 환경 확인 |
| Red Team | 변경 부작용 검토 |
| S6 | 변경사항과 검증 결과 문서화 |

### Execution

1. 파일 구조 확인.
2. 관련 코드 검색.
3. 재현 조건 파악.
4. 최소 수정안 작성.
5. 테스트 추가 또는 기존 테스트 실행.
6. 실패하면 SITREP와 FRAGO.
7. 성공하면 최종 보고와 AAR.

### Authority

자율 가능:

- 파일 읽기.
- 관련 코드 수정.
- 테스트 실행.
- 포맷 실행.

승인 필요:

- 대규모 리팩터링.
- 데이터 삭제.
- 외부 서비스 호출.
- 의존성 대규모 변경.

### SITREP 예시

```text
SITREP

Mission: 로그인 오류 수정.
Completed: 관련 auth 모듈과 테스트를 확인함.
In progress: 토큰 만료 처리 경로 수정 중.
Blocked: 없음.
CCIR: 기존 테스트가 실패 중인데 이번 변경과 무관해 보임.
Risk: 회귀 테스트 추가 필요.
Next action: 최소 수정 후 auth 테스트 실행.
```

### AAR

교훈:

- 코드 작업에서도 S2 조사와 S3 실행을 분리하면 불필요한 수정이 줄어든다.
- 테스트 실패는 FFIR로 보고해야 하며 최종 보고에서 숨기지 않는다.

## 5. Case 04: 고위험 자동화 작업

### Mission

외부 시스템에 영향을 줄 수 있는 자동화를 설계한다.

### Commander's intent

에이전트는 자동화 설계를 도울 수 있지만, 실제 실행 권한은 제한한다. 비용, 데이터 변경, 보안 영향은 사람 승인 전까지 실행하지 않는다.

### Situation

예시:

- 고객 데이터베이스 정리 스크립트.
- 결제 API 자동 호출.
- 배포 파이프라인 변경.
- 공개 웹사이트 업데이트.

### ROE Card

```text
Allowed:
- 코드 초안 작성.
- dry-run 설계.
- 테스트 데이터 기반 검증.
- 위험 목록 작성.

Requires approval:
- 실제 데이터 변경.
- 외부 API 호출.
- 배포.
- 비용 발생.

Prohibited:
- 비밀키 출력.
- 승인 없는 삭제.
- 사용자 변경사항 되돌림.
```

### Decision Board

```text
Decision required:
실제 데이터에 스크립트를 실행할지 여부.

Options:
1. dry-run만 실행.
2. 샘플 데이터에 실행.
3. 백업 후 제한 범위 실행.
4. 전체 실행.

Recommendation:
2번 후 결과 확인, 이후 3번 승인 요청.

Risk:
데이터 손상, 비용 발생, 복구 실패.
```

### Assessment

MOP:

- dry-run 구현.
- 로그와 rollback 계획 작성.
- 승인 gate 설정.

MOE:

- 실제 실행 전 위험이 사용자에게 보이는가?
- 실패 시 복구 경로가 있는가?
- 에이전트가 권한 밖 작업을 멈추는가?

## 6. Case 05: 문서 하달형 멀티에이전트 작업

### Mission

상위 사용자의 큰 목표를 하위 에이전트별 작업으로 분해하되, 최종 산출물이 하나의 의도로 통합되게 한다.

### Commander's intent

각 에이전트는 자기 전문 영역에서 자유롭게 판단하되 mission과 intent를 바꾸지 않는다. Chief of Staff가 산출물을 통합한다.

### 하달 구조

```text
User intent
-> Commander OPORD
-> Chief of Staff tasking
-> S2 research order
-> S3 execution order
-> S4 sustainment order
-> Red Team review order
-> Integrated final output
```

### 하위 에이전트 Tasking 예시

S2:

```text
상위 intent를 보존하라.
너의 임무는 결론 작성이 아니라 출처와 불확실성 생산이다.
각 출처마다 핵심 내용과 적용 가능성을 분리하라.
```

S3:

```text
상위 intent를 보존하라.
너의 임무는 실행 가능한 단계와 산출물 구조를 만드는 것이다.
S2의 불확실성을 무시하지 말고 계획에 반영하라.
```

Red Team:

```text
상위 intent를 보존하라.
너의 임무는 직접 수정이 아니라 실패 가능성, 과장, 출처 부족을 찾는 것이다.
각 finding에는 severity와 권고 조치를 붙여라.
```

### AAR

교훈:

- 멀티에이전트 구조에서는 병렬화보다 통합권이 중요하다.
- 각 에이전트에게 같은 commander's intent를 주지 않으면 산출물이 서로 다른 방향으로 간다.
- Red Team은 독립성을 가져야 하지만 최종 통합권을 가져서는 안 된다.

## 7. 관련 문서

- `military-llm-framework-v0.1.md`
- `agent-roles-and-authority.md`
- `sop-library.md`
- `agent-battle-rhythm.md`
- `decision-risk-assessment.md`
- `prompt-templates.md`
- `evaluation-metrics.md`
