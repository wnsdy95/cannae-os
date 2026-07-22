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
-> Pre-dispatch verifier readiness admission
```

Current repository state: Phases 0-3 have executable prototypes. Repository-scoped proof persistence, bounded campaign supervision, comparative control-plane promotion, signed comparative evidence, and pre-dispatch verifier readiness admission are implemented as local runtimes. UI and externally authenticated execution remain prototype-grade.

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

## 11. Phase 10: Verifier Readiness Admission

Status: implemented as a manifest-backed dispatch prerequisite.

Goal:

- Refuse to start or resume signed campaign work when the bound trust policy cannot form every evidence quorum the campaign will require.

Features:

- exact campaign-to-policy artifact ID, path, SHA-256, mission, and repository binding;
- active policy and verifier validity-window checks at order issuance;
- Ed25519 public-key identity, verifier status, and repository allowlist checks;
- separate receipt and comparative-purpose eligibility populations;
- effective thresholds that cannot be weaker than either campaign or policy quorum;
- distinct verifier, key, and independence-group counts and evidence lists;
- conservative `valid_until` plus admission-state-derived idempotent order identity;
- fail-closed `hold` when any required population is insufficient.

Completion criteria:

- A v0.3+ campaign cannot receive a `ready` order without a manifest-valid, active, repository-bound trust policy.
- A v0.4 campaign cannot receive a `ready` order when receipt quorum is possible but comparative-purpose quorum is not.
- Suspended, revoked, future, expired, wrong-repository, invalid-key, repeated-key, or insufficient-group entries cannot fill readiness positions.
- A payload that merely claims admission satisfaction is rejected when its evidence counts do not meet the recorded thresholds.
- v0.1 cycle orders remain readable, and unsigned campaigns receive an explicit v0.2 no-op admission.

Implemented controls:

- `verifier-trust-readiness.js` computes policy eligibility without accepting agent-authored readiness claims;
- `campaign-supervisor.js` loads the exact policy and propagates admission failures into non-executable orders;
- cycle-order schema v0.2 records policy reference, effective requirements, purpose-specific populations, issue/expiry times, and blocking codes;
- `run-verifier-trust-readiness-fixtures.js`, `run-cycle-order-admission-fixtures.js`, and expanded supervisor fixtures cover readiness and forgery cases.

This phase proves only that policy-declared public verifier capacity can form a quorum at issuance. It does not prove private-key availability, honest execution, operational independence, protected workload identity, or transparency-log inclusion.

## 12. Phase 11: Authenticated Verifier Workloads

Status: Phase 11A implemented as a provider-neutral identity and transparency proof layer; native Sigstore bundle ingestion remains Phase 11B.

Goal:

- Count a verifier toward pre-dispatch quorum only when a currently active workload proves simultaneous possession of its short-lived SPIFFE SVID key and its policy-registered verifier key, and the proof is included in a trusted append-only log checkpoint.

Features:

- `VerifierTrustPolicy` v0.2 pins X.509 trust roots, SPIFFE IDs, transparency-log origins and Ed25519 log keys;
- `VerifierIdentityEvidence` binds verifier, policy, repository, evidence purposes, nonce and validity window under both the SVID key and static verifier key;
- exact-one URI SAN enforcement and exact SPIFFE ID/trust-domain matching;
- bounded X.509 chain, signature, CA-role and active-window validation;
- RFC 6962-style `0x00` leaf and `0x01` node SHA-256 Merkle inclusion verification;
- trusted-log-key signature verification over a tree-size/root/time checkpoint;
- exact manifest ID/path/SHA-256 references in cycle-order v0.3 identity admission;
- purpose-specific exclusion of missing, stale, expired, malformed, untrusted or tampered workload evidence.

Completion criteria:

- A trust-policy v0.2 verifier without valid manifest-backed identity evidence cannot enter receipt or comparative quorum.
- A different SPIFFE ID, extra URI SAN, untrusted chain, stale evidence, altered workload/static signature, altered log signature or false Merkle path fails closed.
- A cycle order cannot claim authenticated assurance unless every counted purpose verifier maps to active evidence and the order expires no later than that evidence.
- Trust-root, verifier, log-key and release changes remain human-controlled.

Implemented controls:

- `verifier-identity-evidence.js` creates and verifies the dual-signed identity binding, X.509 chain and Merkle checkpoint;
- `campaign-supervisor.js` loads schema-valid evidence from the verified repository manifest and passes it to `verifier-trust-readiness.js`;
- cycle-order schema v0.3 records authenticated verifier identities, certificate fingerprints, trust domains, log IDs, exact evidence references and validity boundaries;
- real OpenSSL fixtures cover the valid path and adversarial certificate, signature, freshness, repository and transparency cases;
- end-to-end fixtures prove two identities produce `ready`, while missing or invalid evidence produces `blocked`.

Phase 11A does not implement a general RFC 5280 path builder, revocation service, SPIFFE Workload API client, Fulcio issuer, Rekor monitor/gossip system, Cosign/Sigstore bundle parser, hardware-protected key or trusted execution environment. Phase 11B should add a native Sigstore bundle adapter against official libraries and trusted-root metadata rather than reimplementing that wire format.

## 13. Release Gates

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
| G11 | Signed-campaign dispatch has a satisfied, unexpired, manifest-bound trust-policy admission |
| G12 | Trust-policy v0.2 dispatch has a fresh dual-signed SPIFFE workload proof with verified transparency inclusion |

## 14. Related Documents

- `schema-files/README.md`
- `validator-prototype.md`
- `policy-engine-rules.md`
- `command-post-dashboard.md`
- `agent-runtime-playbook.md`
- `bounded-self-improvement-operations.md`
