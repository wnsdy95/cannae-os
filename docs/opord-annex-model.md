# OPORD Annex Model

## 0. 목적

이 문서는 OPORD 본문과 annex를 LLM 운용 문서 체계로 변환한다.

OPORD 본문은 commander-facing contract다. Annex는 전문 영역별 세부 계획이다. 둘을 구분해야 명령이 짧고, 검증 가능하고, 하위 에이전트가 자기 역할에 필요한 세부사항만 받을 수 있다.

## 1. 핵심 원칙

| 원칙 | 설명 |
| --- | --- |
| Body is command | OPORD 본문은 intent, mission, execution concept, authority를 고정한다 |
| Annex is detail | 전문 영역 세부사항은 annex로 분리한다 |
| Annex owner exists | 각 annex에는 책임 role이 있다 |
| Annex must link to OPORD | annex는 parent_order와 mission_id를 가져야 한다 |
| Annex cannot change intent | intent 변경은 annex가 아니라 FRAGO 영역이다 |
| Annex is releasable by need-to-know | 모든 에이전트가 모든 annex를 볼 필요는 없다 |

## 2. OPORD 본문에 남길 것

OPORD 본문은 하위 에이전트 전체가 공유해야 하는 최소 공통 이해다.

| OPORD paragraph | LLM field | 내용 |
| --- | --- | --- |
| Situation | `situation` | 배경, 사실, 가정, 제약 |
| Mission | `mission` | 작업 문장, target end state |
| Execution | `execution` | 전체 concept, task order, coordinating instructions |
| Sustainment | `sustainment` | 도구, context budget, fallback |
| Command and Signal | `command_and_signal` | authority, CCIR, report trigger |
| Assessment | `assessment` | MOP, MOE, verification |

본문은 "무엇을 왜 해야 하는가"를 고정한다. "어떤 파일을 몇 줄 고치는가", "어떤 출처를 어떤 신뢰도로 평가하는가", "어떤 API fallback을 쓸 것인가"는 annex로 내려보낸다.

## 3. LLM Annex Set

| Annex | Owner | 목적 | 포함 내용 |
| --- | --- | --- | --- |
| Annex A Source Plan | S2 | 출처와 불확실성 통제 | source list, reliability, claim/interpretation split |
| Annex B Execution Plan | S3 | 실행 순서 통제 | task sequence, dependencies, verification commands |
| Annex C Tool/ROE Plan | S3/S6 | 도구 권한 통제 | allowed/approval/prohibited, rollback, dry run |
| Annex D Sustainment Plan | S4/S6 | 자원 지속성 | token/time/tool availability, fallback, maintenance readiness |
| Annex E OPSEC/Releasability | S6/Recorder | context 공유 통제 | classification, EEFI, allowed roles, release review |
| Annex F Risk and Red Team | Red Team | 실패 모드 통제 | risks, mitigations, residual risk, decision packets |
| Annex G Assessment Plan | Evaluator | 효과 평가 | MOP, MOE, indicators, evidence requirements |
| Annex H Handoff/Audit | Recorder | 장기 기억 통제 | event log, source-of-truth files, handoff packet |

## 4. Annex 생성 기준

Annex를 만드는 기준:

- 본문에 넣으면 OPORD가 길어져 intent가 흐려진다.
- 특정 role만 알아야 하는 세부사항이다.
- 위험, 출처, 도구, 보안, 검증처럼 별도 owner가 필요하다.
- 변경 시 본문 전체를 다시 쓰지 않고 독립 갱신해야 한다.

Annex를 만들지 말아야 할 경우:

- 단일 Green action이고 실행자와 검증자가 동일하다.
- 추가 정보가 commander decision에 영향을 주지 않는다.
- 정보가 이미 OPORD 본문에 충분히 명확하다.

## 5. Annex Contract

Annex 최소 필드:

