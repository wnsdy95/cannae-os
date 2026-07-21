# Model Force v0.2 Fixtures

These fixtures verify the operational path from a governed model registry to deterministic assignment, integrated routing/model preflight, dispatch manifests, and model usage telemetry.

Run:

```bash
node run-model-force-v0.2-fixtures.js
```

The suite proves that:

- task readiness, deployment boundary, context, tool impact, evidence, evaluation expiry, availability, load, and family separation are hard eligibility gates;
- quality, policy, cost, and latency scoring happens only after those gates pass;
- routing receipts and model assignments must both be ready before an agent receives an endpoint reference;
- dispatch output preserves role authority, tool scope, context scope, immutable model identity, fallback profiles, and document routing;
- floating versions, expired self-certified readiness, secret-bearing endpoint references, Black requests, missing bindings, and self-authorized telemetry fail closed.
