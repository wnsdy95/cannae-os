# Sample Payloads

This directory contains valid and invalid runtime payload fixtures.

Use these examples to test:

- JSON Schema validation
- semantic validator rules
- tool-use ROE policy checks
- authority matrix validation
- decision packet validation
- working group charter validation
- AI special operations TF charter validation
- department collaboration charter validation
- force structure change order validation
- model force assignment validation
- model registry and assignment request validation
- integrated mission preflight validation
- model usage event validation
- repository artifact manifest validation
- bounded self-improvement campaign, checkpoint, decision, and cycle-order validation
- verification plan and runtime-issued receipt validation
- verifier trust policy, SPIFFE/Sigstore workload identity, trusted-root, verifier runtime policy, execution evidence, signed verification attestation, and signed comparative report validation
- sealed comparative evaluation set, paired execution plan, and promotion report validation
- CCIR alert validation
- handoff packet validation
- continuity plan validation
- context item validation
- document access manifest validation
- doctrine consistency review validation
- release review validation
- release gate decision validation
- maintenance readiness validation
- backbrief validation
- rehearsal validation
- annex validation
- FRAGO scope-change validation
- information report validation
- intelligence assessment validation
- approval scope validation
- approval consumption event validation
- approval revocation event validation
- approval renewal event validation
- approval delegation event validation
- approval delegation revocation event validation
- risk acceptance validation
- AAR readiness update validation
- routing receipt validation
- operational mission wave, context pack, report, and closeout validation
- dispatch tool policy, agent lease, tool admission, and execution checkpoint validation
- approval UI rendering
- AAR/readiness update logic
- agent routing preflight logic
- model force compilation and dispatch preflight logic
- repository-scoped JSON and file artifact isolation logic
- bounded self-improvement decision and persistence logic
- deterministic campaign reconstruction, finite retry/advance orders, terminal holds, and idempotent order persistence
- proof receipt integrity, shell prohibition, parent lineage, and approval-consumption logic
- Ed25519 key identity, DSSE statement binding, signature quorum, replay expiry, and receipt-content binding
- baseline-versus-candidate non-regression, harness identity, contamination control, and no-release comparison logic
- report-artifact digest, plan/set/lineage/evaluator binding, purpose-authorized keys, and independent comparative signature quorum
- native Sigstore bundle/root normalization, exact Fulcio identity/issuer, static-key dual binding, freshness, and nonzero transparency thresholds
- exact verifier code, OCI image, lockfile, harness, invocation, tool, network, sandbox, repository-state, target-digest, builder-signature, and verifier-signature validation
- manifest-pinned GitHub Actions and GitLab CI OIDC/JWKS identity, stable claim, protected workflow/config, token-time, clean-commit, and conservative failure-domain validation
- exact pre-dispatch challenge task/lineage binding, unique nonce issuance, dual-signed response freshness, deadline, ambiguity, and replay rejection
- provider/operator/control-plane/account/project/runner/infrastructure/region/zone correlation, transitive failure domains, and execution-bound quorum diversity
- signed checkpoint consistency, witness/monitor operator quorum, TUF root rotation, immutable transparency incident history, and continuous v0.7 admission

Fixture convention:

- `valid-*.json`: should pass JSON Schema validation.
- `invalid-*.json`: should fail JSON Schema or semantic validation.

The invalid examples are intentionally small so the expected failure is obvious.

`valid-verifier-execution-evidence.json` is a schema and semantic-validation example with structurally valid placeholder signature bytes. Use `run-verifier-execution-evidence-fixtures.js`, which generates real ephemeral Ed25519 keys and signatures, for cryptographic verification behavior.

`valid-verifier-trust-policy-v0.5.json`, `valid-verifier-challenge-set.json`, and `valid-self-improvement-cycle-order-v0.5.json` are independent schema examples of the Phase 12B policy, issued challenge, and satisfied admission contracts; they are not one mutually linked artifact-store history. `invalid-verifier-challenge-set-authority.json` proves that a challenge cannot grant release authority. Use `run-verifier-challenge-fixtures.js` for a coherent manifest-backed policy, issuer-signed challenge, real dual-signed nonce responses, and supervisor round-trip behavior.

The `*-v0.6.json` trust-policy/cycle-order samples and `*-v0.2.json` runtime/execution samples show Phase 12C contracts. The missing-domain and domain-substitution samples fail closed. Use `run-verifier-independence-fixtures.js` for real ephemeral keys, dual-signed execution evidence, transitive correlation, and post-execution quorum behavior.

The `*-v0.7.json` trust-policy and cycle-order samples show Phase 13 continuous transparency admission. The transparency policy, observation, root rotation, incident, and state samples are one coherent generated evidence family. Use `run-transparency-operations-fixtures.js` for real ephemeral log/witness/monitor/TUF signatures and `run-transparency-supervisor-fixtures.js` for repository-manifest rejection behavior.

The GitHub and GitLab native OIDC samples show Phase 14 trust-bundle, projected-evidence, and runtime-policy contracts. Use `run-github-actions-oidc-fixtures.js` and `run-gitlab-ci-oidc-fixtures.js` for real ephemeral RSA signatures, provider-specific adversarial claims, common execution-evidence admission, and missing-manifest-evidence rejection.

The mission lifecycle samples show the plan an operator supplies and the context, report, and closeout contracts used by `skill-mission-controller.js`. The invalid examples prove that an AI cannot become final decision authority, request release in a wave report, or turn a closeout into release approval. Use `run-skill-mission-controller-fixtures.js` for real temporary Git repositories, generated routing receipts, manifest-backed evidence, model-preflight binding, AAR follow-on work, and repository isolation.

The enforced-dispatch samples form a reference controller-authorized policy, lease, baseline checkpoint, and admitted tool event. Their unsafe counterparts cover a self-declared issuer, traversal or mixed matcher fields, lease budget and clean-start drift, malformed none sentinels, allow-without-rule, deny-without-reason, invalid checkpoint chains, active terminal state, unresolved effects, and authority expansion. Use `run-dispatch-runtime-fixtures.js` for mission-plan draft authorization, concurrent one-agent issuance, ordered cross-agent repository handoff, exact post-tool binding, replay denial, repository-state drift, unresolved-effect reconciliation, revocation, interruption, and explicit lineage-continuation behavior.

The protected-gateway samples define the Phase 17A request, decision, receipt, and append-only transaction-event contracts. Invalid examples cover managed-assurance mismatch, audience and validity drift, raw-input retention, unbound allow, incomplete commit, broken transition, and authority expansion. These samples are structural examples rather than one mutually linked manifest history. Use `run-protected-tool-gateway-fixtures.js` for coherent temporary-repository authorization, idempotency, exact begin/commit correlation, pre-execution cancellation, and unknown-outcome recovery.
