# Self-Improvement Loop

Use this after answering, editing, researching, or validating the Controls corpus.

This reference governs maintenance of the doctrine corpus and router. For autonomous improvement of an active mission or in-progress artifact, use `docs/bounded-self-improvement-operations.md` and the campaign/checkpoint/decision contracts instead of an informal AAR-only loop.

## Mandatory Per-Improvement Skill Adaptation

An accepted Controls improvement is incomplete until it also improves the
operator skill. For every improvement:

1. Extract one reusable operational lesson from the product, doctrine, runtime,
   research, validation, or workflow change.
2. Encode that lesson in a real skill surface: `SKILL.md`,
   `references/document-routing.md`, this reference, or a bundled script.
3. Mirror the operational semantics in both
   `codex-skills/controls-doctrine-operator/` and
   `.claude/skills/controls-doctrine-operator/`. Provider-specific paths and
   commands may differ.
4. Keep the main change, skill adaptation, and validation in the same commit or
   pull request.
5. Report the exact product-to-skill mapping at completion.

Mechanical wording churn is not a skill adaptation. If the operator cannot name
a reusable behavior that should change for the next run, the work is maintenance
or an incomplete improvement, not a completed improvement.

## Completion Audits

For "what remains" or an existing-program continuation, run `node implementation-candidate-registry.js audit` before inventing new work. Select
the next dependency-ready item from `docs/completion-backlog.md`, then inspect
its registered source requirements and existing implementation mappings.
Keep out-of-corpus capability routing for genuinely uncovered domains, not
ordinary corpus maintenance.

After changing a candidate section, compare `scan` with the committed registry,
review its exact source digest and mappings, and update both in the same change.
Do not automatically promote status from file presence. Preserve proposed names
and map equivalent existing paths instead of creating duplicate implementations.
For `implemented`, require no remaining work and checks for every acceptance
criterion; run `verify --workstream <id>` against a stable source tree and retain
the digest-bound result as evidence when operating a mission. An audit-only pass
does not execute checks. A verified subset does not close the full registry,
roadmap, campaign, provider operations, or the user's overall goal. Keep blocked
external dependencies visible and continue independent in-scope work.

Read `docs/implementation-candidate-registry.md` for parsing, check execution,
evidence, and trust limits. Never weaken a failing completion gate merely to
remove an item from the queue.

Regenerate retained audit snapshots through their source scanner after source
changes. Their `as_of` must reflect the actual UTC execution date; never manually
restamp an older result or treat its date as proof of current coverage.

## Publication Denial And Partial State

A ready result from before a stop is not reusable authority. When a controller
denies at its publication boundary, inspect status and verify the current
manifest before retrying. Earlier plan, routing, control, admission, or gateway
records may already exist because one lifecycle command is not a multi-artifact
transaction. Preserve those records; do not delete them, overwrite evidence,
backdate the clock, or use the raw store CLI to insert the denied artifact.

For an already admitted tool, distinguish not-started from started/unknown
effects, then use exact cancellation, result settlement, or recovery. Denial of
new authority does not establish process termination or settle old effects.
If the campaign is stopped, do not resume with a new session or campaign ID
without separately authorized successor scope and reconciled predecessor state.

After a provider failure, inspect both pending requests and
`unresolved_tool_effects`, including its exact checkpoint references. A callback
can be fully recorded while its external effects are still unknown. Never infer
settlement from `revoked`, zero pending callbacks, clean Git status, or a newly
authorized wave. Preserve the unknown-effect hold and gather effect evidence;
until an exact USER reconciliation contract exists, neither chat approval nor
manually inserted success records can clear it.

When extending a positive publisher, perform expensive validation outside the
namespace lease and repeat a short, synchronous, read-only authority predicate
inside the store's publication guard. Never write, recover, spawn a validator,
or perform an external effect from that predicate. Test a stop or expiry inserted
between the first check and publication, not only a stop before the command.
Also test exact reuse and prepared/artifact-written/history-reserved/committed
crash ordering. A generic store write without that integration is not admission.

