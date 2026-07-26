# Exact GitHub Release Authorization

## Purpose

The existing release-review and release-gate contracts decide whether a class
of output may leave the system. They do not prove that an operator is
publishing one exact GitHub repository, tag, commit, release body, and CI
result.

`GitHubReleaseAuthorization` closes that final boundary. It is the only
pre-action contract in this repository whose `release_authorized` value may be
true. The value is valid only for one exact, short-lived GitHub release.

```text
USER final decision
+ public repository identity
+ clean default branch at origin
+ exact stable tag and commit
+ exact release-note digest
+ successful Validate push run for that commit
+ enabled repository release-immutability policy
+ exact GitHub release-attestation verification profile
+ absent target tag and release
+ bounded validity
= one terminal release authorization
```

Every execution, verifier, campaign, gateway, process, sandbox, production,
and cycle-order contract remains `release_authorized: false`. Those controls
may produce evidence for a release decision; they cannot grant it.

## Contracts

### GitHubReleaseAuthorization

The authorization binds:

- repository owner/name, an equal normalized Git origin owner/name, default
  branch, public visibility, and the authenticated principal's write-level
  permission;
- one stable semantic-version tag, release name, full commit SHA, and
  non-draft/non-prerelease/latest mode;
- the previous latest release and its resolved tag commit;
- one tracked repository-relative release-notes file, SHA-256 digest, and byte
  length;
- one completed successful `Validate` push run for the exact default branch
  and target commit;
- schema version `0.3` evidence that the repository immutable-releases policy
  is enabled, including the API version, owner-enforcement state, and check
  time;
- the required GitHub CLI version, JSON output, in-toto statement and
  predicate types, GitHub signer identity, and source-archive exclusion;
- clean local HEAD, matching `origin/<default-branch>`, and absence of the
  target tag and release at issuance;
- an exact USER decision over the already-public commit and release notes;
- a canonical USER-grant digest, one-use status, and a validity period of at
  most 60 minutes; and
- a canonical digest over the complete authorization.

The authorization is immutable. Publication records consumption in a separate
receipt instead of modifying and invalidating the authorization digest.

### GitHubReleaseReceipt

The terminal receipt binds:

- the consumed authorization ID, repository-relative path, and digest;
- the authorized repository, tag, release name, and commit;
- GitHub release database/node IDs and API/browser URLs;
- the observed release target, resolved remote tag commit, publish time, and
  release mode, including `immutable: true`;
- the complete successful `gh release verify` JSON result, its canonical
  digest, verifier command/version, signer certificate identity, verified
  timestamps, exact package subject, commit, and uploaded-asset SHA-256
  subjects for schema version `0.3`;
- the exact release-notes digest; and
- `published: true`, `verified: true`, and `authorization_consumed: true`.

An exact retry before authorization expiry is idempotent: it verifies the
already-created release and emits a receipt without creating another release.
A partial or mismatched existing state is denied.

## Operating Procedure

Prerequisites:

- the release implementation is merged;
- local `main` is clean and equals `origin/main`;
- the exact main `Validate` push run completed successfully;
- the repository immutable-releases policy is enabled through the separately
  USER-authorized procedure in `github-release-immutability.md`;
- GitHub CLI `2.93.0` or newer is installed;
- the tracked release-notes file is final;
- the target tag and GitHub release do not exist; and
- the human user explicitly authorizes this exact release.

Issue a 30-minute authorization:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release.js \
  authorize \
  --repository-root . \
  --repository wnsdy95/cannae-os \
  --tag v0.3.0 \
  --name "Cannae OS v0.3.0" \
  --notes docs/releases/v0.3.0.md \
  --run-id <successful-main-run-id> \
  --grant-id UGR-v0_3_0 \
  --output .cannae/releases/v0.3.0/authorization.json \
  --expires-in-minutes 30
```

Publish before expiry:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release.js \
  publish \
  --repository-root . \
  --authorization .cannae/releases/v0.3.0/authorization.json \
  --receipt .cannae/releases/v0.3.0/receipt.json
```

