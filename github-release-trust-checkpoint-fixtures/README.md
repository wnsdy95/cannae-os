# GitHub Release Trust Checkpoint Fixtures

These fixtures exercise the Phase 19D monotonic TUF checkpoint contract and
the Phase 19E one-time initial-bootstrap recovery.

The runner uses the retained real GitHub trusted-root fixture from
`github-release-independent-verification-fixtures/` and proves:

- one explicit USER-authorized genesis;
- exact sequence and predecessor binding;
- unchanged-state continuation;
- rollback, same-version equivocation, root-chain discontinuity, backdated
  retrieval, staleness, and authority-expansion rejection; and
- explicit-clock behavior in both the runtime and generic validator CLI;
- one-time bootstrap expiry that ordinary policy edits cannot reopen;
- latest eligible artifact selection without older/bootstrap fallback;
- exact completed default-branch run and rerun-attempt binding;
- mandatory observation/root/checkpoint ZIP members and bounded parsing;
- exact workflow producer binding;
- exact USER recovery over every retained two-file initial failure artifact;
- recovery run-set, expiry, current in-progress attempt, and no-fallback
  enforcement;
- proof that complete provider checkpoints never invoke recovery; and
- archive traversal and option-injection rejection before bounded direct
  member reads.

Run:

```bash
node run-github-release-trust-checkpoint-fixtures.js
```

Passing fixtures prove deterministic checkpoint and archive validation. They
do not prove
that GitHub Actions artifacts are independently durable or that GitHub cannot
delete or equivocate about its own workflow and artifact records.
