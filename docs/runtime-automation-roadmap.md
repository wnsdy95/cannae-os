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
-> Provider-native execution identity
```

Current repository state: Phases 0-3 have executable prototypes. Repository-scoped proof persistence, bounded campaign supervision, comparative control-plane promotion, signed comparative evidence, pre-dispatch verifier readiness, and a GitHub Actions OIDC execution adapter are implemented as local runtimes. UI, non-GitHub providers, operated transparency infrastructure, and native sandbox enforcement remain prototype-grade or external.

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

Status: Phase 11A and Phase 11B implemented as separate provider adapters. Phase 11A supplies a provider-neutral SPIFFE/X.509 proof contract; Phase 11B consumes native Sigstore bundles and TrustedRoot metadata through pinned official libraries.

Goal:

- Count a verifier toward pre-dispatch quorum only when a currently active workload proves simultaneous possession of a short-lived workload credential and its policy-registered verifier key, with transparency evidence verified under a manifest-pinned trust root.

Features:

- `VerifierTrustPolicy` v0.2 pins X.509 trust roots, SPIFFE IDs, transparency-log origins and Ed25519 log keys for the provider-neutral adapter;
- `VerifierIdentityEvidence` binds verifier, policy, repository, evidence purposes, nonce and validity window under both the SVID key and static verifier key;
- exact-one URI SAN enforcement and exact SPIFFE ID/trust-domain matching;
- bounded X.509 chain, signature, CA-role and active-window validation;
- RFC 6962-style `0x00` leaf and `0x01` node SHA-256 Merkle inclusion verification;
- trusted-log-key signature verification over a tree-size/root/time checkpoint;
- exact manifest ID/path/SHA-256 references in cycle-order v0.3 identity admission;
- purpose-specific exclusion of missing, stale, expired, malformed, untrusted or tampered workload evidence.
- `VerifierTrustPolicy` v0.3 selects `spiffe_x509` or `sigstore_bundle` independently for each verifier and pins exact Sigstore SAN, OIDC issuer, TrustedRoot artifact, bundle media type and nonzero CT/Rekor/timestamp thresholds;
- `SigstoreTrustedRoot` normalizes official protobuf JSON, records source and retrieval time, and is bound by exact manifest ID/path/SHA-256 plus a maximum age;
- `SigstoreVerifierIdentityEvidence` binds the exact canonical Controls statement under both the keyless Fulcio certificate key and the static verifier key;
- `@sigstore/verify` checks the artifact signature, Fulcio chain and SCT, trusted signing time, Rekor inclusion/checkpoint, and Rekor body-to-artifact/signature binding;
- cycle-order v0.4 projects either adapter into one generic identity-assurance record without erasing provider, issuer, authority, root, certificate or log identity.

Completion criteria:

- A trust-policy v0.2 verifier without valid manifest-backed identity evidence cannot enter receipt or comparative quorum.
- A different SPIFFE ID, extra URI SAN, untrusted chain, stale evidence, altered workload/static signature, altered log signature or false Merkle path fails closed.
- A cycle order cannot claim authenticated assurance unless every counted purpose verifier maps to active evidence and the order expires no later than that evidence.
- Trust-root, verifier, log-key and release changes remain human-controlled.
- A native bundle with the wrong artifact bytes, wrong signer identity or issuer, stale root, expired current certificate, zero verification threshold, or unrelated valid Rekor entry fails closed.
- Mixed SPIFFE and Sigstore verifier populations can satisfy a policy only through distinct active evidence for every counted verifier and purpose.

Implemented controls:

- `verifier-identity-evidence.js` creates and verifies the dual-signed identity binding, X.509 chain and Merkle checkpoint;
- `campaign-supervisor.js` loads schema-valid evidence from the verified repository manifest and passes it to `verifier-trust-readiness.js`;
- cycle-order schema v0.3 records authenticated verifier identities, certificate fingerprints, trust domains, log IDs, exact evidence references and validity boundaries;
- real OpenSSL fixtures cover the valid path and adversarial certificate, signature, freshness, repository and transparency cases;
- end-to-end fixtures prove two identities produce `ready`, while missing or invalid evidence produces `blocked`.
- `sigstore-trusted-root.js` and `sigstore-trusted-root-runner.js` ingest, normalize, validate and optionally persist exact trusted-root material;
- `sigstore-verifier-identity-evidence.js` and `sigstore-verifier-identity-runner.js` create or assemble dual-bound native evidence and verify it with the policy-selected root;
- schema and validator support covers trust-policy v0.3, Sigstore root/evidence objects and generic cycle-order v0.4 identity projection;
- official Sigstore conformance material and a live Fulcio/Rekor bundle cover valid verification, wrong-artifact rejection and unrelated-Rekor-entry rejection;
- supervisor fixtures prove exact manifest loading and fail-closed removal of missing Sigstore identity evidence.

Neither adapter operates an identity provider, SPIFFE Workload API, Fulcio, Rekor, CT log, TUF repository, monitor, witness, gossip network, hardware-protected key or trusted execution environment. The provider-neutral adapter is intentionally not a general RFC 5280 path builder. The native adapter verifies official bundle and TrustedRoot formats. Phase 12A adds exact execution evidence after identity admission, and Phase 12B adds bounded liveness at challenge-response time; neither proves honest verifier execution, infrastructure independence, global log consistency or continuous service availability.

## 13. Phase 12: Verifier Execution Integrity

Status: Phase 12A execution evidence, Phase 12B pre-dispatch challenge, and Phase 12C failure-domain independence implemented.

Goal:

- Admit a verifier attestation to quorum only when the exact verifier code, immutable image, dependency lockfile, harness, invocation, tool and network controls, sandbox profile, repository state and verification target are bound to one fresh execution record under separate builder and verifier signatures.

Phase 12A features:

- `VerifierTrustPolicy` v0.4 binds one exact manifest-backed `VerifierRuntimePolicy`;
- each runtime profile pins the builder authority, provider identity requirements, verifier code, OCI manifest digest, dependency lockfile, harness, argv, tool allowlist, network policy, sandbox profile and execution time bounds;
- `VerifierExecutionEvidence` places the exact verification target in an in-toto Statement under the Cannae execution predicate;
- the trusted builder and registered verifier sign the same DSSE payload with distinct Ed25519 keys;
- repository identity, exact head/worktree fingerprint and dirty-state observation, target digest and Phase 11 workload-identity evidence are included in that payload;
- `VerificationAttestation` and `ComparativeEvaluationAttestation` v0.2 cite one exact manifest-backed execution-evidence artifact;
- invalid execution evidence removes the affected attestation before verifier, key and independence-group quorum calculations;
- the controller reloads runtime policy and execution evidence from the verified repository manifest rather than accepting in-memory proof claims.

Completion criteria for Phase 12A:

- Trust-policy v0.4 cannot become ready without an active, repository-bound runtime policy and one complete purpose-authorized profile assignment per verifier.
- Code, image, lockfile, harness, argv, tool, network, sandbox, provider, repository, target, identity-evidence or signature mutation fails closed.
- Legacy attestation v0.1 is excluded from a v0.4 quorum while remaining readable under earlier policy versions.
- Builder and verifier keys must be distinct, and both signatures must cover identical payload bytes.
- Release authority remains false regardless of execution-evidence or quorum status.

Phase 12B features:

- `VerifierTrustPolicy` v0.5 requires a single-use challenge, a dedicated policy-pinned Ed25519 issuer key, 32 to 64 random bytes per verifier and a bounded response timeout;
- the issuer-signed `VerifierChallengeSet` binds campaign, repository, exact policy/runtime references, manifest history, cycle, attempt, transition, baseline, parent lineage, task/proof digests, purpose and deadline;
- existing dual-signed SPIFFE or Sigstore identity evidence serves as the cryptographic response by containing the exact assigned nonce;
- cycle-order v0.5 records the exact challenge and response references and cannot outlive challenge expiry;
- missing, late, wrong-nonce, ambiguous, expired, replayed or offline responders are excluded before purpose quorum calculation;
- the supervisor automatically issues a challenge only when other policy/runtime checks permit bootstrap, then remains blocked until responses pass.

Phase 12C features:

- `VerifierTrustPolicy` v0.6 fixes nine required correlation dimensions and a minimum computed-domain threshold;
- `VerifierRuntimePolicy` v0.2 records stable provider, operator, control-plane, account, project, runner-pool, infrastructure, region and zone identities per profile;
- any shared required component creates a correlation edge, and transitive connected components become deterministic `VID-*` domains;
- declared `verifier.independence_group` labels remain readable but are ignored for v0.6 readiness and post-execution quorum calculation;
- `VerifierExecutionEvidence` v0.2 places observed identities under the builder-and-verifier-signed execution predicate and rejects any profile mismatch;
- cycle-order v0.6 projects the complete domain graph, while the semantic validator independently reconstructs it;
- receipt and comparative quorums use verified execution domains, so individually valid correlated attestations cannot satisfy multi-domain diversity.

Completion criteria for Phase 12C:

- Different labels cannot hide a shared account, project, runner pool, infrastructure, region, zone, provider, operator or control plane.
- Correlation is transitive and unknown identity fails closed.
- Pre-dispatch readiness and post-execution attestation quorum use the same deterministic algorithm.
- Runtime claims and execution observations are bound by exact policy references and dual DSSE signatures.
- Native adapters remain responsible for deriving common fields from authenticated provider claims; a compromised trusted builder remains a documented root-of-trust failure.

See `verifier-execution-integrity.md`, `verifier-pre-dispatch-challenge.md`, `verifier-independence-assurance.md`, and `transparency-operations.md` for contracts, verification order, state transitions, adapter boundaries and operational commands.

## 14. Phase 13: Transparency Operations

Status: implemented as a manifest-backed control-plane verifier. Production Rekor/TUF services, polling adapters, witnesses, monitors, and gossip remain external.

Goal:

- Operate trust over time through Rekor checkpoint consistency, TUF/root rotation, witnesses, monitors, gossip and explicit equivocation and revocation incident procedures.

Phase 13 must not be represented as complete by verifying one inclusion proof or one valid bundle. It requires durable monitor state, consistency checks across checkpoints, independent observations and response authority outside the verifier being monitored.

Implemented controls:

- `TransparencyPolicy` pins log keys, observer registries, distinct-operator thresholds, initial roots, state freshness, and fail-closed incident actions;
- `TransparencyObservation` verifies signed checkpoints, rollback/equivocation rules, RFC 6962 consistency proofs, and separate witness/monitor quorums;
- `TrustRootRotation` uses official TUF models to require previous-root and new-root thresholds plus exact N to N+1 progression;
- `TransparencyIncident` preserves immutable incident and resolution-supersession history with USER authority and durable revocations;
- `TransparencyState` forms a repository-bound sequence whose complete projection is reconstructed from exact embedded evidence;
- `VerifierTrustPolicy` and `SelfImprovementCycleOrder` v0.7 make a current manifest-backed transparency state a dispatch prerequisite;
- the supervisor rejects embedded observations, roots, rotations, incidents, or states that do not resolve to exact verified manifest entries;
- observation, state-age, and TUF-root expiry bound overall admission and cycle-order lifetime, and current state roots cannot exceed the trust policy's admitted root set.

Completion criteria:

- Rollback, same-size root conflict, invalid consistency, stale evidence, correlated/insufficient observers, invalid root rotation, dropped incident history, active revocation, or missing manifest evidence blocks dispatch.
- A blocked historical state can remain in the sequence for an immutable USER-authorized recovery record, but only the newest state can authorize readiness.
- Passing Phase 13 never grants release, policy-change, root-change, revocation, or incident-resolution authority.

See `transparency-operations.md` for the contracts, algorithms, operating sequence, incident model, commands, and explicit infrastructure limits.

## 15. Phase 14: Native Provider Execution Adapters

Status: Phase 14A GitHub Actions and Phase 14B GitLab CI OIDC adapters implemented. Enterprise/self-managed providers, self-hosted runners, local sandbox, and TEE adapters remain open.

Goal:

- Replace builder-restated provider metadata with evidence cryptographically verified under the provider's native identity mechanism before execution evidence can enter quorum.

Phase 14A features:

- `GitHubActionsOIDCTrustBundle` normalizes the exact public issuer, discovery/JWKS endpoints, `RS256` algorithms, signing keys, freshness, and artifact digest;
- `GitHubActionsOIDCEvidence` retains the exact compact JWT for offline verification and projects only signed claims;
- runtime-policy v0.3 requires a GitHub-hosted reusable workflow pinned by commit SHA and an exact manifest-backed trust bundle;
- execution-evidence v0.3 signs the native-evidence reference under both builder and verifier keys;
- issuer, subject, audience, `kid`, signature, token times, immutable repository/owner IDs, workflow refs/SHAs, commit, ref, run ID, attempt, and runner class fail closed;
- GitHub-unattested runner pool, infrastructure, region, and zone are projected as shared unknown domains rather than invented diversity;
- native GitHub evidence requires a clean repository at the exact token commit;
- the controller reloads native evidence and JWKS material from the verified repository manifest before receipt or comparative quorum evaluation.

Completion criteria for Phase 14A:

- Algorithm confusion, unknown keys, signature corruption, audience/repository substitution, mutable workflow refs, self-hosted runners, expiry, trust-bundle replacement, projection forgery, dirty state, and missing nested artifacts fail closed.
- CLI output does not expose the compact token; the manifest-backed artifact store retains it only for bounded offline verification.
- Multiple GitHub-hosted jobs cannot satisfy independent-domain quorum by varying run metadata.
- OIDC success never grants release or policy authority and never replaces dual-signed execution evidence.

See `github-actions-native-verifier-adapter.md` for the exact contract, operations, source interpretation, and limitations.

Phase 14B features:

- `GitLabCIOIDCTrustBundle` normalizes the exact GitLab.com issuer, discovery/JWKS endpoints, `RS256` algorithms, signing keys, freshness, and artifact digest;
- `GitLabCIOIDCEvidence` retains the exact compact JWT and projects normalized signed claims;
- runtime-policy v0.3 now dispatches a provider-neutral native contract to either the GitHub or GitLab adapter;
- GitLab profiles pin stable source and job project/namespace identities, pipeline source, protected branch, same-project config ref/SHA, exact commit, and GitLab-hosted runner class;
- dynamic pipeline, job, and runner IDs remain trace fields and cannot create failure-domain diversity;
- source/job project drift, unprotected refs, external top-level config, self-hosted runners, audience arrays, and config/commit drift fail closed;
- the controller reloads GitLab native evidence and JWKS material from provider-specific manifest namespaces before receipt or comparative quorum evaluation.

Completion criteria for Phase 14B:

- Algorithm confusion, unknown keys, signature corruption, audience/project substitution, source/job divergence, unprotected refs, self-hosted runners, config drift, expiry, trust-bundle replacement, projection forgery, dirty state, and missing nested artifacts fail closed.
- GitLab numeric IDs are normalized without accepting non-positive, unsafe, or non-decimal identities.
- Multiple GitLab-hosted jobs remain one correlated domain even when their runner, pipeline, and job IDs differ.
- OIDC success never grants release or policy authority and never replaces dual-signed execution evidence.

See `gitlab-ci-native-verifier-adapter.md` for the exact contract, operations, source interpretation, and limitations.

## 16. Release Gates

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
| G13 | Trust-policy v0.3 Sigstore dispatch has a fresh dual-bound native bundle under the exact manifest-pinned TrustedRoot, signer identity, issuer and nonzero verification thresholds |
| G14 | Trust-policy v0.4 attestation enters quorum only with valid dual-signed execution evidence matching the exact runtime policy, repository state and verification target |
| G15 | Trust-policy v0.5 dispatch has one exact active supervisor challenge and enough fresh dual-signed nonce responses to satisfy every required purpose quorum without ambiguity or replay |
| G16 | Trust-policy v0.6 dispatch and post-execution quorum use computed failure domains instead of declared group labels |
| G17 | Trust-policy v0.7 dispatch has a current, contiguous, reconstructable and manifest-backed transparency state with valid consistency, observer, root, incident and revocation status |
| G18 | Runtime-policy v0.3 GitHub evidence has a valid manifest-pinned JWKS, strict OIDC signature/claim appraisal, conservative failure-domain projection, clean exact commit, and execution-evidence v0.3 binding |
| G19 | Runtime-policy v0.3 GitLab evidence has a valid manifest-pinned GitLab.com JWKS, strict OIDC signature/claim appraisal, stable source/job identity, protected same-project config, conservative failure-domain projection, clean exact commit, and execution-evidence v0.3 binding |

## 17. Related Documents

- `schema-files/README.md`
- `validator-prototype.md`
- `policy-engine-rules.md`
- `command-post-dashboard.md`
- `agent-runtime-playbook.md`
- `bounded-self-improvement-operations.md`
- `verifier-pre-dispatch-challenge.md`
- `verifier-execution-integrity.md`
- `transparency-operations.md`
- `github-actions-native-verifier-adapter.md`
- `gitlab-ci-native-verifier-adapter.md`
