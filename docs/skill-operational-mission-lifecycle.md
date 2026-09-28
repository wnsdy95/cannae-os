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
-> per-agent dispatch policy and session lease
-> pre-tool admission and post-tool checkpoint
-> manifest-backed work evidence
-> controller-executed required controls and digest-only receipts
-> MissionWaveReport and SITREP
-> AAR and readiness update
-> closeout and bounded next-wave queue
```

The human user remains final decision authority throughout this sequence.

## 1. Contracts

| Contract | Function |
| --- | --- |
| `MissionWavePlan` | Defines intent, success/failure conditions, agent tasks, operational roles, delegated authority, model-preflight requirement, finite adaptive budget, and retained USER authorities. |
| `RoutingReceipt` v0.2 | Separates the narrow router query from the common mission capability query; records existing coverage or one deterministic provisional cell and standing-department candidate. |
| `AgentContextPack` v0.2 | Gives one agent its task, mission capability state, provisional organization when required, role, authority, digest-bound doctrine documents, compiled required controls, model identity, escalation conditions, and exact control references. |
| `ControlExecutionReceipt` | Proves that the controller ran one allowlisted, shell-free control for the exact canonical report input, repository, and doctrine states; stores only output digests and byte counts. |
| `MissionWaveReport` | Records one result per expected agent and requires exact context-pack, control-receipt, and manifest-backed work-evidence references. |
| `MissionWaveCloseout` | Binds plan, report, AAR, readiness update, campaign, next-wave decision, verified artifact state, and a permanently false release grant. |
| `MissionWaveTerminationRequest` / `MissionWaveTermination` | Ends an expired, aborted, or superseded wave without manufacturing a report, AAR, readiness promotion, or execution-success claim. Preserves exact historical references and blocks reuse. |

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
4. Invoke the real doctrine router for one CoS wave receipt and one S3 operations receipt per expected agent. Every call binds the exact plan objective as `capability_query`; role/department/authority metadata and narrower agent tasks cannot suppress an uncovered mission capability.
5. Recompute routing preflight from those receipts.
6. If model assignment is required, reload the exact integrated preflight from the same repository manifest and require one ready dispatch binding per agent and billet.
7. Create or reuse a bounded campaign restricted to the plan's single adaptive target type.
8. Hash every routed doctrine document plus the router and controller code.
9. Compile every routed validation command into an allowlisted, shell-free required control.
10. Persist one minimal context pack per agent only after all gates are ready.
11. Verify the repository artifact store before returning
    `context_dispatch_authorized: true`,
    `tool_execution_authorized: false`, and `dispatch_authorized: false`.

No ready preflight means no context pack. A ready context pack permits the
orchestrator to continue policy authorization, but it is not executable tool
authority. Each artifact write is atomic, but the multi-step open sequence is
not one all-or-nothing transaction; a failed open may retain verified plan,
receipt, or preflight evidence while still withholding context packs. Opening
the same unchanged wave is idempotent and does not advance the manifest
revision.

If no specific doctrine capability matches the mission objective, `open` does
not reject the mission as merely outside the corpus. It gives the wave and
every agent one mission-ID-derived provisional capability cell, routes the
force-structure doctrine and fixture gate, and carries a paired standing-
department candidate into each context pack. The cell may perform only the
plan's reversible, delegated analysis and drafting. It cannot expand authority
or activate the standing candidate. Activation requires alternatives,
readiness, sustainment, documentation, and transition evidence in a validated
`ForceStructureChangeOrder`, followed by the USER's decision. Otherwise the
cell disbands at handoff.

## 3. Agent Execution

An agent executes only from its exact `AgentContextPack`.

- `operational_role` is the mission job; the S3 routing receipt is the mandatory control-plane route and does not replace that job.
- `documents` are path-and-digest pairs, not a broad invitation to read the corpus.
- `allowed_actions` are executable only inside the assigned task and target repository.
- `approval_required` and `escalation_conditions` stop the agent before scope, authority, release, risk, or irreversible boundaries.
- `release_authorized` is always false.
- `capability_query` is the mission-wide capability scope. On `gap_detected`, every agent keeps the same provisional cell and force-structure controls even when its narrower task matches an existing support route.

The context pack proves current routing and task context; it is not tool
authority. Before opening a dispatch-controlled wave, hash one deny-by-default
policy draft per agent and put the exact digest, policy ID, provider, and agent
in `MissionWavePlan.dispatch_control.policy_authorizations`. After `open`, the
dispatch controller recompiles that exact draft against the persisted plan and
context pack. Only the compiled policy may issue the single initial
`AgentDispatchLease` lineage for the exact mission agent, provider session,
provider-agent identity, repository, and checkpoint.

Enable the provider hook adapter so every covered call passes `PreToolUse`
admission and every completed or failed call creates a result-bound post-tool
checkpoint. Write/process agents in one repository-bound wave use separate
top-level sessions but receive authority in ordered stages against the same
artifact namespace; complete or settle one lease before issuing the next. The
local guardrail does not create a parallel exception from a caller-declared
read-only class. A second initial session for the same mission/wave/agent is
rejected; use a different agent assignment or a later explicit lineage
continuation. Parallel worktrees are separate repository-scoped sub-missions
whose outputs require a later integration wave.

On `resume`, `clear`, `fork`, interruption, or handoff, the old lease cannot be
reused. Review the exact manifest-backed checkpoint and explicitly issue a new
lease through the resume command. Restored conversation history never restores
authority. See `enforced-dispatch-and-resume.md` for commands and provider limits.

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

Use the returned `artifact_id`, `relative_path`, and `sha256` in the agent's
report evidence. For a dispatch-controlled wave, first run
`complete --lease <lease-id>` for every agent reported as complete. A blocked or
failed agent must leave no active lease and no unresolved tool request. The
report gate rejects any missing, ambiguous, active, or unsettled lease lineage.

At report admission, the controller reloads every agent's exact context pack,
deduplicates its required controls, and runs each control itself with a stripped
credential environment. The caller cannot substitute a claimed result or
choose the receipt references. A passing receipt is accepted only when command,
context, canonical report-input digest, mission, wave, repository identity, repository state, doctrine
revision, and doctrine state all bind exactly and remain unchanged across the
run. Raw stdout and stderr are not persisted; only their SHA-256 digests and
byte counts enter the receipt.

Freeze the report input before admission. A receipt may be reused only when a
successfully admitted, immutable report already references its exact manifest
entry. If an interrupted or failed admission leaves receipts without a report,
assign a fresh report ID, omit old receipt references, and resubmit so the new
digest forces the complete required-control set to run again. A successfully
persisted report artifact is immutable. Subsequent corrections or additional
work require a new wave rather than rewriting the admitted report.

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
- any missing, caller-forged, failed, timed-out, unallowlisted, or state-drifting required control;
- any release request;
- a dispatch-controlled result with no lease lineage, an unresolved tool
  request, an active lease for a blocked/failed agent, or a non-completed lease
  for a completed agent.

A valid report creates a manifest-backed report and SITREP. Work evidence may be a JSON artifact or a regular file artifact such as source code, Markdown, or a test log. Lifecycle control records cannot substitute for work evidence. A blocked or failed report is recorded but returns a nonzero CLI status so automation cannot silently continue. Omit `--at` in normal operation; it exists for deterministic replay and testing.

## 4A. Terminate Without Claiming Success

An expired plan cannot accept a late report, and normal closeout still requires
an admitted report and AAR. Do not backdate those records or extend a retained
plan to force closeout. Inspect `status`, settle dispatch first, and use:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_mission.js \
  terminate termination-request.json \
  --repository ../target-repository --artifact-root .cannae/artifacts
```

