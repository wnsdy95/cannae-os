# GitHub Actions Native Verifier Adapter

## 1. Purpose

Phase 14A replaces builder-restated GitHub metadata with a cryptographically verified GitHub Actions OIDC token. It does not replace the Phase 12 execution contract. It adds native provider identity to that contract:

```text
GitHub OIDC signature and claims valid
+ Exact manifest-pinned JWKS bundle valid
+ Runtime-policy v0.3 claim pins valid
+ Dual-signed execution evidence valid
= GitHub execution evidence may be considered for quorum
```

The adapter is implemented by:

- `github-actions-oidc.js` for strict JWT, JWK, claim, time, and projection verification;
- `github-actions-oidc-runner.js` for trust-bundle ingestion and native evidence creation;
- `github-actions-oidc-trust-bundle.schema.json` and `github-actions-oidc-evidence.schema.json`;
- `VerifierRuntimePolicy` v0.3 and `VerifierExecutionEvidence` v0.3;
- the receipt and comparative-attestation quorum paths in the autonomous controller.

## 2. Assurance Boundary

The adapter verifies:

- the exact public issuer `https://token.actions.githubusercontent.com`;
- a compact JWT signed with `RS256` by the exact `kid` in a manifest-pinned JWKS bundle;
- exact subject and custom audience;
- `iat`, `nbf`, `exp`, token age, and non-empty `jti`;
- repository and owner names plus immutable numeric IDs;
- exact ref, commit, workflow ref/SHA, and reusable-workflow ref/SHA;
- GitHub-hosted runner class, workflow run ID, and run attempt;
- an exact clean repository commit equal to the JWT `sha`;
- exact projection into provider identity and failure-domain fields.

The adapter does not prove:

- that a GitHub control plane or signing key was uncompromised;
- the physical host, region, zone, or underlying GitHub-hosted runner pool;
- that the OIDC token alone produced the verification result;
- that container or sandbox controls were honestly enforced;
- that a passing verifier result is correct;
- release, merge, deployment, trust-root, or policy-change authority.

The builder and verifier must still sign the same Phase 12 in-toto statement. The OIDC token authenticates the GitHub job context; the dual-signed statement binds that context to the execution controls, invocation, repository state, subject, and verification target.

## 3. Fail-Closed Profile

Runtime-policy v0.3 currently accepts only:

- provider `github_actions`;
- adapter `github_actions_oidc_v1`;
- algorithm `RS256`;
- `runner_environment=github-hosted`;
- a reusable workflow pinned by a full 40-character commit SHA;
- an exact calling-workflow ref whose signed `workflow_sha` equals the repository commit;
- a maximum token age of 600 seconds or less;
- a clock-skew allowance of 120 seconds or less;
- one exact manifest-backed `GitHubActionsOIDCTrustBundle` reference.

Self-hosted runners are excluded from Phase 14A because the GitHub OIDC token identifies only the `self-hosted` class. It does not authenticate a concrete host, runner group, infrastructure, region, or zone. A future self-hosted adapter must add separately authenticated host evidence before it can claim those fields.

## 4. Failure-Domain Projection

Authenticated claims determine these fields:

| Dimension | Projection |
| --- | --- |
| provider | GitHub Actions |
| operator | GitHub |
| control plane | GitHub-hosted Actions control plane |
| account | immutable `repository_owner_id` |
| project | immutable `repository_id` |
| runner pool | `runner_environment=github-hosted` class |
| infrastructure | `shared-unknown` |
| region | `shared-unknown` |
| zone | `shared-unknown` |

The final three values are deliberately shared. The token does not justify finer claims. Multiple GitHub-hosted verifiers therefore remain correlated and cannot manufacture a multi-domain quorum by using different run IDs, runner labels, regions, or zones. Multi-domain assurance requires a genuinely different authenticated provider or future supplemental infrastructure evidence.

## 5. Trust Bundle

`GitHubActionsOIDCTrustBundle` records:

- the fixed issuer, discovery URI, and JWKS URI;
- only normalized RSA signing keys with `alg=RS256`, `use=sig`, exponent 65537, and at least a 2048-bit modulus;
- retrieval and operator-selected expiry times;
- a canonical artifact digest.

Create a short-lived bundle and persist it in the target repository namespace:

