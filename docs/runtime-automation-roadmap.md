# Runtime Automation Roadmap

## 0. Purpose

This document is a roadmap for evolving the current document-based framework into an actual tool-gated LLM runtime.

Target state:

```text
Manual doctrine docs
-> Structured prompt workflow
-> JSON Schema validated orders
-> Policy-gated tool execution
-> Dashboard and approval UI
-> AAR-driven learning runtime
```

## 1. Phase 0: Documentation Base

Current state.

Completion criteria:

- doctrine documents.
- SOP library.
- prompt templates.
- source map.
- evaluation metrics.
- risk register.
- runtime schemas.

Remaining risks:

- No actual runtime enforcement.
- No validator code.
- No dashboard.

## 2. Phase 1: Local Validator CLI

Goal:

- Validate OPORD, tool request, SITREP, and AAR JSON locally.

Features:

- JSON Schema validation.
- semantic rule validation.
- valid/invalid fixture tests.
- report output.

Completion criteria:

- `validate opord.json` command.
- critical/error/warning output.
- fixtures pass.

## 3. Phase 2: Prompt Compiler

Goal:

- Convert a user request into an OPORD draft.
- Decompose an OPORD into per-agent task orders.

Features:

- mission extraction.
- intent extraction.
- authority suggestion.
- CCIR suggestion.
- assessment suggestion.

Completion criteria:

- The user can approve/edit the OPORD draft.
- The validator catches missing fields.

## 4. Phase 3: Tool Gateway

Goal:

- Every tool request passes through the policy engine.

Features:

- tool request object.
- ROE decision.
- approval request generation.
- tool-use log.

Completion criteria:

- Red without approval is blocked.
- Black action is blocked.
- Green action audit log.

## 5. Phase 4: Approval UI

Goal:

- The user understands the risk and grants action-level approval.

Features:

- approval queue.
- dry-run button.
- risk/rollback/alternatives display.
- approval log.

Completion criteria:

- Production-like actions cannot execute before approval.
- The approval scope and expiration are recorded.

## 6. Phase 5: Evidence Store

Goal:

- Store sources and claims in structured form.

Features:

- source metadata.
- claim/interpretation split.
- reliability.
- linked documents.
- source map export.

Completion criteria:

- Unsupported claims can be detected.
- Claims can be traced via the evidence viewer.

## 7. Phase 6: Command Post Dashboard

Goal:

- Command mission, approval, CCIR, risk, and readiness from a single screen.

Features:

- mission board.
- CCIR alerts.
- approval queue.
- risk board.
- readiness board.
- AAR library.

Completion criteria:

- Blocked missions and decision-required items are immediately visible.

## 8. Phase 7: Learning Runtime

Goal:

- AAR updates SOP, policy, and readiness.

Features:

- AAR parser.
- SOP update suggestion.
- readiness ledger update.
- recurring risk detection.

Completion criteria:

- When the same failure recurs, a risk/register/policy update is proposed.

## 9. Release Gates

| Gate | Condition |
| --- | --- |
| G1 | Schema fixtures pass |
| G2 | Critical validator rules pass |
| G3 | Policy engine blocks Red without approval |
| G4 | Approval UI logs action-level scope |
| G5 | Evidence records link claims to sources |
| G6 | Dashboard shows decision required |
| G7 | AAR updates readiness ledger |

## 10. Related Documents

- `schema-files/README.md`
- `validator-prototype.md`
- `policy-engine-rules.md`
- `command-post-dashboard.md`
- `agent-runtime-playbook.md`
