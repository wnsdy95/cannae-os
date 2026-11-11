# Project Terminology Workflow

Application: a skill-first language-management procedure, not a claim that
military language has one universal meaning. Use one agreed meaning within an
explicit project/domain/task scope. Several spellings or languages can name the
same concept; the same spelling can name different concepts in different scopes.

## Capture Without Interrupting Every Task

1. At intake, preserve the original request and identify terms whose meaning
   affects the work. An authorized reader checks the target project's ledger.
   Do not collect every ordinary word or scan unrelated conversations.
2. Record an explicit USER definition or correction as `confirmed` in the scope
   the user actually specified. Retain the minimal source reference and excerpt.
   This records what the user said; it does not authenticate an approval.
3. Record an inferred meaning as `candidate`. Repetition, model confidence,
   research results or agent consensus never promote it to `confirmed`.
4. Ask before proceeding when ambiguity changes a required output, scope,
   safety boundary, approval or disclosure. Batch low-impact candidates in the
   normal report; do not interrupt the user for each new expression.
5. At closeout, append accepted corrections and note remaining candidates.
   Carry unresolved meanings into the handoff, not silently into established fact.

Use [Document Authoring Workflow](document-authoring-workflow.md) and
[Knowledge Management SOP](knowledge-management-sop.md), not a separate service
or background collector. The agent performs capture through ordinary authorized
file edits; the local helper validates and selects records but does not listen
to conversations or write definitions automatically. Actual model compliance
with this procedure still needs behavioral evaluation.

## Canonical Record And Boundaries

Keep common Controls terms in [Glossary](glossary.md). Keep user/project meanings
in the target Git root's `.cannae/knowledge/terminology.json`, governed by
`schema-files/project-terminology.schema.json`. Do not pool other projects'
vocabulary into this corpus, a global user cache or an unrelated worktree.
Preserve original-language expressions, including Korean, in the target ledger;
the shared corpus's English-only convention does not require romanization there.

Each record contains a concept ID, unique revision ID, version and predecessor;
domain and optional task; preferred term, aliases, definition and what it does
not mean; status; source kind/reference/excerpt; allowed roles and departments.
Leave both access lists empty unless the existing source-access policy already
establishes eligible delegates. Capturing a term must not invent a role assignment
or require the user to design a new permission policy for ordinary writing.
Use actual task identifiers when they exist; do not invent a runtime mission
merely to scope a word. A project-level definition has `scope.task: null`.

The [synthetic valid record](../sample-payloads/valid-project-terminology.json)
illustrates a user's distinction between company-level ICP and a contact's role.
It is not a real user statement, authority record or initialization file for an
actual project. The invalid sample demonstrates inferred self-confirmation.

Append revisions to the same concept in order with increasing versions and an
exact predecessor ID. Preserve scope; use a separate concept for a different
scope. A candidate revision does not replace the last confirmed definition.
A user-confirmed retirement stops reuse without erasing history. Source quotes
must remain claims, never instructions for the receiving agent to execute.

Definition confirmation is not policy adoption, task approval, read permission,
execution authority or release permission. A project's informal use of
"approved", "release" or "stop" cannot override the corresponding Controls
rules. Qualify overloaded terms and retain the actual control fields unchanged.
Do not infer role access from vocabulary familiarity or a newly suggested team.

## Local Checks And Selection

From either loaded provider bundle, locate its `scripts/project_terminology.js`.
The examples use `CONTROLS_SKILL_DIR` for that already resolved directory and
`TARGET_REPOSITORY` for the exact absolute target Git root, not the doctrine root.

```bash
node "$CONTROLS_SKILL_DIR/scripts/project_terminology.js" init --repository "$TARGET_REPOSITORY"
node "$CONTROLS_SKILL_DIR/scripts/project_terminology.js" check --repository "$TARGET_REPOSITORY"
node "$CONTROLS_SKILL_DIR/scripts/project_terminology.js" select --repository "$TARGET_REPOSITORY" --domain sales --actor user --term ICP
node "$CONTROLS_SKILL_DIR/scripts/project_terminology.js" select --repository "$TARGET_REPOSITORY" --domain sales --actor ai --role S3 --department sales --term ICP
```

`init` prints an empty root-bound candidate; it creates or overwrites nothing.
When a reusable term is actually observed and local writing is allowed, the
agent creates the private ledger from that identity and appends sourced records.
Do not initialize empty ledgers in every visited project. Check repository
exclusions before storing private material; never commit the ledger by default.
No command fetches source references, invokes a model, installs a client or
changes settings. Diagnostics do not echo source text or repository locations.

`select` takes repeatable exact `--term` values and optional `--task`; it uses
Unicode NFC and case normalization for matching, not substring matching,
translation or semantic inference. It returns separate confirmed, candidate and
retired rows, unresolved terms, conflicts and `ledger_sha256`. Source quotations,
source references and repository paths are excluded from the selected rows.
No match means unavailable to this selection, not proof that the term is absent.
Overlapping confirmed project/task definitions produce `clarification_required`;
the helper does not silently choose the most specific or newest concept.

