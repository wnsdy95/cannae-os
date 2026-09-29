# Runtime Automation Roadmap

## 0. Purpose

Campaign [known-obligation terminal reconciliation](campaign-terminal-reconciliation.md)
now follows explicit USER stop intake. Historical snapshot replay, wave/report
proof, orphan rejection and guarded publication preserve the stop. The separate
[exact successor contract](campaign-successor-admission.md) now binds the complete
candidate, repository state and fresh USER decision through held candidate then
admission publication. It satisfies only the selected successor's stop fence;
normal trust/budget/dispatch gates, trusted time and external containment remain
independent obligations.

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
-> Operational skill mission lifecycle
```

Current repository state: Phases 0-3 have executable prototypes. Repository-scoped proof persistence, bounded campaign supervision, comparative control-plane promotion, signed comparative evidence, pre-dispatch verifier readiness, GitHub Actions and GitLab CI OIDC execution adapters, independent GitHub release bundle/TUF verification, provider-retained monotonic release-trust checkpoints with bounded initial-bootstrap recovery, and the operational Codex/Claude skill lifecycle are implemented as local runtimes. UI, enterprise/self-managed providers, operated transparency infrastructure, and native sandbox enforcement remain prototype-grade or external.

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

Status: partially implemented. [Request intake](request-order-intake.md) now retains
original bytes and typed model/operator analysis, appraises exact source quotes,
and compiles non-executable OPORD/task drafts. The deterministic compiler does not
perform semantic extraction itself. Exact USER review/adoption, approved-edit
consumption and issued-order-to-mission-plan binding remain open.

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

## 16. Phase 15: Operational Skill Mission Lifecycle

Status: implemented as a repository-bound local controller and identical Codex/Claude skill entry points.

Goal:

- Make the correct doctrine workflow the easiest and machine-enforced path for real delegated agent work, instead of requiring an operator to assemble routers, receipts, preflights, context, evidence, reports, AARs, and campaigns manually.

Implemented controls:

- `MissionWavePlan` fixes intent, success/failure conditions, role and department assignments, delegated authority, optional model-preflight requirements, retained USER authority, finite validity, and adaptive budgets;
- `skill-mission-controller.js open` invokes the real router for one CoS receipt and every expected S3 receipt, recomputes preflight, checks optional integrated model dispatch, creates a target-limited bounded campaign, and emits digest-bound per-agent context packs only when ready;
- each context pack binds the doctrine revision, router/controller hashes, exact document bytes, task, operational role, model identity, validation commands, approvals, prohibitions, escalation conditions, and a false release grant;
- `report` requires the exact plan, preflight, context pack, complete expected-agent set, consistent status, valid time window, and manifest-backed work evidence while rejecting control metadata as work proof;
- `close` persists AAR and readiness evidence, queues ordinary findings into the bounded campaign, escalates retained decisions, requires another wave when work remains, and keeps release unauthorized;
- `status` and `verify` expose repository identity and manifest state without relying on chat history or local absolute paths;
- Codex and Claude wrappers resolve the same controller from symlink, copy-install marker, or `CANNAE_OS_HOME`;
- E2E fixtures operate independent temporary Git repositories and prove mandatory per-wave routing, idempotence, model binding, exact evidence, blocked closeout, and namespace isolation.

Completion criteria:

- No delegated context pack exists without one ready current-wave routing preflight containing every expected receipt.
- A model-required wave cannot open without one exact ready integrated dispatch row per agent and billet.
- A complete result cannot cite missing, cross-wave, cross-repository, or control-plane metadata as execution evidence.
- AAR improvement creates bounded next-wave work without claiming that work already ran.
- Scope, commit, push, merge, risk, policy, authority, and release remain human-controlled.
- Codex and Claude execute the same lifecycle and validation semantics.

See `skill-operational-mission-lifecycle.md` for operator commands, contracts, failure behavior, and limitations.

Lifecycle reconciliation now supports expired, aborted, and superseded wave
termination without a fabricated report/AAR. Exact USER scope decisions bind
early abort and replacement to retained plan digests. Settled dispatch and
immutable terminal records prevent reopening the old wave. Campaign-level stop,
terminal reconciliation and exact successor admission use separate contracts;
automatic replacement planning and external process termination remain open.
A wave terminal record does not imply them. Adaptive
wave and dispatch admission now reconstruct supervisor readiness, so a terminal
decision, pause, invalid lineage, exhausted budget, or unavailable trust admission
cannot be ignored through a new wave/session. This read-only guard does not
provide atomic campaign cancellation or replace the exact USER successor ceremony.
The same guard checks the creation-based wall-clock deadline independently of
reported progress, including idle campaigns and retained ready orders. Trusted
time, hard process deadlines, and pause-adjusted budgets remain external or
separately designed lifecycle work.

Wave, dispatch, gateway, and supervisor publications now repeat their readiness
checks under the artifact namespace lease after pending-journal recovery. This
closes the covered check/write gap against a preceding retained stop and keeps
settlement available. Supervisor exact order reuse is guarded too; signed
challenge publication rejects snapshot drift, concurrent issuance and expiry.
Explicit [USER stop intake](bounded-self-improvement-operations.md#210-explicit-user-stop-intake)
now persists a monotonic stop bound to its exact pre-publication manifest,
campaign and USER decision. The same-mission fence applies even to a new campaign
ID or non-adaptive wave; admitted results and revocation remain recordable.
The [terminal controller](campaign-terminal-reconciliation.md) records known-obligation
closure using exact historical replay and current inventory. The separate
[successor controller](campaign-successor-admission.md) now binds exact USER
consent, immutable partial publication, one-use stop sets and later-stop holds.
It never grants tool or release authority. Atomic multi-artifact settlement,
authenticated USER identity and external containment remain open.
See `repository-artifact-isolation-policy.md` for exact recovery ordering and
the unchanged cooperating-writer/shared-filesystem trust boundary.

Unknown post-tool effects are now projected from complete checkpoint history,
including legacy terminal lease rows. They block new repository authority and
wave termination instead of being erased by revocation. The separate
[hook settlement contract](tool-effect-settlement.md) now requires exact USER
scope judgement, historical/current verifier readiness and execution-bound
quorum before clearing one checkpoint. The failed lease still needs explicit
revocation. Gateway cleanup/transaction settlement and full campaign restart
remain open; this is not complete external-effect knowledge or USER authentication.

## 17. Phase 16: Enforced Dispatch And Resumable Orchestration

Status: implemented as a provider-neutral, manifest-backed local admission
controller with Codex and Claude Code hook adapters. Non-bypassable managed
deployment and a production tool gateway remain external.

Goal:

- Make a current route, exact context pack, short-lived per-agent lease, tool
  policy, provider identity, and serialized repository-state checkpoint
  prerequisites for every covered delegated tool call.

Implemented controls:

- a USER-authorized `MissionWavePlan` must preauthorize the canonical digest
  and exact agent/provider/policy identity of every policy draft;
- `authorize-policy` compiles the final `DispatchToolPolicy` only after
  reloading the exact persisted plan and context pack; a raw caller policy
  cannot issue a lease;
- `DispatchToolPolicy` is deny-by-default, exact-tool, input-constrained,
  plan-action-bound, budgeted, finite, repository-scoped, and release-inert;
- `AgentDispatchLease` binds one mission agent, provider session,
  provider-agent identity, plan, routing preflight, context pack, policy,
  repository identity, baseline state, nonce, request budget, and expiry;
- one initial lease lineage is permitted per repository/mission/wave/agent,
  repository-scoped issuance locks reject concurrent issuance or a second
  provider session under the same assignment, and every covered-tool agent uses
  ordered cross-agent handoff within one repository namespace;
- `dispatch-runtime-controller.js` reloads every authority-bearing object from
  the verified artifact manifest before admission;
- `ToolAdmissionEvent` binds each tool-use ID and canonical input digest to one
  allow or deny decision, and replay is rejected;
- `AgentExecutionCheckpoint` permits one in-flight tool per lease and advances
  the repository state only after a post-tool event matching the exact tool
  name and input digest records provider-result digest, status, and external
  effect disposition;
- read-only repository mutation, HEAD drift, external worktree drift,
  cross-agent/session/provider binding, expired or revoked authority, unresolved
  in-flight work, and obvious retained commands fail closed;
- resume lifecycle events never renew authority. They interrupt the old lease,
  and explicit resume issues a new nonce and baseline only from an exact
  interruption checkpoint;
- `dispatch-hook-adapter.js` preserves native provider permission checks on
  allow and emits provider-native structured deny on failure;
- `install-dispatch-hooks.js` merges project-local lifecycle hooks without
  replacing existing settings;
- mission `open` distinguishes context readiness from tool authority, and the
  report gate requires one settled lease lineage per dispatch-controlled agent;
- Codex and Claude skill wrappers invoke the same runtime and preserve
  `USER` final decision authority.

Completion criteria:

- A covered tool call without one exact active lease is denied.
- Two concurrent calls cannot advance one lease from the same checkpoint.
- A replayed tool-use ID, stale checkpoint, expired lease, revoked lease, wrong
  repository, wrong session, wrong agent, or wrong provider cannot execute.
- A resumed session cannot inherit the old lease.
- A complete agent result cannot enter the wave report until its lease lineage
  is completed and free of unresolved tool requests.
- An allow never bypasses native provider permissions and never grants release.
- Project-hook coverage and bypass limits are documented without representing
  local hooks as a complete security boundary.

See `enforced-dispatch-and-resume.md` for contracts, commands, provider
differences, deployment levels, failure behavior, and residual limits.

## 18. Phase 17A: Protected Tool Gateway Contract

Status: implemented as a provider-neutral, repository-manifest-backed contract
and reference controller. Production execution adapters and a non-bypassable
managed deployment remain Phase 17B.

Goal:

- Move exact identity, authority, repository-state, idempotency, execution, and
  recovery correlation to a durable gateway transaction boundary.

Implemented controls:

- `ToolGatewayRequest` binds one authenticated-principal projection and exact
  gateway deployment/configuration projection to the active dispatch lease,
  policy, checkpoint, repository identity/state, tool name, operation class,
  canonical input digest, validity, and idempotency key;
- raw tool input is supplied separately for digest verification and is not
  copied into request, decision, receipt, or event artifacts;
- trusted principal and gateway digests are required at admission and every
  state-changing continuation;
- the reference controller refuses `managed_exclusive` assurance because it
  cannot independently prove deployment exclusivity;
- Phase 16 dispatch admission remains cumulative and supplies the exact matched
  rule; operation-class substitution is cancelled and denied;
- `ToolGatewayDecision` records one exact allow or deny, dispatch admission,
  repository state, coordination observation, and retained USER authority;
- `ToolGatewayTransactionEvent` creates the append-only sequence `received ->
  authorized/denied -> executing -> committed/aborted/recovery_required`;
- `begin` creates the one current execution-event reference required for
  completion;
- `ToolExecutionReceipt` binds a committed result to the exact executor
  measurements and post-tool checkpoint, proves exact cancellation for
  `aborted`, or records unknown effects for `recovery_required`;
- one idempotency key maps to one canonical request; equivalent retries reload
  state, a reused transaction or changed request conflicts before write, and
  partial writes resume from retained admission/checkpoint/receipt evidence;
- the repository gateway transaction store is serialized for atomic
  transaction/idempotency uniqueness, and explicit recovery cancels an orphan
  allow admission or blocks its lease before denial;
- authorized but unstarted work can be cancelled only with the exact raw input;
  an unknown executing outcome blocks the dispatch lease and requires human
  reconciliation;
- all contracts keep production execution, production deployment verification,
  release, self-approval, and authority expansion false;
- Codex and Claude skills route to the same controller and recovery procedure.

Completion criteria:

- A principal, gateway, lease, policy, checkpoint, repository, input, operation
  class, idempotency, or execution-token substitution cannot commit.
- A retry cannot create a second execution for the same request.
- Raw input is absent from ordinary gateway audit artifacts.
- An unstarted authorization can be proven cancelled without leaving an
  unresolved dispatch admission.
- An executing call with no trustworthy result cannot be reported as success.
- The local controller cannot claim managed exclusivity or production
  deployment verification.

Phase 17B residuals after implemented 17B1, 17B2A, 17B2B, and the 17B2C1
production-admission contract:

- independently managed credential delivery, key custody, rotation, and
  revocation for mTLS, DPoP, and workload-OIDC adapters;
- provider-specific shell, filesystem, MCP, network, and delegation execution
  adapters beyond the OCI reference path;
- provider adapters and live infrastructure that produce independently managed
  host, runtime, image, key, configuration, and deployment evidence;
- installation-level exclusive routing and adversarial enforcement that remove
  direct side paths;
- a real external linearizable coordinator and storage-side fencing backend;
- multi-user permission, secret, incident, break-glass, and reconciliation
  operations;
- adversarial deployment tests proving that tools are unreachable when the
  gateway is unavailable.

See `protected-tool-gateway-contract.md` for contracts, commands, state
transitions, failure behavior, deployment requirements, and residual limits.

## 19. Phase 17B1: Authenticated Gateway Identity Admission

Status: implemented as a repository-manifest-backed authenticated-reference
adapter. Managed exclusivity, production execution, and release remain false.

Implemented controls:

- `GatewayIdentityPolicy` pins one repository and gateway projection,
  adapter code/runtime/configuration identifiers, Ed25519 signing key, TLS 1.3-only
  profile, server certificate, X.509 roots, exact agent/provider/SPIFFE
  principals, revocations, and bounded challenge/evidence lifetimes;
- `GatewayIdentityChallenge` binds one random 32-byte nonce to the exact
  transaction, mission, wave, agent, provider, provider session, gateway,
  repository, policy, issue time, and expiry under the adapter signature;
- the reference adapter observes the gateway-side `TLSSocket`, requires an
  authorized TLS 1.3 client, validates exactly one SPIFFE URI SAN and an
  ordered chain to one pinned root, records both endpoint certificate digests,
  and derives a 32-byte `EXPORTER-Channel-Binding` proof;
- `GatewayPrincipalEvidence` signs the exact TLS observation, principal and
  gateway projection digests, challenge/policy references, policy-pinned
  adapter identifiers, repository, session, and short validity window;
- `ToolGatewayRequest`, decision, and event v0.2 plus receipt v0.4 carry the
  same three immutable identity references;
- `authenticated_reference` admission derives the verified-principal digest
  from retained evidence rather than trusting a caller-provided digest;
- admission, begin, commit, and recovery revalidate signature, digest,
  certificate, policy, freshness, revocation, projection, one-use challenge,
  and cross-transaction replay state;
- `contract_reference` remains available with three exact none sentinels, while
  `managed_exclusive` remains denied.

Completion criteria:

- A real TLS 1.3 mutual-authentication handshake and matching client/server TLS
  exporter can authorize one exact dispatch-controlled transaction.
- A stale challenge/evidence, reused challenge, cross-transaction replay,
  revoked principal/certificate, wrong SPIFFE leaf, server-certificate drift,
  exporter substitution, or payload change with repaired digest cannot enter
  admission.
- Identity references cannot change between request, decision, events, and
  receipt.
- The adapter cannot claim an exclusive deployment, production execution,
  production deployment verification, or release.

After implemented Phase 17B2A, 17B2B, and the 17B2C1 contract, a real
production deployment still requires:

- provider-specific shell, filesystem, MCP, network, and delegation executors
  beyond the measured OCI reference path;
- independently protected sandbox host/runtime/image, adapter key,
  configuration, and deployment evidence;
- exclusive execution and egress routing that eliminate direct side paths;
- linearizable multi-host coordination and storage-side fencing;
- managed credential rotation, Workload API integration, incident,
  break-glass, reconciliation, and multi-user administration;
- adversarial deployment tests proving tools are unreachable when the gateway
  is unavailable.

See `gateway-identity-admission.md` for the exact trust boundaries, contracts,
operations, failure matrix, and residual limits.

## 20. Phase 17B2A: Protected Process Execution Adapter

Status: implemented as a repository-manifest-backed POSIX reference adapter.
It executes a policy-pinned local process but does not claim an OS/container
sandbox, network isolation, managed exclusivity, production execution, or
release authority.

Implemented controls:

- `ProtectedExecutorPolicy` binds one repository and trusted gateway
  projection to exact adapter/runtime measurements, an Ed25519 evidence key,
  explicit process/network control profiles, finite validity, and exact
  executable/argv/cwd/limit/effect rules;
- `ProtectedProcessToolInput` contains only one concrete policy reference and
  one rule ID, so caller-supplied command fragments, options, paths,
  environment, and stdin cannot enter after dispatch authorization;
- the adapter requires a canonical ELF or Mach-O executable with an exact file
  digest, appraises its path, format, and digest before gateway begin,
  immediately before spawn, and after process close, and requires a
  repository-contained cwd, a non-root POSIX parent, an empty environment, no
  runtime-inserted shell, no detached mode, no stdin, bounded output, and a
  finite timeout;
- a signed `ProtectedExecutionEnvelope` binds the exact transaction, request,
  decision, executing event, policy, input, rule, command, limits, controls,
  repository state, and expiry before process spawn;
- a signed `ProtectedExecutionObservation` binds the envelope to process exit,
  signal, termination reason, output accounting and hashes, result digest,
  before/after repository state, and ordered timestamps;
- `ToolExecutionReceipt` v0.4 carries exact policy, envelope, and observation
  references only for `bounded_process_reference`; other modes require exact
  none sentinels;
- the gateway independently reloads and verifies the complete evidence bundle
  before dispatch completion and rejects protected input paired with a
  caller-declared fixture or external result;
- a retained envelope is a no-rerun claim marker: any later crash or ambiguous
  continuation becomes `recovery_required`;
- a rule declaring no repository effect fails closed if the observed
  repository fingerprint changes;
- Codex and Claude skills route the same protected-executor workflow and expose
  equivalent wrappers.

Completion criteria:

- A real exact ELF or Mach-O executable and argv can commit once with signed pre/post
  evidence and an idempotent retry cannot execute it again.
- Rule, tool input, policy, executable digest, adapter/runtime, evidence,
  execution event, result, output, timestamp, or repository-effect substitution
  cannot commit.
- Timeout and output-limit termination are recorded as failed process results.
- A crash after the execution claim or process run cannot trigger automatic
  re-execution.
- Caller-declared external results cannot satisfy a protected process request.
- Every artifact and skill route remains indexed and both skill surfaces use
  the improved procedure.

## 21. Phase 17B2B: OCI Linux Sandbox Provider

Status: implemented as a Docker Engine reference provider. It executes one
policy-pinned static Linux target in a measured container, but does not claim
an independently trusted host/daemon, managed exclusivity, production
execution, deployment verification, or release authority.

Implemented controls:

- `OciLinuxSandboxPolicy` binds one repository and gateway projection to exact
  adapter, Docker CLI, static probe, immutable image ID, vendored seccomp
  profile, namespace, UID/GID, capability, filesystem, cgroup, network, target,
  limit, validity, and authority controls;
- `OciSandboxToolInput` contains one concrete policy reference and one rule ID;
  the acting agent cannot add a command, image, mount, environment, network,
  privilege, or Docker option after authorization;
- the live reference fixture builds a `FROM scratch` image containing only
  `/cannae-probe`; the provider uses an immutable image ID and `--pull never`
  but does not claim a complete image-filesystem inventory;
- before gateway begin and again immediately before execution create, the
  provider extracts `/cannae-probe` from an unstarted appraisal container,
  matches its byte digest to the measured host probe, and verifies cleanup;
- a signed `OciSandboxExecutionEnvelope` is retained before `docker create` and
  binds the exact image, target, probe command, Docker create-argv digest,
  daemon/runtime measurements, controls, repository state, and expiry;
- Docker inspect must preserve the exact entrypoint, command, user, fixed
  supervisor environment, read-only root, recursively read-only repository
  mount, constrained tmpfs, all capabilities dropped, `no_new_privileges`,
  exact seccomp JSON, private namespace modes, init, cgroup limits, and `none`
  network mode before start;
- the static probe directly reads `/proc/self/status`, namespace handles,
  mountinfo, cgroup v2 limits, interfaces, addresses, routes, and bounded
  outbound-connect behavior, performs root/workspace/tmp write tests, and
  supervises the exact target with an empty environment, bounded output, and
  timeout;
- the provider retains `OciSandboxProbeObservation`, verifies terminal Docker
  state, removes the container, verifies removal, and signs
  `OciSandboxExecutionObservation`;
- `ToolExecutionReceipt` v0.4 requires concrete policy, envelope, and
  observation references plus the exact probe digest for
  `oci_linux_sandbox_reference`; the signed observation carries the concrete
  probe reference;
- the gateway independently reloads and verifies the complete policy,
  envelope, probe, observation, result, repository, and transaction chain;
- an envelope remains the no-rerun claim marker. Recovery may contain and
  remove an existing container but cannot invoke the target again;
- live Docker fixtures compile the probe, build the scratch image without
  network access, and exercise success, replay, timeout, profile drift, image
  absence, image-probe substitution, caller-result injection, probe tampering,
  cleanup, and interrupted no-rerun recovery;
- Codex and Claude skills expose equivalent OCI wrappers and route the same
  doctrine and validation.

Completion criteria:

- One exact static Linux target commits once with signed pre-create and
  post-cleanup evidence, and replay cannot execute it again.
- Policy, rule, input, image, probe, seccomp, Docker configuration, kernel
  privilege, mount, cgroup, network, result, time, cleanup, or repository
  substitution cannot commit.
- Timeout and output limits become exact failed process results rather than
  fabricated success.
- A caller-declared fixture/external result cannot satisfy OCI sandbox input.
- A crash after the envelope or container run cannot trigger automatic
  re-execution.
- Every schema has valid and adversarial samples, runtime fixtures pass, route
  coverage is complete, and both skill surfaces use the improved procedure.

Phase 17B2C1 now supplies the provider-neutral policy, evidence, admission,
quorum, scope, and gateway/coordinator contract for these controls. The
following provider and operational implementations remain:

- independently protected provider key, policy, configuration, deployment,
  Docker daemon, runtime, host, and image provenance evidence;
- rootless/user-namespace and mandatory-access-control provider profiles;
- application-minimal seccomp generation and verification;
- network allowlist, DNS, proxy, and authenticated egress adapters beyond
  measured external IP egress denial under Docker `none` networking;
- provider-specific filesystem, MCP, network, and delegation adapters;
- linearizable multi-host coordination and storage-side fencing;
- secret brokering, managed rotation, incident, break-glass, reconciliation,
  and multi-user administration;
- adversarial deployment tests proving direct tool paths are unavailable when
  the gateway or sandbox is unavailable.

See `oci-linux-sandbox-provider.md` for contracts, operation sequence,
commands, gateway appraisal, direct observations, failure behavior, and
explicit residual limits.

## 22. Phase 17B2C1: Production Sandbox Admission

Status: provider-neutral admission contracts, validator, repository adapter,
gateway binding, external-coordinator interface, adversarial fixtures, and
Codex/Claude operator surfaces are implemented. Production infrastructure and
provider adapters are not bundled.

Goal:

- Permit `managed_exclusive` only when independent appraisers agree on one
  exact production deployment and the protected gateway proves current scope,
  identity, coordination, and fencing at every transition.

Implemented controls:

- `ProductionSandboxPolicy` pins one repository and managed gateway,
  a separate Ed25519 admission authority, at least two Ed25519 appraisers,
  exact SPIFFE workload identities, nine-dimensional failure-domain claims,
  quorum thresholds, one RATS/EAT profile, exact OCI executor policies, all
  required production controls, validity, USER authority, and release false;
- `ProductionSandboxEvidence` signs one fresh appraisal over Evidence,
  Attestation Result, Appraisal Policy, Reference Values, Endorsements,
  appraiser identity, repository/gateway, complete deployment layers, and
  exact execution scope;
- host, Docker runtime, immutable OCI manifest, in-toto/SLSA provenance,
  signature/transparency, credential custody, rootless/userns, MAC,
  application-minimal seccomp, read-only filesystem, network policy,
  external coordination, storage fencing, and exclusive-path claims are all
  mandatory;
- any shared provider, operator, control-plane, account, project, runner-pool,
  infrastructure, region, or zone identity creates a correlation edge, and
  transitive components form deterministic failure domains;
- `ProductionSandboxAdmission` recomputes signatures, trust, freshness,
  deployment consensus, scope, key diversity, and failure-domain quorum from
  exact repository-manifest references and is signed by the separate admission
  authority;
- `ToolGatewayRequest` v0.3, decision/event v0.3, and receipt v0.5 preserve one
  exact production admission and policy-fixed
  `oci_linux_sandbox_reference` mode;
- managed admission, begin, commit, and recovery reload and reverify the
  production bundle and require an external coordinator handle whose adapter,
  configuration, transaction, idempotency key, admission digest, revision,
  fencing token, lease, and expiry all match;
- a missing coordinator denies before dispatch authority is consumed, while
  terminal settlement records production deployment verification only after
  the managed checks pass;
- production admission never authorizes release.

Completion criteria:

- A different policy, evidence record, appraiser key, repository, gateway,
  deployment, OCI policy, execution mode, or repaired admission digest cannot
  authorize production.
- Correlated appraisers or appraisers that disagree on deployment cannot form
  quorum.
- Expired policy, identity, evidence, admission, coordinator, or request cannot
  continue.
- A missing, failed, or mismatched external coordinator denies managed
  execution.
- Reference and authenticated paths remain backward compatible and retain
  production false.
- Codex and Claude route and operate the same production procedure.
- Release remains false.

Provider boundary:

- a provider must still appraise original TPM/TEE or cloud evidence, operate
  the EAT/CMW profile and endorsement/reference-value services, secure keys,
  verify registry/SLSA/Sigstore material, harden the host/runtime, operate the
  coordinator and storage fencing, and prove direct side-path denial;
- the deterministic fixture coordinator is not a production backend;
- the standalone CLI intentionally cannot inject a production coordinator and
  therefore cannot enable managed execution by itself.

See `production-sandbox-admission.md`.

## 23. Phase 18: Exact GitHub Release Authorization

Status: exact public-repository authorization and receipt contracts,
dependency-free semantic validation, a `gh`/Git system adapter, offline
adversarial fixtures, and equivalent Codex/Claude operator wrappers are
implemented.

Goal:

- Convert one explicit human USER release decision into a short-lived,
  single-use terminal authorization for one exact GitHub release without
  widening any lower execution or assurance contract.

Implemented controls:

- `GitHubReleaseAuthorization` is the only pre-action artifact allowed to
  carry `release_authorized: true`;
- authorization version `0.2` introduced the repository immutable-releases
  prerequisite and records the observed policy state; Phase 19B supersedes
  new issuance with version `0.3`;
- it binds owner/repository, public visibility, default branch, write-level
  viewer permission, stable tag, release name, full commit SHA, previous latest
  release, tracked release-notes path/digest/length, successful exact
  `Validate` push run, clean origin-synchronized repository state, USER review,
  USER grant, expiry, and canonical self-digest;
- authorization requires the target tag and release to be absent, the version
  to advance, and the target commit to differ from the previous release;
- publication reappraises the repository, CI, notes, expiry, tag, and release
  state immediately before invoking GitHub;
- `gh release create` receives the exact full commit SHA, title, notes file,
  no-commit failure, and latest-release selection;
- terminal verification reloads the GitHub release, compares its body digest,
  resolves the remote tag commit, checks mode/latest/immutable status, and
  emits `GitHubReleaseReceipt`;
- retry against one byte-equivalent existing release is idempotent, while
  partial and mismatched states deny;
- mission, campaign, verifier, dispatch, gateway, executor, sandbox,
  production, and cycle-order artifacts remain release false; and
- both skills route, operate, and validate the same terminal procedure.

Completion criteria:

- A USER grant for repository A, tag A, commit A, notes A, and CI run A cannot
  authorize any B value.
- Dirty state, origin drift, untracked or changed notes, wrong/stale CI,
  insufficient permission, version regression, expiry, and existing partial
  state all deny.
- A published release is accepted only when the release body and resolved tag
  commit match the exact authorization.
- Publication consumes authority in a terminal receipt and never converts a
  lower control-plane artifact to release true.

Remaining hardening:

- cryptographic USER signatures and protected signing devices;
- signed or annotated release tags and provenance binding;
- GitHub environment/repository-rule evidence and credential isolation;
- independent transparency logging and witnessing;
- support for private repositories, prereleases, first releases, alternate
  workflow/check names, and provider-neutral release adapters.

See `github-release-authorization.md`.

## 24. Phase 19A: Repository Release Immutability

Status: official GitHub policy semantics, exact USER authorization and terminal
receipt contracts, a `gh`/Git system adapter, prospective future-release
enforcement, adversarial fixtures, and equivalent Codex/Claude wrappers are
implemented.

Goal:

- Activate the repository immutable-releases policy through one exact,
  short-lived USER policy decision and require immutable platform state for
  every future release authorization and receipt.

Implemented controls:

- `GitHubReleaseImmutabilityAuthorization` binds the exact public repository,
  equal origin, ADMIN permission, clean origin-synchronized default branch,
  successful exact `Validate` push run, policy endpoint/API/method, disabled
  prior state, enabled desired state, latest-release snapshot, USER grant,
  expiry, and canonical digest;
- `GitHubReleaseImmutabilityReceipt` records the consumed authorization,
  GET-before, optional PUT, actual HTTP 204, GET-after, verified enabled state,
  and unchanged historical-release immutability;
- activation performs one PUT, while an exact retry verifies the
  already-enabled state without another request;
- missing status evidence, state drift, failed post-action verification,
  retroactive historical-release mutation, and authority expansion deny;
- both policy artifacts retain `release_authorized: false`;
- `GitHubReleaseAuthorization` and `GitHubReleaseReceipt` version `0.2` or
  later require enabled policy at authorization/publication and observed
  immutable release state at terminal verification;
- historical version `0.1` release evidence remains readable but is not
  retroactively upgraded; and
- both skills route, operate, and validate the same policy procedure.

Completion criteria:

- A USER policy grant for repository A, commit A, run A, and endpoint A cannot
  authorize any B value.
- Only an authenticated repository ADMIN on a clean synchronized main commit
  with successful exact main CI may issue the activation authorization.
- Execution fails unless GitHub returns an observable HTTP 204 or the exact
  policy is already enabled for an idempotent retry.
- A terminal receipt requires a verified enabled GET response and records that
  the pre-existing `v0.2.0` release remains non-immutable.
- No policy artifact grants a release, and no version `0.2` or later release
  receipt is valid unless GitHub reports it immutable.

Remaining hardening:

- cryptographic USER signatures and protected signing devices;
- organization-owner enforcement and independent transparency witnessing;
- signed tags and credential isolation;
- provider-neutral repository-policy adapters; and
- an explicit, separately authorized disable/rollback contract if ever
  required.

See `github-release-immutability.md`.

## 25. Phase 19B: Release Attestation And Drift Monitoring

Status: tracked read-only policy, GitHub-signed release-attestation
normalization and retention, full and release-event observation contracts,
publisher version `0.3`, fail-closed drift monitoring, sanitized credential
diagnosis, scheduled CI, live credential-ready acceptance, offline
adversarial fixtures, and equivalent Codex/Claude wrappers are implemented.

Goal:

- Continuously verify that repository release immutability remains enabled and
  that every post-activation release is immutable and carries the exact
  GitHub-signed attestation for its repository, tag, commit, and uploaded
  assets.

Implemented controls:

- `GitHubReleaseIntegrityPolicy` binds the exact repository, Phase 19A
  activation receipt/commit/time, two grandfathered releases, expected policy
  endpoint, attestation profile, cadence, bounded retries, fail-closed
  behavior, USER authority, and release false;
- `GitHubReleaseIntegrityObservation` records exact repository state, trigger,
  policy result, releases, resolved tag commits, immutable classifications,
  complete normalized attestation evidence, issues, derived summary, and a
  canonical digest while keeping policy mutation and release false;
- policy status has explicit `verified`, `credential_unavailable`,
  `inspection_failed`, and `not_requested` states; an unavailable
  Administration-read credential cannot become a no-drift claim;
- credential failures distinguish sanitized HTTP 401 secret-value rejection
  from HTTP 403 permission/repository-selection denial without retaining the
  response body or token;
- `full` scope checks the live policy and all published releases, while
  `release_attestation` scope checks one exact release event and explicitly
  does not claim policy assessment;
- GitHub CLI must cryptographically verify the Sigstore bundle; Cannae then
  constrains the verified in-toto Statement v1, release/v0.2 predicate,
  GitHub signer identity, package URI, commit SHA-1, unique asset names and
  SHA-256 digests, and retains the complete raw JSON with its digest;
- publisher authorization and receipt version `0.3` bind this attestation
  profile and permit no terminal receipt until bounded verification succeeds;
- exact retry can finish delayed attestation verification for an already
  matching immutable release but cannot recreate, repair, retarget, or delete
  it;
- `.github/workflows/release-integrity.yml` verifies every release event,
  performs a six-hour full scan, retains observations, and fails the run on
  credential, policy, baseline, mutability, or attestation failure; and
- both skills route, operate, and validate the same read-only procedure.

Completion criteria:

- A valid GitHub attestation for repository, tag, or commit B cannot satisfy
  A.
- A mutable post-activation release, missing attestation, asset digest
  substitution, grandfather tag drift, or missing baseline release blocks.
- Policy disablement blocks, and inability to inspect policy state remains
  distinguishable from observed no drift.
- Release-event scope never claims policy assessment.
- Monitoring artifacts cannot authorize a repository policy change or a
  release.

Credential boundary:

- the release-attestation job can use the short-lived repository
  `GITHUB_TOKEN`;
- the immutable-policy GET requires repository Administration read permission;
- the full workflow accepts `CANNAE_IMMUTABILITY_MONITOR_TOKEN` from a
  repository-selected read-only monitoring identity and must not receive the
  owner's broad OAuth token;
- absent or insufficient credentials intentionally produce a failed run and a
  blocked retained observation.

Live credential acceptance:

- manual first-attempt run `30522252521` at
  `1ce41636998742f65096ad1e0b4273ce3b359e42` retained artifact
  `8751232448` with API-matching ZIP digest
  `sha256:ea704b6e4c608b807e0b1dddc7cc3aa32e5cae7994a3f67c248b932b4dfe2a57`;
- the exact three-file observation replayed as `ready`, policy verified and
  enabled, zero issues, and ordinary sequence 13 to 14 provider continuity;
  and
- reset and release authorization remained false.

Remaining hardening:

- short-lived GitHub App credential minting and automated rotation;
- signed tags and protected USER signing devices;
- long-term transparency storage, independent witnesses, and cross-provider
  monitoring;
- automatic monitor-liveness supervision outside GitHub Actions; and
- private repository, prerelease, first-release, and provider-neutral
  profiles.

See `github-release-integrity-monitoring.md`.

## 26. Phase 19C: Independent Retained-Bundle Verification

Status: pinned GitHub TUF bootstrap, complete retained root/metadata chain,
offline TUF replay, pinned Sigstore JavaScript verification, CLI-to-signed
statement cross-check, real public fixtures, publisher v0.4, monitor v0.2,
scheduled acquisition, and equivalent Codex/Claude wrappers are implemented.

Goal:

- Verify the exact retained release bundle and trust material without treating
  the GitHub CLI conclusion or a recomputable wrapper digest as sufficient.

Implemented controls:

- `GitHubReleaseTrustedRoot` retains root v1 through the current GitHub root,
  timestamp, snapshot, targets, exact `trusted_root.json` target bytes,
  metadata projections, normalized trust material, and release false;
- offline replay verifies root v1 self-threshold, every old/new root
  transition, exact sequential versions, current metadata signatures and
  expiry against an explicit caller clock, snapshot/targets links, target
  length/hash, and normalized target equality;
- `GitHubReleaseIndependentVerification` uses pinned
  `@sigstore/verify 4.1.0`, records verifier-module and lockfile digests, and
  binds the exact trusted root, certificate, RFC 3161 timestamp, DSSE payload,
  repository, tag, commit, package URI, assets, and raw CLI result;
- the signed DSSE statement must equal the GitHub CLI projection;
- publisher authorization/receipt v0.4 requires and embeds the trusted root
  and independently replayed evidence before a terminal receipt; active
  publication rejects legacy authorization versions and preflights root
  freshness through authorization expiry before creating a release;
- integrity policy/observation v0.2 refreshes one root per run, independently
  verifies each required release, and retains TUF acquisition failure as a
  blocked schema-valid observation;
- successful publisher and monitor fixtures use a real public
  `cli/cli v2.93.0` bundle instead of a fake signature; and
- root and independent evidence remain monitoring-only with USER final
  authority and release false.

Completion criteria:

- Omitting a root version or changing signed root/targets data fails even
  after wrapper digests are recomputed.
- Changing the DSSE payload fails cryptographic verification.
- Changing only the CLI statement fails the signed-statement cross-check.
- A valid bundle for repository, tag, or commit B cannot satisfy A.
- Missing, stale, or invalid TUF evidence blocks publication receipts and
  monitor readiness.
- Missing evaluation time, signed metadata expiry within wrapper age, a root
  that expires inside the operation window, or a legacy authorization blocks
  before publication.
- Independent evidence cannot be converted into release authority.

Remaining hardening:

- independently operated verification infrastructure and failure domains;
- independently durable prior TUF state for cross-provider rollback detection;
- external long-term bundle/root archives, witnesses, and gossip;
- protected USER signing devices and signed tags;
- short-lived GitHub App monitoring credentials; and
- private, prerelease, first-release, and provider-neutral profiles.

See `github-release-independent-verification.md`.

## 27. Phase 19D: Monotonic Trust Checkpoint Continuity

Status: USER-authorized genesis, monotonic checkpoint contract, bounded
GitHub Actions artifact store, publisher v0.5, monitor v0.3, push/scheduled
acquisition, adversarial fixtures, and equivalent Codex/Claude operating
rules are implemented.

Goal:

- Detect a validly signed rollback, same-version equivocation, predecessor
  fork, or retained-state substitution by comparing every GitHub TUF refresh
  with the exact state previously accepted.

Implemented controls:

- `GitHubReleaseTrustCheckpoint` retains sequence, predecessor, repository,
  TUF role versions/digests/expiries, trusted-root and target digests,
  retrieval/evaluation times, transition result, producer, and release false;
- genesis requires one explicit USER grant, while runtime reset authority is
  fixed false;
- every transition rejects version rollback, same-version digest conflict,
  missing prior root-chain bytes, target/root conflict, backdated retrieval,
  stale state, sequence gaps, and predecessor substitution;
- `github-release-checkpoint-store.js` selects only the latest completed
  default-branch run by stable run number whose commit contains the exact
  current policy, verifies status/branch/artifact ID/digest/expiry/run/head
  bindings, reads only bounded uniquely named observation/root/checkpoint
  files, and checks exact workflow producer identity;
- reruns consume only the exact immediately prior attempt of the same stable
  run, while a historical rerun after any newer eligible run is rejected as a
  fork;
- a missing latest eligible artifact never falls back to an older artifact or
  repository bootstrap;
- repository bootstrap exists only for four hours after the first
  `trust_checkpoint_policy` introduction commit; ordinary policy edits cannot
  reopen it;
- integrity policy/observation v0.3 retain predecessor provenance, prior
  checkpoint/root, deterministic current checkpoint, and explicit blocked
  failures;
- publisher authorization/receipt v0.5 accepts only the latest non-genesis
  successful `ready` full-monitor artifact, replays its observation, binds its
  exact checkpoint/root and artifact lineage into the USER grant, resolves
  that lineage again, and rechecks mutable authorization/repository/policy
  state before any release creation;
- the validator enforces used JSON Schema combinators, nested
  `additionalProperties: false`, positional items, conditional requirements,
  and contained-item requirements as blocking errors; and
- the workflow retains observation, root, and checkpoint together every six
  hours, on every `main` push, and on default-branch manual runs; release
  events use the separate attestation job. Both jobs require exact
  default-branch workflow identity, immutable `workflow_sha`, full-SHA action
  pins, and Actions read permission.

Completion criteria:

- Authenticated prior higher versions make a lower current version fail.
- Equal versions with different signed digests fail as equivocation.
- Root-chain discontinuity, retrieval-time rollback, sequence forks, and
  rehashed predecessor substitutions fail.
- Missing latest artifacts do not select older or bootstrap state.
- Historical reruns cannot branch from an older run, and valid reruns consume
  only their exact prior attempt.
- Ordinary policy edits do not reauthorize bootstrap.
- Missing, stale, schema-invalid, local, genesis, path-substituted,
  superseded, or otherwise valid but unauthorized checkpoints block before
  any release creation call.
- Missing, blocked, forged, or root/checkpoint-mismatched full observations,
  off-default or incomplete reruns, expiry during resolution, and
  immutable-policy drift block before release creation.
- A post-create verification retry never creates a second release and can
  reconcile only the exact immutable release published inside the original
  authorization window under currently fresh trust evidence.
- Checkpoint, policy, root, and observation artifacts cannot claim release or
  reset authority.

Remaining hardening:

- independently operated durable checkpoint storage and witnesses;
- cross-provider monitor liveness and gossip;
- a separately designed exact USER-authorized incident reset contract;
- protected USER signatures and trusted time;
- short-lived GitHub App monitoring credentials; and
- private, prerelease, first-release, and provider-neutral profiles.

See `github-release-trust-checkpoint-continuity.md`.

## 28. Phase 19E: Initial Bootstrap Recovery

Status: one-time USER recovery contract, exact failed-artifact replay,
current-run admission, schema/semantic validation, operating wrapper,
adversarial fixtures, and live sequence-zero to sequence-two provider
continuity are implemented.

Goal:

- Recover only the first provider checkpoint transition when initial runs
  retained complete blocked observations and trusted roots but emitted no
  checkpoint, without turning missing evidence into fallback or reset
  authority.

Implemented controls:

- `GitHubReleaseBootstrapRecovery` binds the original policy introduction,
  exact current policy bytes, fresh committed sequence-zero checkpoint/root,
  every policy-matching failed run and artifact, every blocked observation,
  one USER grant, and a maximum 60-minute validity inside the original
  four-hour bootstrap window;
- the provider store proves complete bounded run history and accepts only
  first-attempt failed artifacts containing exactly observation and root;
- each observation is schema-validated and semantically replayed against the
  exact policy, repository, default branch, run, artifact metadata, and root;
- only stale-genesis or missing-checkpoint archive failure is recoverable,
  with credential unavailability as the sole optional second issue;
- the consumer must be the newest in-progress attempt-one workflow run at
  exact current `HEAD`;
- successful runs, complete checkpoints, missing/deleted artifacts, unknown
  issues, reruns, history truncation, expiry, and substitutions fail closed;
- accepted provenance advances the ordinary deterministic sequence from zero
  to one and never authorizes checkpoint reset or release; and
- Codex and Claude expose the same evidence-derived authorization command and
  operating rules.

Completion criteria:

- Exact retained initial failure evidence and one current USER contract admit
  sequence-zero consumption once.
- Omitted runs, altered authority, expired validity, offline consumers,
  additional archive members, and unknown issues fail.
- A complete provider checkpoint always uses normal lineage and never invokes
  recovery.
- Recovery provenance is schema-valid and replayable in the sequence-one full
  observation.
- Monitoring can remain blocked for a separate credential issue; release
  authorization still requires a later successful `ready` provider artifact.

Live acceptance evidence:

- push run `30338646806` used
  `repository_bootstrap_recovery` to produce
  `GRTC-1-2c648122261b` from the committed sequence-zero genesis;
- separate manual run `30338779941` used the retained run `30338646806`
  artifact through normal `github_actions_artifact` provenance to produce
  `GRTC-2-f4f90a807d04`; and
- both exact three-file observations replayed successfully, kept reset and
  release false, and remained blocked only on the independently missing
  Administration-read monitor credential.

The later Phase 19B credential-acceptance run `30522252521` consumed the
ordinary sequence-13 provider predecessor, advanced to sequence 14, and
reported a ready enabled-policy observation with zero issues. This closes the
deployment credential gap without changing the Phase 19E recovery boundary.

Remaining hardening:

- dedicated short-lived Administration-read monitor credentials;
- external durable checkpoint storage and independent witnesses;
- protected USER signatures and trusted time; and
- a separately designed incident reset contract for established lineage.

See `github-release-trust-checkpoint-continuity.md`.

## 29. Release Gates

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
| G20 | A delegated skill wave has one generated CoS receipt, every expected S3 receipt, ready routing/model admission, digest-bound context packs, repository-manifest evidence, report/AAR closeout, bounded next-wave disposition, and no AI release authority |
| G21 | Every covered delegated tool call has one active per-agent lease compiled from an exact USER-plan-authorized draft digest, exact policy/context/checkpoint binding, replay-safe serialized admission, and a result-bound post-tool state checkpoint; one settled lineage is required before reporting, resume requires explicit continuation, and release remains false |
| G22 | Every Phase 17A gateway commit has an exact trusted principal/gateway binding, current dispatch and repository bindings, one canonical idempotent request, one current execution token, one result-bound receipt and append-only terminal event; cancellation or unknown-outcome recovery fails closed, while production and release claims remain false |
| G23 | Every Phase 17B1 authenticated-reference gateway transition reloads one exact manifest-backed policy/challenge/evidence chain and validates its signatures, freshness, TLS 1.3 SPIFFE certificate path, exporter-bound principal projection, revocation, one-use state and immutable downstream references without claiming managed exclusivity, production, or release |
| G24 | Every Phase 17B2A protected process commit reloads one exact manifest-backed policy/envelope/observation chain, verifies signatures and complete command/result/repository bindings, and proves one policy-pinned native execution with no runtime-inserted shell or automatic rerun while explicitly denying sandbox, network, production, exclusivity, and release claims |
| G25 | Every Phase 17B2B OCI sandbox commit reloads one exact policy/envelope/probe/observation chain, verifies image, probe, seccomp, Docker configuration, directly observed kernel privilege/mount/cgroup/network state, terminal result, repository immutability, cleanup, and no-rerun recovery while denying independent host trust, production, exclusivity, and release claims |
| G26 | Every Phase 17B2C1 managed transition reloads one exact production policy/evidence/admission chain, recomputes trusted independent deployment consensus and OCI scope, and holds a matching live external revision/fencing lease; production may be true only for that deployment and release remains false |
| G27 | A GitHub release may carry release true only through one explicit USER-granted, unexpired authorization bound to the exact public repository, advancing stable tag, full main commit, successful exact Validate push run, tracked notes digest, clean origin state, absent target, and terminal verified tag/release receipt |
| G28 | Repository release immutability may be enabled only through one explicit USER-granted, unexpired ADMIN authorization bound to the exact public repository, origin-synchronized main commit, successful exact Validate push run, policy endpoint and prior state; future release authorization and receipt require enabled policy and observed immutable release state while policy artifacts retain release false |
| G29 | Every Phase 19B full observation binds the tracked activation baseline to a live Administration-read enabled policy and every published tag; each post-activation release must be immutable and carry a GitHub-verified exact repository/tag/commit/asset attestation, credential uncertainty remains blocked, and monitoring retains policy mutation and release false |
| G30 | Every Phase 19C publisher receipt or ready integrity observation replays the complete pinned GitHub TUF chain and target against an explicit clock, independently verifies the retained Sigstore bundle and exact signed release statement, cross-checks the CLI projection, retains verifier/root digests, and leaves all verification evidence release false; active publication accepts only v0.4 and preflights TUF validity through authorization expiry before external mutation |
| G31 | Every Phase 19D ready observation and active v0.5 release operation consumes one fresh exact predecessor lineage, rejects rollback, same-version conflict, root discontinuity, retrieval rollback, sequence fork, artifact or producer substitution, and missing latest retention without fallback; USER remains final authority while checkpoint reset and all nonterminal release claims remain false |
| G32 | Phase 19E may consume sequence zero only from one unexpired USER contract that exactly enumerates every retained policy-matching initial failure artifact, proves each two-file observation/root pair and the newest in-progress current run, and leaves checkpoint reset and release false |

## 30. Related Documents

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
- `production-sandbox-admission.md`
- `github-release-trust-checkpoint-continuity.md`
- `gitlab-ci-native-verifier-adapter.md`
- `skill-operational-mission-lifecycle.md`
- `enforced-dispatch-and-resume.md`
- `protected-tool-gateway-contract.md`
- `gateway-identity-admission.md`
- `protected-process-execution.md`
- `oci-linux-sandbox-provider.md`
- `github-release-authorization.md`
- `github-release-immutability.md`
- `github-release-integrity-monitoring.md`
- `github-release-independent-verification.md`
