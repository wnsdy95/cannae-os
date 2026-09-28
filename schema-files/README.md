# Schema Files

This directory contains JSON Schema contracts for the military-style LLM runtime.

`GitHubReleaseIndependentVerification` v0.2 pairs with verifier 4.1.2; v0.1
retains its exact 4.1.0 producer contract for historical reads. The schema rejects
cross-version producer substitution. Full admission additionally requires a
recognized exact producer tuple and current-engine cryptographic replay with
the original raw bundle and retained trust root. The new current/legacy samples
are test wrappers around public signed material, not release authority or proof
that the historical runtime executed.

`implementation-candidate-registry.schema.json` defines the source-bound
engineering inventory: unique candidate identities, reviewed implementation
mappings, acceptance checks, and residual work. Its valid/invalid samples are
contract examples, not full-corpus audit inputs. Audit the canonical
`docs/implementation-candidate-registry.json` with
`node implementation-candidate-registry.js audit`; validation never grants
execution or release authority.

The schemas are intentionally small and composable. They define the minimum state objects required to implement:

- mission intake
- OPORD tasking
- agent registry
- tool-use ROE checks
- approval requests
- authority matrix rules
- decision packets
- working group charters
- AI special operations TF charters
- department collaboration charters
- force structure change orders
- model force assignment plans
- model registries and assignment requests
- integrated mission preflight manifests
- model usage events
- repository artifact manifests
- bounded self-improvement campaigns, checkpoints, decisions, and finite cycle orders
- verifier trust policies, workload identity evidence, verifier runtime policies, execution evidence, signed verification attestations, and signed comparative evaluation reports
- CCIR alerts
- handoff packets
- continuity plans
- context items
- document access manifests
- doctrine consistency reviews
- release reviews
- release gate decision events
- exact GitHub release authorizations and terminal receipts
- GitHub release-immutability policy authorizations and terminal receipts
- maintenance readiness reports
- backbriefs
- rehearsals
- OPORD annexes
- FRAGO scope changes
- information reports
- intelligence assessments
- scoped approvals
- approval consumption events
- approval revocation events
- approval renewal events
- approval delegation events
- approval delegation revocation events
- risk acceptance records
- AAR readiness updates
- SITREP / FRAGO / AAR event logs
- evidence records
- readiness ledger entries
- routing receipts
- operational mission wave plans, per-agent context packs, wave reports, and closeouts
- deny-by-default dispatch tool policies, short-lived agent leases, tool admission events, and resumable execution checkpoints
- protected tool gateway requests, decisions, execution receipts, append-only transaction events, authenticated gateway identity evidence, and production sandbox admission
- WARNO warning orders and source-plan annexes
- board decisions, battle-rhythm event definitions, and battle-rhythm scheduler proposals
- agent METLs, readiness change events, and resource status watches
- decision-log entries and knowledge source records
- classification labels, releasability reviews, EEFI alerts, and context release decisions

Recommended validation order:

