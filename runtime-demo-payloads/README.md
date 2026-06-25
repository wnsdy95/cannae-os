# Runtime Demo Payloads

This directory contains a small end-to-end runtime scenario:

1. Mission intake.
2. OPORD.
3. Task order.
4. Backbrief.
5. Rehearsal.
6. Green tool request.
7. Red tool request requiring approval.
8. Approval request.
9. SITREP.
10. Evidence record.
11. AAR.

These payloads are intentionally compatible with the current `schema-files/` contracts where applicable.

Run the end-to-end check from the repository root:

```bash
node runtime-demo-runner.js
```