```json
{
  "schema_version": "0.1",
  "type": "ANNEX",
  "annex_code": "A",
  "mission_id": "M-DEMO-001",
  "parent_order": "OPORD-DEMO-001",
  "owner": "S2",
  "classification": "internal",
  "purpose": "Control source reliability and uncertainty.",
  "inputs": [],
  "outputs": [],
  "constraints": [],
  "ccir_links": [],
  "verification": [],
  "updated_at": "2026-06-18T16:30:00+09:00"
}
```

현재 저장소에는 `schema-files/annex.schema.json`과 `schema-files/frago-scope-change.schema.json`이 있다. annex schema는 전문 세부계획을 OPORD에 연결하되 intent/authority 변경을 금지하고, FRAGO scope-change schema는 mission scope나 authority boundary 변경을 명시적으로 분리한다.

## 6. OPORD와 Annex 관계

```text
OPORD
  -> Annex A Source Plan
  -> Annex B Execution Plan
  -> Annex C Tool/ROE Plan
  -> Annex D Sustainment Plan
  -> Annex E OPSEC/Releasability
  -> Annex F Risk/Red Team
  -> Annex G Assessment
  -> Annex H Handoff/Audit
      -> Task Orders
          -> Backbriefs
              -> Rehearsal
                  -> Execution
```

## 7. Need-to-Know Routing

Annex는 context releasability policy를 따른다.

| Role | 기본 접근 |
| --- | --- |
| Commander | 모든 annex summary, Red/Black detail when decision needed |
| CoS | 모든 annex raw 또는 summary |
| S2 | Source annex raw, OPSEC annex summary |
| S3 | Execution/tool/risk annex raw |
| S4 | Sustainment annex raw |
| S6 | Tool/OPSEC/handoff annex raw |
| Red Team | Risk annex raw, source/tool summary |
| Evaluator | Assessment annex raw, execution evidence summary |
| Final Output | public/released summary only |

## 8. FRAGO와 Annex 변경

Annex 변경이 항상 FRAGO는 아니다.

| 변경 유형 | 처리 |
| --- | --- |
| 출처 하나 추가 | Annex A update |
| 검증 명령 추가 | Annex B/G update |
| fallback tool 변경 | Annex D update |
| EEFI classification 변경 | Annex E update, release review 필요 |
| mission purpose 변경 | FRAGO |
| authority boundary 변경 | FRAGO 또는 approval scope update |
| risk acceptance 필요 | decision packet |

원칙: OPORD intent, mission, authority, priority를 바꾸면 FRAGO다. 전문 계획의 세부 실행만 바꾸면 annex update다.

## 9. Annex Anti-Patterns

피해야 할 패턴:

- annex가 OPORD intent를 조용히 바꿈.
- 모든 annex를 모든 에이전트에게 raw로 전달.
- annex owner가 없는 상태로 세부 계획이 방치됨.
- Red Team annex가 실행 명령처럼 쓰임.
- source annex가 claim과 interpretation을 섞음.
- assessment annex가 output count만 측정하고 effect를 측정하지 않음.

## 10. 구현 상태와 향후 Schema 후보

구현된 schema:

- `annex.schema.json`
- `frago-scope-change.schema.json`

추가 후보:

- `source-plan.schema.json`
- `verification-plan.schema.json`

검증 규칙:

- annex가 OPORD intent를 변경하면 `ANNEX_CHANGES_INTENT`.
- annex가 authority boundary를 변경하면 `ANNEX_CHANGES_AUTHORITY`.
- FRAGO scope change가 변경 세부사항, affected role, backbrief, rehearsal 없이 발행되면 차단.
- authority boundary 변경 FRAGO는 Commander issue 또는 approval이 필요하다.

## 11. 출처 앵커

- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- STANAG 2014, Formats for Orders: https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507

## 12. 관련 문서

- `orders-production-pipeline.md`
- `context-releasability-policy.md`
- `opsec-classification-model.md`
- `decision-risk-assessment.md`
- `maintenance-readiness-model.md`
