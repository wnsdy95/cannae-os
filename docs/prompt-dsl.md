# Prompt DSL

## 0. Purpose

This document defines OPORD, WARNO, FRAGO, SITREP, and AAR as a prompt DSL that can be machine-read and validated.

The goal is not an impressive format, but to structure user intent and authority boundaries so that agents handle them consistently.

## 1. DSL Design Principles

| Principle | Description |
| --- | --- |
| Explicit intent | Separates mission from intent |
| Machine-checkable | Required fields must be verifiable |
| Human-readable | Users must be able to read and edit it as-is |
| Role-aware | Must enable tasking of subordinate agents |
| ROE-linked | Must be linked to tool-use authority |
| Assessment-ready | Must include MOP/MOE and verification criteria |

## 2. Common Schema

```yaml
schema_version: "0.1"
type: "OPORD"
id: "ORDER-0001"
created_at: "2026-06-18"
created_by: "Commander"
mission_id: "M-0001"
classification: "public"
```

Common fields:

| Field | Required | Description |
| --- | --- | --- |
| schema_version | yes | DSL version |
| type | yes | OPORD, WARNO, FRAGO, SITREP, AAR |
| id | yes | Document ID |
| mission_id | yes | Linked mission |
| created_by | yes | Author |
| classification | yes | public, internal, sensitive |

## 3. OPORD DSL

```yaml
schema_version: "0.1"
type: "OPORD"
id: "OPORD-0001"
mission_id: "M-0001"
created_by: "Commander"
classification: "public"

situation:
  background:
    - "Military-style LLM framework documentation in progress"
  known_facts:
    - "A framework document set currently exists in docs/"
  assumptions:
    - "Research is focused on publicly available materials"
  constraints:
    - "Use of non-public military materials is prohibited"

mission:
  statement: "Document military-style operating methods as an LLM operating framework."
  target_end_state:
    - "Document set is linked from the README"
    - "Sources and applied interpretation are separated"

intent:
  purpose: "Build an undistorted command structure for AI task execution."
  key_tasks:
    - "Research materials"
    - "Documentation"
    - "Draft SOP and evaluation framework"
  expanded_purpose:
    - "The next worker must be able to pick up and extend the work."
  failure_to_avoid:
    - "Unsourced generalities"
    - "Actual military operational advice"

execution:
  concept:
    - "Proceed in the order: research, structuring, templating, evaluation design"
  tasks:
    - assigned_to: "S2"
      task: "Investigate sources and update the source map"
      purpose: "Ensure traceability of evidence"
    - assigned_to: "S3"
      task: "Draft document structure and execution procedures"
      purpose: "Ensure operational feasibility"
  coordinating_instructions:
    - "Link new documents from the README"
    - "Mark unsourced claims as hypotheses"

sustainment:
  tools:
    - "filesystem"
    - "web research"
  context_budget: "medium"
  fallback:
    - "If official sources are insufficient, state the limitation"

command_and_signal:
  authority:
    allowed:
      - "markdown file creation"
      - "public source summary"
    approval_required:
      - "external publishing"
    prohibited:
      - "classified source use"
      - "fabricated citation"
  ccir:
    pir:
      - "Unable to verify South Korean military public materials"
    ffir:
      - "Missing document links"
    eefi:
      - "Discovery of sensitive information"
  reports:
    sitrep_trigger:
      - "New document set added"
      - "CCIR occurrence"

assessment:
  mop:
    - "Document creation"
    - "Link verification"
  moe:
    - "Next worker can execute"
  verification:
    - "rg --files"
    - "wc -l"
```

## 4. WARNO DSL

WARNO is a document used for early warning and preparation to begin before detailed planning is complete.

```yaml
schema_version: "0.1"
type: "WARNO"
id: "WARNO-0001"
mission_id: "M-0001"

warning:
  pending_mission: "Add South Korean military public materials and implementation documents"
  likely_tasks:
    - "Draft korean-military-sources.md"
    - "Draft implementation-guide.md"
    - "Draft prompt-dsl.md"
    - "Draft tool-use-roe.md"
  initial_constraints:
    - "Use only public materials"
  required_preparation:
    - "Review the current document set"
    - "Search official Korean sources"
  earliest_execution: "immediate"
```

