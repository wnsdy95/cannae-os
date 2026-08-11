# Runtime Demo Payloads

This directory contains a small end-to-end runtime scenario:

1. Mission intake.
2. WARNO.
3. OPORD.
4. Task order.
5. Backbrief.
6. Rehearsal.
7. Green tool request.
8. Red tool request requiring approval.
9. Approval request.
10. SITREP.
11. FRAGO.
12. Evidence record.
13. AAR.

These payloads are intentionally compatible with the current `schema-files/` contracts where applicable.

Run the end-to-end check from the repository root:

```bash
node runtime-demo-runner.js
```
