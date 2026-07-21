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

The store writes atomically while holding a repository-namespace manifest lock. Every write first records a transaction journal, then writes the artifact, then commits an immutable manifest-history entry, current manifest, and digest sidecar. If an artifact path already contains identical bytes, the write is idempotent. If it contains different bytes, the operation fails unless `--overwrite` or `--overwrite-artifact` is explicit. Normal agents must not overwrite prior evidence merely to make a run pass.

The lock is acquired through atomic directory creation and has a finite wait timeout. A stale lock is recovered only when it belongs to the same host and its PID is no longer alive. An active same-host lock and any foreign-host lock fail closed rather than being stolen. `--lock-timeout-ms` and `--lock-stale-ms` are available for the general artifact-store CLI; both must be positive integers.

## 4. Manifest

Each repository namespace has one `RepositoryArtifactManifest` containing:

- opaque repository key and fingerprint;
- current Git head;
- artifact ID, mission, wave, and kind;
- relative repository-scoped path;
- filename, content type, byte size, and SHA-256;
- creation and update timestamps;
- a monotonic manifest revision;
- isolation control assertions.
- the previous manifest digest, current canonical digest, retained history range, and zero-pending-transaction assertion.

Each history entry links to the prior canonical manifest SHA-256. `manifest.sha256` anchors the current bytes. `validator-cli-prototype/validate.js` blocks namespace mismatch, path traversal, cross-repository paths, count mismatch, invalid history ranges, digest mismatch, missing concurrency/journal guards, duplicate paths, and filename/ID mismatch.

## 5. Crash Recovery and Verification

Journal states are `prepared`, `artifact_written`, and `manifest_committed`. Recovery runs only while holding the namespace lock:

- a prepared journal with no candidate bytes is archived as rolled back;
- candidate bytes with the declared hash are reconciled into the candidate manifest;
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

The isolation fixture covers namespace and path controls. The concurrency fixture launches 24 writers and exercises lock ownership. The recovery fixture injects failures after artifact write and after manifest commit, reconciles both states, and detects artifact and manifest tampering.
