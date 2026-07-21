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
- verifier trust policy, signed verification attestation, and signed comparative report validation
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

Fixture convention:

- `valid-*.json`: should pass JSON Schema validation.
- `invalid-*.json`: should fail JSON Schema or semantic validation.

The invalid examples are intentionally small so the expected failure is obvious.
