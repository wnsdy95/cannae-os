# LLM Agent Org Chart

## 0. 목적

이 문서는 군대식 LLM 운용에서 에이전트 조직도, 지휘관계, 보고선, 승인선을 정의한다.

멀티에이전트의 문제는 에이전트 수가 부족한 것이 아니다. 누가 목적을 보존하고, 누가 결정을 내리고, 누가 근거를 만들고, 누가 검토하며, 누가 최종 통합하는지가 불명확한 것이 문제다.

핵심 원칙:

```text
에이전트 조직도는 사람 흉내가 아니라
권한, 책임, 보고, 통합을 명확히 하기 위한 구조다.
```

## 1. 기본 조직도

```text
User / Human Commander
        |
        v
AI Commander / Orchestrator
        |
        v
Chief of Staff / Integrator
        |
        +-- S2 Intelligence Agent
        +-- S3 Operations Agent
        +-- S4 Sustainment Agent
        +-- S6 Knowledge / Signal Agent
        +-- Red Team Agent
        +-- Evaluator / Assessment Agent
```

## 2. 지휘관계

| 관계 | 의미 | LLM 적용 |
| --- | --- | --- |
| Command | 최종 의도와 승인권 | User 또는 AI Commander |
| Control | 실행 범위와 우선순위 조정 | Chief of Staff |
| Support | 특정 기능으로 임무 지원 | S2, S4, S6, Red Team |
| Coordinating | 동등 기능 간 조정 | S2-S3, S3-S6 |
| Review | 독립 검토 | Red Team, Evaluator |

## 3. 역할별 책임

### User / Human Commander

책임:

- 최종 목적 제시.
- 고위험 행동 승인.
- 위험 수용.
- 최종 산출물 승인.

하지 않는 일:

- 모든 세부 실행 직접 지시.
- 출처 검증 직접 수행.
- 하위 에이전트 간 조정 전부 수행.

### AI Commander / Orchestrator

책임:

- 사용자 요청을 mission과 intent로 변환.
- 권한과 ROE를 적용.
- task order 발행.
- decision gate에서 사용자 승인을 요청.

권한:

- 낮은 위험 작업 지시.
- 하위 에이전트 tasking.
- SITREP 통합.

제한:

- 위험 수용권 없음.
- 외부 배포, 비용 발생, 데이터 삭제 승인 불가.

### Chief of Staff / Integrator

책임:

- 하위 에이전트 작업 동기화.
- battle rhythm 운영.
- 중복 작업 제거.
- 최종 산출물 통합.

핵심 산출물:

- task board.
- SITREP summary.
- integration memo.
- final synthesis.

### S2 Intelligence Agent

책임:

- 리서치.
- 출처 신뢰도 평가.
- 불확실성 표시.
- PIR 관리.
- source map 갱신.

금지:

- 근거 없는 결론 단정.
- 정책/법률/군사 실무 판단을 최종 결정처럼 작성.

### S3 Operations Agent

책임:

- 실행계획 작성.
- 작업 sequencing.
- 프롬프트/문서/코드 실행.
- FRAGO 반영.

핵심 산출물:

- execution plan.
- maneuver plan.
- task order.
- implementation output.

### S4 Sustainment Agent

책임:

- 토큰, 시간, 도구, 의존성, API, 테스트 환경 점검.
- 장기 작업 checkpoint 설계.
- 병목과 대체 경로 제시.

핵심 산출물:

- sustainment estimate.
- dependency report.
- fallback plan.

### S6 Knowledge / Signal Agent

책임:

- 문서 위치와 링크 관리.
- decision log, AAR, source map 유지.
- context packet 작성.
- 에이전트 간 정보 형식 통일.

핵심 산출물:

- README update.
- knowledge base.
- context brief.
- glossary update.

### Red Team Agent

책임:

- 환각, 과장, 출처 부족, 보안 위험, 권한 위반 탐지.
- 독립 findings 작성.

금지:

- 최종 산출물 직접 통합.
- 지휘관 의도 재정의.
- 검토 없이 자기 수정안을 정답으로 확정.

### Evaluator / Assessment Agent

책임:

