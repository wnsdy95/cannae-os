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

For delegated AI waves, use the operational lifecycle controller. It generates the CoS and every expected S3 receipt, runs preflight, binds optional model assignment, and issues context packs only when ready:

```bash
node .claude/skills/controls-doctrine-operator/scripts/operate_controls_mission.js \
  open <mission-wave-plan.json> \
  --repository <target-repo> \
  --artifact-root .cannae/artifacts
```

The manual receipt commands below are for diagnosis or lower-level integration, not the default dispatch path:

```bash
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --receipt --scope=wave --mission=MIS-... --wave=W2 --agent=chief-of-staff --actor=ai --role=COS --department=coordination --authority=tasking "<wave mission>" .
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --receipt --scope=agent --mission=MIS-... --wave=W2 --agent=plans-agent --actor=ai --role=S3 --department=operations --authority=scoped-execution "<agent task>" .
node agent-routing-preflight-runner.js <agent-routing-preflight-bundle.json>
```

If role, department, or authority is missing in delegated AI mode, start with least-privilege routing and ask or infer only from explicit mission context.

The router and references are bundled under this skill folder and do not depend on `codex-skills/`. The lifecycle wrapper resolves the shared Cannae OS runtime through the live symlink, the copy-install marker, or `CANNAE_OS_HOME`.

## Operational Mission Lifecycle

1. Create a schema-valid `MissionWavePlan` from `sample-payloads/valid-mission-wave-plan.json`. Preserve `USER` final authority, give each AI a non-command operational role, state allowed/approval-required/prohibited actions, and set finite validity and adaptive budgets.
2. For a dispatch-controlled wave, create one deny-by-default policy draft per agent, hash each exact draft with `scripts/operate_dispatch_runtime.js hash-input`, and put each digest plus its exact agent, provider, and policy ID in the USER-authorized `MissionWavePlan.dispatch_control.policy_authorizations`.
3. Run `scripts/operate_controls_mission.js open`. Require `status: ready`, `context_dispatch_authorized: true`, `tool_execution_authorized: false`, `dispatch_authorized: false`, one context pack per expected agent, and a valid artifact store. Do not dispatch from manually assembled chat claims.
4. Give each agent only its exact `AgentContextPack`. The S3 receipt is the mandatory control-plane route; the context pack's operational role, department, task, and delegated authority are the actual mission assignment.
5. For required model allocation, persist a ready integrated preflight first and cite its exact manifest reference and per-agent billet. Missing or mismatched bindings block `open`.
6. Before any covered tool call, run `authorize-policy` on the exact preauthorized draft, then issue one short-lived `AgentDispatchLease` from its persisted `--policy-id` for this exact provider session and mission agent. Enable the provider hook adapter. A ready context pack is necessary but is not tool authority.
7. Store work products and verification results through `repository-artifact-store.js`; control metadata, policies, leases, and completion prose are not work evidence.
8. Run `complete --lease <lease-id>` for each successful dispatch-controlled agent before reporting. Blocked or failed agents must have no active lease or unresolved tool request.
9. Run `scripts/operate_controls_mission.js report <report.json>` with exact plan, preflight, context, and work-evidence references. A blocked or failed report stops continuation.
10. Run `scripts/operate_controls_mission.js close <aar.json> --mission <id> --wave <id>`. Follow the emitted next-wave trigger; bounded improvements do not claim future execution.
11. Use `status` for handoff and `verify` before evidence consumption or completion. Conversation history is not mission state.
12. Never infer commit, push, merge, risk acceptance, policy, authority, or release permission from any lifecycle result or dispatch lease.

Read `docs/skill-operational-mission-lifecycle.md` for the complete command and failure contract.

## Enforced Delegated Tool Dispatch

For every independently acting AI agent:

1. Use a separate provider session and policy draft per agent. In one repository-bound wave, stage agents against the same target worktree and artifact namespace; complete or settle one lease before issuing the next. Do not infer a parallel exception from a caller-declared read-only class. Treat parallel worktrees as separate sub-missions that require a later integration wave.
2. Hash each exact draft before `open`, place its digest in the matching `MissionWavePlan.dispatch_control.policy_authorizations` row, and require retained USER authorization over that protected plan.
3. After mission `open` is context ready, compile the preauthorized draft and issue the one initial lease lineage:

```bash
node .claude/skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  authorize-policy --repository <repo> --artifact-root <artifact-root> \
  --policy <dispatch-tool-policy-draft.json>

node .claude/skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  issue --repository <repo> --artifact-root <artifact-root> \
  --policy-id <policy-id> --session <provider-session-id> \
  --provider-agent <provider-agent-id>
```

