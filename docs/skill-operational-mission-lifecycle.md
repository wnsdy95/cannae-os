# Skill Operational Mission Lifecycle

## 0. Purpose

The doctrine router, routing preflight, model assignment, repository artifact store, AAR converter, and bounded self-improvement controller previously existed as separate tools. An operator could use them correctly, but an agent could also omit a step and still begin work.

`skill-mission-controller.js` is the fail-closed operational entry point for delegated Codex and Claude missions. It turns the skill from a document navigator into a repository-bound mission lifecycle:

```text
MissionWavePlan
-> generated CoS and S3 routing receipts
-> routing preflight
-> optional integrated model preflight
-> per-agent context packs
-> manifest-backed work evidence
-> MissionWaveReport and SITREP
-> AAR and readiness update
-> closeout and bounded next-wave queue
```

The human user remains final decision authority throughout this sequence.

## 1. Contracts

| Contract | Function |
| --- | --- |
| `MissionWavePlan` | Defines intent, success/failure conditions, agent tasks, operational roles, delegated authority, model-preflight requirement, finite adaptive budget, and retained USER authorities. |
| `AgentContextPack` | Gives one agent only its task, role, authority, digest-bound doctrine documents, validation commands, model identity, escalation conditions, and exact control references. |
| `MissionWaveReport` | Records one result per expected agent and requires exact context-pack and manifest-backed work-evidence references. |
| `MissionWaveCloseout` | Binds plan, report, AAR, readiness update, campaign, next-wave decision, verified artifact state, and a permanently false release grant. |

Schemas, valid examples, invalid authority/release examples, semantic validation, and E2E fixtures cover every contract.

## 2. Open A Wave

Start from `sample-payloads/valid-mission-wave-plan.json`. Give every agent a unique ID, an operational role, a department, a bounded task, allowed actions, approval-required actions, prohibited actions, and a context classification.

From the repository skill:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_mission.js \
  open mission-wave-plan.json \
  --repository ../target-repository \
  --artifact-root .cannae/artifacts
```

Claude Code uses the equivalent wrapper:

```bash
node .claude/skills/controls-doctrine-operator/scripts/operate_controls_mission.js \
  open mission-wave-plan.json \
  --repository ../target-repository \
  --artifact-root .cannae/artifacts
```

The controller performs these ordered, fail-closed actions:

1. Validate plan structure and semantics before creating artifacts.
2. Bind the target Git repository identity.
3. Persist the exact plan.
4. Invoke the real doctrine router for one CoS wave receipt and one S3 operations receipt per expected agent.
5. Recompute routing preflight from those receipts.
6. If model assignment is required, reload the exact integrated preflight from the same repository manifest and require one ready dispatch binding per agent and billet.
7. Create or reuse a bounded campaign restricted to the plan's single adaptive target type.
8. Hash every routed doctrine document plus the router and controller code.
9. Persist one minimal context pack per agent only after all gates are ready.
10. Verify the repository artifact store before returning `dispatch_authorized: true`.

No ready preflight means no context pack and no dispatch. Each artifact write is atomic, but the multi-step open sequence is not one all-or-nothing transaction; a failed open may retain verified plan, receipt, or preflight evidence while still withholding context packs. Opening the same unchanged wave is idempotent and does not advance the manifest revision.

## 3. Agent Execution

An agent executes only from its exact `AgentContextPack`.

- `operational_role` is the mission job; the S3 routing receipt is the mandatory control-plane route and does not replace that job.
- `documents` are path-and-digest pairs, not a broad invitation to read the corpus.
- `allowed_actions` are executable only inside the assigned task and target repository.
- `approval_required` and `escalation_conditions` stop the agent before scope, authority, release, risk, or irreversible boundaries.
- `release_authorized` is always false.

Store each durable work product or verification result before reporting it:

```bash
node repository-artifact-store.js \
  --repository ../target-repository \
  --artifact-root .cannae/artifacts \
  --mission MIS-example \
  --wave W1 \
  --kind deliverables \
  --artifact-id OUT-example \
  --source ./result.md
```

Use the returned `artifact_id`, `relative_path`, and `sha256` in the agent's report evidence.

## 4. Record A Wave

Create a `MissionWaveReport` from `sample-payloads/valid-mission-wave-report.json` and run:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_mission.js \
  report mission-wave-report.json \
  --repository ../target-repository \
  --artifact-root .cannae/artifacts \
  --at 2026-07-23T05:10:00+09:00
```

The controller rejects:

