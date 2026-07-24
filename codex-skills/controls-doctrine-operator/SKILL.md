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

For delegated AI waves, use the operational lifecycle controller. It generates the CoS and every expected S3 receipt, runs preflight, binds optional model assignment, and issues context packs only when ready:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_mission.js \
  open <mission-wave-plan.json> \
  --repository <target-repo> \
  --artifact-root .cannae/artifacts
```

The manual receipt commands below are for diagnosis or lower-level integration, not the default dispatch path:

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

### Operating A Delegated Mission

1. Create a schema-valid `MissionWavePlan` from `sample-payloads/valid-mission-wave-plan.json`. Preserve `USER` final authority, give each AI a non-command operational role, state allowed/approval-required/prohibited actions, and set finite validity and adaptive budgets.
2. For a dispatch-controlled wave, create one deny-by-default policy draft per agent, hash each exact draft with `scripts/operate_dispatch_runtime.js hash-input`, and put each digest plus its exact agent, provider, and policy ID in the USER-authorized `MissionWavePlan.dispatch_control.policy_authorizations`.
3. Run `scripts/operate_controls_mission.js open`. Do not dispatch from manually assembled chat claims. Require `status: ready`, `context_dispatch_authorized: true`, `tool_execution_authorized: false`, `dispatch_authorized: false`, one context pack per expected agent, and a valid artifact store.
4. Give each agent only its exact `AgentContextPack`. The S3 receipt is its mandatory control-plane route; `operational_role`, `department`, `task`, and `delegated_authority` remain its actual mission assignment.
5. If `model_assignment.required` is true, first persist a ready integrated mission preflight and cite its exact manifest reference and per-agent billet. A missing or mismatched model binding blocks `open`.
6. Before any covered tool call, run `authorize-policy` on the exact preauthorized draft, then issue one short-lived `AgentDispatchLease` from its persisted `--policy-id` for this exact provider session and mission agent. Enable the provider hook adapter. A ready context pack is necessary but is not tool authority.
7. Store every work product and verification result through `repository-artifact-store.js`. A completion claim, plan, receipt, preflight, context pack, policy, or lease is not work evidence.
8. Run `complete --lease <lease-id>` for each successful dispatch-controlled agent before reporting. Blocked or failed agents must have no active lease or unresolved tool request.
9. Create a `MissionWaveReport` with the exact plan, preflight, context, and work-evidence references. Run `scripts/operate_controls_mission.js report`; a blocked or failed result returns nonzero and stops continuation.
10. Create an AAR and run `scripts/operate_controls_mission.js close --mission <id> --wave <id>`. Follow its next-wave trigger. Ordinary findings enter the bounded campaign; retained decisions return to the user.
11. Run `status` for handoff and `verify` before consuming evidence or declaring wave completion. Conversation history is not mission state.
12. Never infer commit, push, merge, risk acceptance, policy, authority, or release permission from `open`, `report`, `close`, a context pack, a dispatch lease, or a queued improvement.

Read `docs/skill-operational-mission-lifecycle.md` for commands, exact contracts, model binding, failure behavior, and operational limits.

### Enforcing Delegated Tool Dispatch

For every independently acting AI agent:

1. Use a separate top-level provider session and policy draft per agent. In one repository-bound wave, stage agents against the same target worktree and artifact namespace; complete or settle one lease before issuing the next. Do not infer a parallel exception from a caller-declared read-only class. Treat parallel worktrees as separate sub-missions that require a later integration wave.
2. Hash each exact draft before `open`, place its digest in the matching `MissionWavePlan.dispatch_control.policy_authorizations` row, and require retained USER authorization over that protected plan.
3. After `open` returns context ready, compile the preauthorized draft and issue the one initial lease lineage:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  authorize-policy --repository <repo> --artifact-root <artifact-root> \
  --policy <dispatch-tool-policy-draft.json>

node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  issue --repository <repo> --artifact-root <artifact-root> \
  --policy-id <policy-id> --session <provider-session-id> \
  --provider-agent <provider-agent-id>
```

