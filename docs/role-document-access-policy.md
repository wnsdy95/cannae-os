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

### Minimum Sufficient Reading

Before issuing a profile, map each requested output, explicit input and applicable
constraint to the source needed to establish it. Use the document's `rationale`
and a short assignment note; do not add undeclared fields to the manifest.
Classify each candidate as follows:

- Required: name the task claim, procedure or boundary that cannot be assessed
  without this document. Include explicitly requested inputs and indispensable
  policy dependencies even when a recommendation ranks them low.
- Optional: name the condition that makes this allowed reference useful. A
  related topic or role-wide recommendation alone does not make it required.
- Excluded or reference-only: retain the reason and any resulting unknown. A
  reference-only record cannot supply a fact needed for a completed conclusion.

Check the mapping against the original request, not only the proposed reading
list. A smaller list is not better if it loses an obligation. Do not automatically
copy every router recommendation or every default role document into a new
task-specific required list. Conversely, never remove issued controls or relabel
an existing required input to obtain a shorter or passing run. A changed task or
new dependency needs reviewed reassignment and rerouting at the current authority.

Carry the projection's `required_documents` separately from `allowed_documents`;
allowed optional rows are not mandatory reads. A delivery adapter must preserve
that distinction instead of marking every allowed row required. Record actual
reads and unresolved prerequisites in the report. This selection is an operator
judgment to verify against observed work, not proof of semantic minimality or an
authorization decision made by the lexical router.

For inspectable selection origins, use the installed router's direct
`--explain-reading` option. Its `reading_selection` separates baseline navigation,
source arguments, inline references, delegated context, capability-gap handling
and route selections. Per-route conditional omissions remain visible even if
another origin retains the same file. The final `recommended` flag describes the
combined result, not permission or mandatory reading. Objective indexes refer to
the returned declaration list; no semantic decomposition is inferred.

The bound receiving adapter also carries these origins. Its source arguments
come from the preparer's required profile, not necessarily a direct USER request.
Do not merge the diagnostic's candidate paths into that profile or treat an
unlisted recommendation as an accessible source. Use actual task requirements
to justify a newly reviewed profile; issued sources, holds and controls stay in
force. The option reads no document bodies and changes no selected commands.
It is not supported in guarded receipts, artifact persistence or coverage mode.

Treat delivery language separately from the subject of a source. A Korean output
does not by itself require Korean military references; an actual national task,
inherited objective, declared AI duty or explicit source still may. Conditional
router recommendations do not reclassify an already issued required reading or
waive any validation command. Check the original request before revising a profile.

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

For an authorized tool/client adapter, `project-document-packet.js` exports
`recipientData(packet)`, the same structured recipient view used by `renderPrompt`.
Use a current compiled or inspected packet, not an arbitrary object. The function
checks the existing terminology and known-private-path constraints, returns a
detached copy. Ordinary packets require no reads; reviewed packets recheck their
canonical decision and exact source proposal, including source reads under the
preparer's authority. Neither path writes, authenticates a person or transfers data.
Reference-only rows contain no original locator, digest or filesystem metadata.
Do not merge private `request.documents` or `source_repository` fields back into
a tool catalog: blocking the later read cannot undo an earlier listing disclosure.
Raw-source locators, if needed, require their own reviewed receiving-unit context;
this projection does not add locations, shorten required inputs or authorize use.
The existing literal path checks and semantic-review limits still apply.

The same conservative OPSEC/EEFI detectors
check outgoing text, task and recipient strings, source IDs and declared required-term
labels. Recipient catalogs are delivered content even for reference-only rows.
Findings stop preparation with
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

Git metadata process errors, termination signals or missing terminal statuses
stop packet preparation/inspection with `PROJECT_PACKET_GIT_UNAVAILABLE`, even
when the result also contains status zero or plausible output. The code never
substitutes cached origin or ignore results. This failure leaves repository or
source freshness unverified; it is not proof of exclusion, another repository or
a missing source. Preserve the failed attempt and existing holds; diagnose the
host before any separately permitted new attempt. Product timeouts, approval
expiry and retry authority do not change. Ordinary completed Git results retain
their existing root, source-exclusion and ignored-output checks.

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
For terminology-bound tasks, inspect `terminology_readiness` separately from
currentness and review the declared prerequisites against the original request.
Missing declarations remain unassessed. Explicit unresolved prerequisites stop
preparation; optional or excluded terms do not become required automatically.
See the terminology workflow's [declared task prerequisites](project-terminology-workflow.md#declared-task-prerequisites).

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

