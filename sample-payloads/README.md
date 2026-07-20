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

Fixture convention:

- `valid-*.json`: should pass JSON Schema validation.
- `invalid-*.json`: should fail JSON Schema or semantic validation.

The invalid examples are intentionally small so the expected failure is obvious.