1. `mission.schema.json`
2. `agent.schema.json`
3. `opord.schema.json`
4. `task-order.schema.json`
5. `tool-request.schema.json`
6. `approval-request.schema.json`
7. `authority-matrix.schema.json`
8. `decision-packet.schema.json`
9. `working-group.schema.json`
10. `sof-tf-charter.schema.json`
11. `department-collaboration-charter.schema.json`
12. `force-structure-change-order.schema.json`
13. `model-force-assignment-plan.schema.json`
14. `model-registry.schema.json`
15. `model-assignment-request.schema.json`
16. `integrated-mission-preflight.schema.json`
17. `model-usage-event.schema.json`
18. `ccir-alert.schema.json`
19. `handoff-packet.schema.json`
20. `continuity-plan.schema.json`
21. `context-item.schema.json`
22. `document-access-manifest.schema.json`
23. `doctrine-consistency-review.schema.json`
24. `release-review.schema.json`
25. `release-gate-decision-event.schema.json`
26. `maintenance-readiness.schema.json`
27. `backbrief.schema.json`
28. `rehearsal.schema.json`
29. `annex.schema.json`
30. `frago-scope-change.schema.json`
31. `information-report.schema.json`
32. `intelligence-assessment.schema.json`
33. `approval-scope.schema.json`
34. `approval-consumption-event.schema.json`
35. `approval-revocation-event.schema.json`
36. `approval-renewal-event.schema.json`
37. `approval-delegation-event.schema.json`
38. `approval-delegation-revocation-event.schema.json`
39. `risk-acceptance.schema.json`
40. `aar-readiness-update.schema.json`
41. `sitrep.schema.json`
42. `frago.schema.json`
43. `evidence.schema.json`
44. `aar.schema.json`
45. `readiness-ledger.schema.json`
46. `routing-receipt.schema.json`
47. `repository-artifact-manifest.schema.json`
48. `self-improvement-campaign.schema.json`
49. `self-improvement-checkpoint.schema.json`
50. `self-improvement-decision.schema.json`
51. `self-improvement-cycle-order.schema.json`
52. `verification-plan.schema.json`
53. `verification-receipt.schema.json`
54. `verifier-trust-policy.schema.json`
55. `verifier-identity-evidence.schema.json`
56. `sigstore-trusted-root.schema.json`
57. `sigstore-verifier-identity-evidence.schema.json`
58. `verification-attestation.schema.json`
59. `comparative-evaluation-set.schema.json`
60. `comparative-evaluation-plan.schema.json`
61. `comparative-evaluation-report.schema.json`
62. `comparative-evaluation-attestation.schema.json`
63. `verifier-runtime-policy.schema.json`
64. `verifier-execution-evidence.schema.json`
65. `verifier-challenge-set.schema.json`
66. `transparency-policy.schema.json`
67. `transparency-observation.schema.json`
68. `trust-root-rotation.schema.json`
69. `transparency-incident.schema.json`
70. `transparency-state.schema.json`
71. `github-actions-oidc-trust-bundle.schema.json`
72. `github-actions-oidc-evidence.schema.json`
73. `gitlab-ci-oidc-trust-bundle.schema.json`
74. `gitlab-ci-oidc-evidence.schema.json`
75. `mission-wave-plan.schema.json`
76. `agent-context-pack.schema.json`
77. `mission-wave-report.schema.json`
78. `mission-wave-closeout.schema.json`
79. `dispatch-tool-policy.schema.json`
80. `agent-dispatch-lease.schema.json`
81. `tool-admission-event.schema.json`
82. `agent-execution-checkpoint.schema.json`
83. `tool-gateway-request.schema.json`
84. `tool-gateway-decision.schema.json`
85. `tool-execution-receipt.schema.json`
86. `tool-gateway-transaction-event.schema.json`
87. `gateway-identity-policy.schema.json`
88. `gateway-identity-challenge.schema.json`
89. `gateway-principal-evidence.schema.json`
90. `protected-executor-policy.schema.json`
91. `protected-process-tool-input.schema.json`
92. `protected-execution-envelope.schema.json`
93. `protected-execution-observation.schema.json`
94. `oci-linux-sandbox-policy.schema.json`
95. `oci-sandbox-tool-input.schema.json`
96. `oci-sandbox-execution-envelope.schema.json`
97. `oci-sandbox-probe-observation.schema.json`
98. `oci-sandbox-execution-observation.schema.json`
99. `production-sandbox-policy.schema.json`
100. `production-sandbox-evidence.schema.json`
101. `production-sandbox-admission.schema.json`
102. `github-release-authorization.schema.json`
103. `github-release-receipt.schema.json`
104. `github-release-immutability-authorization.schema.json`
105. `github-release-immutability-receipt.schema.json`
106. `github-release-integrity-policy.schema.json`
107. `github-release-integrity-observation.schema.json`
108. `github-release-trusted-root.schema.json`
109. `github-release-independent-verification.schema.json`
110. `github-release-trust-checkpoint.schema.json`
111. `github-release-bootstrap-recovery.schema.json`
112. `warno.schema.json`
113. `board-decision.schema.json`
114. `battle-rhythm-event.schema.json`
115. `battle-rhythm-scheduler.schema.json`
116. `agent-metl.schema.json`
117. `readiness-event.schema.json`
118. `source-plan.schema.json`
119. `context-release.schema.json`
120. `resource-status.schema.json`
121. `decision-log.schema.json`
122. `source-record.schema.json`
123. `classification-label.schema.json`
124. `releasability-review.schema.json`
125. `eefi-alert.schema.json`
126. `control-execution-receipt.schema.json`
127. `mission-wave-termination-request.schema.json`
128. `mission-wave-termination.schema.json`
129. `tool-effect-scope.schema.json`
130. `tool-effect-review.schema.json`
131. `tool-effect-settlement-request.schema.json`
132. `tool-effect-settlement.schema.json`