### Content Review Diagnostics

On `PROJECT_PACKET_CONTENT_REVIEW_REQUIRED`, retain the exact request and source
bytes. An operator already authorized for source preparation may run a read-only
diagnosis through either installed provider wrapper:

```bash
node /absolute/loaded-skill/scripts/prepare_controls_documents.js \
  review-content --repository /absolute/project --request /absolute/request.json
```

This executes the same compiler, access checks, file/digest limits and conservative
detectors as preparation, but writes no packet. Task/recipient and outbound-metadata
findings stop before source reads; a document finding stops before later sources. Reference-only
rows are metadata-checked, never opened or hashed. Summary originals are hashed,
not decoded or screened as recipient text; only the supplied summary is screened.
After task/recipient checks, `outbound_metadata` screens source IDs and declared
required terms. Select report rows by `scope` and `document_index`, not a fixed
position. This additional stage does not change detector rules or grant exceptions.
The structured recipient projection and prompt renderer also screen their complete
outbound view without reading files. Inspect retained packets before reuse: source
digests and an earlier preparation do not waive current screening.

The local report contains the SHA-256 of `JSON.stringify` of the parsed request
(not its original file formatting), the repository identity digest, zero-based
document indices and observed source/delivery digests. Rule identities/counts are
included; task text, recipient labels, source IDs/paths, bodies, matched values,
field paths and per-value hashes are not. Current screening source-file digests
locate the implementation for review; they are not runtime attestation. Keep
diagnostics private too: metadata and digests are not automatically releasable.

`content_review_required` returns exit 1 and `compilation_completed: false`.
`uninspected_document_count` counts the untouched suffix; an inspected
reference-only row still has no content check. Later terminology/private-path and
packet checks may not have run. Other validation or file failures remain fixed-code
errors, not an apparently successful diagnostic. No-findings completion returns
`content_screening_no_findings` and exit 0, not "safe", "approved" or "ready".
It does not perform output persistence/rendering checks or an actual transfer.
Observed digests bind the bytes read at that time, not continuously current files.

A default word match can explain a policy-prose refusal without proving a secret
exists. It also cannot prove a false positive or absence of other sensitive data.
An authorized reviewer must examine the exact local source and intended recipient
within existing authority. Do not remove safety wording, relabel classification,
copy raw text as a summary or drop a required input to evade the refusal. A separately
reviewed summary is an option only when it satisfies the actual task; an exact-source
review cannot silently become summary review. Diagnostics cannot clear a finding:
`manual_clearance_supported`, approval/execution/release and receiver acceptance
remain false. No diagnostic can be supplied to ordinary `prepare` as an override.
The separate procedure below requires its own exact USER decision; general test
consent and the USER's approval of this procedure are not that decision.

### Reviewed Document Preparation

The USER approved this bounded design on 2026-11-12. It supports local preparation
after exact document review, not automatic transfer, public release or expanded
authority. Existing ordinary preparation and guarded-mission restrictions remain.

1. An authorized source preparer preserves the original request, classifications,
   role/department/duty/authority and every required source. Run `propose-review`
   through the same installed wrapper. It reads selected sources, verifies exact
   original digests and writes private `review.json` and `review.md` beneath the
   target project's ignored `.cannae/document-reviews/<UUID>/`. It creates no
   decision, cleared packet or native invocation.
2. The USER reviews that exact proposal, recipient, purpose, source versions,
   findings and any representation. Confirm that matches are policy wording,
   not actual secret values, and that requirements, prohibitions and source
   relationships survive. Keep the original files available to this authorized
   reviewer. Unknown confidentiality or source fidelity keeps preparation on hold.
3. Only after an actual decision, record `ProjectDocumentReviewDecision` as
   `decision.json` beside that proposal. Bind the proposal file SHA-256, the actual
   decision reference, exact-proposal scope and a finite validity interval of at
   most 24 hours. Preserve a separately expected decision-file digest. A sample,
   generated role string, prior verdict or approval of the design is not consent.
4. Run `prepare-reviewed` with both expected digests. It checks the canonical
   decision, scope, expiry, origin, sources, representations and recorded screening
   files. The resulting v0.2 packet retains the review binding privately; the
   recipient receives no decision file or original private path. Its execution,
   release, authenticated-authority and receiver-acceptance flags remain false.
