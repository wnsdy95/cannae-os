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

All schemas target JSON Schema draft 2020-12.

`VerifierTrustPolicy.verifiers[].allowed_attestation_types` can purpose-limit a key to `verification_receipt`, `comparative_evaluation_report`, or both. Comparative signing requires the explicit report grant; existing receipt-only policies may omit the field for v0.3 compatibility.

`VerifierTrustPolicy` v0.2 pins SPIFFE IDs, X.509 roots, transparency-log identities, and log keys. `VerifierIdentityEvidence` binds one short-lived SVID and the verifier's static key to the same repository/policy/purpose statement, then supplies a signed checkpoint and Merkle inclusion path.

`VerifierTrustPolicy` v0.3 can instead select a native `sigstore_bundle` identity. `SigstoreTrustedRoot` records normalized official trust material and its source/freshness metadata. `SigstoreVerifierIdentityEvidence` binds the exact certificate identity, issuer, root digest, repository and purpose statement under both the native Fulcio/Rekor bundle and the verifier's static key.

`VerifierTrustPolicy` v0.4 binds one exact `VerifierRuntimePolicy`. The runtime policy assigns each verifier to a provider profile that pins builder identity, code, OCI manifest, dependency lockfile, harness, argv, tool allowlist, network policy, sandbox profile and time bounds. `VerifierExecutionEvidence` binds those fields to the exact repository state and verification target in a dual-signed in-toto Statement. `VerificationAttestation` and `ComparativeEvaluationAttestation` v0.2 cite that evidence by exact manifest reference; v0.1 remains readable under earlier trust-policy versions.

`VerifierTrustPolicy` v0.5 adds required pre-dispatch challenge assurance and pins a dedicated Ed25519 supervisor issuer key. A signed `VerifierChallengeSet` binds unique per-verifier nonces to the exact campaign, repository, policy/runtime references, projected cycle/attempt/task/lineage, observed manifest and deadline. Existing dual-signed workload identity evidence carries the exact nonce response.

`SelfImprovementCycleOrder` v0.4 extends supervisor-derived `trust_policy_admission` with provider-neutral authenticated workload evidence. v0.5 adds exact challenge-set and response-evidence references, responder counts, blocking codes and a validity boundary capped at challenge expiry. Earlier orders remain readable.
