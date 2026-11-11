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

### Projection Boundary

The runner validates the complete manifest with the shared schema and semantic
validator before producing a usable list. A structural or policy error anywhere
blocks the projection; `allowed_documents` is then empty and all required rows
are unsatisfied. The CLI exits 0 for a ready projection, 1 for blocked and 2 for
invalid invocation or unreadable/malformed JSON. A caller must check both the
exit disposition and the projection, not only whether JSON was printed.

For an explicit role, duty and known authority level, select the highest
applicable profile tier at or below that level. Only its named required and
optional documents are candidates; a document-level role match or
`mission_common` duty cannot add files outside that profile. Do not union lower
tiers into the selected profile. Duplicate role/duty/tier records, duplicate
document paths and allow/deny conflicts are invalid, not a first/last-row choice.
This selection compares declared levels; it does not authenticate a delegation
or permit an agent to choose a higher level for itself.

Preserve each delivery mode. `summary` permits only a separately prepared,
appropriately reviewed summary, not opening the source to summarize it.
`reference_only` permits the reference, not source contents; it cannot satisfy
required reading. An optional reference-only record may remain in the eligible
list. `required_documents.satisfied` means eligible delivery under this policy,
not observed delivery, reading, comprehension or receiver acceptance.

All paths refer to this doctrine repository, regardless of the caller's working
directory. They must identify existing regular files with canonical relative
paths and no symlink components. This runner does not resolve a different
target repository or substitute a same-named file from it. Keep target-project
inputs and outputs in their own repository; cross-repository delivery requires
its separately authorized resolution and handoff rather than copying private
data into the doctrine corpus.

The projection reads policy metadata, not the referenced document contents;
`authorization_verified` is always false. Schema validation likewise reports
`can_execute: false` for this manifest type. A ready result is not a signed or
current USER approval, a release decision, a read audit or an OS file-access
barrier. Bind actual consumption to current task authority and recheck after
policy/source changes. The exported `documentDecision` primitive checks only a
single document; it cannot replace full-manifest/profile validation. The human
USER's visibility is not restricted by an AI role profile.

### Project Content Preparation