```bash
node github-actions-oidc-runner.js trust-bundle \
  --id GAOTB-001 \
  --fetch \
  --retrieved-at 2026-07-23T00:00:00Z \
  --expires-at 2026-07-24T00:00:00Z \
  --repository /path/to/repository \
  --mission MIS-Verification \
  --wave C0 \
  --write-artifact
```

The runtime policy must cite the resulting artifact ID, manifest path, and file SHA-256 exactly. Refreshing JWKS creates a new artifact and requires a reviewed runtime-policy update. Live network retrieval during quorum evaluation is not allowed.

## 6. Native Evidence

The GitHub job must have `id-token: write` and request the exact policy audience, normally `cannae-verifier-execution`. Supply the token through a protected environment variable or a mode-`0600` file; do not place it on the command line:

```bash
node github-actions-oidc-runner.js create \
  --id GAOE-001 \
  --profile github-profile.json \
  --trust-bundle github-trust-bundle.json \
  --trust-bundle-ref github-trust-bundle-ref.json \
  --token-env ACTIONS_ID_TOKEN \
  --evaluated-at 2026-07-23T00:04:30Z \
  --repository /path/to/repository \
  --mission MIS-Verification \
  --wave C1 \
  --write-artifact
```

The persisted native artifact retains the compact JWT because later offline signature verification requires the exact signed bytes. Treat it as sensitive until `exp`, keep the artifact store access-controlled, and never commit it to source control. CLI output is redacted to artifact ID, token digest, validity, and persistence metadata.

## 7. Common Execution Evidence

Create Phase 12 evidence with native references instead of caller-authored provider and independence JSON:

```bash
node verifier-execution-runner.js create \
  --policy trust-policy.json \
  --runtime-policy runtime-policy-v0.3.json \
  --runtime-policy-ref runtime-policy-ref.json \
  --verifier VERIFIER-A \
  --purpose verification_receipt \
  --subject-ref receipt-ref.json \
  --identity-evidence-ref identity-evidence-ref.json \
  --repository-binding repository-binding.json \
  --repository-state repository-state.json \
  --verification-target verification-target.json \
  --native-provider-evidence github-oidc-evidence.json \
  --native-provider-evidence-ref github-oidc-evidence-ref.json \
  --native-trust-bundle github-trust-bundle.json \
  --native-trust-bundle-ref github-trust-bundle-ref.json \
  --invocation invocation.json \
  --builder-private-key /secure/builder.pem \
  --verifier-private-key /secure/verifier.pem \
  --issued-at 2026-07-23T00:04:30Z \
  --expires-at 2026-07-23T00:08:00Z
```

`VerifierExecutionEvidence` v0.3 signs the exact native-evidence reference. The controller reloads the execution evidence, native OIDC evidence, and trust bundle from the verified repository manifest. Missing, substituted, expired, malformed, or invalid artifacts remove the attestation before quorum calculation.

## 8. Verification Order

1. Verify the repository artifact manifest and exact trust-bundle bytes.
2. Verify trust-bundle structure, fixed endpoints, key properties, digest, and validity window.
3. Parse strict compact JWT segments and require the exact JOSE header.
4. Select the exact `kid` and verify the `RS256` signature.
5. Verify issuer, subject, audience, temporal claims, and token age.
6. Verify immutable IDs, exact commit/ref, calling-workflow ref/SHA, reusable workflow pinned by SHA, and runner class.
7. Derive provider identity and conservative failure domains from signed claims.
8. Compare the projection with runtime-policy v0.3.
9. Require a clean repository whose head commit equals the signed `sha`.
10. Verify builder and verifier signatures over execution-evidence v0.3.
11. Verify receipt or comparative-attestation binding before quorum diversity is calculated.

## 9. Validation

```bash
node run-github-actions-oidc-fixtures.js
node run-verifier-execution-evidence-fixtures.js
node run-verifier-independence-fixtures.js
node validator-cli-prototype/run-fixtures.js
```

The adversarial suite covers algorithm confusion, unknown keys, signature corruption, audience and repository-ID substitution, mutable workflows, self-hosted runners, expiry, JWKS substitution, projection forgery, dirty repository state, and missing nested evidence at the quorum boundary.