## 5. FRAGO DSL

FRAGO conveys only the changed portions without rewriting the entire OPORD.

```yaml
schema_version: "0.1"
type: "FRAGO"
id: "FRAGO-0001"
mission_id: "M-0001"
parent_order: "OPORD-0001"

change:
  reason: "User requested to continue"
  unchanged_intent:
    - "Military-style LLM framework documentation"
    - "Separation of sources and applied interpretation"
  modified_tasks:
    - task: "Add South Korean military public-materials document"
      assigned_to: "S2"
    - task: "Draft the prompt DSL"
      assigned_to: "S3"
  new_constraints:
    - "State the public-disclosure limitations for South Korean military materials"
  required_confirmation:
    - "Update README and source map"
```

## 6. SITREP DSL

```yaml
schema_version: "0.1"
type: "SITREP"
id: "SITREP-0001"
mission_id: "M-0001"

status:
  overall: "in_progress"
  completed:
    - "Reviewed the current document set"
    - "Researched Korean public materials"
  in_progress:
    - "Drafting implementation guide"
  blocked: []
  ccir:
    - type: "PIR"
      item: "Limited disclosure of detailed South Korean operational doctrine"
      action: "State the limitation"
  risk:
    - "Risk of over-interpreting public policy materials as detailed operational doctrine"
  next_action:
    - "Draft tool-use ROE"
```

## 7. AAR DSL

```yaml
schema_version: "0.1"
type: "AAR"
id: "AAR-0001"
mission_id: "M-0001"

review:
  expected:
    - "Expansion of the document set"
  actual:
    - "Created 4 new documents"
  delta:
    - "Korean materials ended up limited mainly to laws and policy"
  causes:
    - "Restrictions on disclosure of detailed military doctrine"
  sustain:
    - "Update README and source map simultaneously"
  improve:
    - "Further research on differences between Korean terminology and English doctrinal terms"
  sop_updates:
    - "Add an SOP specifying limitations on the use of Korean materials"
```

## 8. Validation Rules

### OPORD Required Rules

- `mission.statement` must be present.
- `intent.purpose` must be present.
- At least one of `authority.allowed`, `authority.approval_required`, or `authority.prohibited` must be present.
- Both `assessment.mop` and `assessment.moe` must be present.
- `ccir` must include at least one of PIR, FFIR, or EEFI.

### FRAGO Required Rules

- `parent_order` must be present.
- `unchanged_intent` must be present.
- Changed tasks must be distinguished from unchanged intent.

### SITREP Required Rules

- completed, in_progress, and blocked must be kept separate.
- If risk or ccir is absent, state it explicitly as an empty array.
- next_action must be present.

### AAR Required Rules

- expected and actual must be kept separate.
- delta and causes must be recorded.
- At least one of sustain or improve must be present.
- Whether an SOP update is needed must be specified.

## 9. Prompt Compiler

The DSL can be given to the model as-is, but at runtime it is better to compile it into the following structure.

```text
System:
You act only within the assigned role and ROE.

Developer:
DSL validation rules and output contract.

User:
OPORD/WARNO/FRAGO body text.

Assistant first response:
Backbrief + assumptions + CCIR check.
```

## 10. Anti-Patterns

| Anti-pattern | Problem |
| --- | --- |
| Merging mission and intent | What must be done and why get mixed together |
| Omitting authority | Tool-execution boundaries disappear |
| Having only MOP | Ineffective output gets judged as success |
| FRAGO rewrites the whole order | Change history cannot be tracked |
| SITREP has no risk | Information needed for command judgment is missing |
| AAR reads like a reflection essay | Does not lead to SOP improvement |

## 11. Related Documents

- `prompt-templates.md`
- `implementation-guide.md`
- `tool-use-roe.md`
- `evaluation-metrics.md`
- `case-studies.md`
