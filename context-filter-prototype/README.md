# Context Filter Prototype

Dependency-free prototype that filters context items by role and output target.

Usage:

```bash
node context-filter-prototype/context-filter.js context-filter-prototype/context-items.demo.json S3
node context-filter-prototype/context-filter.js context-filter-prototype/context-items.demo.json FINAL_OUTPUT
node context-filter-prototype/run-context-filter-fixtures.js
```

Delivery modes:

- `raw`: full item may be used.
- `summary`: summary only.
- `redacted`: sensitive fields removed.
- `reference_only`: source/id only.
- `denied`: item must not be delivered.
