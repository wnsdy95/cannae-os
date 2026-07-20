# Role Document Access Policy

## 0. Purpose

This document defines the policy that restricts which documents each agent may read, based on role, duty, and authority.

Whereas the existing `context-releasability-policy.md` addresses how context items are delivered, this document governs the earlier-stage question of "which files may be opened" in the first place.

Core principle:

```text
Documents are not a knowledge repository open to everyone.
Each agent reads only the documents required for its own mission;
everything else is handled through a summary, a reference, or a Commander/CoS approval request.
```

## 1. Basic Rules

1. The default is deny.
2. Document access requires that role, duty, and authority level all match.
3. Even if the role matches, the document is not read if it is not required for the current duty.
4. A role with lower authority does not read documents belonging to a higher authority level in raw form.
5. For `restricted` or EEFI-related documents, the default is reference only or a redacted summary.
6. Exceptions to document access are recorded as a Commander or CoS approval event.
7. The list of documents read must be reproducible in the handoff and the AAR.

## 2. Access Decision Model

```text
CAN_READ(role, duty, authority, document):
  if manifest.default_decision != deny: block
  if role not in document.allowed_roles: deny
  if duty not in document.duties and mission_common not in document.duties: deny
  if authority < document.minimum_authority_level: deny
  if document.classification == restricted and delivery_mode == raw: block
  else allow with delivery_mode
```

## 3. Authority level

| Level | Meaning of Read Authority |
| --- | --- |
| L0 | Observation of public/internal documents, summarization, and evidence verification |
| L1 | Verification of procedural documents and schemas required to perform an assigned mission |
| L2 | In-scope document modification and verification of runner/schema impact |
| L3 | Verification of documents related to external impact, release, cost, and authority changes |
| L4 | Verification of documents related to irreversible changes, deployment, deletion, and public publication |
| L5 | Verification of documents related to high-risk decisions, policy changes, and retained authority |

## 4. Default Document Bundle by Role

The table below shows the default reading bundle for each standing role. In actual execution, a mission-specific access manifest is created using `schema-files/document-access-manifest.schema.json`.

| Role | Duty | Required documents | Optional documents | Default denied |
| --- | --- | --- | --- | --- |
| COMMANDER | command_decision | `docs/commander-handbook.md`, `docs/agent-roles-and-authority.md`, `docs/decision-risk-assessment.md`, `docs/risk-acceptance-authority.md` | `docs/military-llm-framework-v0.1.md`, `docs/approval-scope-policy.md`, `docs/force-structure-change-policy.md` | raw credentials, implementation scratch files |
| COS | orchestration | `docs/military-operating-system.md`, `docs/llm-agent-org-chart.md`, `docs/agent-battle-rhythm.md`, `docs/orders-production-pipeline.md` | `docs/b2c2wg-operating-model.md`, `docs/interdepartment-collaboration-policy.md`, `docs/force-structure-change-policy.md` | restricted raw source values |
| S2 | source_verification | `docs/source-map.md`, `docs/source-reliability-rubric.md`, `docs/information-to-operations-cycle.md`, `docs/research-compendium.md` | `docs/korean-military-sources.md`, `docs/decision-risk-assessment.md` | credentials, release authority documents unless tasked |
| S3 | operations_planning | `docs/orders-production-pipeline.md`, `docs/prompt-templates.md`, `docs/backbrief-and-rehearsal-sop.md`, `docs/ccir-alerting-model.md` | `docs/agent-metl.md`, `docs/tool-use-roe.md`, `docs/opord-annex-model.md` | raw source archive, private evidence |
| S4 | sustainment | `docs/maintenance-readiness-model.md`, `docs/tool-use-roe.md`, `docs/runtime-automation-roadmap.md` | `docs/data-model.sql.md`, `docs/force-structure-change-policy.md` | sensitive user content unrelated to resources |
| S6 | knowledge_management | `README.md`, `docs/knowledge-management-sop.md`, `docs/source-map.md`, `docs/context-releasability-policy.md`, `docs/opsec-classification-model.md` | `docs/event-sourcing-model.md`, `docs/data-model.sql.md`, `docs/research-compendium.md` | restricted raw values without approval |
| RED_TEAM | independent_review | `docs/military-ai-risk-register.md`, `docs/decision-risk-assessment.md`, `docs/source-reliability-rubric.md`, `docs/context-releasability-policy.md` | `docs/opsec-classification-model.md`, `docs/evaluation-fixtures.md` | exploit detail, credentials, private raw data |
| EVALUATOR | evaluation | `docs/evaluation-metrics.md`, `docs/evaluation-fixtures.md`, `docs/agent-readiness-ledger.md`, `docs/validator-prototype.md` | `validator-cli-prototype/fixtures.md`, `docs/maintenance-readiness-model.md` | raw sensitive mission notes |
| EXECUTOR | assigned_execution | `docs/implementation-guide.md`, `docs/tool-use-roe.md`, `docs/prompt-dsl.md`, `schema-files/README.md` | assigned OPORD, assigned annex, task-specific runner README | Commander-only decision notes, unrelated research archive |
| RECORDER | audit_and_aar | `docs/knowledge-management-sop.md`, `docs/sop-library.md`, `docs/source-map.md`, `docs/research-compendium.md` | `docs/evaluation-fixtures.md`, `docs/agent-readiness-ledger.md` | restricted raw evidence without approval |

## 5. Delivery modes

| Mode | Meaning |
| --- | --- |
| raw | Raw text may be read |
| summary | Only a summary or redacted excerpt is delivered |
| reference_only | Only the file path/id is delivered; reading the raw text requires separate approval |
| denied | Reading is prohibited |

## 6. Mission-Specific Manifest

Actual execution does not rely solely on the static per-role table; a `DocumentAccessManifest` is created for each mission.

Required elements:

- `default_decision`: must always be `deny`.
- `role_profiles`: role, duty, authority level, required/optional/denied docs.
- `documents`: path, classification, owner, allowed roles, duties, minimum authority, delivery mode.
- `controls`: need-to-know, no bulk read, audit, exception approval, source of truth.

## 7. Runner Usage

`document-access-runner.js` takes a manifest and projects only the documents that a specific role is permitted to read.

```bash
node document-access-runner.js sample-payloads/valid-document-access-manifest.json S2 source_verification L0
```

Output:

- `allowed_documents`: the documents that may be read and their delivery mode.
- `required_documents`: documents that must be read before performing the given duty.
- `denied_documents`: the reason access was denied.
- `preflight_blocks`: cases where the manifest itself is unsafe.
- `audit_requirements`: the items that must be logged for a read event.

## 8. Anti-patterns

- Having every agent read `README.md` and the entirety of `docs/`.
- Giving the Executor the Commander decision, the raw risk acceptance text, and the entire source archive.
- Giving the Red Team restricted raw exploit detail.
- Passing the raw source text verified by S2 directly into the final output without a release review.
- S6 reading every restricted raw value on the grounds of its document-management authority.
- Instructing agents to "find and read whatever you need on your own" without a manifest.

## 9. Relationship to Existing Policies

- `agent-roles-and-authority.md`: what a role is authorized to do.
- `context-releasability-policy.md`: how context items are delivered.
- `opsec-classification-model.md`: the sensitivity classification of documents and context.
- `knowledge-management-sop.md`: where the access manifest and audit log are recorded.
- `source-map.md`: which documents connect to which evidence.

## 10. Conclusion

Multi-agent accuracy comes not from more context but from accurate context distribution.

Once the documents each agent reads are fixed, hallucination decreases, authority overreach decreases, and handoffs and AARs become reproducible.
