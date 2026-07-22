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

Phase 12A implements the execution-code and environment terms. Phase 12B implements the supervisor-issued one-time challenge in `verifier-pre-dispatch-challenge.md`. Phase 12C replaces declared independence labels with evaluated provider, operator, control-plane, tenant, runner, infrastructure, region, and zone identities as specified in `verifier-independence-assurance.md`.

Phase 14 adds native provider adapters. GitHub Actions and GitLab CI profiles can now require a manifest-pinned JWKS bundle and a directly verified OIDC token instead of accepting only builder-restated provider claims. See `github-actions-native-verifier-adapter.md` and `gitlab-ci-native-verifier-adapter.md`.

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
- a GitHub token uses another algorithm, key, issuer, subject, audience, repository ID, workflow, commit, runner class, or validity window;
- a GitHub-hosted job invents runner-pool, infrastructure, region, or zone diversity not present in the signed token.
- a GitLab token substitutes its algorithm, key, issuer, subject, audience, source/job project, protected ref, CI config, commit, runner class, or validity window;
- a GitLab job treats dynamic runner, pipeline, or job IDs as independent infrastructure.

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

Runtime-policy v0.3 additionally requires one supported native adapter and exact manifest-backed trust bundle. `github_actions_oidc_v1` requires a GitHub-hosted runner, an exact calling-workflow ref with its signed commit SHA, and a reusable-workflow ref pinned directly by commit SHA. `gitlab_ci_oidc_v1` requires GitLab.com, a GitLab-hosted runner, equal stable source/job project identities, a protected branch, and a same-project CI config whose SHA equals the checkout commit.

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

Under trust-policy v0.6, execution-evidence schema v0.2 additionally binds all nine observed independence fields under the v0.2 predicate. These observations must exactly match runtime-policy v0.2 and determine the post-execution `VID-*` quorum domain.

Execution-evidence v0.3 binds one exact native provider evidence reference under the v0.3 predicate. Native provider identity and independence observations are derived from the signed JWT, not accepted from CLI JSON. Native GitHub and GitLab evidence require a clean repository whose head commit equals the token `sha`.

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
4. For runtime-policy v0.3, dispatch by the policy-selected provider adapter, load native evidence and trust bundle by exact manifest reference, then verify JWT structure, `RS256` signature, `kid`, issuer, subject, audience, temporal claims, stable IDs, provider-specific workflow/config pins, commit, ref, and runner class.
5. Compare provider issuer, subject, audience, every policy-required stable claim, and native failure-domain projection.
6. Compare code, OCI image manifest, lockfile, harness, argv, tool allowlist, network policy, and sandbox profile exactly.
7. Require a boolean dirty-state observation and compare the exact commit and worktree fingerprint with caller expectations and the verification target. Native provider evidence additionally requires `dirty=false` and `head_commit=JWT.sha`.
8. Apply invocation ordering, successful exit, duration, evidence age, policy expiry, verifier expiry, native-token expiry, and evidence expiry.
9. Decode the strict DSSE envelope and verify both signatures over identical payload bytes.
10. Reconstruct the expected in-toto statement and compare every binding.
11. Compare caller-supplied subject, repository, target, and Phase 11 identity-evidence expectations.

`autonomous-improvement-controller.js` reloads runtime policy and execution evidence from the verified repository manifest before these checks. It does not accept an agent-authored in-memory proof substitute.

## 5. Provider Adapter Boundary

| Provider profile | Phase 12A common contract | Native adapter status |
| --- | --- | --- |
| `generic_oci` | Pinned builder key, OCI manifest, execution controls, tenant and runner-pool claims | Implemented reference adapter |
| `github_actions` | Exact issuer, subject, audience, repository and owner IDs, workflow refs/SHAs, commit, ref, runner environment, run and attempt | Phase 14A strict GitHub OIDC/JWKS adapter implemented for GitHub-hosted reusable workflows |
| `gitlab_ci` | Exact source/job project and namespace IDs, config ref/SHA, commit, protected ref, runner ID, and runner environment | Phase 14B strict GitLab.com OIDC/JWKS adapter implemented for protected same-project branch pipelines on GitLab-hosted runners |
| `local_sandbox` | Host-attestor and sandbox-instance claims plus exact sandbox profile | Host security and attestor isolation remain deployment responsibilities |
| `tee` | TEE type, measurement, appraisal-policy digest, and affirming result claims | Native RATS/EAR/vendor evidence appraisal remains to be implemented |

The common adapter verifies that a trusted builder signed provider claims. GitHub and GitLab adapters also verify the provider JWT and exact manifest-pinned JWKS offline. Local host and hardware evidence still require native adapters.

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
  --independence independence-observation.json \
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
node run-github-actions-oidc-fixtures.js
node run-gitlab-ci-oidc-fixtures.js
```

## 7. Phase Boundaries

Phase 12B now establishes bounded pre-dispatch liveness. Trust-policy v0.5 issues one nonce per verifier, binds the set to the exact projected task and lineage, and excludes missing, stale, replayed, ambiguous, wrong-nonce, offline, or late responders. The accepted identity evidence is the signed challenge response; cycle-order v0.5 records its exact manifest reference and caps admission at challenge expiry.

Phase 12C now records and evaluates operational independence. Different verifier IDs that share any required CI provider, operator, control plane, account, project, runner pool, infrastructure, region, or zone component are placed in one transitive correlation domain. This proves policy/evidence consistency for adapter-verified identities; it does not make a compromised builder or provider truthful.

Phase 13 implements manifest-backed transparency-state verification; production polling, witnesses, monitors, gossip, and operated Rekor/TUF infrastructure remain external.

Phase 14A implements native GitHub Actions OIDC verification for GitHub-hosted reusable workflows. Phase 14B implements native GitLab.com CI OIDC verification for protected same-project branch pipelines on GitLab-hosted runners. Both intentionally project unavailable infrastructure, region, and zone fields as shared unknown domains. Enterprise/self-managed providers, self-hosted runners, local sandboxes, and TEE adapters remain future work.

Release remains separately unauthorized. Execution evidence, challenge success, independence satisfaction, and quorum satisfaction never grant merge, push, deployment, policy-change, trust-root-change, or release authority.
