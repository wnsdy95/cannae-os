# Authority Integration Fixtures

These fixtures test the combined execution gate:

```text
policy decision
+ authority matrix / readiness decision
+ scoped approval
+ risk acceptance
= final execution disposition
```

Fixtures:

- `approved-red-bundle.json`: Red deployment is released only when scoped approval and risk acceptance are both valid.
- `consumed-approval-bundle.json`: consumed approval cannot be reused.
- `missing-risk-acceptance-bundle.json`: high-risk action remains blocked when risk acceptance is missing.

Run from the repository root:

```bash
node run-authority-integration-fixtures.js
```
