# GitLab CI Native Verifier Adapter

## 1. Purpose

Phase 14B replaces builder-restated GitLab metadata with a cryptographically verified GitLab.com CI ID token. It extends, but does not replace, the Phase 12 execution contract:

```text
GitLab CI OIDC signature and claims valid
+ Exact manifest-pinned GitLab.com JWKS bundle valid
+ Protected same-project pipeline identity valid
+ Runtime-policy v0.3 claim pins valid
+ Dual-signed execution evidence valid
= GitLab CI execution evidence may be considered for quorum
```

The adapter is implemented by:

- `gitlab-ci-oidc.js` for strict JWT, JWK, claim, time, and projection verification;
- `gitlab-ci-oidc-runner.js` for trust-bundle ingestion and native evidence creation;
- `gitlab-ci-oidc-trust-bundle.schema.json` and `gitlab-ci-oidc-evidence.schema.json`;
- the provider-neutral native profile in `VerifierRuntimePolicy` v0.3 and native reference in `VerifierExecutionEvidence` v0.3;
- manifest reload and verification in receipt and comparative-attestation quorum paths.

## 2. Official Contract

The adapter is based on these current GitLab sources:

- ID token claims and signing behavior: https://docs.gitlab.com/ci/secrets/id_token_authentication/
- `id_tokens` audience configuration: https://docs.gitlab.com/ci/yaml/#id_tokens
- stable-ID trust guidance: https://docs.gitlab.com/ci/cloud_services/
- GitLab Runner ownership model: https://docs.gitlab.com/runner/
- GitLab-hosted runner isolation: https://docs.gitlab.com/ci/runners/hosted_runners/
- live discovery: https://gitlab.com/.well-known/openid-configuration
- live JWKS: https://gitlab.com/oauth/discovery/keys

GitLab documents `RS256`, configurable audience, project and namespace IDs, separate job-project fields, protected-ref state, pipeline config ref/SHA, runner ID and runner ownership class. It also states that `ci_config_ref_uri` and `ci_config_sha` are null when the top-level pipeline definition is not in the same project.

## 3. Assurance Boundary

The adapter verifies:

- the exact public issuer `https://gitlab.com`;
- a compact JWT signed with `RS256` by the exact `kid` in a manifest-pinned JWKS bundle;
- one exact string audience and exact subject;
- `iat`, `nbf`, `exp`, bounded token age, and non-empty `jti`;
- stable source and job project/namespace IDs plus their paths;
- equality of source and job project identities;
- exact pipeline source, branch, fully qualified ref, and `ref_protected=true`;
- exact commit and same-project `ci_config_ref_uri` with `ci_config_sha=sha`;
- `runner_environment=gitlab-hosted` and the signed dynamic runner ID;
- a clean repository head equal to the signed `sha`;
- exact projection into provider identity and failure-domain fields.

The adapter does not prove:

- that GitLab.com or its signing key was uncompromised;
- physical runner infrastructure, machine identity, cloud project, region, or zone;
- that `runner_id` identifies an isolated machine or failure domain;
- the immutable identity of every remotely included CI template;
- that container and sandbox controls were honestly enforced;
- correctness of the verifier result;
- release, merge, deployment, trust-root, or policy-change authority.

The existing builder and verifier signatures remain mandatory. OIDC authenticates the job context; execution evidence binds that context to exact code, image, dependencies, harness, argv, tools, sandbox, repository state, subject, invocation, and result.

## 4. Fail-Closed Profile

The first GitLab native profile accepts only:

- provider `gitlab_ci`;
- adapter `gitlab_ci_oidc_v1`;
- GitLab.com public issuer and `RS256`;
- one exact string audience;
- a GitLab-hosted runner;
- a protected branch, not an unprotected branch or tag;
- equal source/job project and namespace identities;
- a top-level CI definition in the same project and commit;
- a maximum token age of 600 seconds or less;
- a clock-skew allowance of 120 seconds or less;
- one exact manifest-backed `GitLabCIOIDCTrustBundle` reference.

