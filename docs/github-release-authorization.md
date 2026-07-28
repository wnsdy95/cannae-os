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
+ fresh GitHub trusted root reconstructed through pinned TUF metadata
+ fresh monotonic trust checkpoint bound to the exact retained root
+ exact latest non-genesis full-monitor artifact lineage
+ independent Sigstore verification of the retained bundle
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
- schema version `0.5` evidence that the repository immutable-releases policy
  is enabled, including the API version, owner-enforcement state, and check
  time;
- the required GitHub CLI version, JSON output, in-toto statement and
  predicate types, GitHub signer identity, and source-archive exclusion;
- pinned independent verifier package/version, official GitHub TUF mirror,
  committed bootstrap path, and trusted-root freshness limit;
- the exact Phase 19D checkpoint path, ID, sequence, digest, record time,
  12-hour freshness boundary, and trusted-root IDs and digests;
- the latest eligible full-monitor artifact's workflow, stable run ID,
  attempt, head SHA, artifact ID/name/archive digest, creation time, and
  expiry, plus its schema-valid replayed `ready` full observation;
- clean local HEAD, matching `origin/<default-branch>`, and absence of the
  target tag and release at issuance;
- an exact USER decision over the already-public commit and release notes;
- a canonical USER-grant digest, one-use status, and a validity period of at
  most 60 minutes; and
- a canonical digest over the complete authorization.

The authorization is immutable. Publication records consumption in a separate
receipt instead of modifying and invalidating the authorization digest.
Versions `0.1` through `0.4` remain readable for historical validation, but
the active publisher rejects them as a downgrade and accepts only v0.5.

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
  subjects;
- the complete `GitHubReleaseTrustedRoot` TUF chain and target artifact;
- the complete `GitHubReleaseTrustCheckpoint` that binds the prior trusted
  state, transition, producer, sequence, and root;
- an independently replayable `GitHubReleaseIndependentVerification` binding
  verifier code, dependency lock, trust root, certificate, timestamp, DSSE
  payload, signed statement, and CLI cross-check for schema version `0.5`;
- the exact release-notes digest; and
- `published: true`, `verified: true`, and `authorization_consumed: true`.

An exact retry is idempotent. Normally it runs before authorization expiry.
If publication occurred inside the original authorization window but
post-create verification failed, a later retry may verify that exact immutable
release under currently fresh trust evidence and emit the receipt without
creating another release. A release published outside the original window,
or any partial or mismatched state, is denied.

## Operating Procedure

Prerequisites:

- the release implementation is merged;
- local `main` is clean and equals `origin/main`;
- the exact main `Validate` push run completed successfully;
- the repository immutable-releases policy is enabled through the separately
  USER-authorized procedure in `github-release-immutability.md`;
- GitHub CLI `2.93.0` or newer is installed;
- Node dependencies are installed from the exact lockfile;
- the latest eligible full-monitor artifact has been downloaded into a
  repository-contained release directory and its observation/root/checkpoint
  triplet has been schema-validated and replayed against an explicit current
  clock;
- the authenticated operator can read Actions run and artifact metadata so
  the publisher can independently prove that the local pair still equals the
  latest eligible artifact;
- the tracked release-notes file is final;
- the target tag and GitHub release do not exist; and
- the human user explicitly authorizes this exact release.

Verify the retained monitor root and checkpoint with an explicit current
clock:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release_verification.js \
  trusted-root verify \
  --input .cannae/releases/v0.3.0/github-trusted-root.json \
  --evaluated-at <current-UTC-timestamp>

node validator-cli-prototype/validate.js \
  .cannae/releases/v0.3.0/github-release-trust-checkpoint.json \
  github-release-trust-checkpoint \
  --evaluated-at <current-UTC-timestamp>
```

Issue a 30-minute authorization over that exact pair:

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
  --trusted-root .cannae/releases/v0.3.0/github-trusted-root.json \
  --trust-checkpoint .cannae/releases/v0.3.0/github-release-trust-checkpoint.json \
  --output .cannae/releases/v0.3.0/authorization.json \
  --expires-in-minutes 30
```

Publish before expiry:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release.js \
  publish \
  --repository-root . \
  --authorization .cannae/releases/v0.3.0/authorization.json \
  --trusted-root .cannae/releases/v0.3.0/github-trusted-root.json \
  --trust-checkpoint .cannae/releases/v0.3.0/github-release-trust-checkpoint.json \
  --receipt .cannae/releases/v0.3.0/receipt.json
