# GitHub Release Integrity Monitoring

## 1. Purpose

Phase 19B verifies that the Phase 19A repository policy remains enabled and
that every release created after activation carries the exact GitHub-signed
release attestation for its repository, tag, commit, and uploaded assets.
Phase 19C independently replays the retained Sigstore bundle under trust
material reconstructed from GitHub's TUF repository.
Phase 19D compares that state with a retained predecessor checkpoint so a
validly signed rollback or same-version conflict cannot silently replace a
newer state.
Phase 19E permits one exact USER-authorized initial-bootstrap recovery only
when every policy-matching failed run retained a replayable blocked
observation and verified root but no checkpoint.

This is a read-only assurance path. It can alert and retain evidence. It cannot
enable or disable repository policy, repair a tag or release, publish an
asset, or authorize a release.

## 2. Platform Facts

GitHub immutable releases lock the release tag and assets and automatically
produce a release attestation. The attestation identifies the release tag,
commit, and release assets. GitHub documents two distinct verification
commands:

- [`gh release verify`](https://cli.github.com/manual/gh_release_verify)
  verifies the signed release attestation and returns the attested subjects;
- [`gh release verify-asset`](https://cli.github.com/manual/gh_release_verify-asset)
  compares one downloaded local asset with the digest in the release
  attestation.

GitHub's [release-integrity guidance](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity)
states that automatically generated source ZIP and tar archives cannot be
verified this way because GitHub generates them on demand. Cannae therefore
sets `source_archives_in_scope: false`; only the package subject and uploaded
release assets enter this evidence class.

The repository policy endpoint is
`GET /repos/{owner}/{repo}/immutable-releases`. GitHub's
[fine-grained token permission table](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
requires repository Administration read permission for that GET. This is a
different credential boundary from ordinary release reads.

## 3. Trust Equation

```text
Expected repository policy is enabled
+ Policy bytes equal the exact blob committed at current HEAD
+ HEAD is the current origin default-branch commit
+ Live Administration-read policy observation is enabled
+ Every pre-activation release matches the sealed grandfather baseline
+ Every later release reports isImmutable = true
+ gh cryptographically verifies GitHub's release attestation
+ Pinned TUF root authorizes every sequential GitHub root rotation
+ Current timestamp, snapshot, targets, and trusted-root target verify
+ Prior checkpoint and root are fresh and exactly predecessor-bound
+ Every TUF role is monotonic and same-version digests remain equal
+ Current root chain contains the exact previously trusted root
+ Pinned Sigstore code independently verifies the retained DSSE bundle
+ The verified in-toto statement binds exact repository + tag + commit
+ Every attested uploaded asset has one unique SHA-256 subject
= release integrity observation may be ready
```

Any missing term produces `status: blocked`. A blocked observation still
retains the facts that were available; it never converts uncertainty into
`policy_drift_detected: false` with an assessment claim.

## 4. Contracts

### 4.1 `GitHubReleaseIntegrityPolicy`

The policy at `.github/release-integrity-policy.json` must be tracked, must
exactly equal its current `HEAD` blob, and must name an activation commit in
the current commit ancestry. It binds:

- `wnsdy95/cannae-os` and `main`;
- the exact Phase 19A activation receipt ID, digest, commit, and time;
- the expected enabled REST endpoint;
- the exact `v0.1.0` and `v0.2.0` grandfather baseline;
- GitHub CLI JSON verification, in-toto Statement v1,
  `release/v0.2`, and the GitHub release signer identity;
- pinned `@sigstore/verify`, the official GitHub TUF mirror, committed root v1
  path, and a 24-hour trusted-root freshness limit;
- committed Phase 19D bootstrap checkpoint/root paths, exact workflow and
  artifact naming, a 12-hour checkpoint limit, four-hour one-time bootstrap,
  bounded run history, and fail-closed predecessor behavior;
- the fixed Phase 19E recovery path, whose separate contract may authorize
  only one monitoring bootstrap and never checkpoint reset or release;
- a six-hour cadence and bounded attestation retry;
- fail-closed credential, policy-drift, and attestation behavior; and
- USER final authority with both policy mutation and release false.

Its canonical `policy_sha256` prevents a monitor from silently changing the
baseline or verification profile.

### 4.2 `GitHubReleaseIntegrityObservation`

One observation records:

- the exact policy reference, canonical digest, committed-blob digest, and
  committed-at-HEAD assertion;
- repository branch, HEAD, origin main, visibility, and worktree state;
- trigger, actor, run, ref, and observation time;
- live policy status, including an explicit
  `credential_unavailable` state;
- every selected release, resolved remote tag commit, immutable state, and
  grandfather/post-activation classification;
- normalized attestation metadata and the complete verified CLI JSON result;
- one retained `GitHubReleaseTrustedRoot` with the complete TUF metadata chain;
- verified predecessor provenance, prior checkpoint/root, and the newly
  computed `GitHubReleaseTrustCheckpoint`, or an explicit blocked checkpoint
  failure;
- one `GitHubReleaseIndependentVerification` for every verified
  post-activation release;
- issue codes and derived counts;
- a canonical `observation_sha256`; and
- policy mutation and release false.

`scope: full` requires the live policy observation and all published releases.
`scope: release_attestation` verifies one exact release-event tag and
explicitly records that policy drift was not assessed.

Sequence one may record `repository_bootstrap_recovery` predecessor
provenance. That provenance binds the committed recovery digest, USER grant,
blocked-run count, original policy introduction, genesis, and bootstrap root.
It remains monitoring evidence with reset and release false. Later
observations return to ordinary `github_actions_artifact` provenance.

## 5. Attestation Verification

`github-release-publisher.js` and
`github-release-integrity-monitor.js` accept an attestation only after
`gh release verify TAG --repo OWNER/REPO --format json` exits successfully.
They then constrain the returned verified projection:

1. The bundle uses Sigstore bundle v0.3 and a signed DSSE in-toto envelope.
2. The strict-base64 DSSE payload parses as JSON and canonically equals the
   CLI verification-result statement.
3. The verification result contains a valid timestamp no later than the
   retained verification time.
4. The certificate subject alternative name is
   `https://dotcom.releases.github.com`.
5. The statement is in-toto Statement v1 with GitHub release predicate v0.2.
6. Predicate repository, tag, and package URL are exact.
7. Exactly one package subject binds the full 40-character Git commit.
8. Every other subject is a uniquely named asset with a SHA-256 digest.
9. The complete raw verification JSON is retained and canonically hashed.

Phase 19C then separately verifies the bundle with pinned
`@sigstore/verify`. The verifier replays the complete root v1-to-current TUF
rotation, timestamp/snapshot/targets signatures and links, trusted-root target
digest, Fulcio chain, release-service certificate identity, RFC 3161
timestamp, DSSE signature, and exact statement subjects. It also requires the
CLI statement to equal the signed DSSE statement. TUF expiry is evaluated
against the observation's explicit clock, not the root wrapper's retrieval
time.

This prevents a CLI projection, valid attestation for release B, modified
trust target, or recomputed wrapper digest from satisfying release A. See
`github-release-independent-verification.md`.

## 6. Publisher v0.5

New `GitHubReleaseAuthorization` artifacts use schema `0.5`. In addition to
the Phase 19A policy check, they bind the exact attestation-verifier profile
and require GitHub CLI `2.93.0` or newer, pinned Sigstore verification, and
the exact GitHub TUF source and bootstrap. They also bind one fresh Phase 19D
checkpoint, its exact retained root, and the latest non-genesis full-monitor
artifact lineage. The provider artifact is release-eligible only when its
uniquely named full observation is schema-valid, replays the checkpoint
transition, equals the archived root/checkpoint, and reports `ready` from a
successful run.

Before publication, the active publisher rejects every authorization version
older than v0.5 and validates the repository-contained root and checkpoint
against the current clock and the complete authorization window. It resolves
the latest eligible artifact from the exact committed policy at authorization
and again before release creation; it then rechecks authorization freshness,
repository/CI/notes state, target absence, and immutable-policy state. Local,
bootstrap, superseded, blocked-observation, or schema-invalid root/checkpoint
state cannot enter publication.

After publication, the publisher:

1. verifies release body, target, resolved tag, latest state, and immutable
   state;
2. retries attestation availability at most six times with ten-second waits;
3. normalizes and retains the verified bundle and statement;
4. independently verifies the retained bundle and signed statement under the
   preflighted root; and
5. embeds and replays the exact trust checkpoint; and
6. emits `GitHubReleaseReceipt` `0.5` only when every binding matches.

Attestation delay can leave a correctly created release without a receipt.
An exact retry verifies the existing release and may finish the receipt even
after authorization expiry only when GitHub recorded publication inside the
original authorization window and current trust evidence remains fresh. It
must not recreate, delete, retarget, or repair the release.

Historical authorization and receipt versions remain readable. Version `0.3`
retains the CLI attestation, and version `0.4` adds Phase 19C independent
verification, but neither can enter active publication without Phase 19D
checkpoint continuity.

## 7. Operations

Run a full local observation with an authenticated repository administrator:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release_integrity.js \
  monitor \
  --repository-root . \
  --policy .github/release-integrity-policy.json \
  --trusted-root-output .cannae/release-integrity/manual-root.json \
  --trust-checkpoint-output .cannae/release-integrity/manual-checkpoint.json \
  --output .cannae/release-integrity/manual.json \
  --scope full \
  --trigger manual
```

Run the exact release-event scope:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release_integrity.js \
  monitor \
  --repository-root . \
  --policy .github/release-integrity-policy.json \
  --trusted-root-output .cannae/release-integrity/release-root.json \
  --trust-checkpoint-output .cannae/release-integrity/release-checkpoint.json \
  --output .cannae/release-integrity/release-v0.3.0.json \
  --scope release_attestation \
  --expected-tag v0.3.0 \
  --trigger release
```

Run authoritative observations from a synchronized default-branch checkout.
A feature branch, stale HEAD, uncommitted policy edit, activation commit
outside HEAD ancestry, or output path that resolves through a parent symlink
blocks before readiness. Exit zero means the requested scope is ready. Exit
nonzero means blocked.
Always inspect the retained observation; the exit code alone does not identify
credential failure, policy drift, baseline drift, mutability, or attestation
failure.

## 8. GitHub Actions

`.github/workflows/release-integrity.yml` runs:

- `release-attestation` on every published release using the short-lived
  repository `GITHUB_TOKEN`;
- `full-monitor` every six hours and on default-branch manual dispatch;
- `full-monitor` on every push to `main` so a new checkpoint policy can
  establish its first retained artifact inside the bootstrap window;
- artifact retention for each observation, including blocked observations;
- retention of the exact trusted-root and trust-checkpoint artifacts when
  continuity succeeds.

The workflow grants only `actions: read`, `contents: read`, and
`attestations: read`. Actions read permits exact run-attempt and artifact
inspection; it does not permit reruns or cancellation. Event tag, actor, run,
and ref values enter the shell through quoted environment variables rather
than direct expression interpolation. The optional Administration-read secret
is exposed only to the full-monitor command step, not to checkout, Node setup,
dependency installation, or artifact-upload actions. Both jobs install the
exact lockfile with `npm ci --ignore-scripts` before loading the schema
validator.

Each job first requires the exact default-branch `github.workflow_ref`, checks
out immutable `github.workflow_sha` with full history, restores the `main`
branch identity, and then requires equality with current origin `main`.
Release-tag `github.sha` is input data, never executable monitor source. Every
third-party action is pinned to a full commit SHA. The workflow has no narrow
push path filter, so every merged change produces a monitor run and a newly
introduced runtime input cannot silently escape checkpoint acquisition.

The full monitor first tries `CANNAE_IMMUTABILITY_MONITOR_TOKEN` and otherwise
uses the job token. If the active token cannot read repository Administration,
the observation records `credential_unavailable` and the job fails.

The only partial-artifact exception is Phase 19E. It accepts exactly the
two-file observation/root shape, only the two enumerated initial checkpoint
failure codes, every matching failed run, one fresh committed USER recovery,
and the newest in-progress first attempt at current `HEAD`. It cannot consume
a successful run, a complete checkpoint, a deleted artifact, an unknown
issue, a rerun, incomplete history, or an expired authorization. The accepted
run can advance checkpoint continuity while remaining blocked on an
independent credential issue.

Live acceptance on 2026-07-28 used push run `30338646806` to advance the
USER-authorized recovery from sequence zero to one, then a distinct manual
first-attempt run `30338779941` to consume that complete provider artifact
and advance from sequence one to two. The second observation recorded
`github_actions_artifact`, not recovery, as predecessor provenance. Both
three-file artifacts replayed successfully and remained blocked only on the
missing monitor credential. Exact run, artifact, checkpoint, and digest
evidence is retained in `github-release-trust-checkpoint-continuity.md`.

Do not place the owner's broad `gh` OAuth token in this secret. Use a
repository-selected fine-grained token held by a dedicated monitoring
principal, with Administration **read-only**, or inject an equivalently
scoped short-lived GitHub App installation token. Store only that credential:

```bash
gh secret set CANNAE_IMMUTABILITY_MONITOR_TOKEN \
  --repo wnsdy95/cannae-os
```

The workflow does not run on pull requests, fetches full history so activation
ancestry can be proven, and performs no mutation request. A failed scheduled
run is the alert signal. It does not open issues or change policy
automatically.

## 9. Incident Disposition

| Finding | Automatic effect | Required disposition |
| --- | --- | --- |
| Credential unavailable | Block and retain partial observation | Restore or rotate least-privilege monitor identity |
| Policy disabled | Block and report drift | USER decides whether a new Phase 19A authorization is appropriate |
| Grandfather baseline drift | Block | Investigate remote tag/release history; never rewrite automatically |
| Post-activation mutable release | Block | Treat as release-control incident |
| Missing or mismatched attestation | Block | Retry bounded verification, then investigate GitHub/release state |
| TUF root or metadata unavailable, stale, or invalid | Block and retain explicit trust failure | Investigate network, metadata rotation, expiry, or bootstrap integrity |
| Prior checkpoint missing, stale, forked, rolled back, equivocated, or no longer retained | Block without older/bootstrap fallback | Investigate workflow and artifact lineage; no automatic reset |
| Initial runs retained only exact recoverable observation/root pairs | Block unless the USER issues the bounded Phase 19E contract inside the original bootstrap window | Generate the contract from provider evidence; never delete, rerun, or fall back |
| Historical rerun has a newer stable run, or prior attempt identity differs | Block as checkpoint fork | Inspect exact run/attempt history; do not mint replacement genesis |
| Full observation is missing, blocked for release use, malformed, or differs from the archived root/checkpoint | Block release admission | Replay the exact observation triplet; never trust a two-file or self-asserted checkpoint |
| Independent bundle replay fails | Block | Compare raw bundle, root, signed statement, package lock, and verifier code |
| Asset digest mismatch | Block | Quarantine the asset and investigate publication provenance |

No finding grants rollback, deletion, repair, policy activation, or a new
release. Those remain separate exact USER decisions.

## 10. Limits

- GitHub remains the release control plane, attestation signer, timestamp
  authority, and immutable-state reporter.
- The monitor uses both GitHub CLI and pinned `@sigstore/verify`, but both run
  in the same job and therefore do not establish an independent
  infrastructure failure domain.
- GitHub still operates the signer, Fulcio/TSA trust services, and TUF mirror.
  This repository verifies their retained evidence but does not operate them.
- Policy-state freshness depends on the workflow actually running. GitHub
  schedule delay or workflow disablement is an external availability risk.
- Artifact retention is 30 days; long-term external transparency witnessing
  is not yet implemented.
- GitHub hosts both the workflow metadata and checkpoint artifact. The chain
  detects many local substitutions but is not independently durable against
  GitHub deletion or equivocation.
- Generated source archives are outside attested asset verification.
- The current profile supports public, stable releases and at most 100 listed
  releases before requiring policy revision.
- Credential custody, protected USER signatures, signed tags, independent
  witnesses, and provider-neutral release adapters remain external or future
  controls.