4. Install or externally manage the provider hooks with `node codex-skills/controls-doctrine-operator/scripts/install_dispatch_hooks.js --provider codex --repository <repo>`, then launch the agent with `CANNAE_REPOSITORY`, `CANNAE_ARTIFACT_ROOT`, `CANNAE_MISSION_ID`, `CANNAE_WAVE_ID`, `CANNAE_AGENT_ID`, and `CANNAE_PROVIDER_AGENT_ID`.
5. Require a manifest-backed allow event before each covered call and an exact tool-name, input-digest, provider-result, and repository-state checkpoint before another call. Unknown tools, ambiguous rules, replay, drift, expired authority, and retained actions deny by default.
6. On interrupt, `resume`, `clear`, or `fork`, assume the old authority is interrupted. Review the exact checkpoint and run explicit `resume` to issue a lineage-continuation lease. Session history never renews authority.
7. Revoke on scope change, operator stop, unexpected drift, unresolved post-tool failure, or handoff. Run `complete --lease <lease-id>` before a successful agent result enters the wave report.

Project hooks are a deterministic guardrail for covered local calls, not a non-bypassable security boundary. Codex does not expose a unique subagent identity in the documented `PreToolUse` payload, so strict mission-agent isolation requires separate top-level sessions or an external gateway.

Read `docs/enforced-dispatch-and-resume.md` for the policy contract, hook setup, provider limits, failure matrix, and production deployment levels.

### Operating The Protected Tool Gateway

Use this path when a tool call must have a durable gateway transaction in addition to the Phase 16 dispatch admission:

1. Finish routing, policy authorization, and lease issuance first. Build a `ToolGatewayRequest` from the exact active lease, policy, checkpoint, repository state, authenticated-principal projection, trusted gateway projection, and canonical tool-input digest.
2. Treat `--verified-principal-sha256` and `--gateway-binding-sha256` as outputs of independently trusted adapters. Never let the acting agent self-calculate them and claim that this proves identity or deployment trust.
3. Run `scripts/operate_protected_gateway.js admit` with the request and separately held raw input. Continue only from `state: authorized`; `production_execution_authorized` always remains false in Phase 17A.
4. Run `begin` immediately before the external adapter acts. Give the adapter only the returned exact `execution_event_ref`, raw input, and required secret material.
5. Run `commit` with that execution reference, exact input, result, and measured executor digests. A stale reference or post-tool binding failure stops in `recovery_required`.
6. If execution never began, run `recover` with the exact raw input to cancel the admission and record `aborted`. If a crash left an allow admission before its decision, retry `admit` to finish normally or run `recover`; recovery cancels it exactly when possible and otherwise blocks the lease before denial. If execution began and the result is unknown, run `recover` without asserting success; the lease becomes blocked pending human reconciliation.
7. Reuse an idempotency key only for byte-equivalent canonical requests, and never reuse a transaction ID for a different request or key. Never interpret a transaction receipt as commit, push, merge, release, policy, risk, or authority approval.