All schemas target JSON Schema draft 2020-12.

`ToolEffectScope` v0.1 binds one unknown invocation to a finite resource scope,
exact observations, check IDs, and repository state. `ToolEffectReview` v0.1
records evidence-binding checks, not settlement or approval. Its six authority
and assurance booleans remain false, including when `status` is `evidence_bound`.
See [Tool Effect Review](../docs/tool-effect-review.md) before using either.

`ToolEffectSettlementRequest` v0.1 binds exact review, inspection campaign/order,
attestations and USER decision. `ToolEffectSettlement` v0.1 binds that request's
canonical digest, the consumed invocation, proof projection, historical manifest
and admission window. It clears only that hook outcome; execution, release and
cryptographic USER authentication remain false. Schema validity alone is not
admission. Use the controller in [Tool Effect Settlement](../docs/tool-effect-settlement.md).

`GitHubReleaseTrustedRoot` retains the complete pinned GitHub TUF
root/metadata/target chain for offline replay. `GitHubReleaseIndependentVerification`
binds pinned Sigstore verifier code and dependencies to the exact retained
release bundle, trusted root, signer, timestamp, repository, tag, commit,
package, assets, and GitHub CLI cross-check while keeping release false.
`GitHubReleaseTrustCheckpoint` binds one USER genesis or exact predecessor to
monotonic TUF role versions/digests, root and target digests, retrieval time,
producer, and sequence while keeping checkpoint reset and release false.
`GitHubReleaseBootstrapRecovery` binds one short-lived USER decision to the
original checkpoint-policy introduction, exact current policy bytes, fresh
sequence-zero checkpoint/root, and every retained policy-matching initial
failure artifact. It can authorize only one monitoring bootstrap and keeps
checkpoint reset and release false.

`VerifierTrustPolicy.verifiers[].allowed_attestation_types` can purpose-limit a key to `verification_receipt`, `comparative_evaluation_report`, or both. Comparative signing requires the explicit report grant; existing receipt-only policies may omit the field for v0.3 compatibility.

`VerifierTrustPolicy` v0.2 pins SPIFFE IDs, X.509 roots, transparency-log identities, and log keys. `VerifierIdentityEvidence` binds one short-lived SVID and the verifier's static key to the same repository/policy/purpose statement, then supplies a signed checkpoint and Merkle inclusion path.

`VerifierTrustPolicy` v0.3 can instead select a native `sigstore_bundle` identity. `SigstoreTrustedRoot` records normalized official trust material and its source/freshness metadata. `SigstoreVerifierIdentityEvidence` binds the exact certificate identity, issuer, root digest, repository and purpose statement under both the native Fulcio/Rekor bundle and the verifier's static key.

`VerifierTrustPolicy` v0.4 binds one exact `VerifierRuntimePolicy`. The runtime policy assigns each verifier to a provider profile that pins builder identity, code, OCI manifest, dependency lockfile, harness, argv, tool allowlist, network policy, sandbox profile and time bounds. `VerifierExecutionEvidence` binds those fields to the exact repository state and verification target in a dual-signed in-toto Statement. `VerificationAttestation` and `ComparativeEvaluationAttestation` v0.2 cite that evidence by exact manifest reference; v0.1 remains readable under earlier trust-policy versions.