4. Install or externally manage hooks with `node .claude/skills/controls-doctrine-operator/scripts/install_dispatch_hooks.js --provider claude --repository <repo>`, then launch the agent with `CANNAE_REPOSITORY`, `CANNAE_ARTIFACT_ROOT`, `CANNAE_MISSION_ID`, `CANNAE_WAVE_ID`, `CANNAE_AGENT_ID`, and `CANNAE_PROVIDER_AGENT_ID`.
5. Require a manifest-backed allow event before each covered call and an exact tool-name, input-digest, provider-result, and repository-state checkpoint before another call. Bind Claude's hook `agent_id` when present. Unknown tools, ambiguous rules, replay, drift, expired authority, and retained actions deny by default.
6. On interrupt, `resume`, `clear`, or `fork`, assume the old authority is interrupted. Review the exact checkpoint and run explicit `resume` to issue a lineage-continuation lease. Session history never renews authority.
7. Revoke on scope change, operator stop, unexpected drift, unresolved post-tool failure, or handoff. Run `complete --lease <lease-id>` before a successful agent result enters the wave report.

Project hooks are a deterministic guardrail for covered calls, not a non-bypassable security boundary. Use managed settings or an independently protected tool gateway when an operator must not be able to disable or replace enforcement.

Read `docs/enforced-dispatch-and-resume.md` for the policy contract, hook setup, provider limits, failure matrix, and production deployment levels.

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
4. For every v0.3+ candidate and completion state, obtain fresh Ed25519 DSSE attestations over the exact persisted receipt from distinct trusted verifier IDs and keys in the required independence groups. Under trust-policy v0.6, group diversity means computed `VID-*` failure domains, not declared labels. Under trust-policy v0.4+, first produce manifest-backed `VerifierExecutionEvidence` for each verifier using its assigned runtime profile, repository state, target digest and workload-identity evidence; v0.6 additionally requires adapter-observed independence claims matching runtime-policy v0.2+. Runtime-policy v0.3 GitHub Actions and GitLab CI profiles require exact manifest-backed native OIDC evidence and JWKS trust material, with provider and failure-domain fields derived from the verified token. The trusted builder and verifier sign the same payload. Persist evidence and attestations unchanged. A signed `remote` origin without valid execution evidence is only a claim.
5. For `runtime_control` or `skill`, pre-persist one sealed comparative set and plan, then run the identical harness against isolated baseline and candidate worktrees. Promotion requires distinct revisions; completion revalidation runs the same accepted revision twice. Require a `promotable` manifest-backed report; rollback on measured regression and escalate on an inconclusive comparison.
6. For every v0.4 skill/runtime-control comparison, obtain a fresh Ed25519 DSSE quorum over the exact persisted comparative report with `comparative-evaluation-attestation-runner.js` and persist it unchanged. Under trust-policy v0.4, create separate comparative-purpose execution evidence before signing each report attestation.
7. At every wave end, validation failure, scope change, and before completion, create a checkpoint whose metrics cite persisted receipt IDs and, for v0.3+, the signed receipt quorum. Skill/runtime checkpoints cite the comparative report and, for v0.4, its signed quorum. Then run `autonomous-improvement-controller.js --repository <repo>`.
8. For follow-on cycles, cite the manifest path/hash of the immediately prior accepted decision and carry its `accepted_revision` as baseline.
9. For policy, authority, scope, release, trust-key, verifier, quorum, or validity-window effects, persist and cite a USER-granted approval scope and checkpoint-specific consumption event. Prose approval and reused events are invalid.
10. Before the first cycle and after every persisted decision, run `campaign-supervisor.js --repository <repo> --campaign <id> --write-artifact`. For trust-policy v0.2 through v0.4, first persist fresh evidence from every verifier needed for quorum using its selected `spiffe_x509` or `sigstore_bundle` adapter; Sigstore verifiers also require the exact manifest-bound `SigstoreTrustedRoot`. Trust-policy v0.4+ additionally requires the exact human-approved `VerifierRuntimePolicy` with one complete purpose-authorized profile assignment per verifier. Under v0.5+, the first supervisor call issues a manifest-backed challenge and intentionally holds; each verifier must then persist dual-signed identity evidence containing its exact assigned nonce, and supervision must run again. Under v0.6+, require runtime-policy v0.2+ and enough computed failure domains. Under v0.7, advance the exact manifest-backed `TransparencyState` stream with fresh consistency, witness, monitor, root and incident evidence before supervision. Execute only a current cycle order whose status is `ready`, whose required identity, challenge, independence, and transparency admissions are satisfied, and whose `valid_until` has not been reached; use its exact cycle, attempt, baseline, parent, task, trigger, and proof requirements. Runtime-policy readiness, challenge response, and transparency readiness do not claim that a future invocation has already executed. Never self-declare verifier readiness or infer order state from chat history.
11. Carry forward only an accepted working state. Revision, rollback, and continue remain retries in the same cycle. A supervisor `hold`, nonzero exit, missing order, or conflicting order means no work.
12. Require receipt-backed independent evaluation for runtime, skill, and policy candidates. Stop on `escalate` or `terminate`; rollback only this campaign's own uncommitted candidate.
13. Never treat `accept_working_state`, `complete`, a comparative report, a report attestation, or a cycle order as merge, push, policy, trust-root, authority, or release approval.
14. Do not report completion without a passing `before_completion` checkpoint, fresh receipt, fresh signed receipt quorum for v0.3+, valid execution evidence for every quorum member under trust-policy v0.4+, fresh comparison and signed report quorum for v0.4 skill/runtime-control targets, verified parent when applicable, repository-scoped decision evidence, and a supervisor projection whose status is `completed`.

