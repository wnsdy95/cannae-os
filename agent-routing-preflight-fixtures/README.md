# Agent Routing Preflight Fixtures

These fixtures verify that delegated AI waves cannot start until routing receipts exist.

- `valid-wave-routing-bundle.json`: one CoS wave receipt plus one S3 operations receipt for each expected agent.
- `missing-agent-routing-bundle.json`: omits one expected agent receipt and must block.
- `stale-wave-routing-bundle.json`: includes a wave receipt from the wrong wave and must block.
- `partial-capability-gap-routing-bundle.json`: detects a mission capability gap only at wave level and must block because every agent did not inherit the same provisional organization.

Run:

```bash
node run-agent-routing-preflight-fixtures.js
```
