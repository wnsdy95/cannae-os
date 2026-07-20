# Implementation Guide

## 0. Purpose

This document defines how to implement the military-style LLM operating framework in actual software, agent systems, and business automation environments.

Translating the core of the conceptual documents into a runtime structure yields the following.

```text
User request
-> Mission analysis
-> OPORD generation
-> Authority and ROE check
-> Agent tasking
-> Tool-gated execution
-> SITREP and FRAGO loop
-> Verification
-> AAR and memory update
```

## 1. Implementation Principles

| Principle | Implementation meaning |
| --- | --- |
| Intent preservation | Store the user's intent in a separate field and pass it to every downstream task |
| Role separation | Separate research, execution, review, and sustained-support roles |
| Authority before action | Check authority and ROE before executing any tool |
| Evidence-first | Link source-based claims to the evidence store |
| Event-driven reporting | Report centered on state changes and CCIR rather than the clock |
| Assessment loop | Record MOP/MOE/AAR after completion |
| Auditability | Track who executed what, on what evidence, and under what authority |

## 2. Minimum System Configuration

| Component | Role |
| --- | --- |
| Mission Intake | Decompose the user request into mission, intent, and constraints |
| OPORD Compiler | Generate a structured prompt or task order |
| Agent Registry | Manage roles, authorities, proficiency, and tool access |
| Tool Gateway | Control file, browser, API, and deployment tool usage via ROE |
| Evidence Store | Store sources, claims, reliability, and links |
| State Store | Store SITREP, FRAGO, decision log, and AAR |
| Evaluator | Evaluate MOP/MOE, tests, and source discipline |
| Human Approval UI | Present actions requiring approval to the user |

## 3. Data Model

### 3.1 Mission

```yaml
mission:
  id: M-0001
  title: "Documenting the military-style LLM framework"
  statement: "Document the military-style command and control system as an LLM operating framework."
  intent:
    purpose: "Build an undistorted command structure for AI work."
    success_conditions:
      - "The document set is linked from the README."
      - "Sources and applied interpretation are kept separate."
    failure_conditions:
      - "Sourceless military generalities are used as core evidence."
  constraints:
    - "Use only public materials"
    - "No advice on actual military operations"
  created_by: "user"
```

### 3.2 Agent Role

```yaml
agent_role:
  id: S2
  name: "Intelligence Agent"
  responsibilities:
    - "Source collection"
    - "Flagging uncertainty"
    - "PIR management"
  authorities:
    allowed:
      - "public_web_research"
      - "source_summary"
    approval_required:
      - "non_public_source_use"
    prohibited:
      - "fabricate_source"
      - "hide_uncertainty"
  readiness:
    source_collection: T
    korean_sources: P
```

### 3.3 Task Order

```yaml
task_order:
  id: T-0001
  mission_id: M-0001
  assigned_to: S2
  task: "Research public materials on the Korean military and organize LLM application points."
  purpose: "Secure grounds for calibrating the Korean-style framework"
  deliverables:
    - "korean-military-sources.md"
    - "source-map update"
  ccir:
    - "Official source cannot be verified"
    - "Conflict between statute and interpretation"
  verification:
    - "Include a URL for each source"
    - "Separate source claims from LLM interpretation"
```

### 3.4 Tool Request

```yaml
tool_request:
  id: TR-0001
  task_id: T-0001
  actor: S3
  tool: "filesystem.write"
  action: "create_markdown_file"
  target: "docs/implementation-guide.md"
  risk_level: low
  roe_class: allowed
  approval_status: not_required
```

### 3.5 Evidence

```yaml
evidence:
  id: E-0001
  source_title: "ADP 6-0 Mission Command"
  url: "https://armypubs.army.mil/..."
  source_type: "official_doctrine"
  reliability: A
  claim: "Mission command emphasizes commander's intent and disciplined initiative."
  interpretation: "LLM agents need intent and an authority boundary."
  linked_documents:
    - "agent-roles-and-authority.md"
```

### 3.6 SITREP

```yaml
sitrep:
  id: S-0001
  mission_id: M-0001
  status: "in_progress"
  completed:
    - "Research of Korean public materials"
  in_progress:
    - "Writing the implementation guide"
  blocked: []
  ccir: []
  risk:
    - "Public materials on detailed Korean military doctrine are limited"
  next_action: "Write the prompt DSL"
```

### 3.7 AAR

```yaml
aar:
  id: AAR-0001
  mission_id: M-0001
  expected: "Expand the document set."
  actual: "New documents completed and linked from the README."
  delta:
    - "Korean military materials are limited mainly to statutory/policy materials."
  causes:
    - "Limited public availability of detailed operational doctrine."
  updates:
    - "Add an SOP specifying the limits of using Korean materials."
```