Terminology excerpts additionally follow
[Project Terminology Workflow](project-terminology-workflow.md#routing-and-handoff).
Use the request's explicit `terminology_binding` for the helper's selected JSON;
preparation/inspection then rechecks its private originating ledger as well as
the approved excerpt bytes. This requires the preparing reader's existing
authority to read that whole ledger. It does not give the recipient raw ledger
access, waive duty/classification/authority checks or authorize transfer.

For explicitly selected files in another project, use
`project-document-packet.js` through either skill's
`scripts/prepare_controls_documents.js`. This is an offline source-owner
preparation helper for ordinary document work, not a replacement for an already
guarded mission's context, routing receipts, approvals or stops. It never calls a
model, opens a browser, sends a packet or starts a service.

Before preparation, the operator must have actual permission to read the named
inputs and prepare the proposed disclosure. Do not infer that permission from
this request, a role label, a ready access projection or file readability.
The request declares recipient agent/provider/role/department/duty/authority,
the exact task, selected files, their required/optional status and document-level
role/department/duty/authority rules. Those declarations are policy input, not
authenticated delegation. The helper rejects a mismatch but cannot authenticate
the person who wrote them. It does not limit the human USER's visibility.

Use `schema-files/project-document-packet-request.schema.json` and its sample
as the input format. The sample is synthetic, not permission to read another
project. Replace it with the actual scoped request and source digests obtained
under the operator's read authority. No fictional mission or approval is needed.

| Requested form | Preparation and recipient content |
| --- | --- |
| raw | Only public/internal content is eligible. Verify its exact supplied SHA-256 and deliver the original UTF-8 text without truncation or normalization. |
| summary | Require a separately prepared summary, original/summary digests and an asserted review reference. Hash the original to verify lineage, but do not retain or decode its body for the recipient. Read and deliver only the supplied summary; never generate one by opening the source as the recipient. Sensitive originals may use this form. The review reference is not authenticated or semantically appraised by the helper. |
| reference_only | Inspect file metadata without opening or hashing its body. Deliver its source ID with no original path, original digest or content. It cannot satisfy required reading. Restricted sources use only this form. |

The preparer therefore needs original-source read authority for both raw and
summary forms; a summary-only recipient must not run preparation on the original.
If nobody authorized can provide a reviewed summary, hold that input rather than
silently substituting raw content. An identical source/summary path or digest is
rejected even when a review reference is supplied. This does not detect all
near-copies or prove adequate redaction; semantic review is still required.
The same conservative OPSEC/EEFI detectors
check outgoing text, task and recipient strings. Findings stop preparation with
a fixed code and no matched values. These pattern checks may over-block ordinary
policy wording and cannot prove absence of sensitive data or prompt injection.
Do not lower classification or bypass a finding to get a packet out.

Removing path fields from document rows is not sufficient: task text, recipient
fields, source IDs, raw content or a supplied summary can repeat a withheld path.
The shared semantic checks and prompt renderer reject literal substrings matching
the selected summary originals or reference-only source paths. Once the source
origin is known, they also reject its canonical repository and Git-directory
locations. Preparation checks task/recipient fields before source reads and all
delivered text before writing a candidate. Errors contain a fixed code, not the
matched location. Local `packet.json` retains source metadata; it remains private.

On `PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE`, preserve the original request
locally. Prepare a separately reviewed recipient version using source IDs,
retaining all requirements and explicit prohibitions, then obtain any necessary
fresh exact-input consent. Never silently delete a task clause or alter evidence
to satisfy the check. If the task cannot be expressed without the withheld
location, hold transfer for an explicit disclosure decision outside this helper.
The literal check deliberately does not reject ordinary relative raw-source
citations or every filename. It does not discover unlisted paths, basename-only
references, aliases, encoded forms or other sensitive information; exact substring
matches can also over-block. Manual disclosure review remains necessary.

The selected source root must be an existing, separate Git worktree with a HEAD.
Paths must be exact, unignored regular files with no symlink components or nested
repository substitution. The packet binds canonical root, filesystem identity,
Git directory identity, HEAD and the selected current content. This is local
origin binding, not cryptographic publisher authentication or a hostile-host
boundary. Reference-only freshness is metadata-only, explicitly not a content
digest. Raw/summary payloads are limited to 64 KiB per delivered file and 256 KiB
combined; hashing an original for a summary is bounded at 64 MiB. At most 16
sources may be selected. Oversized/binary delivery fails; it is never truncated.

```bash
node codex-skills/controls-doctrine-operator/scripts/prepare_controls_documents.js \
  prepare --repository /absolute/project --request /absolute/request.json
```

The Claude wrapper has the same filename under `.claude/skills/controls-doctrine-operator/scripts/`.
Both use the bundled router's corpus-binding rules, including installed copies.
No client login or native client process is needed for preparation.

Outputs live only in the selected project's ignored
`.cannae/document-packets/<unique-directory>/`: private `packet.json` for local
lineage/policy appraisal and `prompt.md` for the exact proposed recipient input.
The command prints paths, hashes and non-authorizing metadata, not document
bodies. It does not edit ignore rules; unignored or symlinked output locations
fail. Each preparation writes a new candidate without overwriting prior ones.
An interrupted or failed publication can leave an unapproved local candidate.
File presence is not completion; inspect it before considering any transfer.

```bash
node codex-skills/controls-doctrine-operator/scripts/prepare_controls_documents.js \
  inspect --repository /absolute/project --packet /absolute/project/.cannae/document-packets/UUID/packet.json \
  --packet-sha256 EXACT_PREVIOUS_PACKET_SHA256
```

Keep the expected digest from the reviewed preparation, not one recomputed from
an untrusted replacement. Inspect rechecks origin, current source/summary bytes,
request/recipient binding and exact rendered prompt. Source, HEAD, recipient or
prompt changes require fresh preparation and any necessary new review/consent.
It returns `review_candidate_current`; all approval/execution/release/receiver
acceptance flags stay false. A supplied digest is not proof of USER consent.
The check is point-in-time, not an atomic transfer or continuous monitor.

Only propose `prompt.md` for the named recipient; never substitute `packet.json`,
which contains private local paths and preparation metadata. Before an actual
model/agent transfer, separately confirm current task authority, recipient/session,
classification, summary review, actual need-to-know and exact outbound prompt
digest under the applicable consent/release procedure. An old approval is not
renewed by inspection. Preserve all guarded-mission holds; these packets cannot
be inserted into unsupported guarded receipt/context fields as a workaround.
After transfer, retain the real response and evidence of delivery, then assess
its source use, backbrief and omissions. Local compilation, a schema pass and a
synthetic receiver are not proof of native client consumption or comprehension.

`run-project-document-packet-fixtures.js` exercises actual temporary project
files, content assembly, non-reading of reference-only files, root/content
substitution, disclosure checks and both copied/linked provider wrappers.
It invokes no native client or model and grants no authority.
The dedicated `project-document-delivery` route selects this check for explicit
project packet work; ordinary document-access tasks retain their existing checks.

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