5. Reuse the ordinary `inspect` command before separately authorized use. Changed
   source/request/recipient/code bindings, a missing or changed decision, expiry
   or `decision: revoked` stop inspection and projection. Do not recompute an
   expected digest or restore a previous decision to bypass that hold. A new
   decision requires a new actual USER review, not automatic renewal.

```bash
node /absolute/loaded-skill/scripts/prepare_controls_documents.js \
  propose-review --repository /absolute/project --request /absolute/request.json

node /absolute/loaded-skill/scripts/prepare_controls_documents.js \
  prepare-reviewed --repository /absolute/project \
  --proposal /absolute/project/.cannae/document-reviews/UUID/review.json \
  --proposal-sha256 EXPECTED_PROPOSAL_SHA256 --decision-sha256 EXPECTED_DECISION_SHA256
```

Only document-body matches of the selected default EEFI word rules are eligible
for this procedure. OPSEC findings, token-pattern findings, task/recipient/catalog
findings, restricted raw delivery, access mismatches and private-path leaks remain
non-waivable. Quoted credential keys are checked too. Pattern checks still cannot
prove absence of every secret; the exact-source semantic review is necessary.

For internal drafts, request v0.2 `delivery_mode: representation` with
`representation: {method: source_id_locations, project_handle: PROJECT-...}`.
Only exact regular files below `.cannae/document-drafts/` are eligible, with no
symlink, traversal, nested-repository or other excluded-directory components.
The preparer reads the original under existing read authority and preserves it
in place. No relocation, classification downgrade or summary relabeling is used.

Preflight each source path and delivery mode before building a client manifest.
If ordinary preparation reports `PROJECT_PACKET_REQUEST_INVALID`, use the local
request validator to identify the rejected document indices. A path rejection is
not a content-screen verdict or a native-client failure. Do not copy an existing
internal draft to an ordinary path merely to obtain raw delivery. An eligible
internal draft follows this exact-review procedure even when screening finds
nothing and its representation changes no bytes; equal digests do not remove the
decision requirement. Preserve the rejected request and originals separately.

The deterministic representation replaces selected absolute/private relative
locations with `source:ID`, the canonical target root with the declared project
handle, and this bound doctrine root with `CORPUS-CONTROLS`. Other bytes, including
requirements, prohibitions and historical digests, are unchanged. Literal mapping
is not general redaction or semantic equivalence. Review aliases and unlisted
locations separately. `source_sha256` binds the original; `delivered_sha256` binds
the distinct represented text. An identity representation is still labeled as
such. The recipient must preserve the mode and bindings; unsupported adapters
must stop rather than pretend they received an unchanged raw original.

The contracts are `project-document-review-proposal.schema.json` and
`project-document-review-decision.schema.json`; their validator results always
have `can_execute: false`. Fixtures use explicitly synthetic decisions, not
fabricated real USER approvals. Ordinary v0.1 packets remain supported.

Trust limit: the local preparer must verify the actual USER decision outside this
helper. Digests bind the recorded bytes; they do not authenticate a human. There
is no login server, protected key, unforgeable approval UI or rollback-resistant
host here. An actor controlling these files can forge or restore records; do not
claim this workflow prevents that. Checks are point-in-time, not atomic sending
or continuous revocation enforcement. Any actual transfer retains its separate
recipient, disclosure and consent checks.

### Bound Recipient Reader

For an authorized preparer's file-backed tool adapter, `project-document-reader.js`
exports `createDocumentReader`. It accepts a prepared packet's absolute path,
separately expected digest, exact target repository and expected recipient.
Those are trusted preparer inputs, never model-selected paths or authority claims.
It supports ordinary and reviewed packets using the existing inspection path:

```javascript
const { createDocumentReader } = require("/absolute/doctrine/project-document-reader");
const reader = createDocumentReader({
  repository: "/absolute/project",
  packet_path: "/absolute/project/.cannae/document-packets/UUID/packet.json",
  packet_sha256: expectedPacketDigest,
  recipient: exactAssignedRecipient
});
const catalog = reader.catalog();
const response = reader.read("SRC-POLICY");
```

The catalog preserves the exact task, recipient, terminology readiness and
required-source count. It excludes source bodies, private locators and review
records. Reads return only selected readable IDs and keep raw/summary/representation
mode, required status, original/delivered digests and representation metadata.
Reference-only IDs have no readable body, locator or original digest. A summary
read cannot open its original for the recipient. The preparer still rehashes the
original under its own existing authority; this is not a recipient file reader.