## 4. Runtime State Machine

```text
Intake
-> MissionAnalysis
-> OPORDDraft
-> RiskAndAuthorityCheck
-> Tasking
-> Execution
-> Verification
-> Assessment
-> AAR
-> MemoryUpdate
```

### Responsibilities by State

| State | Input | Output | Abort condition |
| --- | --- | --- | --- |
| Intake | user request | raw mission | Request is unclear |
| MissionAnalysis | raw mission | mission, intent, constraints | High-risk domain |
| OPORDDraft | mission | OPORD | Intent missing |
| RiskAndAuthorityCheck | OPORD | ROE class | Approval required |
| Tasking | OPORD | task orders | Role unclear |
| Execution | task orders | artifacts, SITREP | CCIR occurs |
| Verification | artifacts | MOP/MOE result | Verification fails |
| Assessment | verification | final judgment | Effect not achieved |
| AAR | result | lessons | Repeated failure |
| MemoryUpdate | lessons | SOP/source updates | Save failure |

## 5. Implementing the Authority Gate

Before every tool call, always pass through the function below.

```text
check_roe(actor, tool, action, target, context) -> allowed | approval_required | prohibited
```

Judgment criteria:

- The actor's role authority.
- The risk level of the action.
- The sensitivity of the target.
- Mission constraints.
- User approval state.
- System policy.

Behavior by result:

| Result | Behavior |
| --- | --- |
| allowed | Execute, then log |
| approval_required | Halt execution, generate a decision memo |
| prohibited | Refuse execution, report the reason and alternatives |

## 6. Implementing Evidence-First

In source-based work, the evidence object must come into existence before the model's output.

Bad flow:

```text
Model writes the conclusion
-> Sources are searched afterward
```

Good flow:

```text
Collect sources
-> Extract claim
-> Separate interpretation
-> Save to source map
-> Write the document
```

Minimum evidence store fields:

- source title.
- URL.
- source type.
- reliability.
- claim.
- interpretation.
- linked mission.
- linked document.
- checked at.

## 7. File/Document Storage Structure

Recommended structure:

```text
docs/
  doctrine/
  sop/
  cases/
  evals/
  sources/
state/
  missions/
  sitreps/
  frago/
  decisions/
  aar/
logs/
  tool-use/
  approvals/
  verification/
```

The current project is a simple document set, so everything is gathered under `docs/`, but in an actual application, state and logs should be kept separate.

## 8. Implementation Phases

### Phase 1: Manual Framework

Goal:

- A person reads the README and documents, and writes prompts directly.

Components:

- Document set.
- Templates.
- Source map.
- Evaluation sheet.

### Phase 2: Assisted Orchestrator

Goal:

- The system converts the user request into an OPORD draft.
- The person only performs approval and revision.

Components:

- OPORD compiler.
- Role tasking generator.
- Authority checklist.
- Source map updater.

### Phase 3: Tool-Gated Agent Runtime

Goal:

- Agents use tools, but must pass the ROE gate.

Components:

- Agent registry.
- Tool gateway.
- Approval UI.
- SITREP/FRAGO state store.
- Evaluator.

### Phase 4: Learning Organization

Goal:

- AAR results are automatically reflected into the SOP and prompt DSL.

Components:

- AAR parser.
- SOP update recommender.
- Readiness rating.
- Experiment runner.

## 9. Minimum API Design

```text
POST /missions
POST /missions/{id}/opord
POST /missions/{id}/task-orders
POST /tool-requests/check
POST /tool-requests/{id}/approve
POST /sitreps
POST /fragos
POST /evidence
POST /assessments
POST /aars
GET  /missions/{id}/timeline
GET  /agents/{id}/readiness
```

## 10. Operations Dashboard

The dashboard must show the information needed for decisions, more than a pretty screen.

Required panels:

- Active missions.
- Decision required.
- CCIR alerts.
- Tool requests.
- Source confidence.
- Verification status.
- AAR updates.
- Agent readiness.

## 11. Failure Modes

| Failure | Cause | Control |
| --- | --- | --- |
| Agent executes without authorization | No ROE gate | Tool gateway |
| Sourceless claims | No evidence store | Source discipline score |
| Loss of context | State not saved | SITREP and mission state |
| Excessive parallelization | No CoS integration | Task order dependency |
| Approval bottleneck | Everything treated as requiring approval | Risk-based authority |
| Formalism | Documents not linked to decisions | Decision-linked battle rhythm |

## 12. Related Documents

- `prompt-dsl.md`
- `tool-use-roe.md`
- `agent-roles-and-authority.md`
- `agent-battle-rhythm.md`
- `evaluation-metrics.md`
- `experiments.md`
