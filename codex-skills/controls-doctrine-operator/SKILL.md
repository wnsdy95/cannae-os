---
name: controls-doctrine-operator
description: Efficiently navigate, apply, validate, and improve the Controls military-style LLM doctrine corpus and bounded adaptive work campaigns. Use when Codex is working in or from the controls repository, routing doctrine, editing framework artifacts, operating multi-agent missions, improving work already in progress, running finite self-improvement checkpoints, or maintaining schemas, runners, fixtures, source maps, skills, and policy gates.
---

# Controls Doctrine Operator

## Core Rule

Do not read the whole corpus by default. Route the task by operator mode, read the minimum authoritative documents, make the smallest coherent update, then improve the corpus if the work exposed a reusable gap.

## Operator Modes

There are two modes:

- **Human final decision authority**: When the chat user is using this skill directly, treat the user as the final decision-maker. The AI may brief, recommend, draft, validate, and warn, but should not restrict the user's document visibility by the AI's own role.
- **Delegated AI operator**: When an AI agent is acting as a role, department, or staff function, route documents by declared role, department, authority, task, and need-to-know. Escalate to the human user for anything outside delegated authority.

If the request is ambiguous, default to human final decision authority for the user-facing answer. Use delegated AI operator only when the user asks to run an AI role, department, agent, staff section, TF, or authority-bounded workflow.

## Fast Start

1. Confirm the repo root contains `README.md`, `docs/source-map.md`, and `schema-files/README.md`.
2. Run the router when the task is not obvious:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --actor=user "<user request>" .
```

For delegated AI work, pass the role, department, and authority when known:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --actor=ai --role=S3 --department=operations --authority=scoped-execution "<mission request>" .
```

For delegated AI waves, routing is mandatory evidence. The CoS opens every wave with a wave receipt, and each expected agent produces its own S3 execution receipt before work:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --receipt --scope=wave --mission=MIS-... --wave=W2 --agent=chief-of-staff --actor=ai --role=COS --department=coordination --authority=tasking "<wave mission>" .
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --receipt --scope=agent --mission=MIS-... --wave=W2 --agent=plans-agent --actor=ai --role=S3 --department=operations --authority=scoped-execution "<agent task>" .
node agent-routing-preflight-runner.js <agent-routing-preflight-bundle.json>
```

If the skill is loaded from `~/.codex/skills`, run the bundled script from that skill folder or pass the repo root as the last argument.

3. Read only the recommended documents plus any directly referenced schema/runner/sample.
4. If a claim depends on external military doctrine, use `docs/source-map.md` first. Browse only when the source is missing, stale, or explicitly current-date-sensitive.
5. For edits, update the document, the index, and the executable validation surface together.
6. After adding, renaming, or deleting a document, schema, sample, runner, fixture, or skill file, verify inventory coverage:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
```

## Routing References

Read these only when needed:

- `references/document-routing.md`: task-to-document map, validation commands, and artifact ownership.
- `references/self-improvement-loop.md`: how to update source-map, compendium, fixtures, and this skill after learning.

## Workflows

### Answering Framework Questions

1. Route the question in human final decision authority mode unless the user explicitly asks for AI delegation.
2. Read the primary docs from the router output.
3. Prefer local source-of-truth files over memory.
4. Answer with document paths and line references when useful.
5. If the question reveals a missing index entry or repeated confusion, apply the self-improvement loop.

### Routing Delegated AI Agents

1. Identify the agent's role, department, authority scope, task, release target, and risk level.
2. For every new wave, require exactly one CoS wave routing receipt using `--receipt --scope=wave --role=COS --department=coordination --authority=tasking`.
3. For every expected worker agent, require one agent routing receipt using `--receipt --scope=agent --role=S3 --department=operations --authority=scoped-execution`.
4. Run `node agent-routing-preflight-runner.js <agent-routing-preflight-bundle.json>` before delegated execution. If projection status is `blocked`, do not start the wave.
5. If role, department, or authority is missing, use least-privilege routing and ask or infer only from explicit mission context.
6. Start from `docs/role-document-access-policy.md`, `docs/agent-roles-and-authority.md`, `docs/approval-scope-policy.md`, and task docs from the router.
7. Do not broaden document access just because the corpus is available locally; broaden only when the role, mission, or approval permits it.
8. Escalate to the human user before release, irreversible action, high-risk tool use, or cross-boundary authority claims.
9. When a mission uses multiple model tiers or families, compile the assignment from `ModelRegistry` and `ModelAssignmentRequest`, bind each expected agent and current-wave receipt to a compiled billet, and require `integrated-mission-preflight-runner.js` status `ready` before dispatch. Model capability never expands role authority.

