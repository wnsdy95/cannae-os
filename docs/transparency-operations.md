# Transparency Operations

## 1. Purpose

Phase 13 extends verifier admission from one valid inclusion proof to continuously checked trust state. It answers a different question from Phases 11 and 12:

```text
Identity valid
+ exact verifier execution valid
+ fresh challenge valid
+ failure-domain independence valid
+ current transparency state valid
= verifier may enter quorum
```

This implementation does not operate Rekor, a TUF repository, witnesses, monitors, or a gossip network. It verifies and persists evidence produced by those systems, reconstructs an append-only state stream, and blocks campaign dispatch when the evidence is missing, stale, inconsistent, correlated, revoked, or incident-affected.

## 2. Research Basis

- [Rekor transparency overview](https://docs.sigstore.dev/logging/overview/) describes tamper-evident logging and the separate monitor responsibility.
- [rekor-monitor](https://github.com/sigstore/rekor-monitor) persists the last verified checkpoint and checks append-only consistency on later runs.
- [transparency-dev checkpoint formats](https://github.com/transparency-dev/formats/tree/main/log) define origin, tree size, root hash, and signed-note composition.
- [transparency-dev witness](https://github.com/transparency-dev/witness) retains one checkpoint per log, verifies a consistency proof, and countersigns the new checkpoint.
- [RFC 6962](https://www.rfc-editor.org/rfc/rfc6962.html) specifies domain-separated Merkle hashing, consistency proofs, and the need to exchange signed tree heads to detect split views.
- [The Update Framework specification](https://theupdateframework.github.io/specification/draft/) requires sequential root updates that satisfy both the previous root threshold and the new root's own threshold.
- [Sigstore's threat model](https://docs.sigstore.dev/about/threat-model/) treats root rotation, revocation, freshness, and threshold root control as distinct operational responsibilities.
- [Rekor v2 tiles](https://github.com/sigstore/rekor-tiles) uses time-sharded logs whose active and inactive shard information is distributed through Sigstore trust metadata.

The local implementation uses RFC 6962 SHA-256 leaf and node prefixes because the current Controls contracts and prior fixtures use that construction. It does not claim to implement an RFC 9162 log service.

## 3. Control Contracts

| Artifact | Responsibility | Mutable authority |
| --- | --- | --- |
| `TransparencyPolicy` | Pins logs, Ed25519 keys, witness/monitor registries, operator thresholds, initial trusted roots and TUF expiry, state age, and fail-closed actions | USER-controlled trust change |
| `TransparencyObservation` | Carries one signed checkpoint transition, RFC 6962 consistency proof, witness signatures, monitor signatures, and freshness window | External observation, immutable after persistence |
| `TrustRootRotation` | Carries old/new Sigstore roots and TUF root metadata with N to N+1 dual-threshold verification | USER approval required |
| `TransparencyIncident` | Records equivocation, rollback, freeze, compromise, revocation, containment, and immutable resolution supersession | USER disposition required |
| `TransparencyState` | Reconstructs one repository-bound sequence state from exact embedded evidence and the immediately previous state | Generated projection only |
| `VerifierTrustPolicy` v0.7 | Requires one exact transparency policy, stream, and maximum state age in addition to all v0.6 controls | USER-controlled trust policy |
| `SelfImprovementCycleOrder` v0.7 | Records the exact admitted policy/state references, sequence, age, observer counts, incident count, and validity boundary | Supervisor-generated only |

Every artifact reference is a tuple of artifact ID, repository-relative path, and file SHA-256. A matching ID alone is never sufficient.

## 4. Checkpoint Verification

For each configured log, the verifier performs these checks in order:

1. Match policy ID, log ID, origin, log key ID, and observation time.
2. Verify the log's Ed25519 signature over the canonical checkpoint body.
3. Match the observation's previous checkpoint to the last durable state exactly.
4. Reject a smaller tree as rollback.
5. Reject a same-size checkpoint with a different root as equivocation.
6. For growth, verify the RFC 6962 consistency proof from the previous root to the new root.
7. Verify each witness countersignature over the exact checkpoint and each monitor signature over the complete transition; observer registry authorization must remain active at the signed times.
8. Count distinct identities and distinct operators separately for witnesses and monitors.
9. Cap state validity at the earliest policy, checkpoint, or observation boundary.

Witnesses and monitors are deliberately separate registries. The policy rejects overlapping operators for one log, so one operator cannot satisfy both independent-observation functions.

## 5. Root Rotation

A root transition is accepted only when:

- the previous TUF root verifies itself;
- the previous root threshold verifies the next root;
- the next root verifies itself under its new threshold;
- the version advances exactly from N to N+1;
- the new root is active at the effective time;
- the current state retains the new TUF root expiry and cannot outlive it;
- revoked root keys are absent from the new root role;
- both old and new Sigstore `TrustedRoot` artifacts verify and match exact manifest references;
- compromise rotations name revoked keys; and
- `approved_by` is `USER` with an ordered approval and effective time.

The current state root must also be among the roots admitted by `VerifierTrustPolicy.identity_assurance`. A valid TUF transition cannot silently widen the verifier trust policy.

## 6. Incident Lifecycle

An open or contained incident blocks dispatch. A later resolution is a new immutable `TransparencyIncident`, not a rewrite of the original record. It must cite the exact earlier incident through `supersedes_incident_ref`, preserve remediation evidence, and carry USER authority.

Every later state must retain all prior incident references. Dropping an incident from history produces `TRANSPARENCY_INCIDENT_HISTORY_DROPPED`. A resolution that omits or mismatches its original record produces `TRANSPARENCY_INCIDENT_SUPERSESSION_INVALID`. Effective revocations remain in force; recovery from a compromised active log, observer, key, or root therefore requires a separately approved policy/root replacement.

## 7. State And Admission

`TransparencyState` is an append-only sequence. Sequence 1 uses the explicit `none` predecessor; every later state cites the exact manifest reference of sequence N-1. The verifier reconstructs each state from embedded evidence and compares the complete expected object, including its self-digest.

Historical blocked states may remain in a valid chain so incident recovery can be recorded. Only the newest state must be `ready`, unexpired, within both policy and trust-policy age limits, and free of active incidents or revocations.

State time is monotonic and acts as an evidence cut. An observation must already have occurred and remain unexpired, a root rotation must already be effective, and an incident detection or resolution must not be future-dated relative to `generated_at`. Future evidence cannot be projected backward into an earlier ready state.

`campaign-supervisor.js` additionally reloads every embedded observation, root, rotation, and incident from the verified repository manifest. Embedded bytes without a corresponding manifest artifact do not count. Trust-policy v0.7 emits cycle-order v0.7 and includes transparency expiry in the overall admission `valid_until`.

The admission equation is:

```text
latest state is ready
AND complete sequence 1..N is reconstructable
AND every evidence object is manifest-bound
AND N was generated within the configured age
AND N remains inside its validity window
AND every current TUF root remains unexpired
AND current roots remain admitted
AND no transparency blocking code exists
```

## 8. Operating Procedure

1. Persist every initial `SigstoreTrustedRoot`.
2. Create and persist `TransparencyPolicy` under `transparency-policies`.
3. Bind its exact reference into `VerifierTrustPolicy` v0.7 and persist that policy.
4. Obtain a signed checkpoint and consistency proof from each log adapter.
5. Obtain the policy-required witness and monitor signatures from distinct operators.
6. Build a bundle containing exact precomputed artifact references.
7. Run the transparency state tool. With `--write-artifact`, it persists evidence first, verifies every reference, requires the prior state in the manifest, then persists the new state.
8. Run the campaign supervisor. Do not dispatch unless cycle-order v0.7 reports every assurance as satisfied and remains unexpired.

```bash
node transparency-operations-runner.js \
  --bundle /secure/transparency-bundle.json \
  --state-id TS-example-0001 \
  --generated-at 2026-07-22T10:00:00Z \
  --write-artifact \
  --repository /path/to/repository \
  --artifact-root /secure/cannae-artifacts \
  --mission MIS-example \
  --wave C1

node campaign-supervisor.js \
  --repository /path/to/repository \
  --artifact-root /secure/cannae-artifacts \
  --campaign SIC-example
```

Writing requires `bundle.policy_ref`; all wrapper references must already name the paths produced by the selected repository, mission, wave, and artifact kind. Persistence is idempotent for identical bytes and fails on a conflicting artifact.

The state tool persists a schema-valid, exactly reconstructable `blocked` state as durable incident history; a blocked status is an operational result, not corrupt output. It still rejects repository, mission, trust-policy, evidence-reference, or reconstruction mismatches. Only the supervisor may turn a current `ready` state into admission, and a blocked state never authorizes dispatch.

## 9. Failure Rules

The following conditions block all v0.7 dispatch:

- missing, duplicate, stale, future, expired, or non-contiguous state;
- non-monotonic state time or evidence not yet observed, effective, detected, or resolved;
- checkpoint rollback, same-size root conflict, or invalid consistency proof;
- invalid log, witness, or monitor signature;
- observer timestamps that differ from the signed observation time;
- insufficient identity or operator quorum;
- observer-role operator overlap;
- unapproved, non-sequential, expired, or incorrectly signed root rotation;
- current root absent from verifier trust admission;
- missing manifest evidence or byte mismatch;
- active incident, dropped incident history, invalid resolution, or active revocation.

No transparency artifact grants execution, merge, push, release, policy, key, root, or incident-resolution authority.

## 10. Limits

- Controls does not poll Rekor or discover active shards. A provider adapter must obtain checkpoints, proofs, and shard metadata.
- Controls does not run a durable witness, monitor, gossip, or global split-view detection network.
- Ed25519 signed observations prove possession of configured keys, not operator honesty or physical independence.
- Local state detects inconsistency among evidence it receives; withheld conflicting checkpoints require external gossip or independent monitors to expose them.
- TUF verification covers sequential root metadata and threshold signatures. It does not operate timestamp, snapshot, or targets refresh workflows.
- The repository artifact store is still a local/shared-filesystem trust boundary and must be protected independently.

## 11. Validation

```bash
node run-transparency-operations-fixtures.js
node run-transparency-supervisor-fixtures.js
node validator-cli-prototype/run-fixtures.js
```

Fixtures cover consistency proofs for every prefix through 64 leaves and tree sizes above 32 bits, independent observer quorum, rollback, equivocation, stale checkpoints, signature and timestamp mutation, TUF threshold and version failures, immutable incident recovery, evidence tampering, v0.7 readiness, state-lineage gaps, and supervisor manifest rejection.
