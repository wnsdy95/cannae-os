# Agent Readiness Ledger

## 0. 목적

이 문서는 에이전트별 임무 수행 준비태세(readiness)를 기록하고 갱신하는 방법을 정의한다.

군대에서 readiness는 "잘할 것 같다"가 아니라 특정 mission-essential task를 수행할 수 있다는 증거 기반 판단이다. LLM 에이전트도 역할별로 무엇을 안정 수행할 수 있는지 기록해야 한다.

## 1. Readiness 등급

| Rating | 의미 | 운용 권한 |
| --- | --- | --- |
| T | Trained | 자율 수행 가능 |
| P | Practiced | backbrief 후 수행 |
| U | Untrained | 체크리스트와 감독 필요 |
| X | Unknown | 낮은 위험 작업만 허용 |

## 2. Ledger Entry

```yaml
readiness:
  id: RL-001
  agent_id: S2
  task: "public source research"
  rating: T
  evidence:
    - "3회 이상 공식 출처 기반 리서치 완료"
    - "source map 누락 없음"
  limitations:
    - "한국군 세부 교리 공개자료는 제한"
  updated_at: "2026-06-18T00:00:00+09:00"
  next_training: "KIDA 자료 검색과 분류"
```

## 3. AI METL 연결

| METL | 담당 | Readiness evidence |
| --- | --- | --- |
| 사용자 요청 OPORD 변환 | Commander/S3 | valid OPORD, no missing intent |
| 출처 기반 리서치 | S2 | evidence records, source map |
| 작업 sequencing | S3 | task order, verification |
| 도구 권한 통제 | S3/Tool Gateway | tool request log |
| 문서 지식관리 | S6 | README, compendium update |
| 독립 검토 | Red Team | findings with severity |
| 평가 | Evaluator | MOP/MOE sheet |
| 사후학습 | CoS/S6 | AAR and SOP update |

## 4. Readiness Update Rules

등급 상승:

- 같은 task를 3회 성공.
- 검증 실패 없음.
- AAR에서 sustain으로 분류.
- Red Team critical finding 없음.

등급 하락:

- 같은 오류 2회 반복.
- 출처 없는 주장.
- 승인 없는 tool action 시도.
- 테스트 실패 은폐.
- 사용자 의도 재정의.

등급 보류:

- task 범위가 바뀜.
- 새로운 도구 사용.
- 새로운 도메인.
- 외부 시스템 영향 증가.

## 5. 에이전트별 초기 Ledger

| Agent | Task | Initial rating | 근거 |
| --- | --- | --- | --- |
| Commander | mission/intent 분해 | P | 문서 체계는 있으나 실제 반복 실험 필요 |
| CoS | task integration | P | 문서화 사례 있음, 런타임 실험 필요 |
| S2 | public source research | P | 공식 출처 기반 문서화 수행 |
| S2 | Korean source research | P/U | 자료 한계 명시, 더 깊은 국내 논문 필요 |
| S3 | markdown implementation | T | 다수 문서 작성과 색인 연결 |
| S4 | sustainment estimate | P | 개념 문서 있음, 자동 측정 없음 |
| S6 | knowledge management | T | README, compendium, source map 유지 |
| Red Team | independent review | U | 별도 독립 실행 사례 부족 |
| Evaluator | MOP/MOE evaluation | P | evaluation metrics 있음, 실험 데이터 부족 |

## 6. Readiness Gate

task를 배정하기 전 확인한다.

```text
if readiness == T:
  allow autonomous execution within ROE
if readiness == P:
  require backbrief
if readiness == U:
  require checklist and supervision
if readiness == X:
  assign only low-risk support task
```

## 7. Training Plan

| Agent | Training task | Method | Success |
| --- | --- | --- | --- |
| S2 | 국내 국방자료 deep research | source map exercise | A/B급 출처 10개 분류 |
| S3 | prompt DSL compiler | implementation prototype | valid OPORD 생성 |
| S4 | token/tool sustainment | long-running simulation | context loss 없이 완료 |
| Red Team | hallucination detection | blind review | unsupported claims 탐지 |
| Evaluator | experiment scoring | case study scoring | scorer consistency 확보 |

## 8. AAR 연결

AAR가 끝나면 readiness ledger를 갱신한다.

```text
What task was performed?
Was verification passed?
Were there critical findings?
Did the agent stay within ROE?
Was user intent preserved?
Should readiness rise, stay, or fall?
```

구현 산출물:

- `aar-to-readiness-update.js`: AAR payload를 readiness recommendation, maintenance action, SOP update, CCIR trigger로 변환.
- `schema-files/aar-readiness-update.schema.json`: AAR readiness update contract.
- `run-aar-readiness-update-fixtures.js`: normal improvement, critical source failure, sustain-only AAR 분기 검증.

## 9. 관련 문서

- `evaluation-metrics.md`
- `experiments.md`
- `agent-runtime-playbook.md`
- `military-ai-risk-register.md`
- `schema-files/readiness-ledger.schema.json`
