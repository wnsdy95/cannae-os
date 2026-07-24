# Schema Files

This directory contains JSON Schema contracts for the military-style LLM runtime.

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
- protected tool gateway requests, decisions, execution receipts, append-only transaction events, and authenticated gateway identity evidence

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

All schemas target JSON Schema draft 2020-12.

`VerifierTrustPolicy.verifiers[].allowed_attestation_types` can purpose-limit a key to `verification_receipt`, `comparative_evaluation_report`, or both. Comparative signing requires the explicit report grant; existing receipt-only policies may omit the field for v0.3 compatibility.

`VerifierTrustPolicy` v0.2 pins SPIFFE IDs, X.509 roots, transparency-log identities, and log keys. `VerifierIdentityEvidence` binds one short-lived SVID and the verifier's static key to the same repository/policy/purpose statement, then supplies a signed checkpoint and Merkle inclusion path.

`VerifierTrustPolicy` v0.3 can instead select a native `sigstore_bundle` identity. `SigstoreTrustedRoot` records normalized official trust material and its source/freshness metadata. `SigstoreVerifierIdentityEvidence` binds the exact certificate identity, issuer, root digest, repository and purpose statement under both the native Fulcio/Rekor bundle and the verifier's static key.

`VerifierTrustPolicy` v0.4 binds one exact `VerifierRuntimePolicy`. The runtime policy assigns each verifier to a provider profile that pins builder identity, code, OCI manifest, dependency lockfile, harness, argv, tool allowlist, network policy, sandbox profile and time bounds. `VerifierExecutionEvidence` binds those fields to the exact repository state and verification target in a dual-signed in-toto Statement. `VerificationAttestation` and `ComparativeEvaluationAttestation` v0.2 cite that evidence by exact manifest reference; v0.1 remains readable under earlier trust-policy versions.

`VerifierTrustPolicy` v0.5 adds required pre-dispatch challenge assurance and pins a dedicated Ed25519 supervisor issuer key. A signed `VerifierChallengeSet` binds unique per-verifier nonces to the exact campaign, repository, policy/runtime references, projected cycle/attempt/task/lineage, observed manifest and deadline. Existing dual-signed workload identity evidence carries the exact nonce response.

`VerifierTrustPolicy` v0.6 adds required failure-domain assurance. `VerifierRuntimePolicy` v0.2 records provider, operator, control-plane, account, project, runner-pool, infrastructure, region, and zone identities. Any shared required component places verifiers in one transitive computed domain. `VerifierExecutionEvidence` v0.2 binds the observed identity under builder and verifier signatures.

`VerifierTrustPolicy` v0.7 adds continuous transparency assurance. It binds one exact `TransparencyPolicy`, state stream, and maximum age. `TransparencyObservation` records signed checkpoint consistency plus independent witness/monitor approval, `TrustRootRotation` verifies sequential dual-threshold TUF roots, `TransparencyIncident` preserves USER-controlled incident and revocation history, and `TransparencyState` reconstructs their append-only repository-bound projection while retaining current TUF expiry.

`VerifierRuntimePolicy` v0.3 adds strict native OIDC profiles for GitHub Actions and GitLab CI. Their provider-specific trust bundles pin normalized `RS256` JWKS material and freshness; native evidence preserves the exact signed token and conservative provider/failure-domain projection. `VerifierExecutionEvidence` v0.3 signs the native-evidence reference, and nested artifacts must be reloaded from the repository manifest before quorum evaluation.

`SelfImprovementCycleOrder` v0.4 extends supervisor-derived `trust_policy_admission` with provider-neutral authenticated workload evidence. v0.5 adds exact challenge-set and response-evidence references, responder counts, blocking codes and a validity boundary capped at challenge expiry. v0.6 adds deterministic failure-domain bindings and graph reconstruction. v0.7 adds exact transparency policy/state references, sequence, freshness, observer/incident counts, and a transparency-bounded validity window. Earlier orders remain readable.

`MissionWavePlan` is the operational skill entry contract. It preserves USER final authority, requires routing and repository evidence on every wave, optionally binds a ready integrated model preflight, and can bind exact per-agent dispatch-policy draft digests before context issuance. `AgentContextPack`, `MissionWaveReport`, and `MissionWaveCloseout` carry exact manifest references through dispatch, execution evidence, AAR learning, and the next-wave queue without granting release.

`DispatchToolPolicy` v0.2 must be controller-compiled from a policy-draft digest already authorized by the exact USER-authored mission plan. Each rule binds one allowed mission action, exact provider tool, operation class, matcher input, repository-state control, and finite budget under default deny; project-hook policies cannot authorize network or delegation classes. `AgentDispatchLease` binds that policy to one provider session, repository identity/state, context chain, nonce, and validity window. `ToolAdmissionEvent` records each pre-tool allow or deny decision, while `AgentExecutionCheckpoint` v0.2 maintains the serial state chain, exact provider-result digest, and unresolved-effect disposition. All four retain `USER` final authority and keep release unauthorized.

`ToolGatewayRequest` v0.2 binds an externally authenticated principal and exact gateway configuration to the active Phase 16 lease, policy, checkpoint, repository state, canonical tool-input digest, validity window, idempotency key, and three immutable identity references without retaining raw input. `ToolGatewayDecision` and `ToolGatewayTransactionEvent` v0.2 preserve those references through admission and the append-only state sequence. `ToolExecutionReceipt` v0.3 additionally carries exact protected-executor policy, envelope, and observation references for bounded process execution; every non-bounded mode uses three exact none sentinels.

`GatewayIdentityPolicy`, `GatewayIdentityChallenge`, and `GatewayPrincipalEvidence` implement Phase 17B1 `authenticated_reference` admission. They bind an exact USER-controlled gateway/repository policy, TLS 1.3 SPIFFE X.509 principal, one-use signed challenge, server/client certificate digests, TLS exporter proof, policy-pinned adapter identifiers, revocation, and bounded freshness. `contract_reference` uses three exact none sentinels. `managed_exclusive`, production execution, deployment verification, and release remain false.

`ProtectedExecutorPolicy`, `ProtectedProcessToolInput`, `ProtectedExecutionEnvelope`, and `ProtectedExecutionObservation` implement Phase 17B2A bounded process evidence. They bind one exact ELF or Mach-O executable and argv to the authorized gateway transaction, retain a signed intent before spawn and a signed observation after close, and keep sandbox, network, production, exclusivity, and release claims false.
