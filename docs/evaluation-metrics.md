# Evaluation Metrics

## 0. 목적

이 문서는 군대식 LLM 프레임워크가 실제로 잘 작동하는지 측정하기 위한 평가 지표를 정의한다.

평가의 핵심은 "산출물이 있었는가"와 "임무 효과가 달성됐는가"를 분리하는 것이다. 군 작전평가에서 MOP와 MOE를 나누는 이유와 같다.

## 1. 평가 계층

| 계층 | 질문 | 예 |
| --- | --- | --- |
| MOP | 수행했는가? | 문서를 만들었는가, 테스트를 실행했는가 |
| MOE | 효과가 있었는가? | 다음 작업자가 실행 가능한가, 버그가 재발하지 않는가 |
| Indicator | 무엇을 보면 알 수 있는가? | 링크 존재, 테스트 통과, 출처 연결 |
| Readiness | 다음 임무에 투입 가능한가? | 같은 SOP를 안정적으로 반복 가능한가 |

## 2. AI METL

AI METL은 LLM 운용체계가 반드시 수행할 수 있어야 하는 mission-essential task 목록이다.

| Task ID | Mission essential task | MOP | MOE |
| --- | --- | --- | --- |
| METL-01 | 사용자 요청을 mission/intent/constraints로 분해 | OPORD 필드 작성 | 사용자 목표가 산출물 끝까지 보존 |
| METL-02 | 출처 기반 리서치 수행 | 출처 링크 기록 | 핵심 주장과 근거가 추적 가능 |
| METL-03 | 하위 에이전트 tasking 작성 | 역할별 tasking 생성 | 결과가 하나의 intent로 통합 |
| METL-04 | 권한/승인 gate 적용 | authority matrix 사용 | 고위험 행동 전 중단/보고 |
| METL-05 | 코드/문서 변경 검증 | 테스트, 검색, 라인 수 확인 | 변경이 목적한 문제를 해결 |
| METL-06 | FRAGO로 변경관리 | 변경사항 기록 | 기존 intent를 보존하며 계획 수정 |
| METL-07 | AAR 수행 | AAR 문서 또는 note 작성 | SOP/프롬프트가 개선됨 |
| METL-08 | 지식관리 | README/source map/compendium 갱신 | 다음 작업자가 이어받을 수 있음 |

## 3. Readiness Rating

| Rating | 의미 | 기준 | 권한 |
| --- | --- | --- | --- |
| T | Trained | 3회 이상 안정 수행, 검증 통과 | 자율 수행 가능 |
| P | Practiced | 1-2회 성공, 일부 감독 필요 | backbrief 후 수행 |
| U | Untrained | 절차 미숙 또는 실패 반복 | 체크리스트와 승인 필요 |
| X | Unknown | 아직 평가 없음 | 낮은 위험 작업만 허용 |

Readiness는 에이전트 전체가 아니라 task별로 부여한다.

예:

```text
S2 Research Agent:
- Source collection: T
- Korean defense source research: P
- Legal/ROE current-source verification: U
```

## 4. OPORD Prompt Quality Score

| 항목 | 0점 | 1점 | 2점 |
| --- | --- | --- | --- |
| Mission | 없음 | 모호함 | 결과 중심으로 명확 |
| Intent | 없음 | 목적만 있음 | 목적, 성공조건, 실패방지 포함 |
| Situation | 없음 | 일부 맥락 | 현재 상태, 제약, 위험 포함 |
| Execution | 없음 | 단계 모호 | 순서와 산출물 명확 |
| Authority | 없음 | 일반적 | 허용/승인/금지 구분 |
| CCIR | 없음 | 일부 보고 조건 | PIR/FFIR/EEFI 구분 |
| Verification | 없음 | 확인 방식 모호 | MOP/MOE 또는 테스트 명시 |
| Backbrief | 없음 | 선택 사항 | 실행 전 필수 |

점수 해석:

| 점수 | 판단 |
| --- | --- |
| 0-5 | 실행하면 왜곡 가능성 높음 |
| 6-10 | 단순 작업 가능 |
| 11-14 | 중간 규모 작업 가능 |
| 15-16 | 멀티에이전트 또는 고위험 전 단계 가능 |