`VerifierTrustPolicy` v0.5 adds required pre-dispatch challenge assurance and pins a dedicated Ed25519 supervisor issuer key. A signed `VerifierChallengeSet` binds unique per-verifier nonces to the exact campaign, repository, policy/runtime references, projected cycle/attempt/task/lineage, observed manifest and deadline. Existing dual-signed workload identity evidence carries the exact nonce response.

`VerifierTrustPolicy` v0.6 adds required failure-domain assurance. `VerifierRuntimePolicy` v0.2 records provider, operator, control-plane, account, project, runner-pool, infrastructure, region, and zone identities. Any shared required component places verifiers in one transitive computed domain. `VerifierExecutionEvidence` v0.2 binds the observed identity under builder and verifier signatures.

`VerifierTrustPolicy` v0.7 adds continuous transparency assurance. It binds one exact `TransparencyPolicy`, state stream, and maximum age. `TransparencyObservation` records signed checkpoint consistency plus independent witness/monitor approval, `TrustRootRotation` verifies sequential dual-threshold TUF roots, `TransparencyIncident` preserves USER-controlled incident and revocation history, and `TransparencyState` reconstructs their append-only repository-bound projection while retaining current TUF expiry.

`VerifierRuntimePolicy` v0.3 adds strict native OIDC profiles for GitHub Actions and GitLab CI. Their provider-specific trust bundles pin normalized `RS256` JWKS material and freshness; native evidence preserves the exact signed token and conservative provider/failure-domain projection. `VerifierExecutionEvidence` v0.3 signs the native-evidence reference, and nested artifacts must be reloaded from the repository manifest before quorum evaluation.

`SelfImprovementCycleOrder` v0.4 extends supervisor-derived `trust_policy_admission` with provider-neutral authenticated workload evidence. v0.5 adds exact challenge-set and response-evidence references, responder counts, blocking codes and a validity boundary capped at challenge expiry. v0.6 adds deterministic failure-domain bindings and graph reconstruction. v0.7 adds exact transparency policy/state references, sequence, freshness, observer/incident counts, and a transparency-bounded validity window. Earlier orders remain readable.

`MissionWavePlan` is the operational skill entry contract. It preserves USER final authority, requires routing and repository evidence on every wave, optionally binds a ready integrated model preflight, and can bind exact per-agent dispatch-policy draft digests before context issuance. `AgentContextPack` carries controller-compiled required controls. `ControlExecutionReceipt` v0.2 binds each shell-free execution to exact mission, wave, canonical report input, context, command, repository, and doctrine states while retaining only output digests and byte counts. `MissionWaveReport` cites controller-selected receipt references, and `MissionWaveCloseout` carries the verified chain through AAR learning and the next-wave queue without granting release.

`GitHubReleaseAuthorization` is the only pre-action terminal contract allowed
to carry `release_authorized: true`. It binds one explicit USER grant to the
exact public repository, stable tag, full commit, previous release, tracked
notes digest, successful default-branch `Validate` push run, clean repository
state, enabled release-immutability policy, GitHub attestation and independent
verification profiles, exact fresh trust checkpoint/root pair for version
`0.5`, the exact successful ready full-observation/root/checkpoint artifact
triplet that supplied that pair, and short
expiry. `GitHubReleaseReceipt` records exact
publication, tag verification, observed immutable state, complete normalized
GitHub-signed attestation evidence, independent bundle replay, full trust
checkpoint/root evidence, and authorization consumption. No lower
control-plane contract inherits that value.

`GitHubReleaseImmutabilityAuthorization` separately binds one USER-approved
repository ADMIN action to the exact immutable-releases endpoint, disabled
prior state, clean origin-synchronized main commit, successful `Validate` push
run, historical latest-release snapshot, and bounded validity.
`GitHubReleaseImmutabilityReceipt` records one verified activation or
already-enabled idempotent retry while keeping `release_authorized: false`.