Read `docs/bounded-self-improvement-operations.md` for the state machine and authority matrix.

## Validation

Use the smallest relevant validation, then broaden:

```bash
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
node .github/scripts/check-english-only.js
node run-agent-routing-preflight-fixtures.js
node run-skill-mission-controller-fixtures.js
node run-dispatch-runtime-fixtures.js
node run-document-routing-fixtures.js
node run-model-force-assignment-fixtures.js
node run-model-force-v0.2-fixtures.js
node run-repository-artifact-isolation-fixtures.js
node run-repository-artifact-concurrency-fixtures.js
node run-repository-artifact-recovery-fixtures.js
node run-verification-runner-fixtures.js
node run-verifier-execution-evidence-fixtures.js
node run-github-actions-oidc-fixtures.js
node run-gitlab-ci-oidc-fixtures.js
node run-verifier-challenge-fixtures.js
node run-verifier-independence-fixtures.js
node run-transparency-operations-fixtures.js
node run-transparency-supervisor-fixtures.js
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
- Starting delegated work without the current controller-issued context pack, or reusing a prior wave's routing evidence.
- Starting covered delegated tool work without a current manifest-backed dispatch lease for the exact mission agent and provider session, or treating resumed conversational context as renewed authority.
- Describing project-local hooks as a complete security boundary when the deployment requires managed policy, separate repository-scoped sub-missions/worktrees and sessions followed by an integration wave, an OS sandbox, or an independently protected gateway.
- Mixing artifacts from separate target repositories in one flat output namespace.
- Continuing adaptive work without a finite campaign, runtime-issued receipt, fresh trusted signed receipt quorum for v0.3+, required signed report quorum for v0.4 control-plane work, required manifest-backed evidence for every counted verifier's selected SPIFFE or Sigstore adapter under trust-policy v0.2+, the selected Sigstore TrustedRoot when applicable, the exact runtime policy and per-attestation execution evidence under trust-policy v0.4+, the exact unexpired supervisor challenge and dual-signed nonce responses under v0.5+, runtime-policy v0.2+ and enough computed failure domains under v0.6+, the exact native OIDC/JWKS chain and clean token-bound commit for runtime-policy v0.3 GitHub Actions and GitLab CI evidence, a contiguous current manifest-backed transparency state under v0.7, verified accepted baseline, integrity-checked proof store, mandatory checkpoint, or evidence-backed stop decision.

## Mandatory Skill Adaptation

Every accepted Controls improvement must include one concrete, reusable skill
adaptation before completion. Do not defer it to another phase.

1. State the operational lesson exposed by the improvement.
2. Patch at least one real skill surface: `SKILL.md`, a routing/reference file,
   or a bundled script. A date bump, typo-only edit, or restatement of completed
   work does not count.
3. Apply the same operational rule to both the Claude and Codex skill trees.
   Provider-specific wording and commands may differ, but authority, routing,
   execution, validation, and stop semantics must remain equivalent.
4. Keep the product change, skill adaptation, and validation in the same commit
   or pull request.
5. In the completion report, identify the product delta, corresponding skill
   delta, and validation that proves both.

If no honest reusable skill adaptation can be identified, do not label or close
the work as an improvement. Re-examine the operational lesson or classify the
change as maintenance explicitly authorized by the human user.

After every improvement, check whether coverage missed an artifact, a repeated
request lacks a route, a new artifact or validation family appeared, several
unrelated documents were needed, or a validation failure exposed a missing
instruction. Update the smallest skill surface that makes the next operator
perform the improved procedure by default.

This Claude skill is self-contained. Its bundled files are:

- `.claude/skills/controls-doctrine-operator/SKILL.md`
- `.claude/skills/controls-doctrine-operator/references/document-routing.md`
- `.claude/skills/controls-doctrine-operator/references/self-improvement-loop.md`
- `.claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js`
- `.claude/skills/controls-doctrine-operator/scripts/operate_controls_mission.js`
- `.claude/skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js`
- `.claude/skills/controls-doctrine-operator/scripts/enforce_controls_dispatch.js`
- `.claude/skills/controls-doctrine-operator/scripts/install_dispatch_hooks.js`

The Codex copy under `codex-skills/controls-doctrine-operator/` is the parallel skill for Codex (`~/.codex/skills`). When the router script or a reference changes, update both copies so they do not drift.
