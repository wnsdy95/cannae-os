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
14. `ccir-alert.schema.json`
15. `handoff-packet.schema.json`
16. `continuity-plan.schema.json`
17. `context-item.schema.json`
18. `document-access-manifest.schema.json`
19. `doctrine-consistency-review.schema.json`
20. `release-review.schema.json`
21. `release-gate-decision-event.schema.json`
22. `maintenance-readiness.schema.json`
23. `backbrief.schema.json`
24. `rehearsal.schema.json`
25. `annex.schema.json`
26. `frago-scope-change.schema.json`
27. `information-report.schema.json`
28. `intelligence-assessment.schema.json`
29. `approval-scope.schema.json`
30. `approval-consumption-event.schema.json`
31. `approval-revocation-event.schema.json`
32. `approval-renewal-event.schema.json`
33. `approval-delegation-event.schema.json`
34. `approval-delegation-revocation-event.schema.json`
35. `risk-acceptance.schema.json`
36. `aar-readiness-update.schema.json`
37. `sitrep.schema.json`
38. `frago.schema.json`
39. `evidence.schema.json`
40. `aar.schema.json`
41. `readiness-ledger.schema.json`
42. `routing-receipt.schema.json`

All schemas target JSON Schema draft 2020-12.
