# Sample Runtime State

## 0. Purpose

This document provides examples of the state objects that a military-style LLM runtime should store.

Implementers can use this document as a reference for designing JSON/YAML schemas, DB tables, and event logs.

## 1. Mission State

```yaml
mission:
  id: M-20260618-001
  title: "Expansion of the military-style LLM framework"
  status: in_progress
  requester: user
  created_at: "2026-06-18T09:00:00+09:00"
  mission_statement: "Document military-style command and control and document systems as an LLM operating framework."
  intent:
    purpose: "Build an AI agent operating system free of distortion."
    success_conditions:
      - "The document set is linked from the README."
      - "Sources and interpretation are kept separate."
      - "A practically implementable DSL and ROE are defined."
    failure_conditions:
      - "Claims without sources"
      - "Unauthorized tool execution"
      - "Documentation only, with no execution procedure"
  constraints:
    - "Use only publicly available material"
    - "No advice on actual military operations"
  current_order: OPORD-20260618-001
```

## 2. OPORD State

```yaml
opord:
  id: OPORD-20260618-001
  mission_id: M-20260618-001
  situation:
    known_facts:
      - "The base framework documentation exists"
      - "Korean-language source material and implementation documents are needed"
    assumptions:
      - "Publicly available material on detailed Korean military doctrine is limited"
    constraints:
      - "Based on publicly available material"
  mission:
    statement: "Add Korean-language source material, an implementation guide, DSL, ROE, and an org chart."
  execution:
    tasks:
      - id: T-001
        assigned_to: S2
        task: "Research Korean public source material"
      - id: T-002
        assigned_to: S3
        task: "Write the implementation guide"
      - id: T-003
        assigned_to: S6
        task: "Update README and source map"
  command_and_signal:
    ccir:
      pir:
        - "Unable to verify official Korean-language material"
      ffir:
        - "Missing README link"
      eefi:
        - "Discovery of sensitive information"
```

## 3. Agent Registry

```yaml
agents:
  - id: S2
    name: Intelligence Agent
    model: default
    readiness:
      public_source_research: T
      korean_source_research: P
    tools:
      green:
        - web.search
        - file.read
      amber:
        - authenticated_site.read
      black:
        - fabricate_source

  - id: S3
    name: Operations Agent
    readiness:
      markdown_authoring: T
      code_implementation: P
    tools:
      green:
        - file.write_markdown
        - shell.readonly
      amber:
        - package_install
      red:
        - deploy.production
```

## 4. Task Orders

```yaml
task_orders:
  - id: T-001
    mission_id: M-20260618-001
    assigned_to: S2
    task: "Research and document publicly available Korean military material."
    purpose: "Secure grounding for Korea-specific calibration"
    deliverables:
      - "docs/korean-military-sources.md"
    status: complete

  - id: T-002
    mission_id: M-20260618-001
    assigned_to: S3
    task: "Write a guide for actual system implementation."
    purpose: "Translate concepts into a runtime structure"
    deliverables:
      - "docs/implementation-guide.md"
      - "docs/reference-architecture.md"
    status: complete
```

## 5. Tool Request

```yaml
tool_request:
  id: TR-001
  mission_id: M-20260618-001
  actor: S3
  tool: filesystem
  action: create_file
  target: "docs/prompt-dsl.md"
  roe_class: Green
  approval_required: false
  reason: "Creating a new markdown file within documentation scope"
  result: success
```

## 6. Approval Request

```yaml
approval_request:
  id: AR-001
  mission_id: M-20260618-001
  actor: S3
  requested_action: "production deployment"
  tool: deploy
  target: "prod"
  roe_class: Red
  why_needed: "Release a new feature to users"
  risk:
    - "Service outage"
    - "Data migration failure"
  rollback:
    - "previous release restore"
  alternatives:
    - "preview deployment"
    - "dry-run"
  status: pending
```

## 7. SITREP Event

```yaml
sitrep:
  id: SITREP-001
  mission_id: M-20260618-001
  timestamp: "2026-06-18T10:00:00+09:00"
  status: in_progress
  completed:
    - "korean-military-sources.md"
    - "implementation-guide.md"
  in_progress:
    - "Index update"
  blocked: []
  ccir: []
  risk:
    - "Limited public availability of detailed Korean military doctrine material"
  next_action:
    - "Verify README links"
```

## 8. FRAGO Event

```yaml
frago:
  id: FRAGO-001
  mission_id: M-20260618-001
  parent_order: OPORD-20260618-001
  reason: "The user directed continued progress"
  unchanged_intent:
    - "Documentation of the military-style LLM framework"
  modified_tasks:
    - "Add reference architecture"
    - "Add sample runtime state"
  new_constraints: []
```

## 9. Evidence Record

```yaml
evidence:
  id: E-001
  mission_id: M-20260618-001
  source_title: "Korea Law Information Center"
  url: "https://www.law.go.kr/"
  source_type: official_law_database
  reliability: A
  claim: "Official channel for verifying military-related statutes and directives"
  interpretation: "Grounding for the Korean institutional context of LLM authority and ROE"
  linked_docs:
    - "korean-military-sources.md"
    - "tool-use-roe.md"
```

## 10. AAR Event

```yaml
aar:
  id: AAR-001
  mission_id: M-20260618-001
  expected:
    - "Write new documents"
    - "Link the index"
  actual:
    - "Expanded the document set"
    - "Verified README links"
  delta:
    - "Not a git repository, so diff verification was not possible"
  causes:
    - "No .git present in the current working folder"
  sustain:
    - "Verify that README links exist"
    - "Update source map and compendium together"
  improve:
    - "Creating the runtime state example first from now on makes the implementation documentation more stable"
  sop_updates:
    - "When adding a new document, verify that the file referenced by the README link exists"
```

## 11. Related Documents

- `reference-architecture.md`
- `implementation-guide.md`
- `prompt-dsl.md`
- `tool-use-roe.md`
- `approval-ui-patterns.md`