Phase 17A is a contract/reference controller and does not execute tools or prove an exclusive deployment. Read `docs/protected-tool-gateway-contract.md` before integrating an adapter.

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
4. For every v0.3+ candidate and completion state, obtain fresh Ed25519 DSSE attestations over the exact persisted receipt from distinct trusted verifier IDs and keys in the policy-required independence groups. Under trust-policy v0.6, group diversity means computed `VID-*` failure domains, not declared labels. Under trust-policy v0.4+, first produce manifest-backed `VerifierExecutionEvidence` for each verifier using its exact assigned runtime profile, repository state, target digest and workload-identity evidence; v0.6 additionally requires adapter-observed independence claims matching runtime-policy v0.2+. Runtime-policy v0.3 GitHub Actions and GitLab CI profiles require exact manifest-backed native OIDC evidence and JWKS trust material, and must derive provider/failure-domain fields from the verified token. The trusted builder and registered verifier must sign the same payload. Persist evidence and attestations unchanged and cite their manifest paths and hashes. A signed `remote` origin without valid execution evidence is only a claim.
5. Before promoting a `runtime_control` or `skill` candidate, persist a sealed `ComparativeEvaluationSet` and `ComparativeEvaluationPlan`, then run `comparative-evaluation-runner.js` against the accepted baseline worktree and candidate repository. Require one identical harness/hash/argv, campaign-owned absolute and non-regression thresholds, and a persisted `promotable` report. `rollback` means rollback; `inconclusive` means stop and escalate.
6. For every v0.4 skill/runtime-control comparison, obtain a fresh Ed25519 DSSE quorum over the exact persisted comparative report with `comparative-evaluation-attestation-runner.js`. Under trust-policy v0.4+, create separate execution evidence for the comparative-report purpose before signing each report attestation. Persist the evidence and attestations unchanged and cite their manifest paths/hashes. Receipt signatures and report signatures are separate evidence classes.
7. At every wave end, validation failure, scope change, and before completion, create a `SelfImprovementCheckpoint` whose metrics and independent evaluation cite persisted receipt IDs and, for v0.3+, the receipt quorum. Skill/runtime-control checkpoints cite the comparative report and, for v0.4, its signed quorum. Run `autonomous-improvement-controller.js --repository <repo>` against the proof store.
8. For cycle 2+, cite the manifest path/hash of the immediately prior `accept_working_state` decision and use its `accepted_revision` as the baseline. Do not carry forward a rejected, rollback, or merely named parent.
9. For policy, authority, scope, release, trust-key, verifier, quorum, or validity-window changes, persist an exact USER-granted `ApprovalScope` and matching `ApprovalConsumptionEvent`. Bind its execution ID to the checkpoint; prose approval and reused events are invalid.
10. Before the first cycle and after every persisted decision, run `campaign-supervisor.js --repository <repo> --campaign <id> --write-artifact`. For trust-policy v0.2 through v0.4, first persist fresh evidence from every verifier needed for quorum using its selected `spiffe_x509` or `sigstore_bundle` adapter; Sigstore verifiers also require the exact manifest-bound `SigstoreTrustedRoot`. Trust-policy v0.4+ additionally requires the exact human-approved `VerifierRuntimePolicy` with one complete purpose-authorized profile assignment per verifier. Under v0.5+, the first supervisor call issues a manifest-backed challenge and intentionally holds; each verifier must then persist dual-signed identity evidence containing its exact assigned nonce, and supervision must run again. Under v0.6+, require runtime-policy v0.2+ and enough computed failure domains. Under v0.7, advance the exact manifest-backed `TransparencyState` stream with fresh consistency, witness, monitor, root and incident evidence before supervision. Execute only a current `SelfImprovementCycleOrder` whose status is `ready`, whose required identity, challenge, independence, and transparency admissions are satisfied, and whose `valid_until` has not been reached; use its exact cycle, attempt, baseline, parent, task, trigger, and proof requirements. Runtime-policy readiness, challenge response, and transparency readiness do not claim that a future invocation has already executed. Never self-declare verifier readiness or infer order state from chat history.
11. Carry forward only an accepted working state; revision, rollback, and continue orders remain retries in the same cycle. A supervisor `hold`, nonzero exit, missing order, or conflicting order means no work.
12. Permit automatic edits only for targets/actions/change classes inside the campaign envelope. Require receipt-backed independent evaluation for runtime, skill, and policy candidates.
13. Treat `escalate` and `terminate` as hard stops. For `rollback`, revert only this campaign's own uncommitted candidate changes.
14. Never infer merge, push, release, policy, trust-root, or authority approval from `accept_working_state`, `complete`, a comparison report, a report attestation, or a cycle order; these artifacts leave release unauthorized.
15. Do not report completion without a passing `before_completion` checkpoint, a fresh receipt, a fresh signed receipt quorum for v0.3+, valid execution evidence for every quorum member under trust-policy v0.4+, a fresh comparative report and signed report quorum for v0.4 skill/runtime-control targets, a verified parent when applicable, repository-scoped decision evidence, and a supervisor projection whose status is `completed`.

Read `docs/bounded-self-improvement-operations.md` for the full state machine and authority matrix.

### Editing Doctrine Or Policy

1. Read `docs/source-map.md`, the target policy, and any referenced schemas/runners.
2. If changing a runtime contract, update all four: schema, valid sample, invalid sample, runner/fixture. Protected-gateway changes must also update both gateway skill wrappers and the transaction/recovery guidance.
3. If adding official sources, update `docs/source-map.md`, `docs/research-compendium.md`, and `source-map-url-coverage-report.json`.
4. Run targeted validation first, then the relevant `run-*.js` fixture.
5. Commit coherent changes when the repo is clean except ignored files.

### Adding New Capability

Use the existing force-structure rule:

1. Identify the capability gap.
2. Check whether SOP, schema, tooling, training, or authority changes solve it before adding a new unit/role/runner.
3. If a new artifact is justified, add source-map, README, schema/sample/runner references.
4. Add a fixture that fails for the unsafe or under-specified case.

### Mandatory Skill Adaptation For Every Improvement

Every accepted Controls improvement must include one concrete, reusable skill
adaptation before the work is complete. Do not defer the skill update to a
later phase or backlog item.

