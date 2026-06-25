# Knowledge Management SOP

## 0. 목적

군대식 mission command는 "좋은 지휘관이 말로 잘 지시한다"만으로 작동하지 않는다. 공유 이해, 기록, 용어, 지식 저장소, battle rhythm, liaison, AAR가 함께 작동해야 한다.

LLM runtime에서는 대화 기억이 가장 취약한 저장소다. 따라서 장기 작업의 source of truth는 다음에 있어야 한다.

- doctrine docs
- source map
- research compendium
- evidence records
- decision log
- event log
- runtime payloads
- AAR/readiness ledger

이 SOP는 S6 Knowledge 역할과 CoS가 지식관리를 어떻게 운영하는지 정한다.

## 1. 지식관리 원칙

| 원칙 | 설명 | LLM 적용 |
| --- | --- | --- |
| Findable | 필요한 자료를 찾을 수 있어야 함 | README, source-map, links |
| Traceable | 결론이 출처와 연결되어야 함 | evidence record, source reliability |
| Current | 최신 상태가 유지되어야 함 | event replay projection, SITREP |
| Bounded | 아무 정보나 공유하지 않음 | classification, releasability |
| Actionable | 다음 작업자가 실행할 수 있어야 함 | handoff packet, SOP, schema |
| Learnable | AAR가 절차와 훈련으로 환류 | readiness ledger, SOP updates |

## 2. Source of truth hierarchy

| 정보 | source of truth | 보조자료 |
| --- | --- | --- |
| 전체 프레임워크 구조 | `README.md`, `military-llm-framework-v0.1.md` | research compendium |
| 출처와 근거 | `source-map.md`, evidence records | source reliability rubric |
| 현재 mission state | event log projection | dashboard state |
| 권한과 승인 | authority matrix, approval request | tool-use ROE |
| 실행 결과 | validator/test output, AAR | SITREP |
| 다음 작업 큐 | framework doc, research queue | compendium |

대화 기록은 source of truth가 아니다. 대화는 작업 지시와 임시 context다.

## 3. S6 Knowledge 책임

S6는 문서 작성자만이 아니다. S6는 지식흐름의 운영자다.

책임:

- README와 reading order 유지.
- source-map과 research-compendium 갱신.
- evidence와 interpretation 분리.
- decision log와 event log 보존.
- handoff packet 생성.
- classification/releasability metadata 관리.
- AAR에서 나온 SOP 변경 반영.

S6가 승인하지 않는 것:

- 정책 결심.
- Red action 실행.
- source가 없는 사실 단정.
- 민감정보 공개.

## 4. 지식 capture SOP

새 정보가 들어오면:

1. 정보 유형을 분류한다: source, decision, event, evidence, risk, SOP, AAR.
2. classification label을 붙인다.
3. 원문 claim과 LLM interpretation을 분리한다.
4. 관련 mission/task/order id에 연결한다.
5. source-map 또는 compendium에 저장한다.
6. 실행에 영향을 주면 CCIR alert로 올린다.
7. 반복 사용할 지식이면 SOP나 schema에 반영한다.

## 5. Decision log SOP

모든 중요한 결심은 decision log로 남긴다.

```json
{
  "decision_id": "DEC-DEMO-001",
  "mission_id": "M-DEMO-001",
  "decision_type": "approval",
  "decider": "COMMANDER",
  "question": "Allow production deployment?",
  "decision": "reject",
  "rationale": "Demo is local-only and no production approval exists.",
  "scope": "TR-DEMO-002",
  "timestamp": "2026-06-18T11:13:00+09:00",
  "expires_at": "2026-06-18T23:59:59+09:00"
}
```

필수 결심:

- Red action approval/rejection.
- scope change.
- priority change.
- risk acceptance.
- source reliability override.
- authority matrix change.

## 6. Handoff packet

context transition, long-running pause, agent handoff 전에 아래 packet을 만든다.

```text
HANDOFF PACKET:
- mission_id:
- current_order:
- commander_intent:
- completed:
- in_progress:
- blocked:
- pending_decisions:
- active_risks:
- source_of_truth_files:
- verification_status:
- next_actions:
- do_not_do:
```

규칙:

- chat history 없이 재개 가능해야 한다.
- pending approval은 반드시 표시한다.
- Red/Black boundary를 다시 적는다.
- 마지막 verification command와 결과를 적는다.

## 7. Knowledge review rhythm

| Event | Owner | Output |
| --- | --- | --- |
| Daily or phase close KM review | S6 | changed docs, stale links, missing source map entries |
| Source review | S2/S6 | reliability rating and interpretation risk |
| AAR update | Evaluator/S6 | SOP updates and readiness changes |
| Handoff review | CoS/S6 | handoff packet |
| Release review | Commander/S6 | final output safe summary |

## 8. 문서 저장 규칙

규칙:

- 새 개념 문서는 `docs/`에 둔다.
- 실행 가능한 schema는 `schema-files/`에 둔다.
- 예제 payload는 `sample-payloads/` 또는 domain-specific payload directory에 둔다.
- prototype은 별도 `*-prototype/` directory에 둔다.
- README와 source-map을 함께 갱신한다.
- compendium에는 "왜 만들었는지"와 "LLM 적용"을 남긴다.

문서 끝에는 가능한 경우 출처 앵커를 남긴다.

## 9. 품질 gate

문서 변경 후:

- README link check.
- JSON parse check if schema/payload changed.
- validator fixture if validation logic changed.
- source-map entry if new military concept added.
- compendium note if research interpretation added.

지식관리 실패 조건:

- 다음 작업자가 어디서 시작할지 모른다.
- source와 interpretation이 섞여 있다.
- decision이 chat에만 남아 있다.
- 승인 범위가 기록되지 않았다.
- AAR가 SOP/readiness로 환류되지 않았다.

## 10. Prompt guard

```text
작업이 끝나면 KM check를 수행하라.
1. 어떤 파일이 source of truth인가?
2. 새 결심이나 승인 범위가 기록됐는가?
3. source-backed claim과 interpretation이 분리됐는가?
4. README/source-map/compendium 갱신이 필요한가?
5. 다음 작업자가 chat history 없이 이어갈 수 있는가?
```

## 11. 구현 후보

schema:

- `decision-log.schema.json`
- `handoff-packet.schema.json`
- `source-record.schema.json`

prototype:

- `handoff-generator.js`: event projection과 README queue를 묶어 packet 생성.
- `source-map-linter.js`: docs에 새 URL이 있는데 source-map에 없으면 경고.
- `km-review-runner.js`: links, JSON, source-map, compendium checks를 통합.

## 12. 출처 앵커

- Executing Knowledge Management in Support of Mission Command: https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507
- CJCSI 5780.01 Knowledge Management: https://www.jcs.mil/Portals/36/Documents/Library/Instructions/CJCSI%205780.01.pdf
- USFKI 5780.01 Knowledge Management Program: https://www.usfk.mil/Portals/105/Documents/Publications/Instructions/USFKI_5780-01_Knowledge-Management-Program.pdf

## 13. 현 단계 결론

LLM knowledge management의 핵심은 "많이 저장"이 아니다. 결심, 근거, 현재상태, 승인권, 학습이 서로 연결되어 다음 실행을 통제할 수 있어야 한다.

따라서 모든 장기 작업은 다음 네 가지를 남겨야 한다.

1. source map
2. event/decision log
3. current projection
4. AAR/SOP update
