# Approval Renewal Fixtures

These fixtures verify that approval renewal is an append-only event and cannot silently expand authority.

Run:

```bash
node run-approval-renewal-fixtures.js
```

Cases:

- `valid-renewal-bundle.json`: active approval receives a later expiry from the original granting authority.
- `expired-renewal-bundle.json`: expired approval cannot be renewed retroactively.
- `scope-expansion-bundle.json`: renewal cannot change target or increase execution count.

The runner complements `schema-files/approval-renewal-event.schema.json` by checking cross-document consistency between the approval scope and the renewal event.
