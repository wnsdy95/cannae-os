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
-> Authenticated comparative evidence
```

Current repository state: Phases 0-3 have executable prototypes. Repository-scoped proof persistence, bounded campaign supervision, comparative control-plane promotion, and signed comparative evidence are implemented as local runtimes. UI and externally authenticated execution remain prototype-grade.

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

## 10. Phase 9: Authenticated Comparative Evidence

Status: implemented as a local DSSE/in-toto proof layer.

Goal:

- Authenticate who vouched for the exact persisted comparative report before a control-plane candidate is promoted.

Features:

- report-artifact SHA-256 and report self-digest binding;
- plan, evaluation-set, campaign, mission, cycle, baseline, candidate, repository, evaluator, and invocation binding;
- Ed25519 DSSE signatures over an in-toto statement with a purpose-specific predicate;
- distinct verifier ID, key, and independence-group quorum;
- issue, expiry, trust-policy, key-validity, execution-origin, and maximum-age checks;
- controller and supervisor integration under campaign/checkpoint/decision schema `0.4`;
- no merge, push, execution, trust-root, or release authority.

Completion criteria:

- A `0.4` skill or runtime-control checkpoint cannot promote from an unsigned comparative report.
- Rebinding a signed report to another artifact, campaign, plan, set, baseline, candidate, evaluator invocation, or repository fails closed.
- Repeated, expired, untrusted, or non-independent signatures cannot satisfy quorum.
- `0.2` receipt-only and `0.3` signed-receipt campaigns remain readable and executable under their original contracts.

Implemented controls:

- `comparative-evaluation-attestation-runner.js` signs the exact persisted report reference and emits portable evidence;
- `autonomous-improvement-controller.js` reloads each report attestation from the verified artifact manifest and recomputes quorum against the campaign trust policy;
- `campaign-supervisor.js` binds accepted comparative attestation IDs back to checkpoint references and carries the signed-report requirement in every `0.4` cycle order;
- dedicated fixtures cover signature tamper, artifact/self-digest mismatch, plan/set/lineage/evaluator/repository rebinding, cross-campaign replay, expiry, origin restrictions, duplicate signers, and weak quorum.

This phase authenticates trusted-key possession and statement integrity. It does not prove that the evaluator ran honestly, that `remote` is a protected execution service, or that declared independence groups are operationally independent.

## 11. Release Gates

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
| G10 | Schema `0.4` control-plane comparison has a fresh trusted signed report quorum |

## 12. Related Documents

- `schema-files/README.md`
- `validator-prototype.md`
- `policy-engine-rules.md`
- `command-post-dashboard.md`
- `agent-runtime-playbook.md`
- `bounded-self-improvement-operations.md`
