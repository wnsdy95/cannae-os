# GitHub Release Trust Checkpoint Fixtures

These fixtures exercise the Phase 19D monotonic TUF checkpoint contract.

The runner uses the retained real GitHub trusted-root fixture from
`github-release-independent-verification-fixtures/` and proves:

- one explicit USER-authorized genesis;
- exact sequence and predecessor binding;
- unchanged-state continuation;
- rollback, same-version equivocation, root-chain discontinuity, backdated
  retrieval, staleness, and authority-expansion rejection; and
- explicit-clock behavior in both the runtime and generic validator CLI.

Run:

```bash
node run-github-release-trust-checkpoint-fixtures.js
```

Passing fixtures prove deterministic checkpoint validation. They do not prove
that GitHub Actions artifacts are independently durable or that GitHub cannot
delete or equivocate about its own workflow and artifact records.
