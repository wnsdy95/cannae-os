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
   policy bytes equal the current policy;
3. exclude the current run and select the latest eligible run;
4. require exactly one artifact named
   `release-integrity-<run-id>-<attempt>`;
5. bind artifact ID, GitHub SHA-256 digest, run ID, head SHA, creation time,
   expiry, and non-expired state;
6. verify the downloaded ZIP bytes against GitHub's digest;
7. reject unsafe member paths and read only one uniquely named checkpoint and
   trusted-root file through bounded in-memory extraction; and
8. require the checkpoint producer to equal the exact workflow, run,
   attempt, and head commit.

If the latest eligible run exists but its expected artifact is missing, the
store does not fall back to an older run or repository bootstrap. That
behavior makes deletion or interrupted lineage visible instead of silently
accepting an older state.

The repository bootstrap is usable only when no eligible artifact lineage
exists and only for four hours after the first commit that introduced
`trust_checkpoint_policy`. Ordinary later policy edits do not reopen this
window. The bootstrap contains one explicit USER grant and cannot authorize a
release or a future reset.

## 6. Monitor v0.3

`GitHubReleaseIntegrityPolicy` v0.3 binds:

- the bootstrap checkpoint and root paths;
- exact workflow, artifact prefix, and retained filenames;
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

The workflow runs the full monitor on relevant pushes to `main`, every six
hours, every release event, and manual dispatch. It retains the observation,
trusted root, and checkpoint together for 30 days. Both successful and
blocked monitor conclusions may produce evidence; missing or malformed
checkpoint evidence remains blocked.

## 7. Publisher v0.5

Active release authorization and publication accept only schema v0.5.

Before issuing the USER authorization, the publisher:

1. loads a repository-contained trusted root and trust checkpoint;
2. validates both against the issuance clock and full authorization window;
3. requires their exact digest and state equality; and
4. binds checkpoint ID, sequence, digest, record time, paths, root IDs and
   digests into the authorization and USER-grant digest.

Immediately before any `gh release create` call, publication reloads the same
two paths, revalidates freshness, and requires exact equality with the
authorization. Missing files, path substitution, stale state, a different
valid checkpoint, or legacy v0.4 authorization all stop with zero release
creation calls.

The terminal v0.5 receipt embeds the full checkpoint and trusted root. Receipt
semantics replay both contracts and retain release authority only from the
exact USER authorization.

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
commands:

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
| ZIP path is unsafe or retained file is missing/duplicated/oversized | block |
| Repository bootstrap window expired | block |
| Ordinary policy edit attempts to reopen bootstrap | block |
| Publisher path, checkpoint, root, or authorization binding differs | deny before publication |
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
substitution, and archive path attacks.