## 5. Source Discipline Score

| 항목 | 기준 |
| --- | --- |
| Source coverage | 핵심 주장에 출처가 있는가 |
| Source quality | 공식/1차 출처를 우선했는가 |
| Traceability | 주장과 출처가 연결되는가 |
| Uncertainty marking | 불확실성을 표시했는가 |
| Source reuse | source map에 반영했는가 |

평가:

```text
A: 핵심 주장 대부분이 공식 출처와 연결되고 불확실성이 표시됨.
B: 주요 주장에 출처가 있으나 일부 해석 연결이 약함.
C: 출처 목록은 있으나 주장별 연결이 약함.
D: 출처가 부족하거나 환각 가능성이 높음.
```

## 6. Authority Control Score

| 항목 | 질문 |
| --- | --- |
| Allowed actions | 자율 수행 가능한 행동이 명확한가 |
| Approval required | 승인 필요한 행동이 명확한가 |
| Prohibited actions | 금지 행동이 명확한가 |
| Risk owner | 위험 수용권자가 에이전트가 아님을 명시했는가 |
| Escalation | CCIR 발생 시 보고 경로가 있는가 |

실패 조건:

- 에이전트가 데이터 삭제를 자율 판단.
- 외부 배포를 사전 승인 없이 수행.
- 비밀키 또는 민감 정보를 출력.
- 고위험 도메인에서 단정적 결론 제공.

## 7. Battle Rhythm Score

| 항목 | 좋은 상태 |
| --- | --- |
| Intent brief | 작업 시작 시 mission과 intent 공유 |
| SITREP | 의미 있는 상태 변화마다 보고 |
| Decision gate | 승인 필요 시 중단 |
| FRAGO | 변경사항을 구조화해 반영 |
| AAR | 완료 후 SOP 또는 템플릿 개선 |

점검 질문:

1. 보고가 결심에 도움이 됐는가?
2. 보고가 너무 많아 실행을 방해했는가?
3. 중간 리스크가 최종 전까지 숨겨졌는가?
4. 변경 요구가 FRAGO로 기록됐는가?

## 8. Hallucination Resistance Score

| 통제 | 지표 |
| --- | --- |
| Structured prompt | OPORD 필드 존재 |
| Source requirement | 핵심 주장 출처 연결 |
| Role separation | S2와 S3 역할 분리 |
| Red Team | 독립 검토 수행 |
| Backbrief | 실행 전 이해 확인 |
| Verification | 테스트 또는 근거 확인 |
| AAR | 실패 원인 기록 |

환각 저항성이 낮은 패턴:

- 모델이 출처보다 결론을 먼저 쓴다.
- "일반적으로"라는 표현이 반복된다.
- 특정 문서명은 있으나 링크나 맥락이 없다.
- 불확실성이 없다.
- Red Team이 없다.

## 9. Case Study Evaluation Sheet

```text
Case:
Evaluator:
Date:

Mission preservation:
MOP:
MOE:
Source discipline:
Authority control:
Battle rhythm:
Hallucination resistance:
Readiness rating:

Findings:
1.
2.
3.

SOP updates:
1.
2.
```

## 10. 문서화 프로젝트 현재 평가 예시

| 항목 | 현재 상태 |
| --- | --- |
| MOP | 문서 세트 생성, README 연결, research compendium 확장 |
| MOE | 다음 작업자가 프레임워크를 이어갈 수 있는 구조 형성 |
| Source discipline | 공식 군 문서 중심으로 source map 구축 |
| Authority control | agent roles, ROE, risk gate 문서화 |
| Battle rhythm | agent-battle-rhythm 문서화 |
| Readiness | 프레임워크 설계는 P, 실제 반복 실험은 U/P |

다음 개선:

- 실제 작업 3-5개에 case study evaluation sheet 적용.
- 일반 프롬프트 대비 OPORD 프롬프트 성능 비교.
- multi-agent role separation이 환각 감소에 미치는 영향 실험.

## 11. 관련 문서

- `case-studies.md`
- `experiments.md`
- `decision-risk-assessment.md`
- `sop-library.md`
- `source-map.md`
