# Information to Operations Fixtures

These fixtures verify the information handling chain:

```text
InformationReport
-> IntelligenceAssessment
-> CCIR alert / SITREP / DecisionPacket / FRAGO scope-change draft
```

Expected behavior:

- order-changing assessed information creates PIR/Decision alerts, a decision packet, SITREP, and FRAGO scope-change draft.
- own-force/tool information creates FFIR alert and SITREP but no FRAGO.
- EEFI/protection information creates Black EEFI alert and blocks release.