Every call rechecks the retained packet and prompt, source freshness, repository
binding and, when applicable, exact current review decision. Recipient substitution,
source drift, expiry and revocation fail rather than returning cached text.
Failures return code-only exceptions, not raw filesystem paths or source values.
The caller must not replace the expected digest, rebind the recipient or restore
old decision bytes to bypass a hold. Original source and screening contracts are
unchanged; this helper itself is not attested by a proposal's screening digest.

This is an in-process adapter utility, not a server, plugin installation, route
receipt, human authentication or native-client acceptance test. Keep actual route,
read-only tool allowlists, per-phase holds and separately applicable transfer
consent in the host adapter. Do not reconstruct a source catalog from private
request rows or add repository paths to the public response. A listed source is
not a completed read; a returned body is not proof of client receipt, comprehension
or adoption. Calls are point-in-time and do not provide atomic sending, continuous
revocation or protected-host guarantees. Execution/release/verified-authority and
receiver-acceptance flags remain false.

### Operation-Local Inspection Reuse

The file-backed reader uses `inspectRecipientData(packetPath, expectedDigest,
repository, recipient)` to receive the detached projection already checked
against the saved prompt in that same inspection. The exact recipient is required
and checked before reading original source content. `inspect` remains metadata-only;
it does not expose that projection, and its result is not a reusable validation token.

Reviewed inspection still rebuilds the current proposal and rechecks it when
projecting the prompt. The reader no longer repeats that projection's source
appraisal a third time after the prompt comparison. No cached state survives a
call, no caller flag skips validation, and standalone `recipientData` and
`renderPrompt` retain their checks. Source drift, changed or expired decisions,
wrong recipients and modified packet/prompt bytes remain refusal conditions.
Concurrent changes between the two appraisals must still fail. This is not an
atomic filesystem snapshot or a guarantee against mutation after the final check.

A local 14-document representation probe observed 217 -> 146 Git calls and
42 -> 28 original-source opens per reader construction, catalog and read. Proposal
creation and packet preparation counts stayed unchanged. These are synthetic
local workload observations, not native context-byte savings, semantic quality,
universal speedup or a completed session integration result. Retain interrupted
earlier probes separately. The [active backlog](completion-backlog.md) owns the
current acceptance status.

Changing the packet implementation changes reviewed proposals' screening-source
identity. Preserve old proposals and decisions; do not rehash them into current
approval. A new current-source proposal requires its own applicable review.

### Routed Receiving Tools

`project-document-session.js` composes the bound reader with the selected installed
router for an ordinary, read-only receiving assignment. It is not a guarded
mission adapter. A trusted preparer supplies this local configuration:

```javascript
const { createDocumentSession } = require("/absolute/doctrine/project-document-session");
const session = createDocumentSession({
  reader: exactPacketReaderBinding,
  skill_directory: "/absolute/loaded-skill",
  doctrine_root: "/absolute/doctrine",
  task_id: "PROJECT-TASK",
  phase: "review",
  access_manifest: assignedCorpusAccessManifest,
  corpus_sha256: expectedCorpusFileDigests,
  held_source_ids: [],
  max_calls: 32,
  max_route_calls: 2,
  deadline_ms: 300000
});
const route = session.execute("route_current_task", {
  query: currentTaskDescription,
  objectives: separatelyDeclaredObjectives
});
const result = session.execute("read_document", {
  route_id: route.route_id,
  source_id: "SRC-POLICY"
});
```

The preparer must retain established phase holds in `held_source_ids`; an empty
list is not permission to omit them. These holds restrict recipient delivery;
the preparer still needs authority to recheck every packet source. If the preparer
is forbidden to reread a source, do not instantiate this session or treat a delivery
hold as permission to retry it. Keep that prerequisite unresolved. `brief` exposes
routing only, with all source
delivery held. `review` permits selected readable IDs except configured holds.
Corpus profiles currently require raw delivery and exact digests for all selected
guides; unsupported modes stop instead of becoming raw. Packet sources retain
their own raw/summary/representation/reference-only modes. Required rows are never
removed because a delivery is held. No tool argument can change the recipient,
phase, profile, root, packet, task identity, authority or hold list.

Each route calls the installed router with the fixed role/department, document-only
scope and target-bound task identity. It keeps the original assignment alongside
the current description and preserves every caller-declared objective assessment.
Project source IDs come from the separately inspected packet, not reconstructed
private file paths or a claim of router filesystem-input admission. Assigned corpus
sources remain explicit router inputs. Recommended documents and all selected
validation commands remain visible; the helper does not run those commands or
prove that the assigned profile contains every semantically necessary source.

