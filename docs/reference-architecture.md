# Reference Architecture

## 0. Purpose

This document is a reference architecture for implementing the military-style LLM operating framework as an actual system.

It is intended for the following:

- LLM-based task automation tools.
- Multi-agent research/coding/documentation systems.
- Approval-based tool execution platforms.
- Internal organizational AI operating systems.

## 1. Overall Structure

```text
Client UI
  |
  v
Mission Intake API
  |
  v
Orchestrator / AI Commander
  |
  +-- OPORD Compiler
  +-- Agent Registry
  +-- Model Registry
  +-- Model Assignment Compiler
  +-- Policy / ROE Engine
  +-- Task Router
  +-- Integrated Mission Preflight
  +-- Battle Rhythm Scheduler
  |
  v
Agent Runtime
  |
  +-- S2 Research Agent
  +-- S3 Operations Agent
  +-- S4 Sustainment Agent
  +-- S6 Knowledge Agent
  +-- Red Team Agent
  +-- Evaluator Agent
  |
  v
Tool Gateway
  |
  +-- Filesystem
  +-- Shell
  +-- Browser/Web
  +-- API
  +-- Database
  +-- Deploy
  |
  v
State / Evidence / Audit Stores
  +-- Model Usage Events
  +-- Repository Artifact Namespaces
```

## 2. Major Components

### 2.1 Client UI

Role:

- Input of user requests.
- Review of OPORD drafts.
- Review of actions requiring approval.
- Review of SITREPs and decision memos.
- Review of final deliverables and AARs.

Required screens:

- Mission dashboard.
- Approval queue.
- Evidence viewer.
- Tool-use log.
- AAR history.

### 2.2 Mission Intake API

Role:

- Convert user requests into mission candidates.
- Perform initial classification of request risk level.
- Generate necessary follow-up questions.

Output:

```yaml
mission_candidate:
  statement:
  intent_guess:
  constraints:
  ambiguity:
  initial_risk:
```

### 2.3 Orchestrator / AI Commander

Role:

- Finalize the mission and intent.
- Generate the OPORD.
- Issue task orders.
- Invoke the authority gate.
- CCIR escalation.

Caution:

- The Orchestrator is not a risk acceptance authority.
- It does not execute Red/Amber actions without user approval.

### 2.4 OPORD Compiler

Role:

- Convert natural-language requests into prompt DSL.
- OPORD validation.
- Generate tasking for subordinate agents.

Input:

- user request.
- mission state.
- selected SOP.
- agent readiness.

Output:

- OPORD.
- task orders.
- validation warnings.

### 2.5 Agent Registry

Managed items:

- role.
- responsibilities.
- tool permissions.
- readiness rating.
- recent AAR findings.
- model/provider.
- context limits.

### 2.6 Policy / ROE Engine

Role:

- Classify tool requests as Green/Amber/Red/Black.
- Generate approval requirements.
- Block prohibited actions.

Input:

```yaml
actor:
tool:
action:
target:
mission_context:
data_sensitivity:
```

Output:

```yaml
roe_decision:
  class: Amber
  reason:
  required_approval:
  safe_alternatives:
```

### 2.7 Model Registry And Assignment Compiler

The Model Registry stores immutable model, harness, prompt, and tool-schema identities plus deployment eligibility and per-task readiness evidence. It stores endpoint references, not credentials.

The Model Assignment Compiler:

- consumes mission-defined billet requirements;
- hard-filters deployment, context, task, tool impact, readiness, evidence, expiry, availability, load, and family separation;
- scores only eligible profiles;
- materializes a `ModelForceAssignmentPlan` with independent authority, assurance, and PACE controls.

### 2.8 Integrated Mission Preflight

The integrated preflight combines the current-wave routing receipt projection with the compiled model assignment. It verifies one-to-one agent, receipt, and billet bindings. Only a `ready` projection emits dispatch rows and model usage event templates.

### 2.9 Tool Gateway

Role:

- Authenticate the principal and load an independently trusted gateway
  configuration.
- Reload the exact active dispatch lease, policy, checkpoint, and repository
  state before every call.
- Bind one canonical tool-input digest and operation class to one idempotent
  transaction.
- Issue one append-only execution token only after a manifest-backed allow
  decision.
- Correlate the exact post-tool result and repository state into an execution
  receipt.
- Cancel an authorized but unstarted admission or block on an unknown in-flight
  outcome.

Prohibited:

- An agent calling a tool directly, bypassing the gateway.
- Treating a bearer claim, network location, context pack, model identity, or
  prior success as current tool authority.
- Persisting raw tool input in ordinary audit artifacts.
- Treating tool authorization as commit, release, policy, risk, or authority
  approval.

Phase 17A implements the contracts and a local reference controller in
`protected-tool-gateway.js`. It does not execute tools or prove that direct tool
paths have been removed. A production deployment must make managed adapters the
only side-effect path and independently verify gateway code, configuration,
identity appraisal, sandbox, egress policy, coordination, and fencing. See
`protected-tool-gateway-contract.md`.

### 2.10 Evidence Store

Stores:

- source metadata.
- claim.
- interpretation.
- reliability.
- linked output.
- checked_at.

### 2.11 State Store

Stores:

- mission.
- OPORD.
- task orders.
- SITREP.
- FRAGO.
- decision memo.
- AAR.
- readiness updates.
- model registries and assignment requests.
- integrated preflight projections.

### 2.12 Audit Store

Stores:

- tool request.
- approval.
- execution result.
- blocked action.
- policy decision.
- immutable model usage events and authority snapshots.

### 2.13 Repository Artifact Store

The artifact store persists durable control projections and deliverables under a Git-derived repository identity:

```text
artifact root
-> repository identity
-> mission
-> wave
-> artifact kind
-> immutable artifact file
```

It journals each JSON/file mutation and serializes manifest commits with an expiring namespace lease plus a monotonic fencing token. It reserves each revision through immutable no-overwrite history, commits a hash-linked manifest and digest sidecar, blocks traversal and conflicting overwrite, and keeps absolute repository paths and remote credentials out of the manifest. `repository-artifact-verify.js` checks pending transactions, fencing monotonicity, the history chain, and every retained artifact hash before proof is consumed. Multi-repository orchestration must declare the target repository for every durable artifact. The built-in coordinator assumes a coherent shared filesystem; partition-tolerant deployments require an external linearizable coordinator and storage-side fencing enforcement.

### 2.14 Proof-Carrying Improvement Controller

The adaptive control path separates evidence generation from decision logic:

```text
candidate state
-> exact VerificationPlan
-> shell-free verification runner
-> repository-scoped VerificationReceipt
-> Ed25519 DSSE attestations from trusted independent verifiers
-> for skill/runtime control: sealed evaluation set + identical baseline/candidate harness executions
-> for schema v0.4 skill/runtime control: Ed25519 DSSE attestations over the persisted comparative report
-> manifest-backed checkpoint references
-> controller reloads and recomputes trust policy / receipt / receipt attestations / comparison / report attestations / parent / approval consumption
-> bounded decision with release_authorized=false
```

The controller cannot turn prose test claims, a named parent ID, an unsigned remote-verifier claim, or a candidate-only score into authority. A v0.3+ promotion requires fresh signatures from distinct trusted keys and the policy-required independence groups over the exact persisted receipt and its self-digest. Skill and runtime-control promotion additionally requires a recomputable `promotable` report from distinct immutable baseline/candidate states under one pre-persisted evaluation set and harness. Schema v0.4 binds a second quorum to the exact report artifact, plan, set, lineage, evaluator invocation, campaign, and repository. Policy, trust-root, and authority effects require a schema-valid USER approval scope consumed by the exact checkpoint execution.

## 3. Data Flow

### 3.1 Standard Task

```text
User request
-> Mission Intake
-> OPORD Compiler
-> ROE precheck
-> Task Router
-> Agent Runtime
-> Tool Gateway received/authorized event
-> one execution token
-> external adapter
-> committed receipt or recovery-required block
-> Verification
-> Final response
-> AAR
```

### 3.2 Task Requiring Approval

```text
Agent requests tool
-> Policy Engine returns Amber/Red
-> Decision Memo
-> User Approval UI
-> Approved or rejected
-> Tool Gateway executes or blocks
-> Audit Store
```

### 3.3 CCIR Occurrence

```text
Agent detects CCIR
-> Immediate SITREP
-> Orchestrator pauses affected task
-> Decision Board
-> FRAGO or stop
```

## 4. Storage Schema Overview

| Store | Key Tables/Collections |
| --- | --- |
| mission_state | missions, opords, task_orders |
| operations_state | sitreps, fragos, decisions |
| evidence | sources, claims, interpretations |
| audit | tool_requests, gateway_decisions, gateway_transaction_events, execution_receipts, approvals, policy_decisions |
| learning | aars, sop_updates, readiness |

## 5. Deployment Patterns

### Local-first

Suitable for:

- Individual research.
- Local coding agents.
- Sensitive file work.

Characteristics:

- Filesystem-centric.
- local state store.
- Direct user approval.

### Team Workspace

Suitable for:

- Organizational documentation.
- Team coding automation.
- Internal knowledge management.

Characteristics:

- shared evidence store.
- approval queue.
- role-based access control.

### Enterprise Controlled Runtime

Suitable for:

- Large-scale organizations.
- Environments where security/audit is mandatory.
- Deployments that include external APIs.

Characteristics:

- central policy engine.
- audit logging.
- SSO/RBAC.
- model gateway.
- data loss prevention.

## 6. Security Boundaries

| Boundary | Control |
| --- | --- |
| User data -> model | redaction, policy check |
| Agent -> tool | tool gateway |
| Gateway request -> execution | authenticated principal, trusted gateway digest, active lease/policy/checkpoint, exact input digest, idempotency, one execution token |
| Tool -> external service | approval and audit |
| Evidence -> output | citation check |
| Candidate -> adaptive promotion | executed receipt, trusted signed quorum, paired canary for skill/runtime control, accepted-parent lineage, consumed approval binding |
| Secret -> logs | masking and EEFI handling |

## 7. Minimum Implementation Order

1. prompt DSL schema.
2. Store mission state as JSON.
3. tool-use ROE checker.
4. approval request UI.
5. evidence store.
6. SITREP/FRAGO event log.
7. AAR and readiness update.
8. Bounded self-improvement checkpoint and next task order.
9. Multi-agent routing.
10. Protected tool transaction and recovery controller.
11. Managed exclusive gateway adapters and side-path isolation.

## 8. Related Documents

- `implementation-guide.md`
- `prompt-dsl.md`
- `tool-use-roe.md`
- `sample-runtime-state.md`
- `approval-ui-patterns.md`
- `bounded-self-improvement-operations.md`
- `enforced-dispatch-and-resume.md`
- `protected-tool-gateway-contract.md`