The publisher invokes `gh release create` with the full authorized commit SHA,
title, tracked notes file, `--fail-on-no-commits`, and `--latest`. It then
reloads the release, resolves the remote tag, compares the release body digest,
requires the release listing to report `isImmutable: true`, and writes a
receipt only when every field matches. For version `0.3`, it also runs
`gh release verify`, retains the complete GitHub-signed attestation result,
and rejects a different repository, tag, commit, signer, predicate, or asset
digest. The publisher checks the repository immutability policy both at
authorization and immediately before publication.

The Claude Code skill exposes the same wrapper and semantics at
`.claude/skills/controls-doctrine-operator/scripts/operate_github_release.js`.

## Failure Rules

| Condition | Result |
| --- | --- |
| Human USER grant missing or mismatched | deny |
| AI approval claimed | deny |
| Wrong repository or insufficient GitHub permission | deny |
| Normalized Git origin differs from the authorized repository | deny |
| Non-default branch, dirty worktree, or origin drift | deny |
| Authorization artifact resolves outside the repository | deny before publication |
| Target tag/release already exists at authorization time | deny |
| Version does not advance the latest stable release | deny |
| Notes are untracked, outside the repository, empty, or changed | deny |
| CI is not a successful `Validate` push for the exact commit | deny |
| Immutable-releases policy is disabled or changes after authorization | deny |
| Authorization expired | deny |
| Tag exists without release, or release exists without tag | deny |
| Existing release body, name, mode, target, or tag commit differs | deny |
| GitHub release attestation is unavailable after bounded retry | deny receipt |
| Attestation repository, tag, commit, signer, predicate, or asset digest is different | deny receipt |
| Exact immutable release already exists and still matches | verify idempotently |

## Security Boundary And Limits

- The current authorization uses a canonical SHA-256 integrity digest, not a
  USER digital signature. A process that can rewrite the artifact and execute
  the publisher under the authenticated GitHub account remains inside the
  trusted local operator boundary.
- GitHub identity and state are obtained through the installed authenticated
  `gh` CLI. This contract does not replace protected GitHub credentials,
  branch protection, environment protection, signed tags, or organization
  policy.
- The current path supports public repositories, stable semantic versions, a
  prior release, one `Validate` workflow name, and one required-check label.
- Successful CI establishes the repository's configured checks, not universal
  correctness, absence of secrets, or production fitness.
- Repository release immutability applies only to releases created after
  activation. Historical `v0.2.0` remains non-immutable.
- GitHub CLI performs the Sigstore verification. Cannae retains and constrains
  its verified result but does not implement a second cryptographic verifier.
- Automatically generated source ZIP and tar archives are outside the release
  attestation's uploaded-asset set.
- Continuous policy and attestation monitoring is defined in
  `github-release-integrity-monitoring.md`; it does not replace signed tags,
  credential isolation, or independent transparency witnesses.

## Validation

```bash
node validator-cli-prototype/validate.js \
  sample-payloads/valid-github-release-authorization.json \
  github-release-authorization

node validator-cli-prototype/validate.js \
  sample-payloads/valid-github-release-receipt.json \
  github-release-receipt

node run-github-release-publisher-fixtures.js
node run-github-release-immutability-fixtures.js
node run-github-release-integrity-fixtures.js
```

The fixture suite uses an injected adapter and never contacts GitHub or creates
a release.

## Source Basis

- [GitHub CLI `gh release create`](https://cli.github.com/manual/gh_release_create)
  documents explicit target selection, notes files, failure when no commits
  exist, and latest-release selection.
- [GitHub CLI `gh release view`](https://cli.github.com/manual/gh_release_view)
  exposes the observed release fields used for terminal verification.
- [GitHub Releases REST API](https://docs.github.com/en/rest/releases/releases#create-a-release)
  defines the release resource and target-commit behavior.
- [GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
  defines prospective release immutability and release attestations.
- [GitHub CLI `gh release verify`](https://cli.github.com/manual/gh_release_verify)
  defines signed release-attestation verification and JSON output.
