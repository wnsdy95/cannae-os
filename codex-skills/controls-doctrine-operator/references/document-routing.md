# Document Routing

## Start With Core Work

Read `docs/skill-first-product-scope.md` before selecting new work. For writing
or revision, use `docs/document-authoring-workflow.md`, then the selected format
and `docs/knowledge-management-sop.md`. The `document-authoring` route covers
SOP drafting, document revision and handoff documents in both provider trees.

Test realistic format names with modifiers, such as "support escalation SOP",
not only "draft an SOP". An authoring route must include the selected format's
actual template; a continuity label without the handoff template is incomplete.
Retain explicitly supplied source files alongside doctrine recommendations.
For client starter maintenance, route the exact starter from another project in
link and copy installations. Check the authoring bundle itself; a supporting
handoff match can conceal a missing authoring route. Keep the real wording and
correct the matcher instead of renaming every document task to fit one keyword.
Use the requirement-to-evidence matrix in `docs/document-authoring-workflow.md`
before accepting a draft or revision, including unchanged prohibitions and
unknowns. Record author self-review separately from independent acceptance.
Keep "identity not supplied" distinct from "nobody appointed". A source assigning
one step to a function does not assign the whole SOP to it. Reappraising a draft
from new evidence is separate from changing its canonical source record; do not
invent a record-write prerequisite or claim that an unchanged record was corrected.
When repairing that claim, trace its uses in work queues, inquiry text, holds and
successor actions. A corrected unknown in the SOP does not fix a plan that still
orders a new appointment. Record each affected location and compare the unchanged
requirements too. Preserve old tool history and author self-ratings as historical;
an operator's exact-span correction is neither a new model response nor a fresh
review verdict. Exact edit accounting does not prove semantic correctness.
Finding a document format is not domain expertise. For delegated authoring,
keep the real mission objective in `--capability-query`; an SOP-shaped subtask
must not suppress its mission-level capability gap or activate a standing unit.

Apply the same separation to ordinary compound tasks: keep the original domain
objective in `--capability-query` and the complete requested work, including
glossary/SOP housekeeping and prohibitions, in the task query. Route distinct
domain objectives separately rather than omitting one. A glossary or document
format match does not establish expertise in the work being described. The
router now suggests bounded English/Korean task-clause separation when no objectives
are declared. It does not establish semantic completeness; unrecognized or
context-dependent wording can still hide a domain behind a supporting route.
Do not rewrite an issued mission objective or patch its receipts to obtain this
separation; an existing guarded mission retains its exact rerouting procedure.

Ordinary authoring does not require a dashboard, owner login, server or a full
platform verification campaign. Preserve original intent, source/interpretation
boundaries, ownership, supersession and unresolved decisions. Existing runtime
holds and actual delegated execution still require their original controls.

Router commands are validation recommendations, not actions already performed
or permission to expand the user's request. Lexical matches can include broad
or negated terms; distinguish drafting an instruction from executing it. Do not
strip required controls from an already issued receipt or context pack. Clarify
an ambiguous guarded operation before dispatch, not by silently removing gates.

### Conditional Instruction Delivery

The entrypoint links four phase-specific guides: [Project Content And Reporting](project-content.md),
[Client Operation](client-operation.md), [Project Terms](project-terms.md) and
[Delegated Waves](delegated-waves.md). Read the applicable body before its phase.
For a tool-disabled recipient, an authorized preparer must include those exact
bytes in the reviewed input; a link, catalog row or digest is not body delivery.
Do not silently add an unassigned guide to a manifest-governed read profile.
Missing assigned guidance holds dependent work, not unrelated permitted drafting.

The bundled helper emits local instruction content, not project sources:

```bash
node "$CONTROLS_SKILL_DIR/scripts/read_controls_instructions.js" --topic=project-content
node "$CONTROLS_SKILL_DIR/scripts/read_controls_instructions.js" --topic project-terms
```

Use the actual loaded skill directory established in the entrypoint. No topic
emits only the entrypoint; repeated topics select distinct named guides.
`--all` emits all four, without invoking a client, sending content or granting
permission. Unknown/duplicate topics and missing, unlinked, empty, invalid UTF-8
or symlinked instruction files fail without partial stdout. Installed root links
are resolved; child instruction paths must be ordinary local files.

The result binds each full body to its UTF-8 bytes and SHA-256; the content-set
digest binds their ordered path/byte/hash list. JSON framing adds bytes beyond
`emitted_content_bytes`. Count what the recipient actually receives, including
entrypoints, references, repeats and framing; do not report selection or helper
stdout as native-client reading. The helper cannot infer all semantic dependencies.

Direct terminology/content/client routes recommend the relevant modules, and
explicit inputs remain selected. Skill maintenance and guarded context select
all four in both provider trees so moved controls remain digest-bound.
`--explain-reading` records `conditional_instruction` reasons and triggers.
Recommendation does not assign reading, grant access, clear a hold or prove use.
Guarded packs are not shortened to meet an ordinary-work size target.
Run `node run-skill-progressive-disclosure-fixtures.js` for a bundle change,
then the affected installation, routing and context-integrity checks.

### Version-Bound Reference Reading

For a large optional corpus reference, inspect its navigation before choosing
the directly relevant body. Do not paste README, the source map or the research
compendium wholesale merely because they are navigation recommendations. This
does not remove assigned sources, applicable controls or the original task.
Read the complete entrypoint and full explicitly assigned source bodies; use an
excerpt only where the actual assignment permits selective reference reading.
A navigation index is not a complete source or evidence supporting a claim.

```bash
node "$CONTROLS_SKILL_DIR/scripts/read_controls_reference.js" \
  --file docs/source-map.md --index
node "$CONTROLS_SKILL_DIR/scripts/read_controls_reference.js" \
  --file docs/source-map.md --sha256 "$SOURCE_SHA256" --lines "$FIRST_LINE:$LAST_LINE"
node "$CONTROLS_SKILL_DIR/scripts/read_controls_reference.js" \
  --file docs/source-map.md --sha256 "$SOURCE_SHA256" --full
```

Set the variables from that file's index and the intended range; never reuse a
different file's digest. Use the full digest, not a display abbreviation. Ranges are inclusive,
one-based physical lines and preserve exact bytes, including CRLF and a missing
final newline. Navigation lists literal heading-shaped lines, not parsed Markdown
sections; inspect surrounding context and complete conditions before choosing a
range. The helper does not infer a section end, resolve links or decide sufficiency.
A source change anywhere invalidates an old selection, including unchanged lines.
Inspect the new version and reassess affected work instead of merely replacing
the old digest. Keep the earlier selection and its history.

This local reader accepts tracked corpus Markdown, not target-project sources,
untracked drafts, arbitrary files or execution receipts. It uses the loaded skill's
doctrine binding even from another repository; inspect a stale copy first.
Read authority must already exist. Do not replace manifest-governed or guarded
reading with this helper, use it to clear a hold, or treat a tracked file as public
release clearance. Project content retains its separate access/preparation path.

Count the entrypoint, emitted reference bodies, navigation text, JSON/tool framing
and all follow-up reading in the actual recipient trace. Repeated reads and
overlapping ranges still cost context; do not deduplicate them after delivery.
The body byte count excludes metadata/framing and is not the total wire count.
Local stdout does not prove native-client consumption, comprehension or R2 savings.
Retain original request, source requirements, authority and issued validation
commands alongside a prepared context; shorter guidance cannot waive them.

### Inspecting Reading Selection

Direct `request_intake` records matching-only views for a recognized leading
`Task:`, `Request:`, `Assignment:` or `Objective:` label and known exclusions.
The full `query` remains the source of intent and constraints. These views do
not change role, authority, assigned sources, selected controls or read access.
Do not forward the shortened relevance view as the user's complete request.
The document session carries these views alongside its required explicit
objective declarations. A returned view is neither an access grant nor a new
assignment; retain the prepared original and current assigned source profile.

When no `--capability-query` is supplied, bounded English action clauses joined
by sentences, semicolons, `and`, `then` or `also` can produce separate
`capability_assessments`. Check the `objectives` provenance: inferred clauses
are suggestions, not USER declarations. Inspect every original objective and
prohibition before forwarding; a covered SOP cannot clear an uncovered analysis.
Source-policy review and explicitly qualified draft-readiness checks remain
document/source work, not unsupported domains or unit readiness.
Quoted text and deictic steps such as "Review its design" are not independently
split because their meaning depends on context. Unsupported wording still needs
the faithful English-query path below. If extraction is absent or wrong,
review explicit per-objective declarations without deleting the original request.
Detected automatic compound intake cannot issue a guarded receipt or artifact;
use the original mission's reviewed tasking process, not an omitted objective
or single merged declaration. Existing caller declarations retain their exact
parent/mission meaning and still require completeness review.

### Korean Matching Views

Keep the actual Korean or mixed-language request in the task query. The router
recognizes bounded format/source terms, action endings, leading task labels and
complete platform exclusion clauses. It handles common nouns for SOP, handoff,
research/progress reports and glossary; it is not a Korean parser or translator.
`request_intake.normalization.matching_query` exposes the lexical view and
`complete_translation: false`. The original `query`, declared objectives, source
references and authority remain unchanged. Normalized Unicode and stripped
particles in that view do not establish byte-identical forwarding.
`objective_views` uses zero-based indices into the original `capability_queries`
or the single `capability_query`; inspect it even when an English task has a
Korean parent. A document clause cannot make a separate execution/deployment
clause read-only document work. Keep its operational context and original
authority limit; recognizing an action does not authorize it.

Review every purpose and prohibition against the original before assigning work.
Supported action conjunctions can yield separate original-language assessments;
an uncovered analysis must retain its gap even beside a covered SOP. Conditional
or unrecognized exclusions stay conservative. Explicit inputs, technical parent
objectives and actual design review still retain their technical references.
The output language alone is not a request for national military doctrine.
Unknown vocabulary, omitted spacing, dependent clauses and exclusions outside
the bounded grammar can still misroute or conceal work. A matched format is not
evidence that those clauses were understood.

For unsupported wording, preserve the exact original locally and route a faithful
English task description with the original purposes and prohibitions. Label it
as an operator translation, not a router translation or USER-confirmed meaning.
Compare that description and each declared objective with the original before
handoff; carry both at an authorized boundary. Do not introduce new access,
publish a glossary or rewrite a policy because a lexical view matched. Guarded
multi-objective rejection and existing receipt/mission controls still apply.

For direct analysis, add `--explain-reading` before `--` while retaining the exact
task, all objectives and the declared delegation. The optional `reading_selection`
reports the actual selection paths without changing recommendations or commands.
It is unavailable with guarded receipt/artifact/mission metadata or coverage mode;
do not drop those controls to get a diagnostic.

Inspect all reasons for a path. A route can conditionally omit a specialist manual
while a role or source argument still retains it. Use the row's `recommended`
value for the combined outcome, not one reason's `selected` flag. Route
`objective_indexes` are zero-based into `objective_queries`; they describe the
declared or inferred clauses, not verified semantic coverage.
An omitted route recommendation is neither missing doctrine nor denied access.

In direct document work, a supported model-transmission exclusion is not a model
allocation assignment. Check `model_specialist` when the only model mention is
inside that exclusion. Actual model subjects, parent tasks, assigned sources and
model-specific department duties still retain that context. Questions, exceptions
and dependent review stay conservative. Guarded routing keeps its selected model
references; no recommendation change removes validation commands or clears consent.

`source_argument` means an actual `--source` argument, potentially supplied by
an adapter from its assigned profile, not necessarily a direct USER instruction.
An inline `task_reference` can still need input/output clarification. Project
inputs stay separate metadata-only references; no body is read by this diagnostic.
Do not infer that the preparer or another phase performed no reads from that flag.

Use the evidence to review a proposed reading profile against the original task,
not to remove an issued prerequisite or control. Reasons do not establish required
reading, need-to-know or authorization. The bound receiving tool includes this
diagnostic, but only its separately assigned `documents` and current read results
establish eligible delivery and observed reading; a recommended unlisted source
still cannot be opened.

### Document Tasks And Execution Roles

Reviewing a report or document against supplied policy, original requirements or
assigned evidence is source-bound document work, even when the request does not
call it a draft or SOP. Retain the authoring/KM comparison procedure and actual
source inputs; a format name alone does not establish the subject's capability.
Route separately declared domain analysis independently. Ordinary review wording
does not authorize adoption, execution or a new source read.

Drafting or revising WARNO, OPORD, FRAGO, SITREP or AAR documents needs the
authoring/KM procedure as well as the order templates. A template match alone
does not cover source appraisal, unchanged constraints or revision history.
Keep drafting distinct from executing, approving or adopting that document;
the underlying mission objective still needs its own capability assessment.

An S3 label does not make a plain document task protected process execution.
For direct document work with explicit `read-only` authority, the router can
omit five execution-specialist role defaults while retaining core access,
authority, tool-use, order and policy guidance. Inspect `--explain-reading` for
the `read_only_document_role` reason. This is conditional recommendation, not
denied access, permission to omit an assigned guide or removal of a control.

