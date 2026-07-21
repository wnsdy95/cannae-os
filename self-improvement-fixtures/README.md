# Bounded Self-Improvement Fixtures

Run:

```bash
node run-self-improvement-fixtures.js
node run-signed-self-improvement-fixtures.js
node run-verification-attestation-fixtures.js
node run-campaign-supervisor-fixtures.js
```

The fixture suite proves that the controller:

- accepts only receipt-backed measurable improvement to in-progress work;
- executes an exact verification plan and reloads its persisted receipt;
- rolls back executed verification failures without authorizing release;
- escalates missing/tampered receipts, missing/reused approvals, forged parent lineage, policy changes, and missing independent proof;
- terminates destructive or cross-repository behavior;
- completes only after a mandatory before-completion checkpoint;
- prevents baseline replacement and parentless follow-on cycles, including manifest-backed parent verification;
- stores checkpoints and decisions in the repository-scoped artifact namespace and verifies the proof-store chain.

The signed suites additionally prove that v0.2 remains compatible while v0.3 requires a fresh two-key/two-group quorum over the exact persisted receipt and its self-digest. They reject duplicate signers, changed signed payloads, expired attestations and trust roots, cross-repository reuse, and exposed private-key files.

The campaign supervisor suite uses real temporary Git repositories and repository artifact stores. It proves deterministic start, retry, accepted-parent advance, before-completion, completion, and escalation transitions; blocks orphan checkpoints, forged parents, and exhausted budgets; and verifies that repeated persisted supervision does not create another manifest revision.
