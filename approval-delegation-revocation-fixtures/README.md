# Approval Delegation Revocation Fixtures

These fixtures verify that delegated approval authority has an explicit termination path.

Run:

```bash
node run-approval-delegation-revocation-fixtures.js
```

Cases:

- `valid-revocation-bundle.json`: Commander revokes an active delegation before expiry.
- `valid-expiry-bundle.json`: Recorder projects expiry at the delegation expiry time.
- `staff-revocation-bundle.json`: staff role attempts to revoke delegated authority and fails.

The runner complements `schema-files/approval-delegation-revocation-event.schema.json` by checking that termination events reference an active delegation and preserve the original delegation scope snapshot.