The Claude wrapper accepts the same command. Start from
`sample-payloads/valid-mission-wave-termination-request.json`, replacing its
sample identifiers and plan reference with the exact verified manifest entry.
The terminating CLI uses its live clock and rejects `--at`; module-level clock
injection is reserved for trusted deterministic fixtures, not agent authority.

- `expired`: controller time must be at or after the retained plan's expiry.
  Both decision and successor references use the exact three-field `none`
  sentinel. Expiry is a time observation, not a claim that work succeeded.
- `aborted`: requires a manifest-backed `DecisionLogEntry` in this wave's
  `decision-logs`, made by `USER`, with `decision_type: scope`, `status:
  complete`, and a `retained_authority` basis referencing this plan ID.
- `superseded`: requires the same decision plus the exact successor plan in
  the same repository store. The successor must be currently valid, not closed
  or terminated, and already have ready routing and all bound context packs.
  Linking it does not dispatch it or transfer authority or evidence.

For abort/supersession, the decision must be no more than 60 minutes old and
not in the future. Its `chosen_option` and one `options_considered` entry must
equal `terminate:<status>:<plan-sha256>:<successor-sha256-or-none>`; its
`affected_artifacts` must contain the exact plan path and any successor path.
The request's `decision_ref` must identify that exact persisted record.
The assistant must not manufacture a USER decision. This is a local record
binding, not cryptographic proof of the human's identity; protect the decision
store and entry point in managed deployments.

