# Verifier Execution Integrity

## 1. Purpose

Phase 11 proves that an active workload controls an accepted identity credential and the verifier key registered by policy. It does not prove that the accepted verifier code, dependency set, harness, container image, or sandbox actually produced a signed verification result.

Phase 12A adds that missing execution contract. A verification receipt or comparative evaluation report may enter a trust-policy v0.4+ quorum only when its verifier attestation cites a manifest-backed `VerifierExecutionEvidence` that passes the exact `VerifierRuntimePolicy` selected by the trust policy.

The final target remains:

```text
Identity valid
+ Exact verifier code valid
+ Execution environment valid
+ Fresh challenge valid
+ Independence valid
= Verifier may enter quorum
```

Phase 12A implements the execution-code and environment terms. Phase 12B implements the supervisor-issued one-time challenge in `verifier-pre-dispatch-challenge.md`. Phase 12C must replace declared independence labels with evaluated provider, operator, infrastructure, and failure-domain identities.

## 2. Threat Model

Phase 12A blocks these cases:

- a valid verifier key signs output produced by different verifier code;
- a mutable image tag replaces the approved OCI image;
- dependency lockfile or harness bytes change without policy review;
- argv, tool allowlist, network policy, or sandbox profile changes;
- a privileged, host-networked, host-PID, writable-root, or host-mounted profile claims equivalence with an isolated profile;
- evidence is rebound to another repository state, verification target, receipt, report, verifier, purpose, or workload-identity evidence artifact;
- a verifier self-asserts its environment without a separate trusted builder signature;
- stale evidence or a failed invocation enters quorum;
- a runtime policy artifact is substituted by ID while its path or digest changes.

The model assumes the configured builder or provider attestor reports execution accurately. A compromised builder control plane can issue false provenance. SLSA explicitly keeps trusted-build-platform compromise outside the provenance consumer's guarantee, so builder admission remains a human-controlled root-of-trust decision.

## 3. Contracts

### 3.1 `VerifierTrustPolicy` v0.4

Version 0.4 retains Phase 11 identity assurance and adds:

```json
{
  "execution_assurance": {
    "required": true,
    "runtime_policy_ref": {
      "artifact_id": "VRP-Cannae-001",
      "relative_path": "repositories/.../verifier-runtime-policies/VRP-Cannae-001.json",
      "sha256": "..."
    }
  }
}
```

The reference is exact. Policy ID alone is insufficient.

### 3.2 `VerifierRuntimePolicy`

The runtime policy binds one or more profiles and assigns exactly one profile to each verifier. Every profile fixes:

- adapter and provider type;
- trusted builder ID, Ed25519 key, and key ID;
- exact provider issuer, subject, audience, and stable required claims;
- verifier code descriptor and SHA-256;
- OCI image manifest URI, media type, and SHA-256;
- dependency lockfile and harness descriptors;
- exact argv and tool allowlist;
- denied or endpoint-allowlisted network policy;
- sandbox kind and profile digest;
- read-only root, no-new-privileges, non-privileged, no-host-network, no-host-PID, and no-host-mount requirements;
- maximum execution duration and evidence age;
- allowed evidence purposes.

An OCI image must use `name@sha256:<manifest digest>`. A tag is not an execution identity.

### 3.3 `VerifierExecutionEvidence`

Execution evidence exposes index fields and carries an in-toto Statement under the Cannae execution predicate:

```text
https://cannae.dev/attestations/verifier-execution/v0.1
```

The predicate adopts SLSA build-definition and run-details semantics. Its in-toto subject is the exact persisted receipt or comparative report that will enter quorum; the underlying candidate or evaluation target is separately fixed by `verification_target` inside the predicate. It is therefore a Cannae verification-execution predicate, not a claim that either artifact was produced by a standard SLSA build-provenance predicate.

The same DSSE payload is signed by:

1. the runtime-policy builder key, which vouches for the execution and provider claims; and
2. the verifier key, which binds the registered verifier to that exact execution record.

The evidence binds the runtime policy, trust policy, verifier, profile, purpose, subject artifact, Phase 11 identity-evidence reference, repository identity, exact repository state, verification-target digest, provider identity, execution controls, invocation ID, result, issue time, and expiry. A dirty worktree is allowed when its full fingerprint is the declared candidate revision; the evidence records that condition instead of pretending the worktree is clean.

### 3.4 Attestation v0.2

`VerificationAttestation` and `ComparativeEvaluationAttestation` v0.2 add one exact `execution_evidence_ref`. Under trust-policy v0.4+:

- v0.1 attestation is ineligible;
- missing or mismatched execution evidence is ineligible;
- invalid builder or verifier signature is ineligible;
- any policy/environment/target mismatch is ineligible;
- invalid evidence removes only that attestation before quorum diversity is calculated.

Legacy trust policies continue to read v0.1 attestations.

## 4. Verification Order

`verifier-execution-evidence.js` applies this order:

