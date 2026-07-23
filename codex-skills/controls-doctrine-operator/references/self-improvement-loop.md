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
| New or moved corpus artifact | route coverage remains `valid: true` with `unrouted_artifact_count: 0` |
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

- Keep commits coherent: one concept, one validation story.
- Do not stage ignored local files.
- Mention any source family, schema, runner, or fixture added in the commit message if it is the core change.
- Leave the worktree clean except ignored local files.
