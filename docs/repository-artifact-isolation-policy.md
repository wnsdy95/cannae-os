# Repository Artifact Isolation Policy

## 0. Purpose

This policy prevents outputs from different target repositories from being mixed during multi-repository AI operations.

```text
One repository identity -> one artifact namespace.
One mission -> one mission subtree inside that namespace.
No explicit repository -> no durable artifact write.
```

The policy applies to durable AI control evidence and deliverables, including routing receipts, compilations, preflight projections, usage events, reports, Markdown, JSON, images, PDFs, and other files that must survive the current conversation.

It does not relocate ordinary compiler caches, dependency caches, Xcode DerivedData, test coverage, or build-system outputs. Those remain governed by the target repository's own build configuration.

## 1. Namespace Layout

All Cannae-managed artifacts use this layout under the selected artifact root:

```text
.cannae/artifacts/
└── repositories/
    └── <repository-key>/
        ├── manifest.json
        ├── manifest.sha256
        ├── .manifest-history/
        ├── .manifest.lease/
        ├── .fencing-token
        ├── .transactions/
        └── missions/
            └── <mission-id>/
                └── <wave-id>/
                    ├── routing-receipts/
                    ├── model-assignment-compilations/
                    ├── integrated-mission-preflights/
                    ├── model-usage-events/
                    ├── reports/
                    └── <other-kind>/
```

The same mission, wave, kind, or artifact ID may appear in several repositories. The repository key keeps those paths distinct.

## 2. Repository Identity

`repository-artifact-store.js` resolves the target Git root and computes identity from:

1. normalized `remote.origin.url`, when available;
2. the real Git root path.

The visible key combines a readable repository label with the first 12 characters of a SHA-256 identity fingerprint. The manifest stores the fingerprint and current Git head, but not the remote URL, credentials, or absolute repository root.

The origin and real root are combined before hashing. Therefore, two clones or worktrees of the same origin remain separate local repository namespaces. Moving a working tree creates a new local identity; an explicit handoff is required when old artifacts must follow it.

## 3. Write Rules

Every durable write must declare:

- target repository;
- mission ID;
- wave ID;
- artifact kind;
- artifact ID;
- JSON payload or source file;
- optional shared artifact root.

Path segments must be single path-safe identifiers. POSIX/Windows absolute artifact paths, `..` traversal, symlink source files, and namespace symlinks that escape the artifact root are rejected.

The store writes while holding an expiring repository-namespace lease. Every successful acquisition receives a monotonically increasing fencing token from `.fencing-token`. The writer records a transaction journal, writes the artifact, creates an immutable manifest-history entry with no-overwrite semantics, rechecks lease ownership and token, then replaces the current manifest and digest sidecar. If an artifact path already contains identical bytes, the write is idempotent. If it contains different bytes, the operation fails unless `--overwrite` or `--overwrite-artifact` is explicit. Normal agents must not overwrite prior evidence merely to make a run pass.

The lease is acquired through atomic directory creation and has a finite TTL. An unexpired owner record cannot be stolen, including across hosts. An expired record may be replaced only after the contender obtains the atomic recovery marker, confirms the same expired owner, removes that lease directory, obtains a higher fencing token, and creates a new owner record. Every write phase revalidates lease ID, token, and expiry; a resumed old writer is fenced. `--lease-timeout-ms` controls acquisition wait and `--lease-ttl-ms` controls validity. The legacy `--lock-timeout-ms` and `--lock-stale-ms` flags remain compatibility aliases.

`.manifest.lease/` is transient coordination state and may be absent while idle. `.fencing-token` is durable namespace state and must never be reset, copied backward, or edited by an agent.

### 3.1 Publication-Time Appraisal