`GitHubReleaseIntegrityPolicy` seals the Phase 19A activation baseline,
expected enabled state, grandfathered releases, attestation profile, cadence,
bounded retry, monotonic checkpoint-store policy for version `0.3`, and
the exact retained observation/root/checkpoint filenames with fail-closed
behavior. `GitHubReleaseIntegrityObservation`
retains the exact committed policy-blob digest, current default-branch state,
live policy status, explicit credential uncertainty, every selected resolved
release, immutable classification, complete verified attestation evidence,
prior/current checkpoint lineage, derived issues and a canonical digest. Both
contracts are read-only: repository-policy mutation, checkpoint reset, and
release remain false.

`DispatchToolPolicy` v0.2 must be controller-compiled from a policy-draft digest already authorized by the exact USER-authored mission plan. Each rule binds one allowed mission action, exact provider tool, operation class, matcher input, repository-state control, and finite budget under default deny; project-hook policies cannot authorize network or delegation classes. `AgentDispatchLease` binds that policy to one provider session, repository identity/state, context chain, nonce, and validity window. `ToolAdmissionEvent` records each pre-tool allow or deny decision, while `AgentExecutionCheckpoint` v0.2 maintains the serial state chain, exact provider-result digest, and unresolved-effect disposition. All four retain `USER` final authority and keep release unauthorized.

`ToolGatewayRequest` v0.2 binds an externally authenticated principal and exact gateway configuration to the active Phase 16 lease, policy, checkpoint, repository state, canonical tool-input digest, validity window, idempotency key, and three immutable identity references without retaining raw input. v0.3 additionally fixes one production admission and OCI execution mode. `ToolGatewayDecision` and `ToolGatewayTransactionEvent` v0.2/v0.3 preserve the applicable references through admission and the append-only state sequence. `ToolExecutionReceipt` v0.4 carries exact policy, envelope, and observation references for bounded process and OCI sandbox execution, plus the exact OCI probe digest when applicable; v0.5 also preserves production admission and deployment verification. Fixture and external modes use three exact none sentinels.

`GatewayIdentityPolicy`, `GatewayIdentityChallenge`, and `GatewayPrincipalEvidence` implement Phase 17B1 identity admission. They bind an exact USER-controlled gateway/repository policy, TLS 1.3 SPIFFE X.509 principal, one-use signed challenge, server/client certificate digests, TLS exporter proof, policy-pinned adapter identifiers, revocation, and bounded freshness. `contract_reference` uses three exact none sentinels. Identity evidence alone cannot claim `managed_exclusive`, production execution, deployment verification, or release.

`ProtectedExecutorPolicy`, `ProtectedProcessToolInput`, `ProtectedExecutionEnvelope`, and `ProtectedExecutionObservation` implement Phase 17B2A bounded process evidence. They bind one exact ELF or Mach-O executable and argv to the authorized gateway transaction, retain a signed intent before spawn and a signed observation after close, and keep sandbox, network, production, exclusivity, and release claims false.

`OciLinuxSandboxPolicy`, `OciSandboxToolInput`, `OciSandboxExecutionEnvelope`, `OciSandboxProbeObservation`, and `OciSandboxExecutionObservation` implement Phase 17B2B OCI/Linux evidence. They bind an immutable probe-only image, exact static target, Docker create configuration, digest-pinned seccomp profile, namespace, UID/GID, capability, mount, cgroup, and complete-network-denial controls to signed pre-create and post-cleanup artifacts. The unsigned kernel probe is retained by exact manifest reference inside the signed observation. Docker/host independence, image provenance, managed exclusivity, production execution, deployment verification, and release remain false.

`ProductionSandboxPolicy`, `ProductionSandboxEvidence`, and `ProductionSandboxAdmission` implement Phase 17B2C1 managed deployment admission. The USER policy pins appraiser and admission keys, RATS/EAT profile, computed failure-domain quorum, exact OCI policies, deployment controls, and validity. Each appraiser signs one complete deployment result, while the separate admission authority signs only a recomputed, consensus-backed quorum over exact manifest references. Production execution and deployment verification may become true only for that scope; release remains false.
