# Governance

Cannae OS uses lightweight maintainer governance with explicit authority boundaries.

## Project Authority

The repository owner, `@wnsdy95`, is the initial final decision authority for:

- project direction;
- release decisions;
- maintainer appointment and removal;
- security-sensitive policy changes;
- license and governance changes;
- disputes that cannot be resolved in review.

This mirrors the framework's own principle: delegation is useful, but final authority must be explicit.

## Maintainer Responsibilities

Maintainers may:

- review and merge pull requests;
- triage issues;
- request additional validation;
- close out-of-scope proposals;
- protect source discipline and safety boundaries;
- cut releases when authorized.

Maintainers should:

- prefer PR-based changes;
- keep review decisions concrete and file-grounded;
- require tests or review paths for control-surface changes;
- avoid merging their own high-risk changes without another reviewer when possible.

## Decision Classes

### Ordinary Changes

Examples:

- typo fixes;
- README improvements;
- small documentation clarifications;
- fixture additions that do not change policy.

Approval:

- one maintainer review is sufficient.

### Control-Surface Changes

Examples:

- authority policy;
- release review;
- approval lifecycle;
- risk acceptance;
- context filtering;
- delegated agent routing;
- schema or runner behavior that blocks or allows execution.

Approval:

- maintainer review is required;
- CODEOWNERS review is required when configured;
- CI must pass;
- the PR must state the affected risk and authority boundary.

### Directional Changes

Examples:

- new major doctrine family;
- new runtime architecture;
- license change;
- governance change;
- maintainer access change;
- public release positioning.

Approval:

- final decision by the repository owner until a larger maintainer council is formed.

## Release Authority

Only authorized maintainers may create version tags or GitHub Releases.

Release notes must state:

- maturity level;
- major changes;
- validation status;
- known limitations;
- whether the release changes authority, release, or security behavior.

## Conflict Resolution

Use the smallest decision path that resolves the issue:

1. clarify the technical disagreement in the PR or issue;
2. identify the affected authority, safety, source, or validation boundary;
3. request maintainer review;
4. escalate to the repository owner for final decision when needed.