GitLab Self-Managed, GitLab Dedicated, self-hosted runners, audience arrays, tags, fork merge-request identities, and externally located top-level pipeline definitions require separate reviewed profiles or adapters. They are not silently generalized from GitLab.com.

## 5. Failure-Domain Projection

| Dimension | Projection |
| --- | --- |
| provider | GitLab CI |
| operator | GitLab |
| control plane | GitLab.com-hosted control plane |
| account | stable `job_namespace_id` |
| project | stable `job_project_id` |
| runner pool | `runner_environment=gitlab-hosted` class |
| infrastructure | `shared-unknown` |
| region | `shared-unknown` |
| zone | `shared-unknown` |

`runner_id`, `pipeline_id`, and `job_id` are retained for traceability but do not create independence. GitLab distinguishes a runner configuration, runner manager, and machine; the token does not authenticate all of those physical boundaries. Two GitLab jobs with different dynamic IDs therefore remain correlated under the shared provider and unknown infrastructure fields.

## 6. Trust Bundle

Create a reviewed short-lived GitLab.com bundle:

```bash
node gitlab-ci-oidc-runner.js trust-bundle \
  --id GLOTB-001 \
  --fetch \
  --retrieved-at 2026-07-23T01:00:00Z \
  --expires-at 2026-07-24T01:00:00Z \
  --repository /path/to/repository \
  --mission MIS-Verification \
  --wave C0 \
  --write-artifact
```

The bundle normalizes only unique RSA signing keys with `alg=RS256`, `use=sig`, exponent 65537, and at least a 2048-bit modulus. Runtime policy cites its exact manifest artifact ID, relative path, and file digest. Quorum evaluation never fetches live JWKS.

## 7. Native Evidence

Declare one dedicated audience in the GitLab job:

```yaml
verify:
  id_tokens:
    CANNAE_GITLAB_ID_TOKEN:
      aud: cannae-verifier-execution
  script:
    - node gitlab-ci-oidc-runner.js create --token-env CANNAE_GITLAB_ID_TOKEN ...
```

Create and persist the evidence without putting the token on the command line:

```bash
node gitlab-ci-oidc-runner.js create \
  --id GLOE-001 \
  --profile gitlab-profile.json \
  --trust-bundle gitlab-trust-bundle.json \
  --trust-bundle-ref gitlab-trust-bundle-ref.json \
  --token-env CANNAE_GITLAB_ID_TOKEN \
  --evaluated-at 2026-07-23T01:04:30Z \
  --repository /path/to/repository \
  --mission MIS-Verification \
  --wave C1 \
  --write-artifact
```

The access-controlled artifact retains the compact JWT for offline verification. The CLI prints only artifact identity, token digest, validity, and persistence metadata. Token files must be regular, non-symlink files with mode `0600` or stricter.

## 8. Admission Order

1. Verify the repository manifest and exact trust-bundle bytes.
2. Verify fixed GitLab.com endpoints, normalized keys, bundle digest, and review window.
3. Parse strict compact JWT segments and require the exact JOSE header.
4. Select the manifest-pinned `kid` and verify the `RS256` signature.
5. Verify issuer, subject, one audience, temporal claims, and token age.
6. Verify source/job stable IDs, protected branch, pipeline source, commit, same-project CI config, and hosted runner class.
7. Normalize signed numeric IDs to decimal strings and derive conservative domains.
8. Compare every pinned claim and domain with runtime-policy v0.3.
9. Require a clean checkout at the signed commit.
10. Verify builder and verifier signatures over execution-evidence v0.3.
11. Verify receipt or comparative-report binding before quorum calculation.

## 9. Validation

```bash
node run-gitlab-ci-oidc-fixtures.js
node run-github-actions-oidc-fixtures.js
node run-verifier-execution-evidence-fixtures.js
node run-verifier-independence-fixtures.js
node validator-cli-prototype/run-fixtures.js
```

The GitLab suite covers algorithm confusion, unknown keys, signature corruption, scalar/array audience substitution, source/job project drift, unprotected refs, self-hosted runners, missing or changed CI config, expiry, JWKS replacement, projection forgery, false runner diversity, dirty repository state, and missing nested evidence at quorum.