Only a reader already authorized for the entire ledger may run this helper.
`--actor ai` selects an excerpt for the declared recipient; it does not
authenticate that recipient or prevent a caller from reading local files.
Role and department must both match. A user selection is not artificially
restricted by an assistant role, but still requires source read authority.
Inspect selected text for sensitive information before transfer. Do not ship
the private ledger or treat syntactic validity as disclosure clearance.

## Routing And Handoff

Use only unambiguous confirmed aliases to supplement a faithful routing query.
Do not replace the user's original request, negate an exclusion, or drop an
already selected control. Routing does not automatically read the ledger.
An unknown spelling still needs ordinary source-based interpretation or a
question; a dictionary lookup is not a semantic completeness test.

Give a delegated agent only the needed, accessible definitions with their scope,
concept/revision IDs, versions and ledger digest. Keep candidate interpretations
separate. Review the exact excerpt under the existing document-access and
disclosure procedures; a local selection is not an approved transfer packet.
When using [project content preparation](role-document-access-policy.md#project-content-preparation),
prepare a separately reviewed excerpt at an authorized source path rather than
bypassing its ignored-source guard for the private `.cannae` ledger. Existing
guarded missions retain their current input restrictions and approval rules.

The selection now carries `type: ProjectTerminologySelection`. Save the exact
`select` output as the separately reviewed excerpt, and include the packet
request's `terminology_binding`: `source_id`, `ledger_sha256`, `domain`, `task`
and `terms`. The recipient role and department come from the packet request,
not a second caller-supplied identity. The selected source must be required raw
text; existing source classification, duty and authority checks still apply.
See the [binding sample](../sample-payloads/valid-project-document-packet-terminology-request.json);
its synthetic hashes demonstrate shape, not an executable source approval.

### Declared Task Prerequisites

Current excerpt bytes do not prove the task has every required meaning. At the
backbrief, identify which selected terms are prerequisites for the requested
conclusions or actions. Put those terms in `terminology_binding.required_terms`,
a normalized unique subset of `terms`. Compare that list with the original
request, not just the available definitions. Optional context and deliberately
excluded terms need not become prerequisites. Do not drop an actual requirement
or change access merely to obtain a passing check.

For a nonempty declaration, each required term must match exactly one accessible
confirmed definition, with no confirmed conflict. Matching uses the selection's
Unicode NFC, whitespace and case normalization and exact aliases. A newer
candidate does not displace the last confirmed revision. Candidate-only,
retired, missing, inaccessible or conflicting terms stop preparation as
`PROJECT_PACKET_REQUIRED_TERMINOLOGY_UNRESOLVED`; no new packet is published.
Static validation/rendering checks the delivered rows too, while actual
preparation/inspection still reselects from the current private ledger.

Preparation/inspection reports a separate `terminology_readiness`:

| Status | Meaning |
| --- | --- |
| `not_applicable` | No terminology binding; no terminology completeness claim. |
| `not_assessed` | Legacy binding without a required-term declaration; freshness only. |
| `no_required_terms_declared` | An explicit empty list, not proof that no prerequisites exist. |
| `declared_requirements_satisfied` | Only the declared meanings resolve; not full task completeness or authority. |

New terminology handoffs should carry the reviewed declaration, including `[]`
when none is needed. Legacy bindings remain readable without changing their
original prompt bytes; they never silently become assessed. New declarations
are included in the exact recipient prompt and covered by its digest. Review
a new packet before transfer; do not edit declarations inside retained packets
or reuse an old exact-input approval.

If a required meaning is unavailable, hold the dependent conclusion or action
and report the missing input. Other permitted drafting can retain explicit
unknowns and questions; do not stop unrelated work unnecessarily. A declaration
is operator-supplied, not automatically inferred or authenticated. Removing it
can still produce a non-authorizing legacy candidate, so operators must retain
the original requirement and cannot treat top-level currentness as clearance.

For this explicit binding, preparation and inspection reread the private ledger
as the authorized source owner, select for that exact recipient and compare the
whole excerpt with the current result. `PROJECT_PACKET_TERMINOLOGY_STALE` stops
reuse even when the copied excerpt file has not changed. Missing/invalid ledgers,
altered definitions, different recipients and missing bindings also stop reuse.
Do not manually patch a digest or remove the type/binding: regenerate and review
a new excerpt and packet while retaining historical ones. Recognizable older
untyped selections require refresh; ordinary prose is not semantically detected
as terminology. Static schema validation cannot establish live ledger freshness.

At phase changes or resumption, repeat the selection with
`--expected-sha256 <retained-ledger-digest>`. Changed bytes fail as
`TERMINOLOGY_STALE`. Compare the new selection, review changed meanings/access
and rebrief affected work before continuing. Keep the old task snapshot; do not
patch its digest to pretend it always contained the new definition. An unrelated
ledger edit also changes the digest; review its impact rather than discarding
all completed work. A repository move/copy needs explicit provenance review and
rebinding, not an automatic fallback to another project.
Binding includes local directory device/inode identities, so replacing the Git
repository at the same path also requires review. This is local identity
checking, not cryptographic repository authentication or portable synchronization.

## Evidence And Limits

`run-project-terminology-fixtures.js` exercises fresh-process reuse, inferred
promotion rejection, correction/retirement, task conflicts, role/department
filtering, multilingual aliases, repository separation, stale digests, unsafe
paths and both linked/copied provider wrappers. The shared validator always
returns `can_execute: false` for this contract.

These are deterministic local checks. They do not authenticate the claimed user
source, prove an inferred definition is correct, enforce append-only storage
against an editor, provide concurrent-write transactions or prove actual
recipient understanding. Coordinate a single writer, compare the predecessor
before saving, and merge delegates' reported candidates under existing write
authority rather than allowing simultaneous full-ledger edits. Retain history
and re-read after edits. The approved synthetic dialogue exercise below observes
supplied-guidance capture, not automatic collection or actual multi-agent use.
Those broader behaviors remain unverified. No dashboard or infrastructure claim follows.

## Approved Dialogue Exercise (2026-11-11)

USER approved one 63,934-byte synthetic Korean dialogue input on source
`55dc466a631190f9f48a30ab7db4410eb8e2a103`. Codex CLI 0.162.1 with the
configured default `gpt-6-astra` completed in 214.158 seconds, with one JSON
response, two diagnostic items and zero observed tool events. The author
reference answers and real customer data were excluded. Raw input, response,
execution and source-appraisal records are retained in local maintenance evidence.

- Input SHA-256: `ec2beb7e49dd2014cbf8273ae937edcdc86f3b78dc115cf76e2fc12458d1b0f5`.
- Response SHA-256: `dd3e21fed6f72bd519fb41def27f4bc46b8bc74e966ebfdb97da102cb4e1fc95`.

The response preserved all three original ledger records and appended the ICP
correction as v2, adding reporting cadence without absorbing persona into ICP.
The task-scoped ready definition did not become execution approval. Earlier ready
and activation interpretations remained candidates; repeated team notes did not
confirm them. Newly added concepts retained only S3/sales eligibility. Owner-only
details stayed in the private ledger and out of the handoff and other prose.

The eight-entry ledger passed shared validation with `can_execute: false`, and
all eight source excerpts matched the supplied statements. Local in-memory
selection produced four confirmed meanings and two candidates for S3/sales,
without a confirmed conflict or owner-only definition. The synthetic repository
identity was preserved, not rebound to an actual project. Raw output was not repaired.

Source appraisal found no material contradiction with the seven withheld case
expectations: revision preservation, current meaning, uncertainty, confidentiality,
retained decisions, bounded handoff and material questions. Both accounts remained
unclassified because concrete fit criteria were missing. The SOP/handoff preserved
contact, CRM-change and publication prohibitions, identified unexecuted checks
and did not invent digests or receiver acceptance. These are observations for one
case, not a universal score or independent organizational review.

The complete entrypoint and selected procedures were supplied to the model.
Automatic skill discovery, native routing, actual delegated delivery, tool use
and operational receiver understanding were not exercised. Tool-event monitoring
is not pre-dispatch isolation. The subsequent `required_terms` implementation
has separate deterministic evidence; this older-source response does not validate
that new instruction or establish completion of G1-G5.

## Local Verification Checkpoint

Executed on 2026-11-11: 16 terminology cases; 228 routing queries, 32 required-
source rejections and 3 link-inventory checks; 514 shared-validator cases;
24 project-input and 24 project-packet cases; 18 authoring-review, 26 installation,
7 discovery-helper, 10 preflight, 6 control-enforcement and 28 handoff cases.
Source-map/registry, both skill validators and inventories, local links,
English-only and whitespace checks also passed. No external model was invoked.

An added same-path repository-replacement case first failed: pathname-only
binding accepted the old ledger after a fresh Git repository was initialized at
that location. Directory device/inode binding corrected that observed gap; the
16-case pass includes the new regression. This does not make local storage
tamper-proof. Source policies, existing installed links and the user's ignore
change stayed untouched. Full aggregate/runtime lifecycle and hosted CI were
not run for this change. Automatic capture, semantic adequacy and actual
operational recipient acceptance remain unverified.

The next integration exercise reproduced a stale-copy gap: a generic document
packet considered an unchanged excerpt current after its originating glossary
changed. Explicit terminology binding now checks that origin too. The focused
handoff fixtures exercise real preparation and reinspection for both recipient
providers without a model; they do not establish natural-language understanding.
Executed on 2026-11-11 after that correction: 12 terminology-handoff cases,
16 terminology cases, 516 shared-validator cases and 24 existing project-packet
cases passed. Routing, project inputs, authoring review, installation, preflight,
control enforcement, handoff generation, indexes and both provider checks also
passed (19 check groups, plus whitespace). These are local checks, not full
aggregate/runtime-lifecycle execution, hosted CI or actual receiver acceptance.