The fixed routing descriptor is `document-only-verification`; the recipient's
manifest authority remains its separate L-level. Ordinary S3/S4 document tasks
can use the same relevance selection as direct read-only work without renaming
either declaration. Original and current task subjects, objectives, technical
duties and explicit required guides still retain their specialist context.
Unclear or execution descriptors and guarded metadata do not qualify. This is
recommendation selection only: it cannot add or remove assigned documents,
promote optional rows to required, clear holds or grant execution. An optional
guide can stay readable even when omitted from recommendations. Test these
distinctions with `node run-project-document-session-reading-fixtures.js`;
local routing/transport success is not native receipt or semantic acceptance.

A new route retires the old route ID, even if the new attempt fails. The stdio
adapter retires it before argument validation, including extra, missing or wrongly
typed arguments. A pending earlier route cannot reopen access after a later request.
Each successful
route starts fresh returned-source accounting. `returned_required_source_ids` and
`pending_required_source_ids` count actual handler returns, not native receipt or
comprehension. A held/unlisted read cannot clear a hold, but leaves unaffected
permitted reads available. Source/decision/router drift invalidates the context;
there is no cached fallback. Both supplied aliases and canonical private roots
remain withheld from catalogs
and body responses. Call/route budgets and a maximum ten-minute session bound
are enforced, including elapsed wall time after suspension.

For an explicitly assigned client tool process, serialize that configuration
privately and bind its file digest. The optional stdio adapter uses the repository's
existing pinned MCP dependencies:

```bash
node /absolute/doctrine/project-document-session-mcp.js \
  /absolute/session.json EXPECTED_CONFIG_SHA256
```

By default it exposes only `route_current_task` and, in review phase, `read_document`, with
strict arguments and code-only operation errors. It creates no network listener,
global client setting, authentication service or persistent daemon. The client
owns the child process; stdin closure or the configured deadline closes its
transport. Do not install it as an always-running service. Configuration and
packet hashes are trusted local bindings, not authentication or protected code
attestation. This is an optional tool adapter, not separately packaged plugin
distribution or automatic consent to send documents to a model. Inspect sources,
actual client settings and transfer authority before any native use.

### Exact Quote Lookup

For a review whose finding depends on a disputed citation, a trusted preparer
may set `allow_quote_lookup: true` in a newly assigned session configuration.
The default remains disabled; callers cannot enable it through tool arguments
or by mutating the original configuration after construction. In review phase,
the optional stdio tool and session operation are both named `locate_quote`:

```javascript
const location = session.execute("locate_quote", {
  route_id: route.route_id,
  source_id: result.document.id,
  delivered_sha256: result.document.delivered_sha256,
  quote: exactPassageFromTheReturnedDocument,
  context_lines: 2
});
```

The source must already have been fully returned by `read_document` in this
route. Lookup rechecks the packet, reviewed decision, sources, corpus and router;
it cannot access a held, unlisted or reference-only source, change the profile,
clear required reading or survive a reroute without a new full read. The same
session call/deadline limits apply. Brief phase still exposes routing only.

Select one unique, nonblank literal passage of at most 4096 UTF-16 code units.
No case, whitespace, newline or Unicode normalization is performed. Zero or
multiple matches return `PROJECT_QUOTE_NOT_FOUND` or `PROJECT_QUOTE_AMBIGUOUS`;
use a distinctive passage, not a guessed occurrence. These selection failures
leave a successfully rechecked context usable; source/decision drift retires it.
Malformed arguments and mismatched digests fail without falling back to search.

The result retains source and delivered digests, delivery mode, the exact quote
and its digest, zero-based UTF-8 byte offsets (exclusive end), one-based inclusive
line bounds and surrounding complete lines. `context_lines` is 0-5, default 2;
LF separates lines and CRLF bytes remain intact. Locations in a summary or
representation refer to that delivered body, not its withheld original.
`location_verified: true` means only a unique literal match in those bytes.
`semantic_support_assessed` and all authorization/acceptance flags remain false.

Inspect the actual heading, table header/cell and historical/recipient qualifier
before accepting a finding. Nearby lines may omit a distant header; use the full
already-read source, not an inferred column label. This helper does not parse
Markdown, judge interpretation, certify comprehension or create a disclosure
decision. `project-document-quote.js` is the pure locator; use the session boundary
for delegated tools rather than exposing arbitrary local-file lookup.

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
