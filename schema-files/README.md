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

All schemas target JSON Schema draft 2020-12.