### Persisting Multi-Repository Artifacts

1. Identify the target Git repository before creating any durable control evidence or deliverable.
2. Store every JSON or file artifact through `repository-artifact-store.js` under `repository -> mission -> wave -> kind`; never use a shared flat output directory.
3. For routing receipts, use `--write-artifact --target-repository <repo>`. For model compilation and integrated preflight, use `--write-artifact --repository <repo>`.
4. Use one shared `--artifact-root` for a campaign when useful; repository fingerprint namespaces still keep outputs separate.
5. Treat persistence failure as a blocked wave. Do not dispatch from an integrated preflight whose artifact write failed.
6. Run `repository-artifact-verify.js` before consuming proof and before wave completion. A pending journal, broken history, non-monotonic fencing token, sidecar mismatch, or artifact hash mismatch blocks the wave. Use `--recover` only for a valid pending transaction under a current lease.
7. Treat the built-in coordinator as a coherent shared-filesystem backend, not a partition-tolerant distributed lock. Stop writes on split-brain, delayed visibility, fencing-token rollback, or unsupported atomic operations; require an external linearizable coordinator and storage-side fencing for those deployments.

### Operating Bounded Self-Improvement

For a multi-wave mission, control-plane change, explicit autonomous-improvement request, or work that must keep improving after its first usable draft:

1. Create a `SelfImprovementCampaign` before the first improvement cycle, preferably with `self-improvement-campaign-init.js`. Bind it to one target repository and preserve `USER` final decision authority.
2. Define observable acceptance criteria, normalized evidence-backed quality dimensions, protected invariants, finite budgets, and stop conditions. Do not use model confidence as a metric.
3. For every candidate and completion state, create a repository-state-bound `VerificationPlan`; run `verification-runner.js --repository <repo> --write-artifact`. Never substitute model-authored test status, prose output, or an unpersisted receipt.
   Capture optional CLI stdout outside the target repository until verification succeeds; a shell creates redirected files before the check starts.
4. For every v0.3 candidate and completion state, obtain fresh Ed25519 DSSE attestations over the exact persisted receipt from distinct trusted verifier IDs and keys in the policy-required independence groups. Persist them unchanged and cite their manifest paths and hashes. A signed `remote` origin is a claim, not trusted-execution proof.
5. Before promoting a `runtime_control` or `skill` candidate, persist a sealed `ComparativeEvaluationSet` and `ComparativeEvaluationPlan`, then run `comparative-evaluation-runner.js` against the accepted baseline worktree and candidate repository. Require one identical harness/hash/argv, campaign-owned absolute and non-regression thresholds, and a persisted `promotable` report. `rollback` means rollback; `inconclusive` means stop and escalate.
6. At every wave end, validation failure, scope change, and before completion, create a `SelfImprovementCheckpoint` whose metrics and independent evaluation cite persisted receipt IDs and, for v0.3, the signed quorum. Skill/runtime-control checkpoints also cite the comparative report. Run `autonomous-improvement-controller.js --repository <repo>` against the proof store.
7. For cycle 2+, cite the manifest path/hash of the immediately prior `accept_working_state` decision and use its `accepted_revision` as the baseline. Do not carry forward a rejected, rollback, or merely named parent.
8. For policy, authority, scope, release, trust-key, verifier, quorum, or validity-window changes, persist an exact USER-granted `ApprovalScope` and matching `ApprovalConsumptionEvent`. Bind its execution ID to the checkpoint; prose approval and reused events are invalid.
9. Before the first cycle and after every persisted decision, run `campaign-supervisor.js --repository <repo> --campaign <id> --write-artifact`. Execute only a current `SelfImprovementCycleOrder` whose status is `ready`; use its exact cycle, attempt, baseline, parent, task, trigger, and proof requirements. Never infer them from chat history.
10. Carry forward only an accepted working state; revision, rollback, and continue orders remain retries in the same cycle. A supervisor `hold`, nonzero exit, missing order, or conflicting order means no work.
11. Permit automatic edits only for targets/actions/change classes inside the campaign envelope. Require receipt-backed independent evaluation for runtime, skill, and policy candidates.
12. Treat `escalate` and `terminate` as hard stops. For `rollback`, revert only this campaign's own uncommitted candidate changes.
13. Never infer merge, push, release, policy, trust-root, or authority approval from `accept_working_state`, `complete`, a comparison report, or a cycle order; these artifacts leave release unauthorized.
14. Do not report completion without a passing `before_completion` checkpoint, a fresh receipt, a fresh signed quorum for v0.3, a fresh comparative report when the target is a skill/runtime control, a verified parent when applicable, repository-scoped decision evidence, and a supervisor projection whose status is `completed`.

