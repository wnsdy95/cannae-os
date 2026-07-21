---
name: controls-doctrine-operator
description: Use this project skill in the Controls repository to route the military-style LLM doctrine corpus by human final decision authority or delegated AI role, department, authority, task, and need-to-know. Use it when answering framework questions, choosing docs to read, editing docs, schemas, runners, fixtures, source maps, policy gates, or validating that every corpus artifact is covered by the routing system.
---

# Controls Doctrine Operator

## Core Rule

Do not read the whole corpus by default. Route the task first, read the minimum authoritative documents, perform the smallest coherent update, and preserve the human user as final decision authority unless a bounded AI role has been explicitly delegated.

## Operator Modes

- **Human final decision authority**: When the user asks directly, the user is the decision-maker. The assistant may brief, recommend, draft, validate, and warn, but must not restrict the user's document visibility by the assistant's own role.
- **Delegated AI operator**: When the user asks an AI role, department, staff function, or TF to act, route by declared role, department, authority, task, risk, release target, and need-to-know. Escalate anything outside that boundary to the user.

If ambiguous, default to human final decision authority.

## Fast Start

Run the project router from the repo root.

For user-facing work:

```bash
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --actor=user "<request>" .
```

For delegated AI work:

```bash
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --actor=ai --role=S3 --department=operations --authority=scoped-execution "<mission request>" .
```

For delegated AI waves, routing is mandatory evidence. The CoS opens every wave with a wave receipt, and each expected agent produces its own S3 execution receipt before work:

```bash
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --receipt --scope=wave --mission=MIS-... --wave=W2 --agent=chief-of-staff --actor=ai --role=COS --department=coordination --authority=tasking "<wave mission>" .
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --receipt --scope=agent --mission=MIS-... --wave=W2 --agent=plans-agent --actor=ai --role=S3 --department=operations --authority=scoped-execution "<agent task>" .
node agent-routing-preflight-runner.js <agent-routing-preflight-bundle.json>
```

If role, department, or authority is missing in delegated AI mode, start with least-privilege routing and ask or infer only from explicit mission context.

This skill is self-contained: the router script and reference docs are bundled under this skill folder, so it works without reaching into `codex-skills/`.

## References

Read these only when needed (bundled with this skill):

- `.claude/skills/controls-doctrine-operator/references/document-routing.md`: task-to-document map, validation commands, and artifact ownership.
- `.claude/skills/controls-doctrine-operator/references/self-improvement-loop.md`: how to update source-map, compendium, fixtures, and this skill after learning.

## Reading Rules

1. For delegated AI execution, require preflight `ready` from `agent-routing-preflight-runner.js`; no routing receipt means no work.
2. Read `recommended_documents` first.
3. Use `supporting_artifacts` for schemas, samples, runners, fixtures, dashboards, and skill files connected to the matched route.
4. Do not broaden delegated AI access just because the repo is locally available.
5. Use `docs/source-map.md` before relying on an external military doctrine claim.
6. If a claim is current-date-sensitive or source coverage is missing, browse official primary sources before adding the claim.
7. When a mission uses multiple model tiers or families, compile from `ModelRegistry` and `ModelAssignmentRequest`, bind each expected agent and current-wave receipt to a compiled billet, and require `integrated-mission-preflight-runner.js` status `ready` before dispatch. Model capability never expands role authority.

## Editing Rules

When editing the corpus:

- Update the target document and its index/source-map entry together.
- If changing a runtime contract, update schema, valid sample, invalid sample, runner/fixture, and docs.
- If adding, renaming, moving, or deleting any corpus artifact, run coverage:

```bash
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
```

The coverage report must be `valid: true` with `unrouted_artifact_count: 0`.

## Validation

Use the smallest relevant validation, then broaden:

```bash
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
node .github/scripts/check-english-only.js
node run-agent-routing-preflight-fixtures.js
node run-model-force-assignment-fixtures.js
node run-model-force-v0.2-fixtures.js
node validator-cli-prototype/run-fixtures.js
for f in $(ls run-*.js | sort); do node "$f" || exit 1; done
node source-map-linter.js
git diff --check
```

For doc-only changes, also check Markdown links and JSON parsing when affected.

## Escalation Gates

Escalate to the user before:

- External, final, or cross-boundary release.
- High-risk or irreversible tool use.
- Reading or sharing documents outside delegated need-to-know.
- Accepting risk above the delegated role's authority.
- Treating US doctrine as universal without multinational consistency review.
- Allowing model capability, router choice, or evaluator confidence to expand delegated role authority.

## Self-Improvement

Patch this skill or the shared router when:

- `--coverage` reports an unrouted artifact.
- A repeated user request does not map to an obvious route.
- A new artifact type, runner family, fixture family, or validation command appears.
- Work required reading several unrelated docs before finding the right source.

This Claude skill is self-contained. Its bundled files are:

- `.claude/skills/controls-doctrine-operator/SKILL.md`
- `.claude/skills/controls-doctrine-operator/references/document-routing.md`
- `.claude/skills/controls-doctrine-operator/references/self-improvement-loop.md`
- `.claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js`

The Codex copy under `codex-skills/controls-doctrine-operator/` is the parallel skill for Codex (`~/.codex/skills`). When the router script or a reference changes, update both copies so they do not drift.