- missing, duplicate, or unexpected agents;
- a context pack belonging to another agent or wave;
- a plan or preflight reference with different bytes;
- an unknown, stale, cross-wave, or cross-repository evidence reference;
- plan, receipt, context, report, or closeout metadata used as work evidence;
- a complete result without evidence or with unresolved blockers;
- a wave status inconsistent with its agent results;
- a report outside the plan validity window;
- a report timestamp more than five minutes ahead of the controller evaluation time;
- any release request.

A valid report creates a manifest-backed report and SITREP. Work evidence may be a JSON artifact or a regular file artifact such as source code, Markdown, or a test log. Lifecycle control records cannot substitute for work evidence. A blocked or failed report is recorded but returns a nonzero CLI status so automation cannot silently continue. Omit `--at` in normal operation; it exists for deterministic replay and testing.

## 5. Close A Wave

Create an AAR using the existing AAR contract, then run:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_mission.js \
  close aar.json \
  --repository ../target-repository \
  --artifact-root .cannae/artifacts \
  --mission MIS-example \
  --wave W1
```

Closeout performs these actions:

1. Reload and verify the exact plan and report.
2. Persist the AAR.
3. Generate and validate an AAR readiness update at the actual closeout time.
4. Merge AAR and agent improvement candidates.
5. Route ordinary improvements into the existing bounded campaign.
6. Route approval, release, policy, authority, risk, push, or merge effects to human decision.
7. Require another wave for blocked execution, pending human decisions, or queued improvement work.
8. Persist a closeout with `release_authorized: false` and verify the store again.

Repeating `close` with the same AAR verifies and returns the existing closeout. A different AAR cannot replace an already closed wave.

The controller queues work; it is not a background daemon and does not claim future work has executed. A queued adaptive action still needs a current supervisor order, verification receipts, required attestations, checkpoint, and promotion decision under `bounded-self-improvement-operations.md`.

## 6. Inspect And Verify

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_mission.js \
  status --repository ../target-repository --artifact-root .cannae/artifacts --mission MIS-example

node codex-skills/controls-doctrine-operator/scripts/operate_controls_mission.js \
  verify --repository ../target-repository --artifact-root .cannae/artifacts
```

Status returns references, repository identity, manifest state, and waves without exposing local absolute paths. Verify checks transaction state, manifest history, fencing, sidecar, artifact bytes, and namespace integrity.

## 7. Model Assignment

Set `model_assignment.required` to `true` only after persisting a ready `IntegratedMissionPreflightProjection` for the same mission and wave. Put its exact manifest reference in the plan and give each agent the billet ID emitted for it.

The lifecycle controller does not select a model by model name or capability claim. It reloads the integrated projection, requires one matching `agent_id + billet_id` dispatch row, and copies the immutable model profile, family, version, and harness into the context pack. Model capability never expands authority.

## 8. Installation

The default installer uses symlinks, so both skill wrappers resolve the live repository runtime automatically:

```bash
./install-ai-cli-skills.sh
```

`--copy` installations receive a local `.cannae-os-root` runtime marker. `CANNAE_OS_HOME` is the explicit override when the doctrine repository moves.

## 9. Regression Gate

```bash
node run-skill-mission-controller-fixtures.js
node validator-cli-prototype/run-fixtures.js
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
```

The E2E suite uses independent temporary Git repositories and covers mandatory receipts, missing-receipt blocking, digest-bound context, finite campaign scope, idempotence, plan expiry, model-preflight admission, exact and time-bounded evidence, blocked closeout, per-wave rerouting, repository isolation, and both installed-skill wrappers.

## 10. Operational Limits

- The controller is a local command, not a persistent scheduler or a tool-call interception layer. An orchestrator must make it the only dispatch path to prevent agents from bypassing it.
- Repository manifest integrity proves the bytes and namespace of an integrated model preflight, not who produced it. Generate that projection with the model compiler and integrated preflight runner; use stronger signed provenance where the deployment requires producer identity.
- Context-pack hashes reveal later doctrine drift but cannot force an external model process to read or obey the pack. The surrounding harness must provide only the issued context and enforce tool policy.
- The artifact coordinator assumes coherent shared-filesystem semantics. Distributed or partition-prone deployments need an external linearizable coordinator and storage-side fencing.
- The lifecycle never grants commit, push, merge, risk acceptance, policy change, authority change, or release permission.

## 11. Related Sources Of Truth

- `role-document-access-policy.md`
- `agent-roles-and-authority.md`
- `agent-battle-rhythm.md`
- `model-force-v0.2-operations.md`
- `repository-artifact-isolation-policy.md`
- `knowledge-management-sop.md`
- `bounded-self-improvement-operations.md`