Likewise, S4 prose work needs its resource/readiness policies, not automatically
the runtime SQL storage design. For direct explicitly read-only document work,
the router can omit that SQL role default. Retain it for SQL/relational storage,
database or schema-migration subjects, technical duties, explicit inputs or
inherited objectives. Apply the same guarded/unclear-authority limits below;
do not trim an issued reading profile because the direct recommendation shrank.

Keep the full defaults for guarded metadata, execution/unclear authority,
technical duties or parent/source requirements. Do not relabel L1 or an issued
delegation as read-only merely to get a smaller list. Actual task/authority/source
selection may still retain a document omitted by one reason. When role or phase
changes, reroute the real assignment; do not inherit the author's shorter list.
The lexical selector is conservative, not a substitute for reviewing the actual
required reading profile against the whole request.
Direct read-only routing is not a guarded agent receipt. Those receipts retain
their actual S3/operations/scoped-execution contract; do not change a delegation
merely to satisfy that contract or reinterpret its rejection as authorization.

### Using A Skill Versus Maintaining It

For own-product maintenance, inspect every objective's capability assessment as
well as selected manuals. `Maintain the Controls skills` and bounded document
context-reading evaluations have specific routes; a client/skill used to analyze
an uncovered domain does not establish that domain's coverage. Preserve mixed
requests and their remaining cells instead of substituting a maintenance keyword.
Distinguish a generic skill/client method from a specific subject named after it:
using a skill to inspect mission lifecycle still needs lifecycle guidance and controls.
A supported `No model transmission, dashboard or server development` clause
narrows platform reading only: the full prohibition, explicit/parent inputs and
selected controls remain. A fresh corrected route does not amend an issued receipt
or authorize the evaluation's model calls. See the [maintenance intake case](../../../docs/completion-backlog.md#own-skill-maintenance-intake-2026-11-16).

Diagnose a compound gap from each `capability_assessments` row, not the request's
first word or punctuation. A supported maintenance clause can coexist with an
unrecognized document format. Preparing an approval proposal routes its drafting
workflow; it does not approve the proposal or authorize transmission. A named
uncovered subject still needs its own assessment. Review explicit action clauses
after a colon as well as `and`/`then`; the prefix cannot supply another task's
domain coverage. Original wording, source inputs and prohibitions remain binding.
If extraction is uncertain, declare each actual objective with `--capability-query`
instead of deleting the difficult clause. Guarded multi-objective rejection stays
in force; direct draft routing cannot be reused as an execution receipt.

For ordinary direct work, a mention of Codex, Claude, CLI, skill, routing,
operator, inventory or coverage alone does not require installation and corpus
maintenance manuals. The selected skill-operations route keeps the product-scope,
authoring and document-routing guides. Its route/capability decisions and all
selected validation commands remain unchanged; supporting inventory still exposes
the conditional manuals. Other routes and role duties keep their own references.

Retain the full bundle for actual skill/router editing, installation, corpus
inventory/coverage, lifecycle work or an explicit specialist source. Check parent
objectives, supplied input names and delegated AI department as well as the local
query. Human-mode role metadata does not narrow the user's reading. This bounded
selector is not general intent parsing; ambiguous maintenance hints remain
conservative, and project filenames neither load content nor grant access.

Guarded receipts retain the full selected skill-operations reading. Do not replace
a receipt with a shorter direct route or alter an issued document profile. A
smaller list is not semantic completeness: preserve the original objectives,
independent domain gaps, assigned sources and every approval or stop condition.

## Compound Intake

In ordinary intake, declare each domain objective independently with repeated
`--capability-query` arguments. Keep the full request, supporting work and every
prohibition in the positional task query. Check the declarations against the
request before routing; neither keyword matching nor this CLI extracts or
verifies that list for you. Do not invent additional objectives or use only the
easy, supported part of a request as its capability scope.

```bash
node "$CONTROLS_SKILL_DIR/scripts/route_controls_docs.js" --actor=user \
  --capability-query="Research ICP and sales targeting using the canonical track view" \
  --capability-query="Maintain the project glossary" \
  -- "Research ICP and sales targeting using the canonical track view; maintain the project glossary. Do not publish."
```

The direct result preserves `capability_queries` and one `capability_assessments`
row per declaration. In this mode `capability_query` and the combined capability
scope retain the full task query. Any detected gap preserves one provisional
cell for that request, regardless of declaration order; a supported glossary
or document format cannot clear it. Required reading and controls from covered
objectives remain present. One declaration keeps the existing single-objective
output shape. Blank or exactly duplicated declarations fail.

An agent/helper forwarding this result must carry the per-objective query,
status, reason and matched routes, not only the combined `capability_routing`.
A request-level gap does not mean every objective is uncovered. Preserve the
assessment basis and the one request-scoped cell without inventing extra cells
or dropping the covered objectives' reading and controls.

Scoped USER definitions, user-defined terms and project terms are terminology
work even without the word "glossary". If an assigned guide covers a declared
objective but its lexical assessment reports a gap, report that mismatch with the guide's evidence;
do not claim the guide does not exist. Retain the returned assessment and other
domain gaps for review rather than silently rewriting receipts or activating a unit.

This is read-only intake analysis, not admission. Multiple declarations cannot
be used with receipts, artifact persistence, inventory mode or mission/wave
metadata. These paths fail before emitting an artifact instead of discarding
part of the request. Keep the complete assessment for plan/backbrief review;
guarded multi-objective integration remains unsupported. Do not drop declarations,
join them into one string to evade the rejection, or alter an issued mission.

The returned basis explicitly leaves objective completeness and semantic
correctness unverified. An individual declaration can still match an irrelevant
generic keyword, and an undeclared objective cannot be assessed. Preserve those
questions for the reviewer; `covered` is not proof of expertise or authority.

Keep trusted routing options before `--`, followed by the task as a single
argument. Quoting or an argv array prevents shell splitting, not the router's
option parsing. In an adapter with fixed delegation, check the returned actor,
role, department and authority against that delegation before using its result.
Neither the delimiter nor a successful comparison authenticates the caller.

### Continuing Direct Tasks

For a continuing ordinary task, preserve one caller-declared task ID and the
actual target project's absolute root. Pass both `--task-id` and `--task-root`
on each phase/agent route, including compound intake:

```bash
node "$CONTROLS_SKILL_DIR/scripts/route_controls_docs.js" --actor=ai \
  --role=S6 --department=knowledge --authority=read-only \
  --task-id=TASK-61 --task-root="/absolute/target-project" \
  --capability-query="Analyze museum attendance" \
  --capability-query="Draft an SOP" \
  -- "Compare the next museum inventory and revise the SOP. Do not publish."
```

The selected root must exist; aliases resolve to its real directory. The ID is
1-100 ASCII letters/digits/dots/underscores/hyphens, starting with a letter or
digit. Neither field is derived from the current wording or a role. When a gap
exists, their namespaced pair determines one cell and department candidate across
phases, agents and objective order. Another ID or root is a different identity;
covered work still needs no provisional cell. Without this pair, legacy direct
routing remains query-derived and cannot promise phase continuity.

Retain `task_context` with the original request in the handoff. Check its ID/root
against the assignment before reusing an organization. It is caller-declared,
not authenticated ownership, source currentness, task completeness or permission.
The same ID cannot make a changed purpose approved; keep every objective and
prohibition and review changed assignments separately. After a project move,
record the old/new binding explicitly instead of silently claiming continuity.

At a role transition, compare two bindings separately: the task/project pair
should persist, while the current role, department, authority and selected
reading must match the receiving assignment. A stable cell ID does not carry
the sender's route token, successful reads or reading profile into the receiver.
Retain original objectives alongside the new review step. Source-grounded draft
comparison against the original request is authoring work, not a new specialty
merely because it names the former role. This does not establish expertise for
the subject being reviewed; preserve any separate domain gap and issued controls.

Do not invent a runtime mission to stabilize a plain document task. This pair
is rejected with receipt, persistence, coverage or mission/wave/agent metadata;
existing guarded missions keep their mission-ID binding and exact gates.
Project input references, when supplied, must use the same root and retain all
their source/access checks. The identity pair loads no content or artifacts and
does not create a standing organization, shared registry or distributed lock.

For adapter-mediated tasks, inspect the actual argument and return contract before
delegation: who provides the task ID, who binds the canonical root, and who checks
the returned identity? For a query-only tool, verify whether it binds the pair
internally instead of assuming support or failure from its input shape alone.
Preserve the original assignment and hold identity-dependent continuation
until a supported binding exists; do not silently fall back to query-derived cells.

When the source root must stay private, an authorized preparer can bind it inside
the adapter and expose a reviewed project handle with the task ID. Check the
actual router argv and unprojected return locally; the recipient checks its ID
and handle and attributes the root check to the adapter. Never reconstruct the
hidden root from a working directory or claim the recipient authenticated it.
The preparer must also inspect launch context: a client may disclose its working
directory even when a tool response omits paths. Use a separate launch directory
when necessary; do not relocate refused inputs or relax disclosure controls.
This is an interface procedure, not a built-in private-root API or a distributed
identity service. Keep source freshness, objective comparison and current-route
checks separate. A valid ID does not make an inaccessible handoff receiver-ready.

### Comparative Tasks

`compare`, `comparison` and `baseline` alone are methods, not evidence of a
supported domain. A museum-attendance comparison must keep its capability gap;
an SOP comparison can match authoring without becoming an autonomous improvement
campaign. `matched_routes` may retain a comparison-related route and its checks
while `capability_routing` reports a gap. Use the latter for provisional-cell
handling, and retain both the original domain objective and supporting work.

Generic comparisons omit eleven campaign/verifier/transparency specialist
manuals from primary recommendations. General authority, evidence, knowledge
and artifact references remain. Explicit corpus/project inputs, inherited
capability queries and actual improvement or runtime-control comparison context
can restore specialist reading. Required sources and selected validation commands
are not removed. This is conditional reading, not a shortened execution gate;
do not edit issued receipts or waive controls based on recommendation counts.

This lexical correction is not general negation or domain understanding. Explicit
specialist terms in prohibitions still retain related reading conservatively.
Check meaning against the original request; never delete a prohibition or source
reference to improve the count. Ordinary prose routing still does not authorize
running every suggested check or starting a campaign.

### Review And Successor Work

Source-grounded finding appraisal, document self-review and work/review reports
are authoring work. A successor review unit or follow-on review packet uses the
handoff procedure even when its name omits `handoff`. Describe these actual
outputs without replacing the original domain objective with a method label.
Keep every declared objective: a covered review/report cannot clear an uncovered
domain assessment. Generic review, findings or unit wording alone proves neither
domain coverage nor sufficient context; check the returned per-objective decision.

A corrected lexical match changes a fresh recommendation, not an issued receipt.
Gap-only change-order preparation may disappear when all declared objectives
match, but required inputs and independently selected controls remain. Do not
rewrite old routes, retire an existing cell or waive its obligations from that
new result. Use the existing mission/task continuation rules. Recommendations
do not prove source comprehension, read permission or semantic completeness.

## Installation And Corpus Binding

Locate the loaded `SKILL.md` before launching its bundled scripts. Keep the
target project as the working directory and use the entrypoint's installed-path
commands, or set `CONTROLS_SKILL_DIR` to the actual loaded directory for that
invocation. Installer locations honor the provider's `*_SKILLS_DIR`, then
`*_HOME`, then the ordinary user directory. These are installer conventions,
not proof that a client discovered the same location. A plugin/project skill
may live elsewhere; use the path actually supplied by the client.

Do not append `.` as a doctrine root merely because the target is the current
directory. After routing, resolve corpus recommendations and corpus-check
commands against returned `repo_root`; project inputs retain their own origin.
Same-named files in the target project are not substitutes for corpus policy.
Changing a command's working directory does not change the target repository
or authorize writing task outputs into doctrine. Test the literal entrypoint
commands in fresh shells, not only a test helper's independently built argv.

Use `install-ai-cli-skills.sh --dry-run` before changing destinations; this
prints the plan without invoking client binaries or writing installations.
Node.js is required. Codex/Claude binaries are optional at install time; their
presence or version output does not prove the client has loaded the skill.
The installer checks both destinations before writes and rejects source-tree
overlap, overlapping client destinations and non-matching existing targets
without `--force`. Copies are staged before replacement. This is not a
multi-client crash transaction: after an interruption, inspect both destinations
and any retained `.controls-install.*` recovery directory before retrying.

The document router resolves its corpus in this order: explicit
`--doctrine-root` (or the legacy positional root), `CANNAE_OS_HOME`, a copy's
`.cannae-os-root`, the physical installed-source ancestry, then working-directory
ancestry. Do not supply both explicit forms. The flag/environment/marker must
name the actual corpus root; invalid or stale bindings fail instead of falling
back. Markers must be regular files with absolute paths. A deliberate explicit
override can recover a moved corpus without mutating user configuration.
Other retained runtime wrappers have their own resolver contracts; this stricter
precedence statement concerns `route_controls_docs.js`.