Read `docs/repository-artifact-isolation-policy.md` and the lifecycle document
for covered publishers and residual cancellation/restart limits.

## Verifier Dependency Migrations

Before editing a verifier or dependency lockfile, inspect the producer metadata
in retained evidence. A lockfile-only update changes that identity too. Preserve
original artifacts; never edit their hashes or version fields to fit new code.

Run fresh and historical records through the current pinned verifier. Historical
support must recognize exact source-audited producer tuples, not a version range
or caller-supplied digest allowlist. It never authorizes loading an old runtime.
Exercise unchanged historical records, unknown module/lockfile identities,
schema/package mismatches, altered signed claims, and attempts to use the old
package for new verification. Run monitor, checkpoint, publisher, workload
identity, and full regression gates before integration.

Keep policy baselines, trust roots, checkpoint lineage, and release authority
unchanged unless a separate exact USER decision authorizes those operations.
Read `docs/github-release-independent-verification.md` for the supported replay
profiles and the distinction between source identity and execution attestation.

When a live monitor fails, retain every independent blocking code. Credential
renewal does not repair an unavailable predecessor checkpoint. Inspect the exact
provider run and retained artifact availability separately; do not skip failed
history, reuse initial bootstrap recovery, or reset an established lineage to
turn a dependency or credential update green.

## Improvement Triggers

Patch the corpus when one of these is true:

- A task required reading three or more unrelated docs before finding the right source.
- A new official source family, doctrine concept, schema type, runner, dashboard projection, or fixture category was added.
- The user asked a question that should have had an obvious route but did not.
- A validation failure exposed a missing regression rule.
- A source-map host appeared in Markdown but was not covered by `docs/source-map.md`.
- A policy was changed without a matching executable or review surface.

Use these signals to choose which skill surface to improve:

- The routing script missed an important document category.
- `--coverage` reports any unrouted document, schema, sample, runner, fixture, or skill artifact.
- `references/document-routing.md` lacks a repeated workflow.
- The validation command set changed.
- The self-improvement rules caused unnecessary work or missed a real gap.

## Update Surfaces

| Change | Required Updates |
| --- | --- |
| New official source | `docs/source-map.md`, `docs/research-compendium.md`, `source-map-url-coverage-report.json` |
| New policy document | `README.md`, `docs/military-llm-framework-v0.1.md`, `docs/source-map.md`, relevant reference in this skill |
| New runtime contract | schema, valid sample, invalid sample, validator type map, semantic rule if needed, fixture runner |
| New runner | targeted fixture runner, README/source-map entry, evaluation fixture note |
| New delegated-agent routing rule | routing receipt schema/sample, router receipt mode, preflight runner, preflight fixtures, Codex and Claude skill instructions |
| New dashboard projection | dashboard state, projection runner, dashboard fixture, source-map entry |
| New recurring workflow | this skill's `references/document-routing.md` and possibly `scripts/route_controls_docs.js` |
| New delegated mission lifecycle behavior | `docs/skill-operational-mission-lifecycle.md`, lifecycle schemas/samples/controller/E2E fixture, and both skill entry points |
| New adaptive workflow | bounded campaign, ready cycle order, executed verification receipt, signed verifier quorum for v0.3, checkpoint, accepted-parent lineage, decision, supervisor/controller fixtures, and integrity-checked repository evidence |
| New retained release path | exact USER grant, repository/tag/commit/notes/main-CI binding, bounded authorization, pre-action reappraisal, terminal receipt, adversarial fixture, and equivalent Codex/Claude wrapper |
| Persistent repository policy activation | separate exact USER policy grant, administrator/repository/main-CI/prior-state binding, bounded authorization, pre-action reappraisal, terminal observed-state receipt, explicit rollback exclusion, downstream enforcement, adversarial fixture, and equivalent Codex/Claude wrapper |
| Continuous release-integrity monitor | tracked activation baseline, explicit credential state, live policy check, resolved tag/immutability scan, exact retained signed attestation, fail-closed observation, scheduled/release-event CI, sanitized 401/403 diagnosis, fresh provider-ready triplet after every credential change, no mutation/release authority, adversarial fixture, and equivalent Codex/Claude wrapper |
| Initial release-checkpoint bootstrap recovery | one explicit USER grant, original policy-introduction boundary, exact current policy bytes, fresh same-grant genesis/root, complete retained failed-run set, two-file observation/root replay, newest live attempt-one consumer, bounded expiry, no reset/release authority, adversarial fixture, equivalent Codex/Claude wrapper, and live two-run proof from recovery sequence one to ordinary provider sequence two |
| New or moved corpus artifact | route coverage evaluates tracked plus unignored candidates and remains `valid: true` with `unrouted_artifact_count: 0`; Git-ignored runtime state does not enter doctrine inventory |
| Any accepted Controls improvement | one concrete skill delta in both provider skill trees, same-change validation, and an explicit product-to-skill mapping |

