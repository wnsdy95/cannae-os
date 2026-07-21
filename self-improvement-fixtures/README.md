# Bounded Self-Improvement Fixtures

Run:

```bash
node run-self-improvement-fixtures.js
```

The fixture suite proves that the controller:

- accepts measurable improvement to in-progress work;
- rolls back failed candidates without authorizing release;
- escalates policy changes, repository drift, missing independent review, undelegated permissions, and exhausted budgets;
- terminates destructive or cross-repository behavior;
- completes only after a mandatory before-completion checkpoint;
- prevents baseline replacement and parentless follow-on cycles;
- stores checkpoints and decisions in the repository-scoped artifact namespace.