Read `docs/bounded-self-improvement-operations.md` for the full state machine and authority matrix.

### Editing Doctrine Or Policy

1. Read `docs/source-map.md`, the target policy, and any referenced schemas/runners.
2. If changing a runtime contract, update all four: schema, valid sample, invalid sample, runner/fixture.
3. If adding official sources, update `docs/source-map.md`, `docs/research-compendium.md`, and `source-map-url-coverage-report.json`.
4. Run targeted validation first, then the relevant `run-*.js` fixture.
5. Commit coherent changes when the repo is clean except ignored files.

### Adding New Capability

Use the existing force-structure rule:

1. Identify the capability gap.
2. Check whether SOP, schema, tooling, training, or authority changes solve it before adding a new unit/role/runner.
3. If a new artifact is justified, add source-map, README, schema/sample/runner references.
4. Add a fixture that fails for the unsafe or under-specified case.

### Self-Improving This Skill

After significant work, ask:

- Did `--coverage` report any unrouted artifact?
- Did routing require reading many unrelated docs?
- Did the user ask a repeated question not covered by `references/document-routing.md`?
- Did a new artifact type, runner, or validation pattern appear?
- Did a validation failure reveal a missing skill instruction?

If yes, patch this skill's `SKILL.md`, `references/`, or `scripts/`, run skill validation, and commit the skill update.

## Required Validation

Use the smallest relevant set, then broaden:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
node .github/scripts/check-english-only.js
node run-agent-routing-preflight-fixtures.js
node run-document-routing-fixtures.js
node run-model-force-assignment-fixtures.js
node run-model-force-v0.2-fixtures.js
node run-repository-artifact-isolation-fixtures.js
node run-repository-artifact-concurrency-fixtures.js
node run-repository-artifact-recovery-fixtures.js
node run-verification-runner-fixtures.js
node run-verification-attestation-fixtures.js
node run-comparative-evaluation-fixtures.js
node run-self-improvement-fixtures.js
node run-signed-self-improvement-fixtures.js
node run-campaign-supervisor-fixtures.js
node validator-cli-prototype/run-fixtures.js
for f in $(ls run-*.js | sort); do node "$f" || exit 1; done
node source-map-linter.js
git diff --check
```

For doc-only changes, also check Markdown links and JSON parsing when indexes or samples changed.

## Guardrails

- Treat `COMMANDER`, `COS`, `S2`, `S3`, `S4`, `S6` as internal function IDs, not universal ranks or staff labels.
- The human user remains final decision authority unless they explicitly delegate a bounded AI role.
- AI agents must route by role, department, authority, task, and need-to-know.
- Delegated AI waves require routing receipts and preflight `ready`; no receipt means no work.
- Mixed-model missions require registry compilation and integrated routing/assignment preflight; an unready router, unbound agent, model monoculture, correlated assurance, expired evaluation, or authority inherited from model capability blocks dispatch.
- Multi-repository missions require explicit target-repository artifact storage; do not mix receipts, projections, reports, or deliverables in a flat campaign directory.
- Adaptive missions require a finite campaign, runtime-issued receipt proof, fresh trusted signed quorum for v0.3, exact accepted-parent lineage, a verified artifact store, a current ready cycle order, and a mandatory completion checkpoint; self-improvement never creates self-approval, self-release, trust-root authority, or unbounded recursion.
- Skill and runtime-control promotion additionally require one pre-persisted sealed evaluation contract executed against isolated baseline/candidate worktrees with an identical harness. Promotion revisions must differ; completion revalidation runs the same accepted revision twice. Comparison evidence never grants release authority.
- Do not make US doctrine the default for multinational use; apply `docs/multinational-doctrine-consistency-review.md`.
- Do not add external-source claims without source-map coverage.
- Do not leave a new policy without a validation or review path.
- Do not update this skill from one-off taste preferences; update it only for repeated routing, validation, or corpus-maintenance value.
