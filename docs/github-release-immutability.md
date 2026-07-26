# GitHub Release Immutability

## Purpose

Phase 18 authorizes and verifies one exact GitHub release, but a successful
publication receipt alone does not prevent a privileged actor from later
changing its tag or assets. Phase 19A activates GitHub's repository-level
immutable-releases policy and makes that platform state a prerequisite for
future Cannae release authorizations.

This is a repository policy change, not a release:

```text
USER final policy decision
+ repository ADMIN identity
+ clean default branch at origin
+ successful Validate push run for that commit
+ exact GitHub policy endpoint and prior state
+ bounded validity
= one release-immutability activation authorization
```

`GitHubReleaseImmutabilityAuthorization` and its receipt carry
`repository_policy_change_authorized: true` and always keep
`release_authorized: false`.

## Platform Semantics

GitHub's immutable-releases setting:

- applies prospectively to releases created after the setting is enabled;
- locks a qualifying release's tag and release assets;
- produces a release attestation that can be verified with
  `gh release verify <tag>`; and
- does not retroactively make an existing release immutable.

For this repository, `v0.2.0` predates activation and therefore remains an
explicit non-immutable historical release. Future Cannae release receipts
using schema version `0.3` must observe `isImmutable: true` and retain a
verified GitHub release attestation.

## Contracts

### GitHubReleaseImmutabilityAuthorization

The short-lived authorization binds:

- one exact public `owner/repository` and equal normalized Git origin;
- repository `ADMIN` permission;
- a clean default branch whose HEAD equals `origin/<default-branch>`;
- one successful `Validate` push run, including the exact required job, for
  that HEAD;
- API version `2026-03-10`, the exact repository policy endpoint, `PUT`, and
  the `enable_repository_release_immutability` operation;
- an observed disabled policy and desired enabled policy;
- the current latest stable release and its observed immutable state;
- one exact USER grant with a validity period of at most 60 minutes; and
- canonical digests over the USER directive and complete authorization.

The authorization does not permit a release, tag change, asset upload, policy
rollback, repository visibility change, or any other administration action.

### GitHubReleaseImmutabilityReceipt

Execution reappraises the repository, CI run, latest release, authorization
expiry, and current policy before action. The terminal receipt records:

- the consumed authorization path and digest;
- the exact GET-before, optional PUT, and GET-after policy observations;
- an actual HTTP 204 when a PUT was performed;
- `enabled: true` after verification;
- whether the request was performed or an exact retry only verified the
  already-enabled state;
- the unchanged immutable state of the pre-existing latest release; and
- policy execution and verification true while release remains false.

An exact retry is idempotent. It does not issue another PUT after the policy is
already enabled. A missing HTTP status, changed repository or CI state,
changed latest release, unexpected policy state, failed post-action GET, or
retroactive change to the historical release fails closed.

## Operating Procedure

Prerequisites:

- the activation implementation is merged;
- local `main` is clean and equals `origin/main`;
- the exact main `Validate` push run completed successfully;
- `gh` is authenticated to the exact repository with `ADMIN` permission;
- the live immutable-releases policy is disabled; and
- the human USER explicitly directs this repository policy change.

Issue a 30-minute authorization:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release_immutability.js \
  authorize \
  --repository-root . \
  --repository wnsdy95/cannae-os \
  --run-id <successful-main-run-id> \
  --grant-id UGR-enable_release_immutability \
  --output .cannae/release-policy/immutability/authorization.json \
  --expires-in-minutes 30
```

Activate and verify before expiry:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release_immutability.js \
  enable \
  --repository-root . \
  --authorization .cannae/release-policy/immutability/authorization.json \
  --receipt .cannae/release-policy/immutability/receipt.json
```

The Claude Code skill exposes the same wrapper at
`.claude/skills/controls-doctrine-operator/scripts/operate_github_release_immutability.js`.

## Future Release Gate

Newly issued `GitHubReleaseAuthorization` documents use schema version `0.3`.
The authorizer and publisher both query the immutable-releases endpoint and
require `enabled: true`. Terminal release verification also requires the new
release listing to report `isImmutable: true` and the GitHub-signed release
attestation to bind the exact repository, tag, commit, and uploaded assets.

Historical schema `0.1` and `0.2` release artifacts remain readable as
evidence. They do not satisfy the current prospective attestation gate and are
not upgraded retroactively.

Phase 19B continuously checks the live policy and future release attestations
under `github-release-integrity-monitoring.md`. Monitoring is read-only and
does not inherit this activation authority.

## Failure Rules

| Condition | Result |
| --- | --- |
| USER grant missing, mismatched, expired, or AI-approved | deny |
| Repository identity, origin, visibility, or ADMIN permission mismatch | deny |
| Non-default branch, dirty worktree, or origin drift | deny |
| CI is not the exact successful main `Validate` push | deny |
| Authorization input or receipt output resolves outside the repository | deny before PUT |
| Policy is already enabled when issuing a new authorization | deny new authorization |
| Policy or latest release changes after authorization | deny |
| PUT does not return an observable HTTP 204 | deny |
| Post-action GET does not report enabled | deny |
| Exact retry observes enabled and all other bindings match | verify without PUT |
| Historical release immutable state changes unexpectedly | deny |
| Future release policy is disabled at authorization or publication | deny release |
| Future release is not observed immutable after publication | deny terminal receipt |
| Future release attestation is missing or scope-mismatched | deny terminal receipt and alert |
| Scheduled monitor cannot read Administration state | block with credential-unavailable evidence |

## Security Boundary And Limits

- The authorization uses canonical SHA-256 integrity digests, not a USER
  digital signature.
- The adapter trusts the local operator environment, authenticated `gh`
  principal, GitHub API response, repository permissions, and credential
  protection.
- Activation is prospective. It does not repair or protect `v0.2.0`, and this
  runtime does not rewrite historical evidence.
- GitHub owner-level enforcement can constrain repository administrators, but
  this contract does not administer an organization policy.
- The runtime intentionally has no automatic disable command. Disabling the
  policy is a separate future repository-policy decision and cannot be
  inferred from the recorded rollback operation name.
- Phase 19B provides continuous GitHub policy and attestation monitoring, but
  independent providers, signed tags, credential isolation, and external
  transparency witnesses remain separate controls.

## Validation

```bash
node validator-cli-prototype/validate.js \
  sample-payloads/valid-github-release-immutability-authorization.json \
  github-release-immutability-authorization

node validator-cli-prototype/validate.js \
  sample-payloads/valid-github-release-immutability-receipt.json \
  github-release-immutability-receipt

node run-github-release-immutability-fixtures.js
node run-github-release-publisher-fixtures.js
node run-github-release-integrity-fixtures.js
```

The fixture adapters never contact GitHub or change repository policy.

## Source Basis

- [GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
  defines prospective tag and asset immutability plus release attestations.
- [Prevent release changes](https://docs.github.com/en/enterprise-cloud@latest/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes)
  documents repository and organization activation behavior.
- [GitHub repository REST API](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10)
  defines the GET, PUT, and DELETE immutable-release policy endpoints and
  permissions.
- [GitHub CLI `gh release verify`](https://cli.github.com/manual/gh_release_verify)
  verifies release attestations for immutable releases.
