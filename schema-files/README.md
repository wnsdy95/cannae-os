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
13. `ccir-alert.schema.json`
14. `handoff-packet.schema.json`
15. `continuity-plan.schema.json`
16. `context-item.schema.json`
17. `document-access-manifest.schema.json`
18. `doctrine-consistency-review.schema.json`
19. `release-review.schema.json`
20. `release-gate-decision-event.schema.json`
21. `maintenance-readiness.schema.json`
22. `backbrief.schema.json`
23. `rehearsal.schema.json`
24. `annex.schema.json`
25. `frago-scope-change.schema.json`
26. `information-report.schema.json`
27. `intelligence-assessment.schema.json`
28. `approval-scope.schema.json`
29. `approval-consumption-event.schema.json`
30. `approval-revocation-event.schema.json`
31. `approval-renewal-event.schema.json`
32. `approval-delegation-event.schema.json`
33. `approval-delegation-revocation-event.schema.json`
34. `risk-acceptance.schema.json`
35. `aar-readiness-update.schema.json`
36. `sitrep.schema.json`
37. `frago.schema.json`
38. `evidence.schema.json`
39. `aar.schema.json`
40. `readiness-ledger.schema.json`
41. `routing-receipt.schema.json`

All schemas target JSON Schema draft 2020-12.
