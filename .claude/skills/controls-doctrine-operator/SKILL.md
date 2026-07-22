---
name: controls-doctrine-operator
description: Route and operate the Controls military-style LLM doctrine corpus by human final authority or delegated AI role, and run bounded adaptive work campaigns. Use for framework questions, document routing, multi-agent missions, improving work already in progress, finite self-improvement checkpoints, or editing and validating docs, schemas, runners, fixtures, source maps, skills, and policy gates.
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

## Multi-Repository Artifacts

Before creating durable control evidence or deliverables, identify the target Git repository. Store JSON and files through `repository-artifact-store.js` under `repository -> mission -> wave -> kind`; never use a shared flat output directory.

- Use `--write-artifact --target-repository <repo>` for routing receipts.
- Use `--write-artifact --repository <repo>` for model compilation and integrated preflight.
- Treat persistence failure as a blocked wave.
- Run `repository-artifact-verify.js` before consuming proof and before wave completion. Treat pending journals, non-monotonic fencing, and integrity findings as blocking.
- Treat the built-in lease as a coherent shared-filesystem backend, not a partition-tolerant distributed lock. Distributed operation requires an external linearizable coordinator and storage-side fencing.
- Read `docs/repository-artifact-isolation-policy.md` for the complete command and file-handling contract.

## Bounded Self-Improvement

For a multi-wave mission, control-plane change, explicit autonomous-improvement request, or work that must improve beyond its first usable draft:

1. Create a repository-bound `SelfImprovementCampaign` before the first improvement cycle, preferably with `self-improvement-campaign-init.js`. Keep `USER` final decision authority.
2. Define acceptance criteria, normalized evidence-backed quality dimensions, protected invariants, finite budgets, and stop conditions. Never use model confidence as acceptance evidence.
3. For every candidate and completion state, run a repository-state-bound `VerificationPlan` with `verification-runner.js --repository <repo> --write-artifact`. Do not use model-authored validation status.
   Capture optional CLI stdout outside the target repository until verification succeeds; a shell creates redirected files before the check starts.
4. For every v0.3+ candidate and completion state, obtain fresh Ed25519 DSSE attestations over the exact persisted receipt from distinct trusted verifier IDs and keys in the required independence groups. Persist them unchanged. A signed `remote` origin is not trusted-execution proof.
5. For `runtime_control` or `skill`, pre-persist one sealed comparative set and plan, then run the identical harness against isolated baseline and candidate worktrees. Promotion requires distinct revisions; completion revalidation runs the same accepted revision twice. Require a `promotable` manifest-backed report; rollback on measured regression and escalate on an inconclusive comparison.
6. For every v0.4 skill/runtime-control comparison, obtain a fresh Ed25519 DSSE quorum over the exact persisted comparative report with `comparative-evaluation-attestation-runner.js` and persist it unchanged.
7. At every wave end, validation failure, scope change, and before completion, create a checkpoint whose metrics cite persisted receipt IDs and, for v0.3+, the signed receipt quorum. Skill/runtime checkpoints cite the comparative report and, for v0.4, its signed quorum. Then run `autonomous-improvement-controller.js --repository <repo>`.
8. For follow-on cycles, cite the manifest path/hash of the immediately prior accepted decision and carry its `accepted_revision` as baseline.
9. For policy, authority, scope, release, trust-key, verifier, quorum, or validity-window effects, persist and cite a USER-granted approval scope and checkpoint-specific consumption event. Prose approval and reused events are invalid.
10. Before the first cycle and after every persisted decision, run `campaign-supervisor.js --repository <repo> --campaign <id> --write-artifact`. For trust-policy v0.2+, first persist fresh evidence from every verifier needed for quorum using its selected `spiffe_x509` or `sigstore_bundle` adapter; Sigstore verifiers also require the exact manifest-bound `SigstoreTrustedRoot`. Execute only a current cycle order whose status is `ready`, whose `trust_policy_admission.satisfied` and required `identity_assurance.satisfied` are true, and whose required admission has not reached `valid_until`; use its exact cycle, attempt, baseline, parent, task, trigger, and proof requirements. Never self-declare verifier readiness or infer order state from chat history.
11. Carry forward only an accepted working state. Revision, rollback, and continue remain retries in the same cycle. A supervisor `hold`, nonzero exit, missing order, or conflicting order means no work.
12. Require receipt-backed independent evaluation for runtime, skill, and policy candidates. Stop on `escalate` or `terminate`; rollback only this campaign's own uncommitted candidate.
13. Never treat `accept_working_state`, `complete`, a comparative report, a report attestation, or a cycle order as merge, push, policy, trust-root, authority, or release approval.
14. Do not report completion without a passing `before_completion` checkpoint, fresh receipt, fresh signed receipt quorum for v0.3+, fresh comparison and signed report quorum for v0.4 skill/runtime-control targets, verified parent when applicable, repository-scoped decision evidence, and a supervisor projection whose status is `completed`.

Read `docs/bounded-self-improvement-operations.md` for the state machine and authority matrix.

## Validation

Use the smallest relevant validation, then broaden:

```bash
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
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
node run-comparative-evaluation-attestation-fixtures.js
node run-self-improvement-fixtures.js
node run-signed-self-improvement-fixtures.js
node run-campaign-supervisor-fixtures.js
node run-verifier-trust-readiness-fixtures.js
node run-verifier-identity-evidence-fixtures.js
node run-sigstore-verifier-identity-fixtures.js
node run-workload-identity-admission-fixtures.js
node run-cycle-order-admission-fixtures.js
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
- Mixing artifacts from separate target repositories in one flat output namespace.
- Continuing adaptive work without a finite campaign, runtime-issued receipt, fresh trusted signed receipt quorum for v0.3+, required signed report quorum for v0.4 control-plane work, required manifest-backed evidence for every counted verifier's selected SPIFFE or Sigstore adapter under trust-policy v0.2+, the selected Sigstore TrustedRoot when applicable, verified accepted baseline, integrity-checked proof store, mandatory checkpoint, or evidence-backed stop decision.

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