1. State the operational lesson exposed by the improvement.
2. Patch at least one real skill surface: `SKILL.md`, a routing/reference file,
   or a bundled script. A date bump, typo-only edit, or restatement of the
   finished work does not count.
3. Apply the same operational rule to both the Codex and Claude skill trees.
   Provider-specific wording and commands may differ, but authority, routing,
   execution, validation, and stop semantics must remain equivalent.
4. Keep the product change, skill adaptation, and their validation in the same
   commit or pull request.
5. In the completion report, identify the product delta, the corresponding
   skill delta, and the validation that proves both.

If no honest reusable skill adaptation can be identified, do not label or close
the work as an improvement. Re-examine the operational lesson or classify the
change as maintenance explicitly authorized by the human user.

After each improvement, still check whether routing missed an artifact, too many
unrelated documents were needed, a repeated workflow lacks a route, a new
artifact or validation family appeared, or a failure exposed a missing
instruction. Update the smallest skill surface that will make the next operator
perform the improved procedure by default.

## Required Validation

Use the smallest relevant set, then broaden:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
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

For doc-only changes, also check Markdown links and JSON parsing when indexes or samples changed.

## Guardrails

- Treat `COMMANDER`, `COS`, `S2`, `S3`, `S4`, `S6` as internal function IDs, not universal ranks or staff labels.
- The human user remains final decision authority unless they explicitly delegate a bounded AI role.
- AI agents must route by role, department, authority, task, and need-to-know.
- Delegated AI waves require routing receipts and preflight `ready`; no receipt means no work.
- Operational delegated work requires a controller-issued context pack from the current wave; a manually claimed route or stale context pack does not authorize work.
- Covered delegated tool use requires one current manifest-backed dispatch
  lease lineage per mission agent. The exact policy-draft digest must be
  USER-authorized in the mission plan before compilation; no lease means no
  covered work. A resumed, cleared, or forked session requires explicit lineage
  continuation after checkpoint review.
- Project-local hooks guard covered calls but are not a complete security boundary. For concurrency, use separate repository-scoped sub-missions/worktrees and top-level sessions followed by an integration wave; add managed controls, an OS sandbox, or an independently protected tool gateway according to the deployment risk.
- Mixed-model missions require registry compilation and integrated routing/assignment preflight; an unready router, unbound agent, model monoculture, correlated assurance, expired evaluation, or authority inherited from model capability blocks dispatch.
- Multi-repository missions require explicit target-repository artifact storage; do not mix receipts, projections, reports, or deliverables in a flat campaign directory.
- Adaptive missions require a finite campaign, runtime-issued receipt proof, fresh trusted signed receipt quorum for v0.3+, exact accepted-parent lineage, a verified artifact store, a current ready cycle order, and a mandatory completion checkpoint. Trust-policy v0.2+ additionally requires fresh manifest-backed evidence for each verifier's selected SPIFFE or Sigstore workload-identity adapter; Sigstore also requires an exact fresh TrustedRoot. Trust-policy v0.4+ requires an exact runtime policy before dispatch and dual-signed execution evidence for each receipt/report attestation before it can count toward quorum. Trust-policy v0.5+ requires the supervisor's exact unexpired single-use challenge and dual-signed nonce responses before dispatch. Trust-policy v0.6+ requires runtime-policy v0.2+, complete failure-domain identities, and enough computed `VID-*` domains before dispatch and after execution. Runtime-policy v0.3 GitHub Actions and GitLab CI evidence additionally requires the exact native OIDC/JWKS artifact chain and a clean token-bound commit. Trust-policy v0.7 additionally requires a contiguous, current, manifest-backed transparency state with valid checkpoint consistency, observer quorum, root, incident and revocation status. Self-improvement never creates self-approval, self-release, trust-root/runtime-policy/builder-root/incident authority, or unbounded recursion.
- Skill and runtime-control promotion additionally require one pre-persisted sealed evaluation contract executed against isolated baseline/candidate worktrees with an identical harness. Schema v0.4 also requires a fresh trusted signed report quorum. Promotion revisions must differ; completion revalidation runs the same accepted revision twice. Comparison evidence never grants release authority.
- Do not make US doctrine the default for multinational use; apply `docs/multinational-doctrine-consistency-review.md`.
- Do not add external-source claims without source-map coverage.
- Do not leave a new policy without a validation or review path.
- Do not update this skill from one-off taste preferences; update it only for repeated routing, validation, or corpus-maintenance value.
