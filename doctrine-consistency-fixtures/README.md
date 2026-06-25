# Doctrine Consistency Fixtures

These fixtures verify that the framework cannot pass a doctrine consistency review by citing only U.S. sources.

Run:

```bash
node run-doctrine-consistency-fixtures.js
```

The runner checks:

- at least four official source families
- at least three non-U.S. source families
- no `adopt_us_only` disposition
- role/staff terminology alias handling
- jurisdiction gates for ROE/legal analogies
- source-map, compendium, schema, sample, and runner documentation updates
