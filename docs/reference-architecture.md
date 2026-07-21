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

- Single gateway for all external actions.
- Write tool-use logs.
- Execute dry-run first.
- Record results to the state store.

Prohibited:

- An agent calling a tool directly, bypassing the gateway.

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

## 3. Data Flow

### 3.1 Standard Task

```text
User request
-> Mission Intake
-> OPORD Compiler
-> ROE precheck
-> Task Router
-> Agent Runtime
-> Tool Gateway
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
| audit | tool_requests, approvals, policy_decisions |
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
| Tool -> external service | approval and audit |
| Evidence -> output | citation check |
| Secret -> logs | masking and EEFI handling |

## 7. Minimum Implementation Order

1. prompt DSL schema.
2. Store mission state as JSON.
3. tool-use ROE checker.
4. approval request UI.
5. evidence store.
6. SITREP/FRAGO event log.
7. AAR and readiness update.
8. multi-agent routing.

## 8. Related Documents

- `implementation-guide.md`
- `prompt-dsl.md`
- `tool-use-roe.md`
- `sample-runtime-state.md`
- `approval-ui-patterns.md`
