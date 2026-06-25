# Source Reliability Rubric

## 0. 목적

이 문서는 군대식 LLM 프레임워크에서 출처 신뢰도를 평가하는 기준을 정의한다.

환각 방지는 "출처를 붙인다"로 끝나지 않는다. 출처의 권위, 최신성, 직접성, 적용 범위, 해석 위험을 함께 평가해야 한다.

## 1. 등급

| Grade | 의미 | 사용 |
| --- | --- | --- |
| A | 공식 1차 출처 | 핵심 근거 |
| B | 공식 연구/학술/전문기관 | 보완 근거 |
| C | 교육자료/기사/현장 자료 | 사례와 맥락 |
| D | 비공식 요약/블로그/커뮤니티 | 가설 또는 검색 단서 |
| X | 불명확/검증 실패 | 사용하지 않음 |

## 2. 평가 차원

| 차원 | 질문 |
| --- | --- |
| Authority | 누가 발행했는가? |
| Directness | 주장과 직접 관련 있는가? |
| Currency | 최신성이 충분한가? |
| Stability | 자주 바뀌는 정보인가? |
| Scope | 이 출처의 적용 범위는 어디까지인가? |
| Interpretive risk | LLM 적용 해석에서 비약이 있는가? |
| Accessibility | 다음 작업자가 다시 확인 가능한가? |

## 3. 등급 기준

### A급

예:

- 공식 군 교리 문서.
- 법령/훈령 원문.
- 공식 표준.
- 공식 정책 발표.

조건:

- 발행 주체가 명확함.
- 원문 접근 가능.
- 주장과 직접 연결.
- 날짜 또는 버전 확인 가능.

### B급

예:

- 국방연구기관 보고서.
- peer-reviewed 논문.
- 공식 연구기관 해설자료.

조건:

- 전문성 있음.
- 직접 원문은 아니지만 분석 가치 있음.
- 정책/개념 해석에 적합.

### C급

예:

- 군 교육자료.
- 현장 기사.
- 컨퍼런스 발표.
- 비공식이지만 출처가 명확한 실무 자료.

조건:

- 사례로는 유용.
- 핵심 교리 근거로 쓰기에는 약함.

### D급

예:

- 블로그.
- 요약글.
- 커뮤니티.
- 출처 없는 2차 인용.

조건:

- 검색 단서로만 사용.
- 결론 근거로 사용 금지.

### X급

예:

- 링크 사라짐.
- 출처 주체 불명.
- 조작 가능성.
- 원문 확인 불가.

조건:

- 사용하지 않는다.
- 필요하면 "확인 실패"로 기록한다.

## 4. Evidence Record에 넣을 필드

```yaml
reliability:
  grade: A
  authority: "official doctrine"
  directness: "direct"
  currency: "current enough for framework use"
  scope: "US Army doctrine, not Korean doctrine"
  interpretive_risk: "medium"
  note: "LLM application is an analogy, not source claim."
```

## 5. LLM 적용 해석 분리

출처 claim:

```text
Mission command emphasizes commander's intent.
```

LLM interpretation:

```text
LLM agents should receive explicit intent before autonomous execution.
```

금지:

```text
ADP 6-0 says LLM agents need explicit intent.
```

## 6. 한국 자료 특수 기준

한국군 공개자료는 다음처럼 평가한다.

| 자료 | 기본 등급 | 주의 |
| --- | --- | --- |
| 법령/훈령 | A | 실제 적용은 법률 자문 아님 |
| 국방부 정책자료 | A/B | 정책 방향 근거, 세부 절차 근거 아님 |
| KIDA 연구자료 | B | 분석 근거, 공식 명령 아님 |
| 언론 기사 | C | 사례로만 사용 |
| 블로그/요약 | D | 검색 단서 |

## 7. Red Team Source Check

Red Team은 다음을 확인한다.

1. 핵심 주장에 A/B급 출처가 있는가?
2. C/D급 출처가 핵심 결론에 쓰였는가?
3. 출처 claim과 LLM interpretation이 섞였는가?
4. 최신성이 필요한 정보가 오래됐는가?
5. 한국군과 미군 교리를 부정확하게 동일시했는가?
6. 링크가 재검증 가능한가?

## 8. 관련 문서

- `research-compendium.md`
- `source-map.md`
- `korean-military-sources.md`
- `validator-prototype.md`
- `evaluation-fixtures.md`
