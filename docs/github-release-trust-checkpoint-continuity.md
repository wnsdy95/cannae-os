# GitHub Release Trust Checkpoint Continuity

## 1. Purpose

Phase 19C proves that one retained GitHub TUF chain and release bundle verify
at one explicit time. By itself, that does not prove that GitHub has not
served an older but still correctly signed state than a client previously
accepted.

Phase 19D retains the prior trusted state and compares every later refresh
against it. It detects rollback, same-version equivocation, root-chain
discontinuity, backdated retrieval, stale predecessors, sequence forks, and
checkpoint substitution before monitor readiness or release publication.

This is continuity evidence, not release authority:

```text
human_final_decision_authority = USER
monitoring_only = true
checkpoint_reset_authorized = false
release_authorized = false
```

## 2. Source Findings

The [TUF specification](https://theupdateframework.github.io/specification/latest/)
requires clients to persist trusted timestamp, snapshot, and targets metadata
to non-volatile storage. A client compares newly received versions with
previously trusted versions, rejects rollback, aborts on same-version
timestamp metadata, checks expiry for freeze resistance, and advances root
metadata exactly from `N` to `N+1`.

GitHub's
[Actions artifact REST API](https://docs.github.com/en/rest/actions/artifacts?apiVersion=2026-03-10)
projects an artifact ID, name, SHA-256 archive digest, expiry, and workflow-run
ID and head SHA. These fields can bind a retained checkpoint archive to one
workflow execution.

GitHub also documents that artifacts can be deleted by a repository writer,
expire under configurable retention, and disappear with a deleted workflow
run. A deleted artifact cannot be restored. See
[Removing workflow artifacts](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts).

GitHub's
[rerun guidance](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
states that a rerun retains the original `GITHUB_SHA` and `GITHUB_REF`.
The [variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
distinguishes stable run ID/number from the incrementing run attempt, and the
[workflow-run REST API](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10)
provides one exact prior-attempt endpoint under Actions read permission.
Therefore a rerun is another attempt of one stable run, not a newly ordered
checkpoint event.

The resulting boundary is deliberate:

```text
TUF monotonic comparison
+ exact checkpoint predecessor
+ exact GitHub run and artifact digest
= same-provider continuity evidence

same-provider continuity evidence
!= independent durable archive
!= external witness
!= protection from GitHub equivocation
```

## 3. Checkpoint Contract

`GitHubReleaseTrustCheckpoint` v0.1 records:

- one repository and default branch;
- a monotonically increasing sequence;
- either one explicit USER-authorized genesis or the exact prior checkpoint
  ID, digest, and sequence;
- root, timestamp, snapshot, and targets versions, digests, and expiries;
- the complete trusted-root artifact digest, normalized root digest, target
  digest, retrieval time, and checkpoint evaluation time;
- transition classification and per-role version deltas;
- current-root, root-chain, and same-version consistency results;
- repository-bootstrap, GitHub Actions, or local producer identity;
- a canonical checkpoint digest; and
- USER final authority with reset and release false.

Validation requires an external evaluation clock. The checkpoint's
`recorded_at` value is evidence and never becomes the current-time authority.
The default maximum checkpoint age is 12 hours.

## 4. Transition Rules

A non-genesis checkpoint is accepted only when:

1. its predecessor is valid and fresh at the current evaluation time;
2. the supplied predecessor root exactly matches the prior trusted state;
3. every role version is greater than or equal to the prior version;
4. equal versions retain equal signed metadata digests;
5. the current retained root chain contains the exact prior root bytes;
6. equal targets versions retain equal target and normalized-root digests;
7. the current retrieval time does not precede the prior retrieval time;
8. the new sequence is exactly the prior sequence plus one; and
9. the new producer and repository scope are valid.

The runtime does not infer a reset from missing, stale, or conflicting state.
It blocks.

## 5. Provider Artifact Store

`github-release-checkpoint-store.js` resolves one predecessor:

1. list completed default-branch runs for the exact release-integrity
   workflow;
2. retain only runs whose head is in current ancestry and whose committed
   policy bytes equal the current policy, and require `status: completed`,
   exact default-branch provenance, valid stable run number, attempt, creation
   time, and commit identity;
3. exclude the current run and select the greatest stable run number, never a
   mutable `updated_at` string;
4. require exactly one artifact named
   `release-integrity-<run-id>-<attempt>`;
5. bind artifact ID, GitHub SHA-256 digest, run ID, head SHA, creation time,
   expiry, and non-expired state;
6. verify the downloaded ZIP bytes against GitHub's digest;
7. reject unsafe member paths and read exactly one uniquely named checkpoint,
   trusted-root, and `full-observation.json` through bounded in-memory
   extraction;
8. schema-validate and semantically replay the full observation, requiring its
   root and current checkpoint to equal the other two archive members; and
9. require the checkpoint producer and observation to equal the exact
   workflow, run, attempt, default branch, and head commit.

Observation time may precede artifact creation by at most 60 seconds to
accommodate GitHub API timestamp precision. This tolerance does not extend
checkpoint age, authorization, trusted-root expiry, or artifact expiry.

For attempt two or later, the store inspects the exact current attempt and
its immediately preceding attempt. It may consume only that prior attempt.
If any newer eligible stable run already exists, rerunning the historical run
is a fork attempt and blocks. Missing run identity, a skipped attempt, an
incomplete prior attempt, an off-default-branch attempt, or a different
workflow, run number, policy, commit, or conclusion also blocks.

If the latest eligible run exists but its expected artifact is missing, the
store does not fall back to an older run or repository bootstrap. That
behavior makes deletion or interrupted lineage visible instead of silently
accepting an older state.

The repository bootstrap is usable only when no eligible artifact lineage
exists and only for four hours after the first commit that introduced
`trust_checkpoint_policy`. Ordinary later policy edits do not reopen this
window. The bootstrap contains one explicit USER grant and cannot authorize a
release or a future reset.

Before the first merge that can create provider lineage, refresh and validate
the committed bootstrap root and genesis checkpoint against one explicit UTC
clock, bind the genesis producer to the current pre-merge default-branch HEAD,
and complete the first `main` monitor run before both the four-hour bootstrap
window and the twelve-hour predecessor-age limit expire. The bootstrap window
does not make a stale root or genesis acceptable. Once an eligible artifact
lineage exists, never rewrite the bootstrap files; any later reset requires a
separate exact USER decision and a new contract.

## 6. Monitor v0.3

`GitHubReleaseIntegrityPolicy` v0.3 binds:

- the bootstrap checkpoint and root paths;
- exact workflow, artifact prefix, and all three retained filenames;
- a 12-hour predecessor age;
- a four-hour one-time bootstrap window;
- a bounded 100-run search;
- fail-closed missing-predecessor behavior; and
- `independent_persistence_required: false`.

`GitHubReleaseIntegrityObservation` v0.3 retains either:

- verified predecessor provenance, prior checkpoint, prior root, and newly
  computed checkpoint; or
- an explicit checkpoint failure code and message.

Readiness requires checkpoint continuity in addition to the Phase 19B policy
and release checks and the Phase 19C TUF and Sigstore checks. Observation
validation recomputes the transition deterministically from the embedded
predecessor, roots, producer, and observation clock.

The workflow runs the full monitor on every push to `main`, every six hours,
and default-branch manual dispatch. Release events run only the exact
release-attestation job. It retains the observation, trusted root, and
checkpoint together for 30 days. A blocked observation may remain a
continuity predecessor when its checkpoint transition itself replays, but
only a successful `ready` full observation may enter release authorization.

Both jobs require the exact default-branch `github.workflow_ref`, check out
the immutable `github.workflow_sha`, restore the local branch identity, fetch
full history, and require that commit to equal current origin `main`.
Checkout, Node setup, and artifact upload actions are pinned to full commit
SHAs. The job token has `actions: read`, `attestations: read`, and
`contents: read`. There is no narrow push path filter, so any merged change
creates a new checkpoint-producing run and future runtime dependencies cannot
silently escape the trigger closure.

## 7. Publisher v0.5

Active release authorization and publication accept only schema v0.5.

Before issuing the USER authorization, the publisher:

1. loads a repository-contained trusted root and trust checkpoint;
2. rejects schema-invalid nested fields before external mutation and validates
   both artifacts against the issuance clock and authorization window;
3. loads the exact committed release-integrity policy and resolves the latest
   eligible full-monitor artifact through the provider store;
4. requires a schema-valid, semantically replayable, successful `ready` full
   observation whose embedded root/checkpoint equal the archive pair;
5. rejects repository bootstrap, local producers, sequence zero, or any local
   root/checkpoint bytes that do not equal that artifact;
6. cross-checks workflow, stable run, attempt, commit, artifact ID, exact
   artifact name, archive digest, creation, and expiry metadata; and
7. binds that lineage plus checkpoint/root identifiers and digests into the
   authorization and USER-grant digest.

Immediately before any `gh release create` call, publication reloads the same
two paths, revalidates their schemas and freshness, resolves the latest
artifact again, and then rechecks authorization time, repository, CI, notes,
tag/release absence, and immutable-policy state. Missing files, path
substitution, stale state, a blocked or forged observation, a different valid
checkpoint, newly superseded artifact lineage, policy drift during resolution,
or legacy v0.4 authorization all stop with zero release creation calls.

The terminal v0.5 receipt embeds the full checkpoint and trusted root. Receipt
semantics require a non-genesis exact-repository GitHub Actions producer,
replay both contracts, and retain release authority only from the exact USER
authorization. If immutable publication succeeded inside the authorization
window but post-create attestation verification failed, a later retry may
verify that exact existing release with currently fresh trust evidence. It
never creates a second release or adopts a release published outside the
original window.

## 8. Operations

The monitor requires separate root, checkpoint, and observation outputs:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release_integrity.js \
  monitor \
  --repository-root . \
  --policy .github/release-integrity-policy.json \
  --trusted-root-output .cannae/release-integrity/github-trusted-root.json \
  --trust-checkpoint-output .cannae/release-integrity/github-release-trust-checkpoint.json \
  --output .cannae/release-integrity/full-observation.json \
  --scope full \
  --trigger manual
```

For an exact release, download the latest eligible full-monitor artifact into
the target repository's release directory. Validate the checkpoint with an
explicit current clock, then pass the same root and checkpoint paths to both
commands. The local copy is not sufficient by itself: authorization and
publication independently query the Actions artifact lineage and require the
copy to equal the latest eligible artifact.

```bash
node validator-cli-prototype/validate.js \
  .cannae/releases/<tag>/github-release-trust-checkpoint.json \
  github-release-trust-checkpoint \
  --evaluated-at <current-UTC-timestamp>

node codex-skills/controls-doctrine-operator/scripts/operate_github_release.js \
  authorize \
  --repository-root . \
  --repository <owner/repo> \
  --tag <tag> \
  --name "<release name>" \
  --notes <release-notes.md> \
  --run-id <successful-main-validate-run> \
  --grant-id <USER-grant-id> \
  --trusted-root .cannae/releases/<tag>/github-trusted-root.json \
  --trust-checkpoint .cannae/releases/<tag>/github-release-trust-checkpoint.json \
  --output .cannae/releases/<tag>/authorization.json

node codex-skills/controls-doctrine-operator/scripts/operate_github_release.js \
  publish \
  --repository-root . \
  --authorization .cannae/releases/<tag>/authorization.json \
  --trusted-root .cannae/releases/<tag>/github-trusted-root.json \
  --trust-checkpoint .cannae/releases/<tag>/github-release-trust-checkpoint.json \
  --receipt .cannae/releases/<tag>/receipt.json
```

Never create a replacement genesis or edit sequence state to recover a
blocked lineage. The current runtime has no reset operation. Missing or
conflicting retained state requires incident investigation and a future
separately designed, exact USER-authorized reset contract.

## 9. Failure Rules

| Condition | Result |
| --- | --- |
| Prior checkpoint missing, stale, or invalid | block |
| Sequence gap or predecessor digest mismatch | block |
| Any TUF role version decreases | block as rollback |
| Same role version has different signed bytes | block as equivocation |
| Prior root is absent from the current root chain | block |
| Retrieval time moves backward | block |
| Latest eligible artifact is absent or ambiguous | block without fallback |
| Archive digest, run, head, workflow, or producer differs | block |
| Historical rerun occurs after a newer stable run | block as a lineage fork |
| Rerun is off the default branch or does not bind one completed immediately prior attempt | block |
| ZIP path is unsafe or checkpoint, root, or full observation is missing/duplicated/oversized | block |
| Full observation is malformed, cannot replay its transition, or differs from the archived root/checkpoint | block |
| Repository bootstrap window expired | block |
| Ordinary policy edit attempts to reopen bootstrap | block |
| Publisher receives genesis, local, or non-latest artifact state | deny before authorization |
| Publisher receives a blocked observation or failed producer run | deny before authorization |
| Publisher path, checkpoint, root, latest lineage, or authorization binding differs | deny before publication |
| Authorization expires or repository/immutability state drifts during lineage resolution | deny before publication |
| Checkpoint schema contains a nested undeclared field | deny before artifact lookup or publication |
| Checkpoint attempts reset or release authority | reject |

## 10. Limits

- GitHub controls the workflow service, run records, artifact service, and
  TUF repository. One provider can delete or present inconsistent evidence.
- Actions artifacts are retained for 30 days in this workflow and are not a
  long-term archive.
- The checkpoint chain has no independent witness, gossip, transparency log,
  protected monotonic counter, or external trusted-time source.
- A GitHub Actions outage or failed artifact upload can halt continuity.
  Availability is intentionally subordinate to fail-closed rollback
  detection.
- The committed USER grant is integrity-bound by repository history, not a
  protected USER digital signature.
- Independent cross-provider persistence and monitor liveness remain the next
  hardening boundary.

## 11. Validation

```bash
node run-github-release-trust-checkpoint-fixtures.js
node run-github-release-integrity-fixtures.js
node run-github-release-publisher-fixtures.js
node validator-cli-prototype/run-fixtures.js
```

The checkpoint fixtures cover monotonic transitions, rollback, equivocation,
root discontinuity, backdated retrieval, stale state, forked sequences,
authority expansion, bounded bootstrap, ordinary-policy-change replay,
latest-artifact selection, missing-artifact non-fallback, producer
substitution, stable run ordering, exact rerun attempts, historical-rerun
fork rejection, real ZIP observation requirements, deterministic observation
replay, nested schema drift, and archive path attacks. Publisher fixtures
additionally prove non-genesis ready-artifact admission, schema-first trusted
root validation, pre-create time/state/lineage revalidation, and exact
post-create reconciliation.