```

The publisher invokes `gh release create` with the full authorized commit SHA,
title, tracked notes file, `--fail-on-no-commits`, and `--latest`. It then
reloads the release, resolves the remote tag, compares the release body digest,
requires the release listing to report `isImmutable: true`, and writes a
receipt only when every field matches. Before creating any release, the
publisher rejects legacy authorization versions, requires the trusted-root
and trust-checkpoint artifacts, replays them against the current clock, and
requires every TUF role and the checkpoint to remain valid through
authorization expiry. It also resolves the latest full-monitor artifact from
the exact committed policy, requires its successful `ready` full observation
to replay and equal the retained root/checkpoint, rejects genesis and local
producer state, binds the artifact lineage into authorization, and resolves
that lineage again immediately before external mutation. It then rechecks
authorization freshness, repository/CI/notes state, target absence, and the
immutable-release policy. Schema-invalid root/checkpoint fields, blocked or
forged observation state, artifact replacement, a newer run, or state drift
therefore stop before `gh release create`. For version `0.5`, it also runs
`gh release verify`, retains the complete GitHub-signed attestation result,
replays the repository-contained GitHub TUF chain, independently verifies the
bundle through pinned `@sigstore/verify`, cross-checks the CLI statement
against the signed DSSE payload, and rejects a different repository, tag,
commit, signer, predicate, or asset digest. The publisher checks the
repository immutability policy both at authorization and immediately before
publication. It also reloads the exact checkpoint/root paths and rejects any
substitution against the USER authorization before external mutation.

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
| Authorization version is older than v0.5 | deny before publication |
| Tag exists without release, or release exists without tag | deny |
| Existing release body, name, mode, target, or tag commit differs | deny |
| GitHub release attestation is unavailable after bounded retry | deny receipt |
| Attestation repository, tag, commit, signer, predicate, or asset digest is different | deny receipt |
| Trusted-root artifact is absent, stale, outside the repository, invalid, or expires within the authorization window | deny before publication |
| Trust checkpoint is absent, stale, schema-invalid, outside the repository, forked, substituted, or does not bind the exact root and authorization | deny before publication |
| Checkpoint is genesis, locally produced, or not byte-equal to the latest eligible full-monitor artifact | deny before authorization |
| Full observation is missing, blocked, schema-invalid, not replayable, or does not equal the archived root/checkpoint | deny before authorization |
| Latest artifact run, attempt, head, name, digest, creation, expiry, or workflow differs | deny before authorization |
| Latest artifact lineage changes after authorization | deny before publication with zero create calls |
| Authorization expires or repository/immutability state changes during lineage resolution | deny before publication with zero create calls |
| TUF rotation, metadata, or target verification fails | deny before publication |
| Certificate, timestamp, or DSSE verification fails | deny receipt |
| CLI statement differs from the signed DSSE statement | deny receipt |
| Exact immutable release exists, matches, and was published inside the original authorization window | verify idempotently with current trust evidence |

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
- GitHub CLI and pinned `@sigstore/verify` both verify the bundle. Running two
  implementations in one operator environment is defense in depth, not an
  independent infrastructure failure domain.
- GitHub remains the signer, Fulcio/TSA operator, TUF repository operator, and
  immutable-state reporter.
- GitHub Actions checkpoint artifacts are same-provider continuity evidence.
  They can expire or be deleted and do not replace an independent archive or
  witness.
- A downloaded root/checkpoint pair is only an input copy. It becomes release
  evidence only when the publisher resolves the provider lineage and proves
  exact equality at authorization and again before publication.
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
node run-github-release-independent-verification-fixtures.js
node run-github-release-trust-checkpoint-fixtures.js
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
- [GitHub offline attestation verification](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline)
  defines retained bundle and trusted-root verification.
- [`gh attestation trusted-root`](https://cli.github.com/manual/gh_attestation_trusted-root)
  exposes GitHub's trust material.
- [Sigstore JavaScript clients](https://docs.sigstore.dev/language_clients/javascript/)
  document the independent verifier family.
- [The Update Framework specification](https://theupdateframework.github.io/specification/latest/)
  defines the retained root and metadata chain verification.
- [GitHub Actions artifact REST API](https://docs.github.com/en/rest/actions/artifacts?apiVersion=2026-03-10)
  exposes artifact digest, expiry, workflow run, and head SHA bindings.
- [GitHub workflow-run REST API](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10)
  exposes exact run attempts under Actions read permission.
- [GitHub rerun guidance](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
  establishes that reruns retain the original event SHA/ref and are attempts
  of the same workflow run.