- MOP/MOE 평가.
- readiness rating.
- experiment result 기록.
- AAR 입력 제공.

핵심 산출물:

- evaluation sheet.
- metrics report.
- readiness update.

## 4. RACI Matrix

| 활동 | User | Commander | CoS | S2 | S3 | S4 | S6 | Red Team | Evaluator |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mission 정의 | A | R | C | I | I | I | I | I | I |
| OPORD 작성 | C | A/R | C | C | C | C | C | I | I |
| 출처 조사 | I | C | C | A/R | I | I | C | C | I |
| 실행계획 | I | A | C | C | R | C | C | C | I |
| 도구 사용 | I | A | C | I | R | C | C | I | I |
| 승인 필요 판단 | A | R | C | C | C | C | C | C | I |
| 문서 통합 | I | A | R | C | C | C | C | C | I |
| Red Team 검토 | I | C | C | C | C | I | C | R | C |
| 평가 | I | A | C | C | C | C | C | C | R |
| AAR | A | R | R | C | C | C | C | C | C |

범례:

- R: Responsible.
- A: Accountable.
- C: Consulted.
- I: Informed.

## 5. 보고선

```text
S2/S3/S4/S6/Red Team/Evaluator
-> Chief of Staff
-> AI Commander
-> User / Human Commander
```

CCIR 발생 시:

```text
Any Agent
-> AI Commander
-> User if approval/risk decision required
```

Red Team critical finding:

```text
Red Team
-> AI Commander and Chief of Staff simultaneously
-> User if high risk
```

## 6. Commander's Critical Information Requirements

모든 에이전트가 즉시 보고해야 하는 정보:

- mission 또는 intent 불일치.
- 공식 출처 확인 실패.
- 출처 간 핵심 충돌.
- 테스트 실패.
- 도구 권한 부족.
- 민감정보 발견.
- 비용 발생 가능성.
- 데이터 삭제/변경 가능성.
- 기존 사용자 변경사항과 충돌.
- 사용자의 추가 결심 필요.

## 7. 조직 규모별 변형

### 7.1 Single-Agent Mode

한 에이전트가 모든 역할을 순서대로 수행한다.

```text
Commander view
-> S2 view
-> S3 view
-> S4 view
-> S6 view
-> Red Team view
-> Evaluator view
```

적용:

- 짧은 문서 작업.
- 단일 파일 수정.
- 작은 리서치.

### 7.2 Small Staff Mode

```text
Commander
-> Research/Intelligence
-> Operations/Writer
-> Reviewer
```

적용:

- 중간 규모 문서화.
- 간단한 코드 구현.
- 출처 기반 답변.

### 7.3 Full Staff Mode

기본 조직도를 모두 사용한다.

적용:

- 장기 리서치.
- 멀티에이전트 구현.
- 고위험 자동화.
- 외부 공개 산출물.

## 8. 조직도 설계 Anti-Patterns

| Anti-pattern | 문제 | 교정 |
| --- | --- | --- |
| 모든 에이전트가 Commander | 의도 충돌 | 하나의 통합권자 |
| Red Team이 최종 작성자 | 독립성 손상 | finding만 작성 |
| S2가 결론 결정 | 정보와 지휘 혼선 | S2는 근거와 불확실성 담당 |
| S3가 출처 무시 | 실행은 되나 환각 증가 | evidence gate |
| S6 부재 | 문서와 기억 손실 | knowledge owner 지정 |
| User에게 모든 판단 요청 | 승인 병목 | risk-based delegation |

## 9. 에이전트 신설/해체 기준

에이전트를 새로 만든다:

- 같은 유형 작업이 3회 이상 반복됨.
- 특정 전문 기능이 계속 병목.
- 독립 검토가 필요.
- 권한/보안상 분리가 필요.

에이전트를 해체하거나 병합한다:

- 역할 산출물이 중복됨.
- 조정 비용이 산출물 품질보다 큼.
- task volume이 적음.
- 책임과 권한이 불명확함.

## 10. 관련 문서

- `agent-roles-and-authority.md`
- `agent-battle-rhythm.md`
- `implementation-guide.md`
- `tool-use-roe.md`
- `evaluation-metrics.md`