Copies contain the skill entrypoint, metadata, scripts and references, not the
whole corpus or runtime. Refresh them deliberately with `--copy --force` after
reviewing local changes; live links already follow the source. Keep corpus
selection separate from target output paths. Test with isolated homes using
`node run-skill-installation-fixtures.js`; fake CLI version probes are not
native discovery, login, model execution or separately packaged plugin evidence.

For a read-only copy/version diagnosis, run the trusted corpus's
`skill-installation-inspector.js --provider codex|claude --installed <absolute-path>`.
Do not ask an old installed router to certify itself. The inspector compares the
tracked/non-ignored source bundle inventory and current working-tree bytes,
executable bits and the default marker/source-ancestry binding. It records the
source HEAD separately; matching hashes do not mean the source is committed,
trusted or compatible with every runtime/client version. Missing, changed, unsafe
or unexpected installed entries require appraisal. Unknown entry contents are
not read or executed. Explicit/environment corpus overrides and client startup
settings are not assessed, and no settings or installed files are changed.
Keep intentional local edits until reviewed; a difference is not automatically
an obsolete copy. Follow the existing dry-run/replacement procedure only after
choosing the intended source and preserving changes. Native discovery, delivered
bodies and successful task behavior still need their own evidence.

Check the effective startup mode when an installed skill is missing. Claude's
`--bare` skips automatic user-directory discovery; do not diagnose that as a
broken link or remove permission controls to make a test pass. The ordinary
initializer and a minimal-mode initializer are different test conditions.
The tested Claude client also omitted a linked user skill when
`--setting-sources ""` excluded user sources. Do not repair a valid installation
or change persistent settings to compensate for that launch condition.

For an opt-in macOS metadata check, run `skill-client-discovery-probe.js` with
`--codex /absolute/path/to/codex` and/or `--claude /absolute/path/to/claude`.
It uses temporary homes, checks OS network/write denial before starting each
client, and sends no user/model prompt. Codex renders prompt metadata; Claude
receives only its initialization request, with tools/hooks/MCP disabled and
real client credentials/keychain access denied. The absent/link/copy checks
and Claude bare-mode/user-source-exclusion negative cases must match their expected results.
`run-skill-client-discovery-fixtures.js` tests the helper without native clients.
Neither check proves skill-body consumption, semantic work quality, the current
user's settings, authenticated model access or production isolation. Record
client versions and keep actual task execution as a separate acceptance step.

### Selection And Body Delivery

Diagnose installation, metadata discovery, full-body delivery and task behavior
separately. A metadata-only preview is not proof that a real turn omits the body.
When deliberately selecting this workflow in Codex, use the native
`$controls-doctrine-operator` selection with the task. Preserve the literal `$`
with single quotes when passing that prompt through a shell. This is not the
direct router command, and an ordinary client turn can invoke a model and tools.
Do not change automatic-selection policy or enable extra tools merely to test
selection. In Claude Code, start the task with the discovered
`/controls-doctrine-operator` command instead. The observed bare-mode user
installation did not deliver the body even with that text; verify the effective
mode rather than assuming that a name in a prompt proves activation.

For delivery evidence, compare the exact loaded entrypoint with client-inserted
request content, not a name, metadata description, marker or model's claim that
it read the instructions. Codex's separate skill item is not a universal payload
format for other clients. If there is no explicit selection, absence
from the first request does not prove failure: later authorized source reading
has not yet been observed. A local request capture can establish assembly, but
not model consumption, routed document reads, successful work or receiver
acceptance. An intentional capture-endpoint error is not a completed model turn.
Record the actual offered tools; feature switches alone do not prove an empty
tool list. Keep real credentials/configuration unchanged and obtain separate
scope approval before any actual-model verification.

