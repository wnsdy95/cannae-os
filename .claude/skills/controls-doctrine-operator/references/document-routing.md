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
Finding a document format is not domain expertise. For delegated authoring,
keep the real mission objective in `--capability-query`; an SOP-shaped subtask
must not suppress its mission-level capability gap or activate a standing unit.

Apply the same separation to ordinary compound tasks: keep the original domain
objective in `--capability-query` and the complete requested work, including
glossary/SOP housekeeping and prohibitions, in the task query. Route distinct
domain objectives separately rather than omitting one. A glossary or document
format match does not establish expertise in the work being described. The
router does not infer this semantic separation; a combined query can still hide
an uncovered domain behind a supporting route.
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

Do not invent a runtime mission to stabilize a plain document task. This pair
is rejected with receipt, persistence, coverage or mission/wave/agent metadata;
existing guarded missions keep their mission-ID binding and exact gates.
Project input references, when supplied, must use the same root and retain all
their source/access checks. The identity pair loads no content or artifacts and
does not create a standing organization, shared registry or distributed lock.

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
The [Codex receiving case](../../../../docs/document-authoring-case-study.md#native-codex-routing-and-receiving)
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

### Runtime Reading Scope

An ordinary prose handoff no longer adds event-storage architecture by default.
Five architecture, event-store, dashboard/wireframe and database-model references
are conditional in the runtime/dashboard and continuity routes. General maintenance
readiness remains when that route matches. Other routes, declared technical
departments, actual technical task/parent context and explicit corpus/project
inputs still add their references; a prohibition on implementation does not
cancel an assigned technical review or required source.

The router recognizes a bounded set of complete English exclusions, such as
"Do not build a dashboard" and "Dashboard development is deferred". Those clauses
cannot by themselves establish runtime capability or require the five specialist
manuals. The original task and capability query remain verbatim, and selected
route IDs and validation commands remain. Thus "Analyze museum attendance; do not
build a dashboard" keeps its domain gap and provisional cell instead of claiming
dashboard expertise covers the analysis. This adds the existing gap controls,
not authority to create a standing department.

Mixed, conditional and unknown wording stays conservative. "Do not skip dashboard
verification", "do not build it but review its design" and positive parent tasks
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

For a real local evidence workspace, route to `docs/local-operator-console.md`
and `scripts/serve_controls_operator.js`; validate with
`node run-operator-console-fixtures.js`. The human creates the owner account.
Do not read private setup links into chat, seed fake operational records, or
interpret login, viewer invitations or proposal inspection as scope approval.
Grant explicit restricted mission access only after owner reauthentication.
After a stale manifest/cursor error, refresh the list and reselect the evidence.

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

The report must return `valid: true` and `unrouted_artifact_count: 0`. If it does not, update `ROUTE_HINTS`, `RULES`, or the artifact naming so the item has a clear route.

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
| OPORD/WARNO/FRAGO/SITREP/AAR prompting | `docs/prompt-templates.md`, `docs/orders-production-pipeline.md` | `schema-files/opord.schema.json`, `schema-files/warno.schema.json`, `schema-files/frago.schema.json`, `schema-files/sitrep.schema.json`, `schema-files/aar.schema.json` |
| General request intake and draft compilation | `docs/request-order-intake.md`, `docs/orders-production-pipeline.md` | `scripts/compile_controls_order.js`, `request-order-compiler.js`, `order-intake-contract.js`, three intake schemas and `run-request-order-compiler-fixtures.js` |
| Exact USER order adoption and plan-bound agent tasking | `docs/order-adoption-and-plan-binding.md`, `docs/skill-operational-mission-lifecycle.md` | `scripts/adopt_controls_order.js`, `order-adoption-controller.js`, six adoption contracts, plan v0.2/context v0.3 and `run-order-adoption-fixtures.js`; changed plans need new review and legacy downgrade cannot discharge intake |
| Opened-plan revision and predecessor handoff | `docs/order-revision-and-supersession.md`, `docs/order-adoption-and-plan-binding.md` | `scripts/revise_controls_order.js`, revision contracts/controller and `run-order-revision-fixtures.js`; prepare the successor, settle old results, supersede exact scope, then request normal tool admission |
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
receive fixed non-secret error codes, never private contents or paths. In-place
broker re-enrollment after resume is not implemented: settle/revoke the old
lineage and obtain a newly reviewed successor wave instead of reusing its file.

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
| Skill update | `node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .`, `python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" .claude/skills/controls-doctrine-operator`, `python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" codex-skills/controls-doctrine-operator`, review both diffs for equivalent operational semantics |
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
