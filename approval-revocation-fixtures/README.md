# Approval Revocation Fixtures

These fixtures verify that a scoped approval can be revoked only before it is consumed and only by the granting authority.

Run:

```bash
node run-approval-revocation-fixtures.js
```

Cases:

- `valid-revocation-bundle.json`: active approval revoked by Commander within scope and time window.
- `consumed-revocation-bundle.json`: consumed approval cannot be revoked retroactively.
- `wrong-authority-bundle.json`: staff role cannot revoke a Commander-granted approval.

The runner complements `schema-files/approval-revocation-event.schema.json` by checking cross-document consistency between the approval scope and the revocation event.
