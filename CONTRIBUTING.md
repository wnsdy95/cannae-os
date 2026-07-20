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

Recommended full local check:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
node .github/scripts/check-english-only.js
node validator-cli-prototype/run-fixtures.js
for f in $(ls run-*.js | sort); do node "$f" || exit 1; done
node source-map-linter.js
git diff --check
```

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