For an approved tool-assisted check, inspect client-native tools separately from
the selected server's allowlist. A read-only server may coexist with native
resource helpers; inspect exposed resources as well as tool names. Keep the
required client tool bridge available within the approved invocation, rather
than treating every disabled feature as a stronger test. Diagnose its failure
without enabling unrelated actions or changing persistent user settings.
The [Codex receiving case](../../../docs/document-authoring-case-study.md#native-codex-routing-and-receiving)
returned a blocked answer with no MCP calls despite an advertised catalog; client
errors showed a rejected discovery attempt. Its separate retry made actual reads.
Reconcile call identities, arguments and results with source bindings, allowing
parallel completions and repeated reads. Such observation is not a pre-call gate,
proof of minimal context, or permission to weaken a no-tool review's controls.

Claude's selected request contained the complete Markdown body without YAML
frontmatter; compare the appropriate instruction body rather than demanding
Codex's full-file envelope. Do not confuse this with proof that every frontmatter
control was enforced. A single native process can make several transport
requests, even after HTTP 400. Declare retry scope separately from process
relaunches before consent; do not claim one provider request from one CLI run.
For Claude result events, a `success` subtype alone is insufficient: inspect
`is_error`, process exit, usage and substantive output. An error rendered as an
assistant message is not a model-authored review or receiver acknowledgement.

Before an approved native model check, test existing login under the exact
intended launch environment. A login result from the ordinary shell is not
evidence for a sanitized invocation. Preserve the supported existing user/config
identity; do not copy tokens into a temporary home or weaken personal-context
exclusions to obtain a passing result. This is not a requirement to inherit every
environment variable. Record failed attempts and diagnose before a separate retry.

Observe the provider's typed events, not message-text keywords. Claude
`system/thinking_tokens` carries progress estimates, not a tool call or final
usage. The bounded classifier in `authoring-review-packet.js` accepts its known
shape while rejecting unknown envelopes and tool-bearing messages. Retain raw
terminal events even after an earlier error. Neither progress nor a parsed
result substitutes for successful process termination and source appraisal;
an interrupted call's unreported usage is unknown, not zero.

## Authoring Review Packets

For task-source delivery rather than an evaluation corpus, use
`scripts/prepare_controls_documents.js prepare|inspect|review-content` and the project-content
section of `docs/role-document-access-policy.md`. Preparation reads only the
explicitly selected project sources under the source owner's authority, binds
origin/content/recipient, and preserves raw/summary/reference-only distinctions.
Outputs stay in the project, and only `prompt.md` is proposed recipient input.
Known withheld-source and repository paths cannot appear in the task, recipient
or delivered text. Retain the original request locally and review any source-ID
rephrasing without dropping constraints; the helper does not silently redact.
Literal-path checks do not detect unknown locations, aliases or encoded secrets.
Recheck against the previously reviewed packet digest, not a newly invented
approval. No native transfer or receiver acceptance is provided by this helper.
Use `review-content` only as an authorized source preparer when diagnosing a
content refusal. It prints source-index/digest and rule/count metadata, stops at
the first blocked scope and never writes a packet or clears a finding. Read
`docs/role-document-access-policy.md#content-review-diagnostics` before treating
a partial result as evidence; keep the original request and source bytes intact.
Source IDs and required-term labels are recipient content, not harmless catalog
metadata. Inspect findings by scope and document_index, not fixed array positions;
an outbound-metadata refusal leaves every source unread. Keep refused bindings
unchanged pending review, and never silently rename an ID to evade screening.
Rescreen retained packets with `inspect`; an older digest is not a screening waiver.
For the USER-approved bounded review design, follow the access policy's
`reviewed-document-preparation` procedure. `propose-review` writes private review
material, not a cleared packet. Only record `decision.json` after the actual USER
has reviewed the exact version, recipient and purpose; retain its reference and
separately expected digest. Never mint that decision from a role label, general
verification consent or a model's review. `prepare-reviewed` rechecks the exact
proposal, current sources, screening implementation, expiry and canonical decision.
Inspect again before separately authorized use; changed or revoked records hold
delivery. A `representation` is distinct from raw/summary content and retains
source and delivered digests. An adapter that cannot preserve that mode must stop,
not relabel it. No new tool, publication, authenticated identity or host protection
is supplied by this local review procedure.

Before building a client manifest, validate source paths and delivery modes.
For `PROJECT_PACKET_REQUEST_INVALID`, inspect the local request validator's
document indices; distinguish a path rejection from content screening or a model
failure. Keep the rejected request and originals. Do not copy an internal draft
to an ordinary path to obtain raw delivery. Eligible drafts require exact reviewed
preparation even with no screening findings and an identity representation;
equal source/delivered digests do not create approval or change the delivery mode.

For file-backed source tools, use the access policy's `bound-recipient-reader`
procedure instead of assembling a catalog from private packet fields. The trusted
preparer binds the exact packet digest and recipient once; each catalog/read
rechecks the current sources and any reviewed decision. Preserve `representation`
and `summary` modes and both digests in tool responses. Do not retain a successful
catalog as later read authority, infer reading from listed IDs or pass model-chosen
paths/recipients to the reader factory. Its calls do not replace current routing,
phase holds, consent or actual client-delivery evidence.
For a tool-assisted receiving phase, the access policy's `routed-receiving-tools`
procedure binds the same reader to actual installed routing. Keep the complete
original assignment alongside the current query and every declared objective.
A failed reroute cannot fall back to the old read context, including one rejected
for invalid tool arguments. Correct the request and obtain a fresh route before
reading; never retry the previous read ID as recovery. A source-specific hold
does not bar unaffected permitted reading, but must remain pending in the report.
Count returned source IDs separately from model comprehension. Use the stdio
adapter only as an explicitly assigned, bounded client child process; do not
install it globally or turn a transport check into native acceptance or consent.
Recipient delivery holds do not authorize the preparer to reread a prohibited
source. If that source cannot be rechecked within existing authority, stop before
creating the session rather than using the hold list to bypass the prerequisite.

Keep the session's `document-only-verification` descriptor and the recipient's
separate L-level/profile unchanged. The router recognizes that exact descriptor
for ordinary S3/S4 document relevance; it is not a new read or execution grant.
Check the original assignment, current task, objectives and assigned sources
before narrowing recommendations. A required guide still stays required; an
allowed optional guide can remain readable even when it is not recommended.
Do not relabel authority, trim the original task or remove profile entries to
make a shorter list. Test the actual session and transport, not only a direct CLI
query; local handler returns still do not prove native reading or comprehension.

When a tool-assisted review disputes a source locator, use `locate_quote` only
if the trusted preparer enabled it for that review session. First complete the
source's current-route full read, then supply its delivered digest and a unique
literal passage; do not enable tools or search arbitrary files yourself. Inspect
the returned line context against the actual heading/table cell and historical
or recipient qualifiers. A literal match proves location, not semantic support.
Missing or ambiguous quotes require a better supported selection, not a guessed
occurrence. Summary/representation positions are not original-source positions.
Verify numeric citations for the exact passage, including blank lines: a returned
cell location does not verify the header's line. Locate that header or check its
line in the full source; otherwise use a checked heading or unique passage.
Rerouting requires a new full read; lookup does not clear other required reads
or holds. Follow the access policy's `exact-quote-lookup` limits. Ordinary drafting
does not require this tool, and no native acceptance follows from local fixtures.
Keep prior-phase lookup evidence attributed to that phase. Unchanged delivered
bytes can preserve its location, not its route authority or proof of a new call.

For a source-grounded authoring assessment, `authoring-review-packet.js inspect`
checks the local evaluation inputs, and `prepare` writes a fresh repository-local
packet. Both are offline: neither invokes a model nor records consent. Only
`prompt.md` is evaluator input; `author-reference.json` is withheld until review.
Compare the exact prompt digest before any separately approved model call.
The helper's fixtures verify extraction, source binding and separation, not
semantic detection. Its unedited case is not presumed flawless, and a new
model context is not independent operator/provider/infrastructure acceptance.

For an approved native review, classify structured events rather than searching
their text for tool names. Codex item-level `error` diagnostics are not tool
calls; retain them without treating them as success. Top-level failure events,
malformed envelopes and actual or unknown tool items still fail the assessment.
Require a completed turn and a substantive review before evaluating its content.
An aborted one-use invocation consumes that attempt: keep the original evidence,
record any observer correction separately and obtain fresh consent before retry.
Do not enable disabled tools merely to silence a startup diagnostic.

## Specialist Reading

General authority, approval, risk, tool and disclosure policy remains primary
when the authority route matches. GitHub release-operation manuals become
primary only with release-specific context in the task, mission objective or
resolved source references. Verifier dependency migration retains its existing
release-verification reading. A generic support SOP with "do not publish" no
longer requires those four specialist manuals.

This GitHub-release selection is positive context matching, not a negation parser. Explicit GitHub
release prohibitions, mixed clauses and "do not skip verification" still retain
specialist reading. The route IDs, capability decision, mode/authority and
selected validation commands are not reduced. Generic publication still needs
its normal approvals; a shorter reading list does not authorize an action.
Specialist files remain discoverable as supporting artifacts. Read them when
their operation applies, not merely because they appear in that inventory.
Re-route for the new task/phase instead of manually trimming an issued packet.
Test the direct result, generated receipt and receiver context separately.

### Source Reading Scope

General source review keeps the source map, compendium and reliability rubric.
The `sources-research` bundle adds Korean military/culture references for Korean
military or organizational subjects, explicit national inputs and whole-family or
multinational-doctrine reviews. Military/doctrine, role-alias/jurisdiction and multinational context retain the
multinational consistency guide. A U.S.-only military topic does not by itself
require Korean-specific manuals. Other routes keep their own requirements.

Use the actual task, inherited objectives, declared AI department and resolved
corpus/project input references. Delivery-language wording such as `in Korean`
at a sentence end or `Korean-language` is not a national subject. Conversely,
`in Korean military organizations` remains subject context. The original request
and explicit inputs are unchanged; filename hints do not load or authorize content.
All selected validation commands and role requirements remain, and specialist
documents stay discoverable in the supporting inventory.

This is bounded positive relevance matching, not a general negation parser,
semantic decomposition or a globally minimal reading profile. National subjects
in prohibitions and ambiguous clauses remain conservative hints. A shorter list
does not establish domain competence or let an agent discard already assigned
reading. Resolve uncertainty against the original task and use reviewed rerouting
for changed requirements rather than trimming an issued receipt or context.

### Runtime Reading Scope

An ordinary prose handoff no longer adds event-storage architecture by default.
Five architecture, event-store, dashboard/wireframe and database-model references
are conditional in the runtime/dashboard and continuity routes. General maintenance
readiness remains when that route matches. Other routes, declared technical
departments, actual technical task/parent context and explicit corpus/project
inputs still add their references; a prohibition on implementation does not
cancel an assigned technical review or required source.

The router recognizes a bounded set of complete English exclusions, such as
"Do not build a dashboard", "Do not publish or build a dashboard",
"Exclude dashboard and server work", "Dashboard development is deferred", and complete
noun lists like "no publication, dashboard or service work". Platform items may
carry development, implementation or work suffixes, including coordinated
service/server nouns: "Dashboard and service development remain deferred" and
"No publication, external operations, dashboard or server development".
Publication, transmission, deployment, private-source exceptions and external
operations are recognized non-platform items in these complete exclusion lists.
Unknown items, review qualifications and conditions remain relevant.
Complete mixed lists also recognize plural model transmissions/transfers and
"Keep ... deferred" or "Leave ... out of scope". Appraise the entire clause:
"Keep model transfers and dashboard development deferred" is a scope constraint,
whereas a question, conditional deferral or subsequent design review is not a
reason to omit the technical subject. Do not drop an unknown list item or question
mark to force a narrower route. Check the original request and retained controls;
this wording support neither authorizes model transmission nor renews consent.
Those clauses cannot by themselves establish runtime capability or require the
five specialist manuals. The original task and capability query remain verbatim, and selected
route IDs and validation commands remain. Thus "Analyze museum attendance; do not
build a dashboard" keeps its domain gap and provisional cell instead of claiming
dashboard expertise covers the analysis. This adds the existing gap controls,
not authority to create a standing department.

In a recognized authoring task, "clarify document readiness" and "readiness of
the draft" describe the document, not unit/tool preparedness. These bounded
qualified forms no longer add the five runtime manuals or runtime capability
evidence. "Document readiness failures" can instead be an instruction to report
operational conditions and stays conservative. Positive task/parent context,
technical duties and explicit inputs still retain their references.

Check the whole coordinated clause and later work before dropping conditional
reading. "Do not build a dashboard or a server" excludes construction, but a
following "Inspect the server design" still requires technical context. A later
review of a named platform object is treated conservatively, like a pronoun
reference. Do not delete the prohibition from the task or use it to clear a
positive parent objective, explicit source, technical duty or selected control.

Check the full authoring bundle for modifiers and plural formats: "revise outgoing
document handoffs" must retain the writing procedure and handoff template, not
only lose unrelated manuals. General maintenance reading and selected commands
remain available; fewer or differently composed recommendations are not proof
of globally minimal or semantically complete context.

Unsupported mixed, conditional and unknown wording stays conservative. "Do not
skip dashboard verification", "do not build it but review its design" and positive parent tasks
still require reading. This is not general negation parsing, language understanding
or globally minimal context selection. A technical filename is a relevance hint,
not content access or domain competence. Check every original objective and the
actual assigned reading before claiming completeness. Never trim an already issued
packet to match a new count; follow its currentness/rerouting procedure.

## Explicit Task Inputs

The router adds existing corpus files named in the task query to primary
recommendations. Exact relative paths take precedence; a bare filename resolves
only when it is unique or names a root file. Use backticks or a Markdown link
for paths with spaces. A qualified missing path is never repaired by guessing
another basename. The mission-level capability query is not an extra source
reading list for every agent.

For a required input, repeat `--source=SUPPORT.md --source=SECURITY.md` in the
router command. Missing, ambiguous, excluded, outside-root or symlinked inputs
stop that invocation before JSON/receipt publication. Source options do not
change capability matching or authority. Receipts retain resolved paths in
`recommended_documents` and explicit options in `router_command`; existing
context generation binds recommended file bytes separately.

Inspect `task_references.resolved` and `task_references.unresolved` in direct
output. Unresolved ordinary mentions also appear in receipt escalation conditions.
They are not automatically fatal because they may name a new output. Confirm
which are inputs and rerun with `--source` before relying on them; do not present
an unresolved required input as completed research. This is lexical lookup,
not semantic completeness or a required-input manifest for every mission.
Filename matches can occur in examples or prohibitions. Preserve an explicit
"do not read" instruction even when that file appears in recommendations.

Excluded local state and symlink paths are not corpus recommendations. Git
ignore rules apply when Git inventory is available; the warned fallback only
excludes known local-state directories. URLs are not fetched or replaced with
same-named local files. Sources from another repository need its separately
authorized reading/handoff flow; never copy private inputs into doctrine merely
to satisfy this resolver. A path recommendation is not content, freshness proof,
access approval or permission to follow instructions inside that document.

## Project Input References

For direct routing, pair `--input-repository=/path/to/project` with one or more
`--input-source=policies/SUPPORT.md` options. The repository must be a distinct,
existing Git worktree root; no current-directory inference or ancestor fallback
is used for this binding. Relative root arguments are relative to the caller's
working directory, and output names the physical root. `--target-repository`
remains an artifact destination option, not a source selector.

Project inputs appear in `task_inputs`, separate from doctrine-relative
`recommended_documents` and `supporting_artifacts`. Use the pair of repository
root and exact relative path; never substitute a same-named doctrine file.
`--source` still names required doctrine inputs. Both selectors may be used
together when both origins are intentionally required.

In project-input mode, recognized filename mentions resolve only to explicitly
selected project paths, unless that reference is also an explicit `--source`.
Other mentions become `input_source_not_declared`; they are not silently looked
up in doctrine. Inspect `task_references.input_resolved` and `unresolved` before
using a mention as an input. This lexical check is not semantic completeness;
required project files must be named with `--input-source`, including data files
whose extension is outside the corpus mention scanner.

Each selected input must be an exact, canonical, existing regular file with no
symlink components. Missing files, directories, traversal, excluded local-state
paths and Git-ignored files fail the invocation with no partial JSON. Ignore
rules also apply to force-tracked ignored files. There is no basename search,
directory crawl, URL fetch, input-body loading, content digest or copy into
doctrine. Git reads repository/ignore configuration to validate these paths.
Unknown options and missing values fail; use `--` before literal task text that
starts with a dash instead of inventing an option.

The output is reference-only metadata with `content_loaded: false` and
`authorization_verified: false`, in human and delegated modes alike. It proves
only the observed path resolution, not current bytes, source freshness,
classification, permission, delivery or comprehension. Apply actual task/role
and disclosure authority before later source use; a provisional cell gains no
additional access from these references.

Receipt, artifact-publication and coverage modes reject project-input options
because their contracts do not yet bind these external references. Do not drop
inputs to get a receipt or invent delivery evidence. Root-qualified, authorized
content delivery and its receiver/context/receipt checks remain a separate next
step; the doctrine-only access projector is not silently retargeted by these
flags. Test this surface with `node run-document-authoring-input-fixtures.js`.

## Delegated Reading Lists

Use `document-access-runner.js` with the authorized manifest and the agent's real
role, duty and authority level before relying on a delegated reading list. It
validates the whole manifest, then intersects document rules with the selected
profile's required/optional paths; a role match cannot expand that list.
Blocked projections have no allowed rows. CLI exit 1 is blocked, 2 is invalid
input and 0 only means the projection is ready. Never continue from a nonzero
exit by extracting an apparently allowed row from old output.

Summary permission is not permission to open raw text to make that summary;
reference-only delivery is not source reading. An eligible required row is not
proof of actual delivery or comprehension. Neither `authorization_verified`
nor the manifest validator's `can_execute` becomes true. Caller-supplied role
or authority labels cannot establish delegation, and USER visibility is not
limited by an AI profile. The runner resolves doctrine-relative paths even from
another working directory; it does not import target-project sources. Follow
`docs/role-document-access-policy.md#projection-boundary` for limits, and test
changes with `node run-document-access-fixtures.js` before using new projections.

Required means a completion prerequisite for its dependent work, not another
recommendation rank. Before finalizing that work, reconcile required rows with
actual current-phase reads. Identify unread or unavailable requirements and
keep the affected review incomplete; independent partial findings may remain
useful. The assigning operator should select a minimal justified profile, but
the recipient cannot silently downgrade that issued profile to shorten reading.

Before assignment, map each required source to the task claim or boundary that
depends on it; name a trigger for each optional reference. Compare this mapping
with the original request and explicit inputs, not just router recommendations.
Preserve the projection's separate required and allowed lists when delivering
context; do not mark every allowed row required. Follow the minimum-sufficient
reading procedure in `docs/role-document-access-policy.md`. This does not permit
changing an issued list or dropping controls to obtain a passing review.

Research/progress/status reports and decision summaries select the authoring
procedure, not subject-matter expertise. Preserve separately declared domain gaps.
Check actual per-objective wording from each client; a rewritten query that matches
does not repair the original miss or prove equivalent native behavior.

For native discovery diagnostics, distinguish metadata, a Skill invocation,
its launch acknowledgement and actual body delivery. Documented optional task
arguments are not an extra tool or an authority grant. The repository helper
`verifyClaudeSkillBody` checks the exact native loaded-body event, directory and
observed arguments separately; test it with `run-skill-client-discovery-fixtures.js`.
It does not reconcile the invoking call or prove comprehension. Keep full event
history and original failures; an observer correction is not a product pass.

## Conditional Runtime Maintenance

The following operating notes apply only to a relevant existing guarded
operation or explicitly requested maintenance. They are not default onboarding.
Detailed retained procedures are in `references/runtime-operations.md`.
## Force Registry Enrollment

Read `docs/force-registry-enrollment.md` for stable organization, capability and
performer definitions. Use `scripts/operate_controls_force_registry.js propose`
for an exact non-authorizing request, then leave its distinct definition-only
review and password reauthentication to the real owner in the console. A chat
approval, Commander string, earlier order consent or proposed profile is not
enrollment authority. Never read/export the owner's private signing state.
Inspect a lost response and retain partial publication holds; no replay,
automatic repair, signature replacement or retired-ID resurrection is supported.
Public-key pins come from the trusted operator, never from the acting agent.
Require the browser's digest of the complete displayed review; a nonce alone
cannot approve a modified or truncated subject. Keep supporting text in its
original artifact and private owner review, not copied into signed enrollment
history. A changed manifest or target needs a new preview, never replayed consent.
Enrolled is still unassessed: do not dispatch, promote, train unrestrictedly or
activate a standing unit from this registry. Qualification, mandatory actual
grant consumers, full organization lifecycle and controlled rollout remain open.

## Actual Workload Controls

Route `workload-control`, `subject-bound` and report/evidence scan issues to
`docs/subject-bound-workload-controls.md`. Run the workload and control-enforcement
fixtures for code changes, but do not cite those fixture results as a mission's
policy assessment. Use the actual lifecycle `report` operation: it reads exact
same-mission/wave work bytes, runs the bounded worker and retains a separate
digest-only receipt. Keep rejected attempts; replace/redact only through reviewed
work, assign a fresh report ID, then rerun admission. No caller flag skips this
gate. Legacy admitted reports remain readable, not newly publishable authority.

## Readiness Restrictions

Read `docs/readiness-drop-reconciliation.md` after a readiness drop. A rating or
schema-valid event is not a grant. Inspect actual affected leases with
`scripts/reconcile_controls_readiness.js inspect`, collect already admitted
results and use `reconcile` to narrow them. Blocked is not terminal revocation;
preserve tool-effect/gateway obligations and reconcile again after settlement.
Never replay a tool, delete an event, use a later promotion to revive old scope
or infer full qualification from the absence of a drop. Match the actual receiver
role/task and inspect retained introduction history, not path-sorted manifests.
Literal task matching is not a stable cross-mission capability/performer registry.

## Native Producer History

For native consumer upgrades, route to `docs/native-training-producer-history.md`
and use `scripts/inspect_controls_training_producer.js inspect <method-sha256>`.
Run the producer contract, snapshot and actual prior-producer runners before
accepting a new consumer. Preserve the
real old producer, exact source/ignored directory shape and original records;
inspection never signs, executes, settles, qualifies or clears a native hold.
Freeze the actual current producer and its signed attempts before changing
method-bound files. For later snapshots, reference already retained archives by
exact path/size/hash instead of embedding recursive copies; hydrate and verify
the complete original tree and source digest before any fixture execution.
Keep runtime authentication databases and private keys out of source snapshots.
For a failed collection, inspect which hashes the original journal actually
contains. A later response-file hash is a new observation, not an original byte
commitment; missing original evidence must not become a fabricated success or
automatic hold discharge.

## Native Failure Evidence

For failed native training transfers, read `docs/native-training-failure-reconciliation.md`.
An ordinary CLI document-review or context-measurement failure is not a training
trial. Use [Client Operation](client-operation.md) for its exact failed attempt
and consent boundary; do not invent training enrollment or an operator application.
Declared training parent tasks, assigned sources and existing guarded operations
still retain their applicable training controls. A wording change cannot clear
an issued hold or renew transfer consent.
Run the dedicated contracts, actual failure/reconciliation and process-death
matrices, not just a signature audit. Use only the native owner UI or native API
for fresh displayed-subject/password/session/epoch/nonce approval; never script
the older omission/analysis endpoint or sign owner consent from an agent.
Keep provider uncertainty, publication state and response-proof limits as separate
acknowledgments. Inspect the actual persisted receipt after delivery loss rather
than reposting it. A failed/ignored receipt write requires fresh consent. History
must reappraise private original evidence even with model execution disabled;
drift restores the hold. Acknowledgment admits no work, grade, settlement or grant.
Run all four routed control groups (`prefixes`, `authority`, `receipts`,
`publication`); they partition the complete matrix to fit the unchanged
ten-minute per-control watchdog. A passing group alone is not a full matrix.
Distinguish rejected responses from accepted task bytes and inspect all three
deterministic publication IDs even when the failed row has null references.
Do not regenerate missing output. A later hash of an originally unbound response
is a current observation; freeze it in any future review and reject review-time
drift without claiming an original byte commitment. Keep missing evidence,
reused/unobservable PIDs and orphan ownership held separately.

## Manual Receipt Procedure

Use only for diagnosis/lower-level integration, not default dispatch. Give the
wave and every receiver the same mission objective as `--capability-query`; the
final query describes that receipt's narrower task. These commands grant nothing:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --receipt --scope=wave --mission=MIS-... --wave=W2 --agent=chief-of-staff --actor=ai --role=COS --department=coordination --authority=tasking --capability-query="<mission objective>" "<wave task>" .
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --receipt --scope=agent --mission=MIS-... --wave=W2 --agent=plans-agent --actor=ai --role=S3 --department=operations --authority=scoped-execution --capability-query="<mission objective>" "<agent task>" .
node agent-routing-preflight-runner.js <agent-routing-preflight-bundle.json>
```

## Requirement Review

For model-proposed analysis from a retained request, read
`docs/native-order-analysis.md`. Use `scripts/prepare_controls_analysis.js`
only to prepare; real transfer uses the owner's exact request-analysis purpose,
not omission/order consent or a CLI run flag. Inspect Model Actions after a lost
response; never rerun to hide failure or use the omission acknowledgment to clear
an analysis hold. Generate the exact bounded plan, then obtain fresh coverage and
USER adoption before dispatch. Proposed roles and quoted bytes do not
prove semantic completeness or expand authority.
On `ORDER_INTAKE_DRAFT_TOO_LARGE`, stop publication and preserve the original
analysis/transfer history. Small responses can amplify through inherited task
text; do not raise the 8 MiB reader limit, drop constraints/tasks or retry a
model automatically. Ask for a separately reviewed bounded decomposition and
fresh review/consent where required. Test the actual compiler and reader, not
only response schema/input bytes. Old oversized artifacts are not repaired by
truncation or re-signing.
An overall-size regression must first pass structural validation; a per-field
`MAX_LENGTH` denial does not prove the complete-output budget ran.
After uncertain draft publication, inspect Evidence and Model Actions separately;
preserve a draft already written without clearing the held transfer or rerunning it.
For a verifiable failed analysis, use the separate procedure in
`docs/order-analysis-reconciliation.md`. Review both original process/journal
proof and the exact observed draft publication, then let the real owner consume
the analysis-specific two-acknowledgment ceremony. Never use omission endpoints,
recompile to discover effects, adopt/delete a draft as cleanup or treat verified
manifest absence as proof of no effects. Inspect a lost commit; obtain fresh
consent after a failed reservation. Unknown/integrity holds remain unsupported.
For signed model history, require the full invocation and nested preview to rehash
to their original signed commitments before trusting displayed scope. A valid
signature over a digest field alone is insufficient. Keep changed records held;
never recalculate their hashes or re-sign altered bodies as a history repair.

Inventory coverage and request routing are separate gates. After adding a
contract alias, run `node run-document-routing-fixtures.js` as well as `--coverage`
for both providers; a fully indexed corpus can still misroute a real query.
If a known `semantic-review-assignment` request returns `gap_detected`, retain
that failed result and inspect the query rule before proposing a new department.
Do not suppress real capability gaps or infer authority from a corrected route.

For automatic structural plan construction, read `docs/bounded-plan-synthesis.md`
and use `scripts/plan_controls_mission.js` against the explicit target repository.
Supply bounded roster/policy/control inputs, not a fabricated complete plan.
Inspect `blocked` and search-limit results; never drop tasks, raise a budget or
retry a larger search automatically to obtain readiness. Use only the returned
plan with `planning_ref`. For a successor, run `prepare-revision` before preparing
fresh coverage, then use its finalized plan. An old review is invalid after that
binding changes. Preserve parent intent/caps and actual supersession/settlement;
generation grants neither model transfer nor adoption, dispatch or release.
The structural generator uses zero model calls and does not replace calibrated
semantic analysis or an independently reviewed strategic planner.
Reuse agent identity across a successor only with wave-distinct backbrief,
rehearsal and decision IDs; a prior wave's evidence is not fresh acknowledgment.
Keep `BoundedPlanningOperation` outputs out of task evidence, including legacy
untyped bundles and nested/array-wrapped planning or semantic packets. Publish
independent work facts and cite exact control references instead; wrapping a
proposal or removing its outer tag never proves a task was performed.

For requirement inventory and semantic coverage admission, read
`docs/requirement-inventory-admission.md` and run
`scripts/review_controls_requirements.js` with the exact target repository.
Its template performs no extraction or transmission. Review every source
fragment, retain coverage of every actual receiver and bind new adoption v0.2.
Whole-plan edits invalidate that review. Legacy history is readable, not a way
to regain active captured-request execution. Model results remain advisory;
human inventory review is an explicit separate class, not calibrated automation.
For linked revision, finalize its returned successor plan before preparing
coverage: its new revision reference and shortened validity change the plan hash.
Do not backdate coverage before the plan's creation or reuse the prior review.
For browser adoption, compare the Source classifications (including context),
global restrictions and each actual receiver in the Coverage view; inspect the
complete Plan and Exact Approval Subject for budgets and fields not quoted in
the matrix. Receiver/status filters and pagination narrow only the display, not
the signed decision subject. They never renew consent. A readable matrix does
not establish semantic equivalence or prove the human reviewed it. Close stale
previews and obtain fresh review after plan changes; never approve from a
partial or malformed matrix. Run `run-operator-coverage-ui-fixtures.js` and the
real `operator-consent-fixtures/browser-check.js` after changing this presentation.

For semantic omission evaluation, read `docs/semantic-omission-evaluation.md`
and `docs/model-transfer-consent.md`. Run the collector, operator-semantic and
control-evidence fixture suites plus the real browser check. `prepare` transmits nothing.
Use bundled `scripts/evaluate_controls_request.js prepare --repository <repo>
--draft-id <id>` outside the checkout; it exposes no model-execution command.
Inspect actual compiled order/receiver projections, not unused analysis quotes.
Existing CLI login and order consent never approve model transfer. Do not mint
operational consent with fixture keys or expose private previews in agent chat.
Use the console's exact-packet owner preview, password and one-use session-bound
nonce after the trusted host explicitly configures its CLI/model pair. Never
automate the real owner's account or approval. After logout/stop/shutdown require
actual child close and group absence; inspect Model Actions after a lost
response. For a verifiable failed transfer, read `docs/model-transfer-reconciliation.md`
and use Review Model Hold. Require a fresh password/session-bound acknowledgment,
exact original history and independently observed PID/group absence. Require the
original v0.2 signed journal binding: never trust an unsigned journal PID or
retroactively sign a v0.1 result's current files. Legacy unbound results remain
readable but held; a later receipt cannot manufacture their missing provenance.
Preserve the original failure; a saved signed receipt acknowledges only this local model hold
and never starts a new call. After an interrupted acknowledgment, inspect history
and obtain new consent; never finish the old reservation or replay its nonce.
Missing signatures/journals or unconfirmed termination stay held. Never delete
rows/journals or use another nonce/session to bypass a hold. Do not cite
previews, transfer consents or evaluation results as task outputs, even in text
or binary form. Native process exit does not prove upstream billing cancellation.
Reject any response changed between collection and signing; do not bless the new
bytes with a fresh signature or rerun the model to hide the original mismatch.
Treat null/non-object JSONL and invalid UTF-8 as failed collection, not a reason
to restart the HTTP service or replay consent. Confirm its actual child exit.
An authentic signed transport-failure record is not signature corruption. Keep
known digit-bearing codes such as `SEMANTIC_EVENT_UTF8_INVALID` intact; never
replace that distinction with a broad diagnostic exception or a success label.
At shutdown fence the worker queue and model collector together, then await both
actual exits before releasing ownership. Never wait on one while the other admits work.
After a timeout or lost result, keep the consumed reservation and inspect it;
never retry the model automatically. Treat `complete` as advisory until held-out
calibration and mandatory consumers exist; fake-process passes are not calibration.
Unexpected startup diagnostics stay private and failed. Inspect their quarantined
file; never broaden the diagnostic allowlist just to make the run pass.
After a signal failure, preserve that failure and require actual child close
plus group absence; a termination request or clean working tree proves neither.

For an operational situation read, use `docs/operational-cop.md` and the
authenticated Operations view; run `node run-operational-cop-fixtures.js` when
maintaining it. Read attention across the entire permitted scope even when
mission/staff filters return no rows. Refresh expired snapshots and reselect
evidence after manifest drift. A recorded active lease, zero alerts or a fresh
snapshot never proves worker liveness, task completion or tool eligibility.
Never clear a hold by editing the view or recovering issuance during a read;
follow its owning controller. COP JSON is control metadata, not work evidence.

At lease issuance, inspect repository-wide gateway and unknown-effect holds,
including other waves. A new session/wave cannot clear them. Publication must
retain the specific hold before a generic manifest conflict. Use the exact
gateway regression filter for diagnosis only; unknown filters must fail and a
filtered pass never replaces the full consuming suites.

For a real local evidence workspace, route to `docs/local-operator-console.md`
and `scripts/serve_controls_operator.js`; validate with
`node run-operator-console-fixtures.js`. The human creates the owner account.
Do not read private setup links into chat, seed fake operational records, or
interpret login, viewer invitations or proposal inspection as scope approval.
Grant explicit restricted mission access only after owner reauthentication.
After a stale manifest/cursor error, refresh the list and reselect the evidence.
After logout, account replacement or a changed filter/selection, discard earlier
responses and obtain a fresh principal-bound read; hidden old tables and dialogs
must remain cleared. Run `operator-console-fixtures/session-browser-check.js`
with the existing browser/API suites. A discarded approval response is not a
cancelled decision: inspect its exact retained outcome, never replay its write.
Keep authentication throttles active and obey an observed retry interval.

For actual owner plan decisions, read `docs/operator-consent-and-adoption.md`
and run `node run-operator-consent-fixtures.js` with the adoption/console suites.
Keep full-plan preview, selected rehearsal/backbriefs and password
reauthentication together. Never script an actual owner's approval, copy a
nonce to an artifact or retry a write because the response was lost. Inspect
the stored action outcome and preserve any reconciliation-required hold.
An adopted plan still needs ordinary lifecycle/lease/gateway checks; signed
consent cannot replace work evidence or authorize tool execution or release.

For a timed-out or interrupted local owner decision, run
`node run-operator-console-worker-fixtures.js` when maintaining the runtime.
Do not clear the SQLite hold, replace the service ownership or launch another
writer while worker exit is unconfirmed. An observed exit only stops that
worker; inspect the actual action and retained manifest to determine effects.
Preserve reconciliation-required state even after shutdown. A lost response
is never permission to replay the nonce or create a second approval. The exact
local order terminal ceremony below is separate from worker termination.

Use Decisions > Inspect Outcome to compare that exact action with the pinned-key
signed consent, expected decision payload and historical adoption replay.
An `applied` inspection does not clear a private hold or restore expired/current
authority. `unconsumed_decision` needs a later explicit cancellation fence, not
a database edit. Keep `conflicting`/`unverifiable` visible; do not regenerate
missing records. Run `node run-operator-consent-outcome-fixtures.js` and the
browser checks when changing this read path; it never performs terminal discharge.

For one exact interrupted local owner order, read
`docs/operator-terminal-reconciliation.md` and use the authenticated console's
Review Terminal Outcome after inspection. Require the human's fresh password
and one-use terminal nonce; do not script a real owner's consent. Confirm the
retained cancellation or original controller result, signed receipt and archived
failure before accepting a cleared local hold. After another interruption,
keep conflicting or unverifiable projections held even if their private state
claims completion. Do not repair that disagreement by editing the database;
inspect again and obtain fresh terminal consent; reuse only the service-verified
old cancellation reference, never its nonce or original adoption mutation.
Run `node run-operator-reconciliation-fixtures.js` plus the terminal browser
flows and existing consent/adoption suites. The offline signature CLI explicitly
does not verify artifact history or clear state. These contracts cannot settle
campaign/gateway obligations, replace work evidence or grant new tools/release.
Do not trust an evidence file's MIME or extension to distinguish work from
control records: whole JSON audit metadata stays forbidden after plain-text or
binary relabeling. This is not a semantic guarantee for arbitrary prose.

For exact successor activation, read `docs/campaign-successor-admission.md`,
its four request/proposal/admission schemas, `campaign-successor-controller.js`
and `run-campaign-successor-fixtures.js`. Use
`scripts/activate_controls_successor.js` for propose/decision-option/activate/status.
A held candidate is not an admission, and admission is not ordinary dispatch.
Use its non-authorizing `repository-state` command before freezing the proposal.

For campaign terminal reconciliation or successor-activation prerequisites,
read `docs/campaign-terminal-reconciliation.md`, its request/record schemas,
`campaign-terminal-controller.js` and `run-campaign-terminal-fixtures.js`.
Use `scripts/reconcile_controls_campaign.js`; also run hook/gateway settlement
fixtures after historical replay changes. Terminal status never clears a stop.

For campaign stop, cancellation intake, or a denied restart, route to
`docs/bounded-self-improvement-operations.md#210-explicit-user-stop-intake`,
`campaign-stop-controller.js`, its request/record schemas and
`run-campaign-supervisor-fixtures.js`. Use `scripts/stop_controls_campaign.js`
for decision preparation, exact USER-bound stop and status. It does not resume
work, settle effects or create successor authority.

Use this map after running `scripts/route_controls_docs.js`, or when a task is obvious enough to route manually.

## Inventory Coverage

For unknown tool outcomes, route `docs/tool-effect-review.md` and
`docs/tool-effect-settlement.md`. Evidence preparation does not clear holds;
settlement needs historical/current verifier admission and an exact USER
decision. Both fixture suites are required when changing this boundary.
For a reconciled failure or legacy resumed/terminal lease, inspect the separate
failed-agent marker and require explicit post-settlement revocation. Do not
translate zero unresolved effects into successful completion or renewed tools.

For current continuation work, select from the active core queue in
`docs/completion-backlog.md`; do not resume deferred platform work because an
older roadmap lists it. The broad registry percentage is not core completion.

For implementation-candidate audits and existing-program completion, route to
`docs/implementation-candidate-registry.md` and `docs/completion-backlog.md`.
Run `node implementation-candidate-registry.js audit`; use its source-bound
entries rather than regex filename counts or a changelog's closure wording.
Execute selected mapped checks with `verify` before declaring implementation.

The router scans tracked and unignored candidate corpus artifacts, including Markdown/HTML docs, JSON schemas, sample payloads, runtime payloads, fixtures, runner scripts, prototype scripts, dashboard state, and skill metadata. Git-ignored local state such as `.cxt` and `.cannae`, plus `.git` and `node_modules`, is not doctrine inventory. A non-Git fallback retains the explicit directory exclusions. Every routable corpus artifact must have at least one route category.

Run coverage after adding, renaming, deleting, or moving any corpus artifact:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
```

The report must return `valid: true`, `unrouted_artifact_count: 0` and
`unavailable_declared_document_count: 0`. It checks both existing artifacts'
categories and the availability of baseline, role, department, authority, route
and capability-gap references. A missing, ignored, symlinked or non-file target
is unavailable even when every remaining file has a category.

On `ROUTING_DOCUMENT_UNAVAILABLE`, preserve the task, delegation and failed
invocation. Restore the intended file or review its real replacement/retirement
in both bundles, then reroute; do not remove a requirement to get a pass.
No direct result or receipt is emitted, and artifact creation/overwrite does not
run. An unrelated unselected reference can fail the whole-corpus audit without
blocking this direct task. That distinction does not waive an assigned profile
or an existing guarded mission's checks. Successful inventory is not a source
read, semantic review, content digest or disclosure authorization.

For copied test corpora, restore selected provider reference files as well as
ordinary doctrine documents. Keep that availability repair separate from the
receiver's assigned profile: an existing recommendation is not readable merely
because routing succeeds. Test both denied unassigned reads and stale-route
rejection after a selected reference disappears; do not expand access to fix setup.

Inventory coverage does not prove that a specific task received its documents.
Keep local archives in `.cannae` and `.cxt` out of current-document link checks;
their historical relative links are not live corpus failures. Do not ignore
hidden provider skill trees: broken `.claude/skills` references must still fail.
The recommendation bundle preserves orientation, role/authority, capability-gap,
and applicable documents and controls from every selected task route. Ranking
orders recommendations; it must not discard a lower-ranked required task.
`--limit` and `--all` affect only supporting artifacts. Check the exact
task paths in `recommended_documents` and the resulting context pack; a matched
route or validation command alone is not enough. Do not manually truncate a
receipt or context pack. Narrow an overly broad request before creating a fresh
wave without dropping requirements, preserve existing evidence, and retain the
document-access manifest's delivery restrictions: a routing recommendation never
grants raw-data access.
Run `node run-agent-routing-preflight-fixtures.js` for task-level routing
regressions in both provider skill trees, in addition to inventory coverage.

## Operator Mode

S6's default reading follows the knowledge-management bundle in
`docs/role-document-access-policy.md`: knowledge management, context releasability
and OPSEC classification, alongside the common role/access/approval/tool rules.
Its label alone does not require architecture, event storage or dashboard design.
The declared systems/platform/architecture department still adds architecture
and event references; task or parent-objective matches and explicit source inputs
remain additive. Do not change a department to evade an assigned duty. This is
reading selection, not access enforcement, a changed role or execution authority.
Existing issued packets retain their bindings and require the normal fresh-route
procedure when instructions change. Complete supported platform exclusions affect
specialist reading and capability evidence as described above, not role policy,
selected controls or execution authority. Unknown wording stays conservative.

| Mode | Trigger | Routing Rule | Escalation |
| --- | --- | --- | --- |
| Human final decision authority | The chat user asks directly, researches, decides, or asks "how should we use this?" | Route for efficiency and evidence, not to restrict the user's visibility. Read the minimum useful docs, then brief options and tradeoffs. | Warn before high-risk, release, or irreversible actions, but the user decides. |
| Delegated AI operator | The user asks an AI agent, role, department, staff function, or TF to perform work | Route by role, department, authority, task, release target, risk, and need-to-know. Start with role/access/approval policy before task docs. | Escalate to the human user for anything outside delegated authority, cross-boundary release, or high-risk tool use. |

For delegated AI routing, declare as much context as available:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --actor=ai --role=S3 --department=operations --authority=scoped-execution "<mission request>" .
```

## Capability Gap Routing

The router assesses doctrine capability from the request text only; role,
department, and authority options affect access and control documents but do
not prove that the corpus owns the requested domain. For manual wave/agent
receipts, pass the same mission objective through `--capability-query` on every
call and use the positional query for the narrower task.

When `capability_routing.status` is `gap_detected`:

1. Do not return "outside the corpus" and continue as general, unowned work.
2. Task-organize the returned mission-scoped capability cell for analysis and reversible drafting under existing authority.
3. Preserve its deterministic `CELL-*` ID and the paired `DEPT-*` standing-department candidate across CoS, agent receipts, and context packs.
4. Run `run-force-structure-change-fixtures.js` as a mandatory control and assess DOTMLPF-P alternatives.
5. Keep authority expansion and standing activation false. Only the USER can decide whether a validated `ForceStructureChangeOrder` should activate the candidate.
6. Disband the provisional cell at mission handoff unless the standing change is approved.

For delegated execution, routing must create a receipt and pass preflight before any agent starts work:

```bash
node "${CONTROLS_SKILL_DIR}/scripts/route_controls_docs.js" --receipt --scope=wave --mission=MIS-example --wave=W2 --agent=chief-of-staff --actor=ai --role=COS --department=coordination --authority=tasking --capability-query="<actual mission objective>" -- "<wave mission>"
node "${CONTROLS_SKILL_DIR}/scripts/route_controls_docs.js" --receipt --scope=agent --mission=MIS-example --wave=W2 --agent=plans-agent --actor=ai --role=S3 --department=operations --authority=scoped-execution --capability-query="<actual mission objective>" -- "<agent task>"
node agent-routing-preflight-runner.js <agent-routing-preflight-bundle.json>
```

Preflight requires one CoS wave receipt and one S3 operations receipt for each expected agent. A missing, stale, manually claimed, or wrong-role receipt blocks the wave.

Set `CONTROLS_SKILL_DIR` to the actual loaded bundle as described in startup,
replace example identities with the issued mission/wave/agent identities and
carry the same original objective through both commands. Run the preflight
runner from the returned doctrine root against the actual collected bundle.
The producer validates the complete receipt against that root's existing
schema and semantic rules before stdout or artifact persistence. Invalid receipts
exit nonzero without JSON or store changes; unavailable validators, dependencies
or malformed schemas also stop. Receipt mode requires the full bound checkout
and its lockfile dependencies, not just a copied skill folder. Direct routing
remains lightweight, but cannot substitute for a guarded receipt.
Do not combine `--coverage` with receipt or persistence flags: mixed modes reject
instead of silently returning an inventory report where a receipt was requested.
Do not reuse old output after a failed invocation, switch the doctrine root to
evade its policy, relabel the delegate or discard the objective to pass. Resolve
the actual declaration/dependency problem and prepare a fresh route. Successful
emission still requires downstream preflight, current context and applicable
tool/release gates; it neither authenticates the caller nor proves source reading.

Routing preflight checks recorded doctrine-routing consistency, not actual delivery.
It does not authorize tool execution. Before opening a dispatch-controlled wave,
put each exact policy-draft digest and agent/provider/policy tuple in the
USER-authorized mission plan. After `open`, compile that draft and issue the
single repository-, mission-, wave-, agent-, and session-bound lease lineage;
place the provider hook adapter on the execution path. A resumed or forked
session requires explicit lineage continuation after checkpoint review;
restored conversational context never restores authority.

## Core Navigation

| Task | Read First | Then Read |
| --- | --- | --- |
| Write or revise a document | `docs/document-authoring-workflow.md`, `docs/knowledge-management-sop.md` | Selected prompt/SOP/handoff format and its relevant policy |
| Choose current work or explain scope | `docs/skill-first-product-scope.md`, active `docs/completion-backlog.md` | Registry mappings; deferred runtime roadmap only as history |
| Understand the whole framework | `README.md`, `docs/military-llm-framework-v0.1.md` | `docs/military-operating-system.md`, `docs/glossary.md` |
| Contribute or review project governance | `CONTRIBUTING.md`, `GOVERNANCE.md` | `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md` |
| Find source backing | `docs/source-map.md` | `docs/research-compendium.md`, `docs/source-reliability-rubric.md` |
| Choose docs for a request | `README.md`, router output | `docs/military-operating-deep-research-queue.md` |
| Add external military sources | `docs/source-map.md` | `docs/research-compendium.md`, `source-map-linter.js` |

## Mission, Orders, Reporting

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| General request intake and draft compilation | `docs/request-order-intake.md`, `docs/orders-production-pipeline.md` | `scripts/compile_controls_order.js`, `request-order-compiler.js`, `order-intake-contract.js`, three intake schemas and `run-request-order-compiler-fixtures.js` |
| Exact USER order adoption and plan-bound agent tasking | `docs/order-adoption-and-plan-binding.md`, `docs/skill-operational-mission-lifecycle.md` | `scripts/adopt_controls_order.js`, `order-adoption-controller.js`, six adoption contracts, plan v0.2/context v0.3 and `run-order-adoption-fixtures.js`; changed plans need new review and legacy downgrade cannot discharge intake |
| Opened-plan revision and predecessor handoff | `docs/order-revision-and-supersession.md`, `docs/order-adoption-and-plan-binding.md` | `scripts/revise_controls_order.js`, revision contracts/controller and `run-order-revision-fixtures.js`; prepare the successor, settle old results, supersede exact scope, then request normal tool admission |
| OPORD/WARNO/FRAGO/SITREP/AAR prompting | `docs/prompt-templates.md`, `docs/orders-production-pipeline.md` | `schema-files/opord.schema.json`, `schema-files/warno.schema.json`, `schema-files/frago.schema.json`, `schema-files/sitrep.schema.json`, `schema-files/aar.schema.json` |
| Commander's intent and disciplined initiative | `docs/mission-command-runtime-policy.md`, `docs/disciplined-initiative-rules.md`, `docs/intent-continuity-runtime.md`, `docs/method-deviation-runtime.md`, `docs/commander-handbook.md` | `intent-continuity-runner.js`, `method-deviation-runner.js`, `run-intent-continuity-fixtures.js`, `run-method-deviation-contract-fixtures.js`, `run-disciplined-initiative-fixtures.js`, `scripts/check_controls_intent.js`, `scripts/operate_controls_methods.js`, bound schemas and samples |
| Source-plan annex | `docs/opord-annex-model.md` | `schema-files/source-plan.schema.json`, `schema-files/verification-plan.schema.json` |
| Annex vs FRAGO change | `docs/opord-annex-model.md` | `schema-files/annex.schema.json`, `schema-files/frago-scope-change.schema.json`, `run-rehearsal-to-ccir-fixtures.js` |
| Backbrief/rehearsal | `docs/backbrief-and-rehearsal-sop.md`, `docs/dry-run-approval-ui.md` | `schema-files/backbrief.schema.json`, `schema-files/rehearsal.schema.json`, `orders-dissemination-runner.js`, `event-fixtures/rehearsal-event-fixtures.json`, `run-rehearsal-event-fixtures.js` |
| CCIR reporting thresholds and COP | `docs/reporting-threshold-policy.md`, `docs/common-operational-picture-state.md`, `docs/ccir-alerting-model.md` | `ccir-linter.js`, `run-ccir-linter-fixtures.js`, `alert-router-prototype/` |
| Information to operations | `docs/information-to-operations-cycle.md` | `information-to-operations-router.js`, `run-information-to-operations-fixtures.js` |

For an enrolled method baseline, deliver only the receiver's `method_assignment`
with its exact task/plan binding and usable instructions. Keep the routed query
unchanged; adding this control cannot cover an unrelated capability gap. Send
structured requests to the trusted CoS/operator host running the method wrapper
outside the agent's scoped session. Do not grant shell or metadata-write access
to a Read-only agent just to submit its reports. The v0.1 CLI does not implement
automatic provider-message transport. For a newly reviewed v0.2 channel, read
`docs/method-control-channel.md` and use `scripts/operate_controls_channel.js`:
prepare before startup, observe the exact native session, issue its lease, then
enroll. Configure the exact returned server descriptor,
not a prefix-wide MCP allowlist. Keep private state outside the target and model
context. A lost response holds work; only actual retained metadata may be
reconciled. Never renew authority or rerun a task to repair delivery. SDK and
synthetic-hook tests do not attest actual native client startup.
Keep raw private-file/parser diagnostics on the trusted operator side; agents
receive fixed non-secret error codes, never private contents or paths. Same-wave
continuation needs a newly reviewed channel policy v0.2. Settle callbacks,
actual after-reports and metadata delivery, then interrupt and inspect its exact
checkpoint. Use `prepare-continuation` for a fresh private file; configure it,
observe the exact native start, explicitly `resume`, then `enroll` that lease.
Never reuse the old file or reset root deadlines, request IDs, metadata/task
budgets or rule counters. Initial-only v0.1 needs a newly reviewed wave instead.
For interrupted core issuance, read `docs/dispatch-issuance-recovery.md` and
inspect `status` before retrying. Use only the retained issuance ID with
`recover-issuance`; bindings, nonce and expiry are frozen. An unused request may
be explicitly cancelled, never converted into a completed task. Missing legacy
requests cannot be reconstructed. If verification reports `PENDING_TRANSACTION`,
pause dispatch and inspect/recover the actual store journal before issuance
status; require a valid store, then recover only the retained issuance ID.
Store recovery is not issuance approval or task replay. An ordinary first wave
can initialize a genuinely missing namespace; never seed invented evidence or
treat an existing corrupt store as empty. Preserve admitted results; do not hot-swap
runtime code, reuse the old private file or replay a task to repair issuance.
Keep issuance/recovery/cancellation commands on the trusted operator side;
listing their shell digest as an ordinary task does not delegate control-plane
authority. A valid lease JSON and a historical commit result are not current
tool permission. Inspect unresolved issuance before reporting settled work.
Store recovery may finish the final commit record. Still require the live
source-binding and ordinary tool gates; committed history or
`runtime_source_current` alone grants nothing. On source drift, preserve
already-admitted results and explicitly revoke unused authority; never renew
bindings or replay work to hide the denial.
Diagnose dispatch denials by their exact reason code; changed prose is not a
different authority state or permission to retry with new bindings.
For legacy result-only leases, inspect reconciled failure and revocation markers
separately. Preserve their specific hold; a generic migration denial is not
clearance or permission to skip post-settlement revocation of a failed agent.
Require full supervisor, gateway, intent, channel and lifecycle regressions
after changing issuance. Preserve specific stop/failure reasons and legacy
result settlement separately from new authority. When a stricter guard rejects
earlier, prove its exact denial and absence of publications; do not weaken the
guard or broaden an expected-error regex to simulate the old unsafe sequence.
When a retained stop wins over generic CAS, require its exact blocked code and
stop reason plus an actually denied successor admission. Align the assertion
with that stricter boundary; do not restore a generic error or suppress the case.

Propose the exact reviewed alternative before calling its tool. Obtain an exact
USER acknowledgment when required, then report
the actual admission/result through the method wrapper before another call or
completion. A generic SITREP, schema pass, tool output in chat or later report
cannot repair a missed boundary or restore a stopped mission. Inspect the real
revocation checkpoint; blocked revocation preserves containment/effect holds.
Use verified manifest introduction history for causality, never array order or
lexicographic timestamps. Keep caches inside one verified snapshot and reappraise
at publication. The routed pure checks do not substitute for full integration
tests, and legacy workflows do not gain the new guarantee retroactively.
Use the reviewed baseline's shorter validity, never the schema-wide ceiling,
as the operational deadline; after expiry only actual-result reporting remains.

Keep actual task outputs separate from derived SITREPs and other control records.
Whole-record JSON copies remain metadata even without a type tag or after MIME,
whitespace or key-order changes. The report publisher reappraises current retained
control content after its required controls run. A denied publication needs a
fresh report ID and freshly executed controls, not recycled receipts. Run
`node run-skill-control-evidence-fixtures.js` after changing this boundary; it
exercises actual report admission, ordinary JSON work and publication races in
legacy data-only waves, not method dispatch or semantic truth of arbitrary prose.

## Authority, Release, Risk

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| Role authority | `docs/agent-roles-and-authority.md` | `schema-files/authority-matrix.schema.json`, `readiness-gate-prototype/` |
| Tool use policy | `docs/tool-use-roe.md`, `docs/policy-engine-rules.md` | `policy-engine-prototype/`, `policy-engine-authority-integration.js` |
| Enforced tool dispatch and explicit resume | `docs/enforced-dispatch-and-resume.md`, `docs/tool-use-roe.md` | `dispatch-runtime-controller.js`, `dispatch-hook-adapter.js`, `install-dispatch-hooks.js`, dispatch policy/lease/admission/checkpoint schemas |
| Protected tool transaction, gateway ownership/obligations, late gateway callback, idempotency, and recovery | `docs/protected-tool-gateway-contract.md`, `docs/enforced-dispatch-and-resume.md` | `protected-tool-gateway.js`, `dispatch-runtime-controller.js`, gateway request/decision/receipt/event schemas, `run-protected-tool-gateway-fixtures.js`; inspect gateway obligations separately from hook settlement |
| Gateway effect review, gateway settlement intake, or orphan admission | `docs/gateway-effect-review.md`, `docs/completion-backlog.md` | `gateway-effect-review.js`, gateway-effect schemas, `scripts/review_gateway_effects.js`, `run-gateway-effect-review-fixtures.js`; classify first and preserve all holds after review |
| Authenticated gateway principal, mTLS, SPIFFE, TLS exporter, challenge, or replay | `docs/gateway-identity-admission.md`, `docs/protected-tool-gateway-contract.md` | `gateway-identity-adapter.js`, `gateway-identity-evidence.js`, identity policy/challenge/evidence schemas, `run-gateway-identity-adapter-fixtures.js` |
| Protected native process, exact executable/argv, envelope, observation, timeout, shebang rejection, or no-rerun recovery | `docs/protected-process-execution.md`, `docs/protected-tool-gateway-contract.md` | `protected-process-executor.js`, `protected-execution-evidence.js`, protected-execution schemas, `scripts/operate_protected_executor.js`, `run-protected-process-executor-fixtures.js` |
| OCI Linux sandbox, immutable image, seccomp, no-new-privileges, capabilities, namespaces, read-only mounts, cgroup, network none, kernel probe, container cleanup, daemon unavailable, or container absence | `docs/oci-linux-sandbox-provider.md`, `docs/protected-tool-gateway-contract.md`, `docs/protected-process-execution.md` | `oci-linux-sandbox-provider.js`, `oci-linux-sandbox-evidence.js`, `oci-linux-sandbox-probe.go`, OCI sandbox schemas/samples, `runtime-profiles/`, `scripts/operate_oci_sandbox.js`, `run-oci-linux-sandbox-provider-fixtures.js` |
| Production sandbox, RATS/EAT appraisal, OCI/SLSA provenance, managed exclusivity, independent deployment quorum, external coordinator, or storage fencing | `docs/production-sandbox-admission.md`, `docs/protected-tool-gateway-contract.md`, `docs/gateway-identity-admission.md`, `docs/oci-linux-sandbox-provider.md` | `production-sandbox-admission.js`, `production-sandbox-admission-adapter.js`, production schemas/samples, `scripts/operate_production_sandbox.js`, `run-production-sandbox-admission-fixtures.js`, `run-production-sandbox-gateway-fixtures.js` |
| Approval lifecycle | `docs/approval-scope-policy.md` | `approval-consumption-runner.js`, `approval-renewal-runner.js`, `approval-revocation-runner.js`, `approval-delegation-runner.js` |
| Risk acceptance | `docs/risk-acceptance-authority.md` | `schema-files/risk-acceptance.schema.json`, `run-authority-integration-fixtures.js` |
| Readiness to authority | `docs/readiness-to-authority-policy.md`, `docs/training-progression-model.md`, `docs/agent-metl.md` | `schema-files/agent-metl.schema.json`, `schema-files/readiness-event.schema.json`, `readiness-gate-prototype/` |
| Release review | `docs/context-releasability-policy.md`, `docs/opsec-classification-model.md`, `docs/sensitive-output-filter.md` | `release-review-runner.js`, `policy-engine-release-integration.js`, `release-gate-decision-runner.js`, `opsec-linter.js`, `evidence-redactor.js`, `eefi-detector.js`, `schema-files/classification-label.schema.json`, `schema-files/releasability-review.schema.json`, `schema-files/eefi-alert.schema.json`, `schema-files/context-release.schema.json` |
| GitHub repository release-immutability policy activation | `docs/github-release-immutability.md`, `docs/github-release-authorization.md` | `github-release-immutability.js`, policy authorization/receipt schemas and samples, `scripts/operate_github_release_immutability.js`, `run-github-release-immutability-fixtures.js` |
| GitHub immutable-policy drift, release-attestation monitoring, trust-checkpoint continuity, or initial bootstrap recovery | `docs/github-release-integrity-monitoring.md`, `docs/github-release-independent-verification.md`, `docs/github-release-trust-checkpoint-continuity.md`, `docs/github-release-immutability.md`, `docs/github-release-authorization.md` | `.github/release-integrity-policy.json`, `github-release-integrity-monitor.js`, `github-release-trusted-root.js`, `github-release-trust-checkpoint.js`, `github-release-checkpoint-store.js`, `github-release-bootstrap-recovery.js`, `github-release-bootstrap-recovery-operator.js`, `github-release-bundle-verifier.js`, integrity/trust/recovery schemas and fixtures, `scripts/operate_github_release_integrity.js`, `scripts/operate_github_release_verification.js`, `.github/workflows/release-integrity.yml` |
| Exact GitHub tag/release authorization and publication | `docs/github-release-authorization.md`, `docs/github-release-independent-verification.md`, `docs/github-release-trust-checkpoint-continuity.md`, exact tracked release notes | `github-release-publisher.js`, trusted-root, trust-checkpoint, and independent-verification runtimes, authorization/receipt/trust schemas, `scripts/operate_github_release.js`, `scripts/operate_github_release_verification.js`, publisher, checkpoint, and independent-verification fixtures |

For verifier dependency migration, lockfile updates or `ip-address` maintenance,
read `docs/github-release-independent-verification.md#producer-compatibility`
and the dependency procedure in `references/self-improvement-loop.md`.
Run `run-github-release-independent-verification-fixtures.js` before the monitor,
checkpoint, publisher and full aggregate gates. Preserve the prior-producer
sample bytes; regenerate only the separately named current sample.

## Multi-Agent Organization

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| Org chart / roles | `docs/llm-agent-org-chart.md`, `docs/agent-roles-and-authority.md` | `schema-files/agent.schema.json` |
| Department collaboration | `docs/interdepartment-collaboration-policy.md`, `docs/b2c2wg-operating-model.md` | `schema-files/department-collaboration-charter.schema.json`, `department-collaboration-runner.js` |
| Chief of staff and battle rhythm | `docs/chief-of-staff-agent.md`, `docs/b2c2wg-operating-model.md`, `docs/agent-battle-rhythm.md` | `schema-files/board-decision.schema.json`, `schema-files/battle-rhythm-event.schema.json`, `schema-files/battle-rhythm-scheduler.schema.json`, `battle-rhythm-scheduler.js`, `run-battle-rhythm-scheduler-fixtures.js` |
| Liaison and partner interop | `docs/liaison-agent-model.md`, `docs/interop-release-packet.md`, `docs/partner-command-relationship.md` | `schema-files/context-release.schema.json`, `release-review-runner.js`, `release-gate-decision-runner.js` |
| Agent routing preflight | `docs/role-document-access-policy.md`, `docs/agent-roles-and-authority.md`, this routing reference | `schema-files/routing-receipt.schema.json`, `agent-routing-preflight-runner.js`, `run-agent-routing-preflight-fixtures.js` |
| Operational mission lifecycle, expiry, abort, and supersession | `docs/skill-operational-mission-lifecycle.md`, `docs/agent-battle-rhythm.md`, `docs/knowledge-management-sop.md` | `skill-mission-controller.js`, mission-wave/context/report/closeout/termination schemas, `scripts/operate_controls_mission.js`, `run-skill-mission-controller-fixtures.js` |
| One lease lineage per delegated mission agent | `docs/enforced-dispatch-and-resume.md`, `docs/repository-artifact-isolation-policy.md` | `dispatch-runtime-controller.js`, `scripts/operate_dispatch_runtime.js`, `scripts/enforce_controls_dispatch.js`, `scripts/install_dispatch_hooks.js`, `run-dispatch-runtime-fixtures.js` |
| SOF / high-risk TF | `docs/ai-special-operations-tf.md` | `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js` |
| Force structure changes | `docs/force-structure-change-policy.md` | `schema-files/force-structure-change-order.schema.json`, `force-structure-change-runner.js` |
| Unmatched mission capability | `docs/force-structure-change-policy.md`, `docs/interdepartment-collaboration-policy.md`, `docs/b2c2wg-operating-model.md` | routing receipt/context-pack v0.2 `capability_routing`, `run-force-structure-change-fixtures.js`, `skill-mission-controller.js` |
| Mission-based model allocation and dispatch | `docs/model-force-assignment-policy.md`, `docs/model-force-v0.2-operations.md`, `docs/agent-metl.md`, `docs/agent-readiness-ledger.md` | `schema-files/model-registry.schema.json`, `schema-files/model-assignment-request.schema.json`, `model-assignment-compiler.js`, `integrated-mission-preflight-runner.js`, `run-model-force-v0.2-fixtures.js` |
| Continuity and handoff | `docs/personnel-continuity-model.md`, `docs/knowledge-management-sop.md`, `docs/handoff-packet-template.md` | `schema-files/continuity-plan.schema.json`, `schema-files/handoff-generation-request.schema.json`, `handoff-generator.js`, `run-handoff-generation-fixtures.js`, `continuity-drill-runner.js` |

## Source, Culture, Multinational Use

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| Korean adaptation | `docs/korean-military-sources.md`, `docs/korean-org-culture.md` | source-map coverage and local policy notes |
| Multinational consistency | `docs/multinational-doctrine-consistency-review.md` | `schema-files/doctrine-consistency-review.schema.json`, `doctrine-consistency-runner.js` |
| Source reliability | `docs/source-reliability-rubric.md` | source-map linter and evidence samples |
| Research backlog | `docs/military-operating-deep-research-queue.md` | new docs/schemas/runners as justified |

## Runtime, UI, Persistence

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| Reference architecture | `docs/reference-architecture.md`, `docs/implementation-guide.md` | runner suite and prototype directories |
| Event sourcing | `docs/event-sourcing-model.md` | `event-replay-prototype/`, `event-fixtures/` |
| Dashboard | `docs/command-post-dashboard.md`, `docs/dashboard-wireframes.md` | dashboard runners and `dashboard-ui-prototype/*.json` |
| Data model | `docs/data-model.sql.md`, `docs/sample-runtime-state.md` | JSON samples and SQL notes |
| Maintenance/readiness | `docs/maintenance-readiness-model.md`, `docs/agent-readiness-ledger.md`, `docs/sustainment-agent-sop.md`, `docs/resource-priority-policy.md` | `maintenance-readiness-runner.js`, `maintenance-dashboard-runner.js`, `schema-files/resource-status.schema.json`, `resource-budget-checker.js`, `tool-fallback-planner.js` |
| Knowledge management review | `docs/knowledge-management-sop.md`, `docs/handoff-packet-template.md` | `schema-files/decision-log.schema.json`, `schema-files/source-record.schema.json`, `km-review-runner.js`, `run-km-review-fixtures.js` |
| Repository-isolated artifacts | `docs/repository-artifact-isolation-policy.md`, `docs/knowledge-management-sop.md` | `repository-artifact-store.js`, `repository-lease.js`, `repository-artifact-verify.js`, `schema-files/repository-artifact-manifest.schema.json`, isolation/concurrency/recovery fixtures |
| Enforced dispatch, interruption, and resume | `docs/enforced-dispatch-and-resume.md`, `docs/skill-operational-mission-lifecycle.md` | `dispatch-runtime-controller.js`, `dispatch-hook-adapter.js`, `install-dispatch-hooks.js`, `run-dispatch-runtime-fixtures.js` |
| Protected gateway transaction, authenticated identity, bounded process/OCI sandbox execution, production admission, and recovery | `docs/protected-tool-gateway-contract.md`, `docs/gateway-identity-admission.md`, `docs/protected-process-execution.md`, `docs/oci-linux-sandbox-provider.md`, `docs/production-sandbox-admission.md`, `docs/repository-artifact-isolation-policy.md` | `protected-tool-gateway.js`, `gateway-identity-adapter.js`, `protected-process-executor.js`, `oci-linux-sandbox-provider.js`, `production-sandbox-admission-adapter.js`, protected operation wrappers, gateway/executor/sandbox/production fixture runners |
| Bounded self-improvement and active work evolution | `docs/bounded-self-improvement-operations.md`, `docs/sigstore-verifier-workload-admission.md`, `docs/verifier-execution-integrity.md`, `docs/github-actions-native-verifier-adapter.md`, `docs/gitlab-ci-native-verifier-adapter.md`, `docs/verifier-pre-dispatch-challenge.md`, `docs/verifier-independence-assurance.md`, `docs/transparency-operations.md`, `docs/evaluation-metrics.md`, `docs/runtime-automation-roadmap.md`, `docs/knowledge-management-sop.md` | `self-improvement-campaign-init.js`, `campaign-supervisor.js`, `verifier-trust-readiness.js`, `verifier-identity-evidence.js`, `sigstore-trusted-root.js`, `sigstore-verifier-identity-evidence.js`, `verifier-execution-evidence.js`, `verifier-execution-runner.js`, `github-actions-oidc.js`, `github-actions-oidc-runner.js`, `gitlab-ci-oidc.js`, `gitlab-ci-oidc-runner.js`, `verifier-challenge-set.js`, `verifier-independence.js`, `transparency-operations.js`, `transparency-operations-runner.js`, `verification-runner.js`, `verification-attestation-runner.js`, `comparative-evaluation-runner.js`, `comparative-evaluation-attestation-runner.js`, `autonomous-improvement-controller.js`, campaign/cycle-order/proof/trust/root/identity/runtime/execution/challenge/independence/transparency/admission/comparison schemas and fixtures |

## Validation Sets

| Change Type | Minimum Commands |
| --- | --- |
| Schema or sample | `node validator-cli-prototype/run-fixtures.js`, targeted `node validator-cli-prototype/validate.js ...` |
| Any runner | targeted `node run-...-fixtures.js`, then all `run-*.js` if shared logic changed |
| English-only corpus | `node .github/scripts/check-english-only.js` |
| Source-map or official URL | `node source-map-linter.js --write-report` |
| Release/authority/risk | `node run-authority-integration-fixtures.js`, `node run-release-integration-fixtures.js`, relevant lifecycle runner |
| GitHub release-immutability policy authorization or receipt | `node run-github-release-immutability-fixtures.js`, targeted policy authorization/receipt validation, publisher regression fixtures, direct CLI module-entry validation, Codex and Claude wrapper resolution, routing coverage |
| GitHub release-integrity policy, observation, attestation, trusted root, trust checkpoint, initial recovery, bundle, workflow, or monitor credential | `node run-github-release-independent-verification-fixtures.js`, `node run-github-release-trust-checkpoint-fixtures.js`, `node run-github-release-integrity-fixtures.js`, `node run-github-release-publisher-fixtures.js`, targeted policy/root/checkpoint/recovery/observation validation with explicit clocks, fresh first-attempt full provider run after credential changes, API-digest and exact-triplet replay, Codex and Claude wrapper resolution, routing coverage |
| Exact GitHub release authorization or receipt | `node run-github-release-independent-verification-fixtures.js`, `node run-github-release-trust-checkpoint-fixtures.js`, `node run-github-release-publisher-fixtures.js`, targeted authorization/receipt/root/checkpoint validation, direct CLI module-entry validation, Codex and Claude wrapper resolution, routing coverage |
| Orders/backbrief/rehearsal | `node runtime-demo-runner.js`, `node orders-dissemination-runner.js ...`, relevant routing fixture |
| Skill update | `node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .`, `python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" codex-skills/controls-doctrine-operator`, `python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" .claude/skills/controls-doctrine-operator`, review both diffs for equivalent operational semantics |
| Delegated agent routing | `node validator-cli-prototype/validate.js sample-payloads/valid-routing-receipt-agent-s3.json routing-receipt`, `node run-agent-routing-preflight-fixtures.js` |
| Operational skill lifecycle | `node run-skill-mission-controller-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| Dispatch policy, lease, hooks, or resume | `node run-dispatch-runtime-fixtures.js`, targeted validation of dispatch policy/lease/checkpoint samples, Codex and Claude route coverage |
| Protected gateway contract or controller | `node run-protected-tool-gateway-fixtures.js`, `node run-dispatch-runtime-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| Protected process policy, executor, or evidence | `node run-protected-process-executor-fixtures.js`, `node run-protected-tool-gateway-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| OCI Linux sandbox policy, provider, probe, or evidence | `CANNAE_REQUIRE_LIVE_OCI=1 node run-oci-linux-sandbox-provider-fixtures.js` for release/CI validation, `node run-protected-tool-gateway-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| Production sandbox policy, appraiser evidence, admission, managed gateway, or coordinator binding | `node run-production-sandbox-admission-fixtures.js`, `node run-production-sandbox-gateway-fixtures.js`, `node run-protected-tool-gateway-fixtures.js`, `node run-gateway-identity-adapter-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| Model allocation or routing | `node validator-cli-prototype/validate.js sample-payloads/valid-model-registry.json model-registry`, `node run-model-force-assignment-fixtures.js`, `node run-model-force-v0.2-fixtures.js` |
| Multi-repository artifacts | `node run-repository-artifact-isolation-fixtures.js`, `node run-repository-artifact-concurrency-fixtures.js`, `node run-repository-artifact-recovery-fixtures.js`, `node validator-cli-prototype/validate.js sample-payloads/valid-repository-artifact-manifest.json repository-artifact-manifest` |
| Bounded self-improvement | `node run-self-improvement-fixtures.js`, `node run-signed-self-improvement-fixtures.js`, `node run-campaign-supervisor-fixtures.js`, `node run-verifier-trust-readiness-fixtures.js`, `node run-verifier-identity-evidence-fixtures.js`, `node run-sigstore-verifier-identity-fixtures.js`, `node run-verifier-execution-evidence-fixtures.js`, `node run-github-actions-oidc-fixtures.js`, `node run-gitlab-ci-oidc-fixtures.js`, `node run-verifier-challenge-fixtures.js`, `node run-verifier-independence-fixtures.js`, `node run-transparency-operations-fixtures.js`, `node run-transparency-supervisor-fixtures.js`, `node run-workload-identity-admission-fixtures.js`, `node run-cycle-order-admission-fixtures.js`, `node run-verification-runner-fixtures.js`, `node run-verification-attestation-fixtures.js`, `node run-comparative-evaluation-fixtures.js`, `node run-comparative-evaluation-attestation-fixtures.js`, `node validator-cli-prototype/validate.js sample-payloads/valid-verifier-runtime-policy-v0.3.json verifier-runtime-policy`, `node validator-cli-prototype/validate.js sample-payloads/valid-github-actions-oidc-evidence.json github-actions-oidc-evidence`, `node validator-cli-prototype/validate.js sample-payloads/valid-gitlab-ci-oidc-evidence.json gitlab-ci-oidc-evidence`, `node validator-cli-prototype/validate.js sample-payloads/valid-verifier-challenge-set.json verifier-challenge-set`, `node validator-cli-prototype/validate.js sample-payloads/valid-transparency-state.json transparency-state` |
| GitHub/community infrastructure | `node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .`, `node .github/scripts/check-json.js`, `node .github/scripts/check-english-only.js`, `node .github/scripts/check-markdown-links.js`, `git diff --check` |