1. Validate trust-policy v0.4+ and its exact runtime-policy reference.
2. Match trust policy, runtime policy, repository identity, validity windows, verifier assignment, purpose, and profile.
3. Recompute builder and verifier key IDs and require distinct Ed25519 keys.
4. Compare provider issuer, subject, audience, and every policy-required stable claim.
5. Compare code, OCI image manifest, lockfile, harness, argv, tool allowlist, network policy, and sandbox profile exactly.
6. Require a boolean dirty-state observation and compare the exact commit and worktree fingerprint with caller expectations and the verification target.
7. Apply invocation ordering, successful exit, duration, evidence age, policy expiry, verifier expiry, and evidence expiry.
8. Decode the strict DSSE envelope and verify both signatures over identical payload bytes.
9. Reconstruct the expected in-toto statement and compare every binding.
10. Compare caller-supplied subject, repository, target, and Phase 11 identity-evidence expectations.

`autonomous-improvement-controller.js` reloads runtime policy and execution evidence from the verified repository manifest before these checks. It does not accept an agent-authored in-memory proof substitute.

## 5. Provider Adapter Boundary

| Provider profile | Phase 12A common contract | Native adapter status |
| --- | --- | --- |
| `generic_oci` | Pinned builder key, OCI manifest, execution controls, tenant and runner-pool claims | Implemented reference adapter |
| `github_actions` | Exact issuer, subject, audience, repository ID, workflow ref, commit, ref, and runner environment | Native GitHub attestation/OIDC-token verification remains to be implemented |
| `gitlab_ci` | Exact project IDs, config ref/SHA, commit, protected ref, runner ID, and runner environment | Native GitLab JWT/provenance verification remains to be implemented |
| `local_sandbox` | Host-attestor and sandbox-instance claims plus exact sandbox profile | Host security and attestor isolation remain deployment responsibilities |
| `tee` | TEE type, measurement, appraisal-policy digest, and affirming result claims | Native RATS/EAR/vendor evidence appraisal remains to be implemented |

The common adapter verifies that a trusted builder signed the provider claims. It does not parse a GitHub or GitLab JWT, call a provider API, or appraise hardware evidence. Production adapters must perform those native checks and then project the verified result into the common contract.

## 6. Operation

Validate the policy contracts:

```bash
node validator-cli-prototype/validate.js runtime-policy.json verifier-runtime-policy
node validator-cli-prototype/validate.js execution-evidence.json verifier-execution-evidence
```

Persist the human-approved runtime policy before dispatch. The trust-policy reference must use the returned manifest ID, path and file-byte SHA-256:

```bash
node repository-artifact-store.js \
  --repository /path/to/repository \
  --mission MIS-Verification \
  --wave C0 \
  --kind verifier-runtime-policies \
  --artifact-id VRP-Cannae-001 \
  --input runtime-policy.json
```

Create and persist evidence with private keys held outside the repository and mode `0600`:

```bash
node verifier-execution-runner.js create \
  --policy trust-policy.json \
  --runtime-policy runtime-policy.json \
  --runtime-policy-ref runtime-policy-ref.json \
  --verifier VERIFIER-A \
  --purpose verification_receipt \
  --subject-ref receipt-ref.json \
  --identity-evidence-ref identity-evidence-ref.json \
  --repository-binding repository-binding.json \
  --repository-state repository-state.json \
  --verification-target verification-target.json \
  --provider-identity provider-identity.json \
  --invocation invocation.json \
  --builder-private-key /secure/builder.pem \
  --verifier-private-key /secure/verifier.pem \
  --issued-at 2026-07-22T09:01:01Z \
  --expires-at 2026-07-22T09:06:01Z \
  --repository /path/to/repository \
  --mission MIS-Verification \
  --wave C1 \
  --write-artifact
```

The execution runner hashes the supplied runtime-policy file bytes and rejects them unless they match `runtime-policy-ref.json`; the controller performs the same check through the repository manifest.

Pass the persisted evidence reference when creating an attestation:

```bash
node verification-attestation-runner.js trust-policy.json receipt.json \
  --verifier VERIFIER-A \
  --private-key /secure/verifier.pem \
  --receipt-relative-path repositories/.../receipt.json \
  --receipt-sha256 <manifest-sha256> \
  --execution-evidence-ref execution-evidence-ref.json \
  --invocation-id INV-Receipt-A
```

Run the adversarial suite:

```bash
node run-verifier-execution-evidence-fixtures.js
```

## 7. Phase Boundaries

Phase 12B now establishes bounded pre-dispatch liveness. Trust-policy v0.5 issues one nonce per verifier, binds the set to the exact projected task and lineage, and excludes missing, stale, replayed, ambiguous, wrong-nonce, offline, or late responders. The accepted identity evidence is the signed challenge response; cycle-order v0.5 records its exact manifest reference and caps admission at challenge expiry.

Phase 12A also does not prove operational independence. Different verifier IDs can still share one CI account, runner pool, cloud project, operator, or control plane. Phase 12C must record and evaluate those identities against actual failure domains.

Phase 13 must operate transparency over time: checkpoint consistency, root rotation, TUF refresh, witnesses, monitors, gossip, equivocation response, and revocation response.

Release remains separately unauthorized. Execution evidence, challenge success, and quorum satisfaction never grant merge, push, deployment, policy-change, trust-root-change, or release authority.
