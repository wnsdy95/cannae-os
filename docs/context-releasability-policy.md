# Context Releasability Policy

## 0. Purpose

In multi-agent LLM operations, context sharing is not the default. Applying military-style OPSEC and need-to-know principles, each role should receive only the information required to perform its mission.

This document defines how classification, EEFI, role, and mission need are combined to filter context packets.

Core principles:

- Do not give the full context to every agent.
- Sensitive information is delivered as a reference id, redacted summary, or decision state instead of the raw text.
- Final output includes only information that has passed release review.
- Do not give the Red Team the raw text of secrets either. Prefer redacted abstraction for attack-path review.

## 1. Context item model

A context item has at minimum the fields below.

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

In the recommended implementation, `raw_value` is not placed in the default context packet. It is read from the source-of-truth file, subject to an authorization check, only when needed.

## 2. Releasability by role

| Role | Default access | Restriction |
| --- | --- | --- |
| Commander | All summaries and decision packets needed for a decision | Secret raw values are redacted in principle |
| CoS | Tasking, risk, pending decisions, current projection | Restricted raw values are prohibited |
| S2 | Source, evidence, PIR-related material | Raw credentials and private user data are prohibited |
| S3 | Task order, tool request, current ops state | Sensitive source detail is summarized when necessary |
| S4 | Resource, token budget, tool availability | Availability only, without secret values |
| S6 | Docs, event log, evidence metadata, releasability labels | Restricted raw values require separate approval |
| Red Team | Assumptions, failure modes, policy boundary | Raw exploitable secrets/paths are prohibited |
| Evaluator | Outputs, tests, AAR, readiness evidence | Sensitive values are provided as redacted evidence |
| Final Output | Results releasable to the user | Raw sensitive/restricted content is prohibited |

## 3. Classification action table

| Classification | Internal context | Cross-agent context | Final output | External tool |
| --- | --- | --- | --- | --- |
| public | Allowed | Allowed | Allowed | Allowed |
| internal | Allowed | Allowed when the role needs it | Summary allowed | Caution |
| sensitive | Need-to-know | Redacted summary | Redaction in principle | Red |
| restricted | Restricted | Prohibited or reference id only | Prohibited | Black/Red |

## 4. EEFI handling

EEFI is delivered using one of the following methods.

| Source | Delivery method |
| --- | --- |
| API key/token/password/private key | Delivery prohibited. `EEFI_DETECTED` alert only |
| private user data | Minimum summary necessary for the purpose |
| production target detail | Approval packet contains only the target class; the exact target is commander-only |
| vulnerability detail | Red Team receives an abstract failure mode with exploit detail removed |
| legal/policy uncertainty | Delivered as a source id and an open question |

When EEFI is detected:

1. Halt the raw output.
2. Generate a CCIR alert.
3. Store only the redacted record in the source-of-truth.
4. Request commander release review if necessary.

## 5. Context packet generation procedure

1. Identify the roles required for the mission/task.
2. Attach classification and EEFI status to each context item.
3. Compare allowed_roles and purpose for each role.
4. Choose a delivery method among raw, summary, redacted, or reference-only.
5. Record the delivered packet id in the event log.
6. Perform release review before final output.

## 6. Delivery modes

| Mode | Meaning | Usage |
| --- | --- | --- |
| raw | Deliver the original content | public/internal, need-to-know |
| summary | Deliver a summary | internal/sensitive |
| redacted | Remove sensitive fields | sensitive/restricted metadata |
| reference_only | Deliver only the file/id | restricted, commander-only |
| denied | Delivery prohibited | EEFI, Black |

## 7. Policy examples

Delivered to S3:

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

Delivered to the Red Team:

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

## 12. Implementation candidates

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

## 13. Source anchors

- Joint OPSEC Support Element, Operations Security: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/Joint-OPSEC/
- Joint Staff CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf

## 14. Current-stage conclusion

LLM context is an information asset, not a supply item. It must be delivered to the person who needs it, in the amount needed, for the time needed, and in the format needed.

This policy binds hallucination control and security control in multi-agent systems into the same structure. Information without a source is blocked at the evidence gate, and sensitive information is blocked at the releasability gate.
