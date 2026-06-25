# Context Releasability Policy

## 0. 목적

멀티에이전트 LLM 운용에서 context 공유는 기본값이 아니다. 군대식 OPSEC와 need-to-know 원리를 적용하면, 각 role은 임무 수행에 필요한 정보만 받아야 한다.

이 문서는 classification, EEFI, role, mission need를 결합해 context packet을 어떻게 필터링할지 정한다.

핵심 원칙:

- 모든 에이전트에게 전체 context를 주지 않는다.
- 민감정보는 원문 대신 reference id, redacted summary, decision state로 전달한다.
- final output은 release review를 통과한 정보만 포함한다.
- Red Team에도 secret 원문은 주지 않는다. 공격경로 검토에는 redacted abstraction을 우선한다.

## 1. Context item model

context item은 최소 아래 필드를 가진다.

```json
{
  "item_id": "CTX-DEMO-001",
  "mission_id": "M-DEMO-001",
  "classification": "sensitive",
  "eeFI": false,
  "source": "event-fixtures/demo-events.json",
  "summary": "TR-DEMO-002 is blocked pending commander approval.",
  "raw_value": "redacted unless need-to-know",
  "allowed_roles": ["COMMANDER", "COS", "S6"],
  "release_to_final": false,
  "retention": "project"
}
```

권장 구현에서는 `raw_value`를 기본 context packet에 넣지 않는다. 필요할 때만 source-of-truth 파일에서 권한 검사를 거쳐 읽는다.

## 2. Role별 releasability

| Role | 기본 접근 | 제한 |
| --- | --- | --- |
| Commander | 결심에 필요한 모든 summary와 decision packet | secret raw value는 원칙적으로 redacted |
| CoS | tasking, risk, pending decision, current projection | restricted raw value 금지 |
| S2 | source, evidence, PIR 관련 자료 | credential, private user data 원문 금지 |
| S3 | task order, tool request, current ops state | sensitive source detail은 필요 시 요약 |
| S4 | resource, token budget, tool availability | secret value 없이 availability만 |
| S6 | docs, event log, evidence metadata, releasability labels | restricted raw value는 별도 approval |
| Red Team | assumptions, failure modes, policy boundary | exploitable secret/path 원문 금지 |
| Evaluator | outputs, tests, AAR, readiness evidence | 민감값은 redacted evidence로 |
| Final Output | 사용자에게 공개 가능한 결과 | sensitive/restricted 원문 금지 |

## 3. Classification action table

| Classification | Internal context | Cross-agent context | Final output | External tool |
| --- | --- | --- | --- | --- |
| public | 허용 | 허용 | 허용 | 허용 |
| internal | 허용 | role 필요 시 허용 | 요약 허용 | 주의 |
| sensitive | need-to-know | redacted summary | 원칙적 redaction | Red |
| restricted | 제한 | 금지 또는 reference id | 금지 | Black/Red |

## 4. EEFI 처리

EEFI는 다음 중 하나로 전달한다.

| 원본 | 전달 방식 |
| --- | --- |
| API key/token/password/private key | 전달 금지. `EEFI_DETECTED` alert만 |
| private user data | 목적에 필요한 최소 summary |
| production target detail | approval packet에는 target class, exact target은 commander-only |
| vulnerability detail | Red Team에는 abstract failure mode, exploit detail 제거 |
| legal/policy uncertainty | source id와 open question으로 전달 |

EEFI가 감지되면:

1. raw output을 중단한다.
2. CCIR alert를 생성한다.
3. source-of-truth에는 redacted record만 저장한다.
4. 필요한 경우 commander release review를 요청한다.

## 5. Context packet 생성 절차

1. Mission/task에 필요한 role을 확인한다.
2. 각 context item에 classification과 EEFI 여부를 붙인다.
3. role별 allowed_roles와 purpose를 비교한다.
4. raw, summary, redacted, reference-only 중 전달 방식을 선택한다.
5. 전달된 packet id를 event log에 남긴다.
6. final output 전에 release review를 수행한다.

## 6. Delivery modes

| Mode | 의미 | 사용 |
| --- | --- | --- |
| raw | 원문 전달 | public/internal, need-to-know |
| summary | 요약 전달 | internal/sensitive |
| redacted | 민감 필드 제거 | sensitive/restricted metadata |
| reference_only | 파일/id만 전달 | restricted, commander-only |
| denied | 전달 금지 | EEFI, Black |

## 7. Policy examples

S3에게 전달:

```json
{
  "role": "S3",
  "allowed": [
    "task order",
    "tool request id",
    "policy decision",
    "blocked status"
  ],
  "redacted": [
    "credential value",
    "private user data",
    "unapproved production secret"
  ]
}
```

Red Team에게 전달:

```json
{
  "role": "RED_TEAM",
  "allowed": [
    "assumption list",
    "risk controls",
    "approval boundary",
    "abstract attack path"
  ],
  "denied": [
    "secret raw value",
    "private key",
    "step-by-step exploit against live target"
  ]
}
```

Final output:

```json
{
  "release_to_final": true,
  "allowed": [
    "public source links",
    "local file paths in shared workspace",
    "verification summaries"
  ],
  "denied": [
    "credentials",
    "private data",
    "unapproved sensitive internal detail"
  ]
}
```

## 8. Context filter pseudo-code

```text
for each context_item:
  if item.classification == restricted:
    if role is not explicitly allowed:
      deliver reference_only or denied
  if item.EEFI:
    deliver denied and create EEFI alert
  if role not in allowed_roles:
    deliver summary or denied
  if target is final_output and release_to_final is false:
    deliver denied
  else:
    deliver raw or summary based on classification
```

## 9. Interaction with authority matrix

Context releasability and tool authority are separate gates.

- Releasability answers: "Can this role see or receive this information?"
- Authority answers: "Can this role act with this tool on this target?"
- Document access answers: "Can this role open this source document for this duty?"

Both must pass.

Example:

- S3 may know that production deployment is blocked.
- S3 may not receive credentials.
- S3 may request approval for deployment.
- S3 may not execute deployment without approval.

## 10. Required alerts

Create CCIR alert when:

- restricted item is requested by a role without releasability.
- EEFI appears in prompt, output, query, log, or tool target.
- final output attempts to include sensitive/restricted data.
- Red Team request asks for exploit detail against live target.
- external tool would receive sensitive context.

## 11. Verification checklist

Before sending context to an agent:

- Is the role allowed to receive raw content?
- Is summary enough?
- Is the item EEFI?
- Will this context be sent to an external tool?
- Does final output need release review?
- Is the transfer logged?

## 12. 구현 후보

schema:

- `context-item.schema.json`
- `document-access-manifest.schema.json`
- `context-release.schema.json`
- `release-review.schema.json`

prototype:

- `document-access-runner.js`: role, duty, authority and manifest -> allowed/denied document list.
- `context-filter.js`: role and context items -> filtered packet.
- `release-review-runner.js`: final output packet safety check.
- `eefi-detector.js`: secret/private pattern and classification guard.

## 13. 출처 앵커

- Joint OPSEC Support Element, Operations Security: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/Joint-OPSEC/
- Joint Staff CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf

## 14. 현 단계 결론

LLM context는 보급품이 아니라 정보자산이다. 필요한 사람에게 필요한 양만, 필요한 시간 동안, 필요한 형식으로 전달해야 한다.

이 정책은 멀티에이전트 시스템의 hallucination 통제와 보안 통제를 같은 구조로 묶는다. 출처 없는 정보는 evidence gate에서 막고, 민감한 정보는 releasability gate에서 막는다.