Termination requires every dispatch lineage to be `completed`, `revoked`, or
`superseded`, with zero unresolved tool admissions. An expired, interrupted,
or blocked lease is not settlement. Reconcile actual effects first; do not
cancel an already executed tool merely to clear the gate. Termination itself
does not revoke leases, kill processes, settle external effects, or delete
campaigns or artifacts. Existing normal closeouts remain immutable.

The controller appends one terminal record containing the exact plan, request
digest, retained wave references, and terminal time. An exact retry returns
that same record; a changed request fails. Historical v0.1 routing/context
artifacts remain preserved bytes, not silently migrated or treated as current
execution authority. `open`, `report`, `close`, policy authorization, lease
issuance/resume, and covered pre-tool admission reject the terminated wave,
including attempts to backdate a command. Cleanup checkpoints remain available.
Lifecycle writes are serialized per wave, and termination shares the dispatch
issuance lock so it cannot race a new lease into an apparently settled wave.

`status` distinguishes `expired_pending_termination` from a persisted
`expired`, `aborted`, or `superseded` record. This operation ends only one wave,
not its entire campaign. A replacement mission requires fresh authorization,
routing, policy, and leases. Release and continuation remain false.

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

## 9. Campaign Continuation Gate

An adaptive plan's retained campaign must reconstruct a `ready` supervisor
order before opening or reopening a wave, admitting a report, closing a wave,
authorizing a dispatch policy, issuing or resuming a lease, or admitting a
covered tool call. The controller reuses the real supervisor's lineage, budget,
status, and trust-readiness logic. The immutable campaign's original `active`
field alone is insufficient after a terminal decision has been retained.

`complete`, `terminate`, `escalate`, paused campaigns, invalid checkpoint pairs,
exhausted budgets, and unavailable trust admission block continuation. A different
wave ID or provider session cannot clear that state. The report path checks again
after mandatory controls finish. This read-only gate does not create cycle orders
or verifier challenges and does not grant independent execution authority.