Internal controllers may pass a synchronous `publicationGuard` to the JavaScript
store API. It runs under the existing namespace lease, after pending transactions
are recovered and integrity is verified, but before preparing the new journal.
The predicate receives a deeply frozen copy of `{ repository, artifactRoot,
manifest }`; `manifest` is null in a new namespace. It must return exactly `true`.
Exceptions, false-like or truthy non-boolean results, asynchronous predicates,
and a lease that expires during appraisal deny publication. Namespace writes or
recovery from inside that predicate are rejected; ordinary read-only verification
is allowed. Predicates must not perform external effects or long-running checks.

`reuseExisting: true` permits an exact retained artifact to be returned without
a new manifest revision, but only after the same guard succeeds. The result has
`transaction_id: "none"`; the acquisition token is not a new committed revision.
The generic CLI does not accept predicates or infer authority from artifact kind.

Wave plan/campaign/context/report/closeout publication and new dispatch policy,
lease, and tool-allow publication use this boundary to recheck campaign readiness.
Gateway allow decisions and authorized/executing events also recheck current
lease/checkpoint binding and authorization expiry. Already-admitted baseline and
post-tool checkpoints, denial, cancellation, and recovery remain recordable.
Supervisor challenge and cycle-order publication now use the same primitive.
Exact order reuse rechecks current readiness; a new challenge also requires its
unchanged signed manifest and finite window. Read
[guarded supervisor publication](bounded-self-improvement-operations.md#281-guarded-supervisor-publication)
for partial issuance and recovery handling.
An artifact or ready projection is a historical observation, not durable immunity
from a later stop; consumers must still reappraise current authority.

Every cooperating writer first reconciles older journals. Thus a crashed allow
whose bytes were written is recovered before a later stop record can commit;
a prepared write without candidate bytes is rolled back. Recovery never moves
that older transaction after a committed stop. The race and crash fixtures test
both orderings, exact reuse, stale leases, and all four injection boundaries.

This is a local publication primitive, not authenticated campaign cancellation,
an atomic multi-artifact operation, or a protected execution environment. Raw
store writers can omit a predicate, and the shared-filesystem limits in section 9
still apply. USER stop/restart contracts, complete terminal settlement, and
process cancellation remain separate.

## 4. Manifest

Each repository namespace has one `RepositoryArtifactManifest` containing:

- opaque repository key and fingerprint;
- current Git head;
- artifact ID, mission, wave, and kind;
- relative repository-scoped path;
- filename, content type, byte size, and SHA-256;
- creation and update timestamps;
- a monotonic manifest revision;
- isolation control assertions;
- coordination backend, lease ID, and fencing token;
- the previous manifest digest, current canonical digest, retained history range, and zero-pending-transaction assertion.

Each history entry links to the prior canonical manifest SHA-256. Its fencing token may remain equal for revisions committed under one lease, must increase when a new lease epoch commits, and must never decrease or be reused by a different lease ID. `manifest.sha256` anchors the current bytes. `validator-cli-prototype/validate.js` blocks namespace mismatch, path traversal, cross-repository paths, count mismatch, invalid history ranges, digest mismatch, missing lease/fencing/journal guards, duplicate paths, and filename/ID mismatch.

## 5. Crash Recovery and Verification

Journal states are `prepared`, `artifact_written`, and `manifest_committed`. Recovery runs only while holding a valid replacement or renewed namespace lease:

- a prepared journal with no candidate bytes is archived as rolled back;
- candidate bytes with the declared hash are reconciled into the candidate manifest;
- a revision reserved by an immutable history entry is finalized exactly, even when the original writer failed before moving the manifest head;
- a manifest already at the candidate hash is finalized idempotently;
- an unexpected artifact or manifest hash fails closed for manual recovery.

Verify before every wave completion and before consuming proof:

```bash
node repository-artifact-verify.js \
  --repository ../target-repo \
  --artifact-root .cannae/artifacts
```

Use `--recover` only to reconcile a valid pending journal. Recovery does not repair arbitrary tampering.

## 6. Runtime Use

### 6.1 Routing receipt

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js \
  --receipt \
  --scope=agent \
  --mission=MIS-example \
  --wave=W1 \
  --agent=plans-agent \
  --actor=ai \
  --role=S3 \
  --department=operations \
  --authority=scoped-execution \
  --write-artifact \
  --target-repository ../target-repo \
  --artifact-root .cannae/artifacts \
  "Route plans-agent work." .
```

Local target and artifact-root paths are redacted from `router_command` before the receipt is stored.

### 6.2 Model assignment compilation

```bash
node model-assignment-compiler.js \
  sample-payloads/valid-model-registry.json \
  sample-payloads/valid-model-assignment-request.json \
  --write-artifact \
  --repository ../target-repo \
  --artifact-root .cannae/artifacts
```

### 6.3 Integrated preflight

```bash
node integrated-mission-preflight-runner.js \
  sample-payloads/valid-integrated-mission-preflight.json \
  --write-artifact \
  --repository ../target-repo \
  --artifact-root .cannae/artifacts
```

If artifact persistence fails, the integrated preflight changes to `blocked` and clears dispatch and usage-event manifests.

### 6.4 General JSON output

```bash
node some-json-runner.js input.json | \
node repository-artifact-store.js \
  --repository ../target-repo \
  --artifact-root .cannae/artifacts \
  --mission MIS-example \
  --wave W1 \
  --kind projections \
  --artifact-id PROJ-example
```

Use `set -o pipefail` when a shell pipeline must propagate the producer's failure.

### 6.5 General file deliverable

```bash
node repository-artifact-store.js \
  --repository ../target-repo \
  --artifact-root .cannae/artifacts \
  --mission MIS-example \
  --wave W1 \
  --kind reports \
  --artifact-id REPORT-example \
  --source ./report.md
```

The stored filename is derived from `artifact-id` and the source extension. The original source path is not recorded in the manifest.

## 7. Multi-Repository Campaign Procedure

1. Choose one shared artifact root for the campaign.
2. Resolve every target repository separately.
3. Create routing receipts with that target repository explicitly declared.
4. Store every durable control projection and deliverable under the same target repository identity.
5. Never copy an artifact into another repository namespace. Generate a new artifact or an explicit handoff package for the receiving repository.
6. Run `repository-artifact-verify.js` for each repository before wave completion; a pending journal or integrity issue blocks continuation.
7. Include repository-scoped artifact paths in SITREP, handoff, and AAR evidence.

Subdirectories that are not independent Git roots belong to the parent repository namespace. A nested Git repository receives its own namespace.

## 8. Regression Gate

```bash
node run-repository-artifact-isolation-fixtures.js
node run-repository-artifact-concurrency-fixtures.js
node run-repository-artifact-recovery-fixtures.js
node validator-cli-prototype/run-fixtures.js
```

The isolation fixture covers namespace and path controls. The concurrency fixture launches 24 writers, checks monotonic fencing, recovers an expired foreign-host lease, blocks an unexpired lease, and fences a stale writer. The recovery fixture injects failures after artifact write, immutable history creation, and manifest commit, reconciles all states, verifies a same-lease migration plus write, and detects artifact and manifest tampering.

## 9. Coordination Boundary

The built-in backend is a shared-filesystem lease, not a consensus service. Its guarantees require coherent atomic `mkdir`, hard-link creation, rename, and read-after-write visibility for every writer, plus clocks accurate enough for the selected TTL. A local filesystem and a correctly configured strongly coherent shared filesystem are the intended deployments.

Do not use this backend as a partition-tolerant distributed lock. Under network partition, split-brain storage, delayed visibility, fencing-token rollback, or a filesystem without the required atomic operations, stop durable writes. Multi-host deployments that must survive those failures require an external linearizable coordinator such as etcd and a storage commit path that rejects every stale fencing token. A lease record alone cannot make an unsafe storage backend safe.