## AAR Questions

After every improvement, answer briefly in your own working notes:

1. What intent did the user have?
2. Which docs were actually needed?
3. Which docs were distracting?
4. Which validation caught the highest-risk failure?
5. What should the next agent be able to find faster?

Convert at least one reusable answer into a skill edit. Do not use an
unrelated or cosmetic edit merely to satisfy the gate.

## Source Discipline

- Use official military/government/NATO sources for doctrine claims when possible.
- If the information can change, browse and cite sources.
- If adding new official-source links, run `node source-map-linter.js --write-report`.
- If using non-US doctrine, check `docs/multinational-doctrine-consistency-review.md`.
- If the source is not strong enough for policy, record it as a research gap rather than a rule.

## Validation Discipline

Start targeted, then broaden:

1. Validate the exact new/changed artifact.
2. Run the fixture runner for that artifact family.
3. Run `node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .` when any corpus artifact changed.
4. Run `node validator-cli-prototype/run-fixtures.js` if validator/schema/sample changed.
5. Run all `run-*.js` if shared runner logic or policy integration changed.
6. Run Markdown link and JSON parse checks when docs or samples changed.
7. Run the English-only check when user-facing text, examples, or executable messages changed.
8. Run `git diff --check` before commit.
9. For a multi-wave or control-plane change, issue a fresh persisted verification receipt, obtain and persist a fresh trusted signed quorum for v0.3, verify the artifact store, and run the mandatory `before_completion` checkpoint before reporting completion.
10. Validate both provider skill trees and confirm that their operational
    semantics remain aligned.

## Commit Discipline

Before continuing adaptive work, reconstruct current supervisor state. An old
`active` campaign, ready context, or unexpired lease does not override a newer
stop decision. On `CAMPAIGN_CONTINUATION_BLOCKED`, preserve the campaign and
decision bytes, settle admitted tool results, revoke unused authority, and return
the unblock or successor decision to the USER. Do not open another wave or
provider session to bypass the hold. A cancellation or restarted campaign must
not be claimed until its separate terminal-settlement/USER-lineage contract exists.

Count idle time against the campaign's creation-based elapsed budget. A zero
reported counter, old ready order, or longer-lived lease does not extend it.
Use the live clock for actual work; never pass replay/test clock overrides,
restamp campaign creation, or edit retained counters to revive expired authority.
Keep reporting evidence separate from fresh admission, settle already admitted
effects, and return any successor budget/scope decision to the USER.

In synthetic tests, align each newly created plan's finite window with its test
clock. Do not disable the budget gate to reuse a historical sample timestamp;
this fixture setup rule never permits restamping persisted operational artifacts.

- Keep commits coherent: one concept, one validation story.
- Do not stage ignored local files.
- Mention any source family, schema, runner, or fixture added in the commit message if it is the core change.
- Leave the worktree clean except ignored local files.
