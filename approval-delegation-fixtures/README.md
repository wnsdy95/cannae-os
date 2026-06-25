# Approval Delegation Fixtures

These fixtures verify that delegated approval authority is explicit, bounded, and subordinate to Commander-retained authority.

Run:

```bash
node run-approval-delegation-fixtures.js
```

Cases:

- `valid-delegation-bundle.json`: Commander delegates bounded Amber sustainment approval to CoS.
- `staff-retained-delegation-bundle.json`: staff role attempts to delegate retained authority and fails.
- `red-base-rule-bundle.json`: Red base approval rule remains Commander-retained and cannot be delegated.

The runner complements `schema-files/approval-delegation-event.schema.json` by checking that the delegation event maps to an existing approval-required authority matrix rule without expanding ROE, risk, context release, or subdelegation authority.
