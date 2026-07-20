# OPSEC Classification Model

## 0. Purpose

OPSEC is not a narrow security procedure for hiding sensitive information. It is an operational function that prevents the mission from being endangered by unnecessary exposure of operational intent, capabilities, vulnerabilities, and next actions.

Why OPSEC and classification are needed in LLM operations:

- Model context can become mixed with sensitive information the user did not intend to include.
- Because multi-agent systems make information sharing easy, need-to-know boundaries become blurred.
- Tool call targets, logs, evidence, and final output can re-expose sensitive information.
- Even when evidence is retained to prevent hallucination, releasability and retention scope must be distinguished.

## 1. Classification label

The current framework uses four classification levels.

| Level | Meaning | Example | Default handling |
| --- | --- | --- | --- |
| public | Releasable | Public doctrine links, general terminology | Citable |
| internal | Internal to the project | Local design, mission state | Usable in working context |
| sensitive | Requires caution | User non-disclosure requests, internal judgments, undisclosed plans | need-to-know |
| restricted | Strongly restricted | secret, credential, private data, prod target controls | Blocked by default |

Rules:

- Higher-classified information does not flow down into lower-classified context.
- Final output is by default written down to the public/internal level.
- Sensitive/restricted information is handled via summarization, redaction, or reference IDs.

## 2. EEFI model

EEFI stands for essential elements of friendly information. In the LLM runtime, it is defined as "information that, if exposed, would harm the user's mission, security, privacy, cost, or system stability."

EEFI candidates:

- API key, token, password, private key.
- Personally identifiable information and sensitive user data.
- Production targets, credential paths, and deployment details that have not yet been approved.
- Internal vulnerabilities, exploit paths, and bypass methods.
- Non-public business strategy, contracts, personnel, and legal information.
- Content the user has explicitly designated as non-disclosable.

EEFI handling:

- Do not repeat the original text verbatim.
- Store redacted values and sensitivity labels in evidence.
- When necessary, report only "EEFI detected" to the commander.
- The tool gateway classifies restricted targets as Red/Black.

## 3. Context releasability matrix

| From / To | Commander | CoS | S2 | S3 | S6 | Red Team | Final Output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| public | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed |
| internal | Allowed | Allowed | If needed | If needed | Allowed | If needed | Summarizable |
| sensitive | Allowed | Allowed | need-to-know | Restricted | need-to-know | Restricted | redacted |
| restricted | Restricted | Restricted | Prohibited | Prohibited | Restricted | Prohibited | Prohibited |

need-to-know criteria:

- Is this strictly necessary for the role to perform the mission?
- Can the same effect be achieved with a lower volume of information?
- Is the transfer recorded in the event/evidence log?
- Is there a risk of re-exposure in output after transfer?

## 4. Tool-use OPSEC

| Tool action | OPSEC risk | Handling |
| --- | --- | --- |
| read local public docs | Low | Green |
| read arbitrary user path | Possibly sensitive | Amber/Red |
| print env vars | secret exposure | Black |
| upload file | external release | Red |
| call external API with user data | data release | Red |
| deploy production | capability exposure/state change | Red |
| search web | query disclosure | Amber if query contains sensitive info |
| log raw prompt | privacy leakage | Amber/Red |

Rules:

- Sensitive information can also enter through queries.
- Logs are also output.
- Even "read-only" actions are Black if they read and output a secret.
- Red action approval does not include OPSEC release approval. A separate release scope is required.

## 5. Evidence store OPSEC

Evidence records require the following fields.

```json
{
  "evidence_id": "E-DEMO-001",
  "classification": "internal",
  "releasability": ["COMMANDER", "COS", "S2", "S6"],
  "claim": "Production deployment is a Red action requiring explicit approval.",
  "source_uri": "docs/tool-use-roe.md",
  "redaction_required": false,
  "retention": "project"
}
```

Sensitive evidence rules:

- Do not put the raw sensitive value in the claim.
- If source_uri is a private file, access control is required.
- Separate sentences usable in final output from internal judgment sentences.

## 6. Classification downgrade rule

A downgrade decision is required when lowering information to a lower classification level.

```text
DOWNGRADE REVIEW:
- source classification:
- target classification:
- removed sensitive fields:
- remaining risk:
- reviewer:
- approved_for:
- expiry:
```

Examples:

- The raw text of a restricted API key cannot be downgraded to public.
- Sensitive internal architecture can be summarized as "internal architecture detail" in a public final answer.
- Private user data is not sent to external APIs without the user's explicit request.

## 7. Prompt guard

```text
Perform an OPSEC check before output or tool call.
1. Does it contain secret/token/password/private key/personal information?
2. Does it contain internal/sensitive information the user has not authorized for disclosure?
3. Does sensitive information also appear in the query, log, file name, or target?
4. Can the same mission be accomplished with a lower volume of information?

Do not output restricted information; report it as an EEFI alert instead.
```

## 8. Dashboard OPSEC panel

The dashboard displays only status, not the raw text of sensitive information.

| Field | Display |
| --- | --- |
| EEFI detected | count and severity |
| restricted action blocked | yes/no |
| pending release review | approval id |
| redaction status | complete/pending |
| releasability exception | role and reason |

Prohibited:

- secret raw value.
- private path with username if unnecessary.
- exploit detail.
- unapproved customer or personal data.

## 9. Implementation candidates

schema:

- `classification-label.schema.json`
- `releasability-review.schema.json`
- `eefi-alert.schema.json`

prototype:

- `opsec-linter.js`: Detects secret patterns and restricted terms in output/tool targets.
- `context-filter.js`: Reduces the context packet according to per-role releasability.
- `evidence-redactor.js`: Converts evidence records into a final-output-safe form.

## 10. Source anchors

- Joint OPSEC Support Element, Operations Security: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/Joint-OPSEC/
- Joint Staff CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf

## 11. Current-stage conclusion

The core of LLM OPSEC is not "never seeing sensitive information." In actual work, sensitive information may indeed be seen. The core consists of the following four points:

1. Restrict who needs to see it.
2. Restrict which tools it can leave through.
3. Restrict which outputs it can be re-exposed through.
4. If a restriction is broken, record it as an event, alert, and AAR.
