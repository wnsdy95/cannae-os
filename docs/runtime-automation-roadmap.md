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
-> Manifest-backed finite campaign supervision
-> Comparative canary promotion gates
```

Current repository state: Phases 0-3 have executable prototypes, repository-scoped proof persistence, bounded campaign supervision, and comparative control-plane promotion are implemented as local runtimes, and UI/external-system integration remains prototype-grade.

## 1. Phase 0: Documentation Base

Status: implemented.

Completion criteria:

- doctrine documents.
- SOP library.
- prompt templates.
- source map.
- evaluation metrics.
- risk register.
- runtime schemas.

Risks identified at the end of this phase, addressed only partially by later phases:

- No actual runtime enforcement.
- No validator code.
- No dashboard.

## 2. Phase 1: Local Validator CLI

Status: implemented as a dependency-free local prototype with schema and semantic fixtures.

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

Status: partially implemented through structured payloads, routers, and order-dissemination runners; general request-to-OPORD compilation remains open.

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

Status: implemented as local policy and integration prototypes; real external tool interception remains open.

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

Status: static/projection prototype only.

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

Status: partially implemented through repository-scoped manifests, receipts, attestations, and source maps; queryable production storage remains open.

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

Status: static UI and deterministic projections only.

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

Status: partially implemented through AAR/readiness projection and bounded self-improvement controls.

Goal:

- AAR updates SOP, policy, and readiness.

Features:

- AAR parser.
- SOP update suggestion.
- readiness ledger update.
- recurring risk detection.

Completion criteria:

- When the same failure recurs, a risk/register/policy update is proposed.

Implemented bounded-learning controls:

- finite `SelfImprovementCampaign` budgets and protected invariants;
- executable verification receipts and signed verifier quorum;
- exact accepted-parent lineage through the repository manifest;
- deterministic `campaign-supervisor.js` reconstruction and next-cycle orders;
- fail-closed hold on incomplete history, terminal decisions, and exhausted budgets.

## 9. Phase 8: Comparative Candidate Promotion

Status: implemented as a local proof-carrying runtime.

Goal:

- Compare a skill or runtime-control candidate against its accepted baseline before promotion.

Features:

- immutable baseline and candidate identities;
- shared, versioned evaluation set;
- canary execution with contamination controls;
- per-dimension non-regression thresholds;
- independent evaluation evidence;
- promotion, rollback, and inconclusive outcomes;
- cycle-order integration without release authority.

Completion criteria:

- A control-plane candidate cannot be promoted from a single self-reported score.
- The same evaluation contract runs against baseline and candidate.
- Any hard-gate regression or invalid comparison blocks promotion.
- A passing comparison remains only a working-state promotion; merge and release stay human-gated.

Implemented controls:

- `ComparativeEvaluationSet` seals ordered fixtures and contamination-control declarations before candidate execution;
- `ComparativeEvaluationPlan` binds distinct baseline/candidate repository states, one evaluation-set hash, one harness hash, exact argv, and an independent evaluator invocation;
- `comparative-evaluation-runner.js` executes both worktrees with `shell: false`, checks repository and fixture immutability, parses structured observations, and emits `promotable`, `rollback`, or `inconclusive`;
- campaign-owned thresholds cover every quality dimension exactly once and combine an absolute target with a maximum tolerated regression;
- `autonomous-improvement-controller.js` reloads the report, plan, and set from the verified manifest, recomputes the result, and matches report values to checkpoint metrics;
- `campaign-supervisor.js` carries the comparative requirement forward without granting merge, push, execution, or release authority.

## 10. Release Gates

| Gate | Condition |
| --- | --- |
| G1 | Schema fixtures pass |
| G2 | Critical validator rules pass |
| G3 | Policy engine blocks Red without approval |
| G4 | Approval UI logs action-level scope |
| G5 | Evidence records link claims to sources |
| G6 | Dashboard shows decision required |
| G7 | AAR updates readiness ledger |
| G8 | Campaign supervisor emits only a finite ready order from a valid manifest chain |
| G9 | Control-plane candidate passes baseline-versus-canary comparison |

## 11. Related Documents

- `schema-files/README.md`
- `validator-prototype.md`
- `policy-engine-rules.md`
- `command-post-dashboard.md`
- `agent-runtime-playbook.md`
- `bounded-self-improvement-operations.md`
