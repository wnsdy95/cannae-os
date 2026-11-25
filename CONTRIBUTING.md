# Contributing to Cannae OS

Thank you for considering a contribution. Cannae OS is a doctrine and prototype repository for human-led AI agent control, so contributions must preserve clarity, traceability, and authority boundaries.

## Contribution Principles

- Keep the human user as final decision authority.
- Write repository content, examples, and executable messages in English.
- Prefer small, reviewable changes.
- Preserve source discipline for doctrine claims.
- Update documents, schemas, samples, fixtures, and runners together when a runtime contract changes.
- Add regression fixtures for unsafe states that the change is meant to block.
- Do not add military-source claims without updating `docs/source-map.md`.
- Do not broaden AI agent authority, release scope, or context access without an explicit policy path.

## Before You Open a PR

Run the smallest relevant validation first, then broaden when the change touches shared behavior.
Use the [skill-maintenance check map](docs/evaluation-fixtures.md#skill-maintenance-checks-and-evidence)
and preserve exact source/result bindings in the private cycle evidence index.
An intact log or focused pass does not establish full integration or merge approval.

Recommended full local check:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
node .github/scripts/check-json.js
node implementation-candidate-registry.js audit
node .github/scripts/check-english-only.js
node .github/scripts/check-markdown-links.js
node validator-cli-prototype/run-fixtures.js
CANNAE_MANDATORY_CONTROL=0 CANNAE_REQUIRE_LIVE_OCI=1 node run-all-fixtures.js
node source-map-linter.js
git diff --check
node validation-suite-runner.js
```

Run each command to completion and record failures and unexecuted commands.
`run-all-fixtures.js` already discovers the individual `run-*.js` suites; do not
wrap it in a second loop that runs the aggregate and every suite again. Keep this
list aligned with `.github/workflows/validate.yml`; unavailable OCI or other
prerequisites leave the relevant gate unverified, not waived.

For index, README, or community-file changes, also check Markdown links:

```bash
node .github/scripts/check-markdown-links.js
```

## Change Types

### Doctrine Or Policy

- Read the target policy and `docs/source-map.md`.
- Keep interpretation separate from source claims.
- Update `docs/research-compendium.md` when adding meaningful research interpretation.
- Update validation or review paths when the policy is intended to block unsafe behavior.

### Schema, Sample, Or Runner

Change all affected surfaces together:

- schema file;
- valid sample;
- invalid sample;
- validator mapping or semantic rules;
- fixture bundle;
- runner;
- README or index entry.

### Skill Or Routing

- Update the Codex skill and Claude Code skill when behavior must be shared.
- Run routing coverage.
- Ensure new files are routable and have a clear operating category.

### Release, Authority, Or Security

These changes require maintainer review:

- final or external release gates;
- approval scope;
- risk acceptance;
- document access;
- OPSEC, EEFI, classification, or context filtering;
- delegated agent routing preflight;
- force structure creation, expansion, reduction, or disbanding.

## Commit Style

Use short imperative commit messages:

```text
Add release review target gate
Document delegated routing preflight
Fix timestamp ordering in replay
```

## Pull Request Requirements

Every PR should explain:

- what changed;
- why it changed;
- which doctrine area is affected;
- whether source-map coverage is required;
- which validation commands were run;
- what risk or authority boundary is affected.

## What We Usually Decline

- Broad rewrites without a control benefit.
- New agent roles without a capability gap and sunset rule.
- Source claims without traceability.
- Policy language that grants broad autonomy by implication.
- Generated artifacts that should be reproducible outputs instead of source.