Time eligibility is checked from the campaign's immutable `created_at`, finite
elapsed budget, and current evaluation time, as well as the reported cumulative
counter. No checkpoint, low reported time, old ready order, or longer-lived lease
can extend that deadline. See [campaign time budget](bounded-self-improvement-operations.md#29-campaign-time-budget)
for exact boundaries, immutable snapshot semantics, and host-clock limitations.
Omit replay/test clock overrides during live operations.

Post-tool result settlement, evidence inspection, and lease revocation remain
available. A retained lease checkpoint may still say `active` after settlement;
the next admission independently rechecks the campaign and remains denied.
Preserve the stop decision and reconcile the old execution before proposing
separately authorized successor work. Never edit retained campaign bytes or
fabricate a retry to clear an escalation.

Zero pending callback IDs does not establish settled effects. A retained failed
post-tool checkpoint with `external_effects: unknown` remains visible through
later revocation and blocks completed-agent reporting and terminal settlement.
Dispatch status exposes its exact checkpoint references. New repository leases
and active tool admission also remain held; a fresh wave/session cannot clear
the history. Read [unknown tool effects](enforced-dispatch-and-resume.md#51-unknown-tool-effects)
before treating any lease status as proof of reconciliation. Use the separate
[hook settlement controller](tool-effect-settlement.md) for exact USER- and
execution-evidence-bound reconciliation, then explicitly revoke the old lease.
Gateway settlement remains open; never manually erase the hold. Dispatch also
projects `unresolved_gateway_transactions` from gateway records independently
of hook callbacks. A legacy success callback or terminal lease cannot clear it.
Reports (including blocked reports), closeouts and termination reject remaining
gateway obligations, with a fresh check at publication. Direct hook cancellation
is not gateway cancellation; use gateway recovery only within its state rules.

The controllers repeat readiness checks inside the artifact namespace lease at
plan/campaign/context/report/closeout, dispatch policy/lease/tool-allow, and
gateway allow/authorized/executing publication. A stop retained after the earlier
check but before publication denies that new artifact. Exact artifact reuse also
requires current appraisal. See [publication-time appraisal](repository-artifact-isolation-policy.md#31-publication-time-appraisal)
for crash ordering and the non-transactional multi-artifact boundary.

This is an admission guard, not a complete campaign cancellation/restart protocol
or an operating-system process kill. A call already admitted when a stop arrives
still needs result reconciliation. Explicit USER stop/restart contracts,
supervisor order/challenge publication integration, and campaign-wide terminal
settlement remain open. Raw store writes and mutable runtime code are not an
independently protected authority service.

## 10. Regression Gate

```bash
node run-skill-mission-controller-fixtures.js
node run-skill-control-enforcement-fixtures.js
node run-dispatch-runtime-fixtures.js
node run-campaign-supervisor-fixtures.js
node validator-cli-prototype/run-fixtures.js
node validate-controls-skill.js codex-skills/controls-doctrine-operator
node validate-controls-skill.js .claude/skills/controls-doctrine-operator
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
```

The E2E suite uses independent temporary Git repositories and covers mandatory routing, controller-executed controls, unadmitted preinserted receipt rejection, immutable report admission, failure/timeout/state-drift blocking, digest-bound context, finite campaign scope, idempotence, plan expiry, model-preflight admission, exact and time-bounded evidence, blocked closeout, per-wave rerouting, repository isolation, and both installed-skill wrappers.

## 11. Operational Limits

- The mission controller is a local lifecycle command, not a persistent scheduler. The separate dispatch runtime and provider hooks intercept covered local calls, but repository-local hooks remain a bypassable guardrail. Stronger deployments must protect the hook/runtime outside the agent's writable boundary or expose side effects only through an independent gateway.
- The local controller and artifact store are tamper-evident workflow controls, not an independent trust anchor against a principal that can rewrite the runtime, artifacts, manifest, and sidecar under the same OS identity. Production assurance requires write separation plus signed external provenance or an independently protected gateway/store.
- Repository manifest integrity proves the bytes and namespace of an integrated model preflight, not who produced it. Generate that projection with the model compiler and integrated preflight runner; use stronger signed provenance where the deployment requires producer identity.
- Context-pack hashes reveal later doctrine drift but cannot force an external model process to read or obey the pack. The surrounding harness must provide only the issued context and enforce tool policy.
- The artifact coordinator assumes coherent shared-filesystem semantics. Distributed or partition-prone deployments need an external linearizable coordinator and storage-side fencing.
- The lifecycle never grants commit, push, merge, risk acceptance, policy change, authority change, or release permission.

## 12. Related Sources Of Truth

- `role-document-access-policy.md`
- `agent-roles-and-authority.md`
- `agent-battle-rhythm.md`
- `model-force-v0.2-operations.md`
- `repository-artifact-isolation-policy.md`
- `enforced-dispatch-and-resume.md`
- `knowledge-management-sop.md`
- `bounded-self-improvement-operations.md`
