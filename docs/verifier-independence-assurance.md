# Verifier Independence Assurance

## 1. Purpose

Phase 12C prevents several verifier identities from presenting one shared execution system as an independent quorum. Trust-policy v0.6 no longer counts the human-authored `verifier.independence_group` label. It derives correlation domains from policy-pinned runtime identities and requires the same identities in dual-signed execution evidence.

The admission equation is now:

```text
Identity valid
+ Exact verifier code valid
+ Execution environment valid
+ Fresh challenge valid
+ Failure-domain independence valid
= Verifier may enter quorum
```

This is a quorum admission control, not release authority. It never authorizes merge, push, deployment, trust-policy change, root rotation, or public release.

## 2. Research Basis

| Source | Relevant result | Controls interpretation |
| --- | --- | --- |
| NIST SP 800-160 Vol. 2 Rev. 1: https://csrc.nist.gov/pubs/sp/800/160/v2/r1/final | Diversity uses heterogeneity to reduce common-mode failure | Independent verifier count must reflect failure correlation, not names or process count |
| SLSA terminology: https://slsa.dev/spec/v1.1/terminology | A build platform includes the transitive software, hardware, people, and organizations trusted to execute it faithfully | Provider, operator, control plane, tenant, runner, and infrastructure are part of the verifier trust boundary |
| SLSA provenance: https://slsa.dev/spec/v1.2/provenance | `builder.id` identifies the trusted transitive closure behind the build | Two jobs under one trusted closure are not assumed independent merely because job IDs differ |
| GitHub Actions OIDC: https://docs.github.com/en/actions/reference/security/oidc | Tokens expose stable repository, owner, workflow, runner-environment, and related claims | A native adapter must derive project/account/control-plane fields from verified claims |
| GitLab ID tokens: https://docs.gitlab.com/ci/secrets/id_token_authentication/ | Tokens expose project, namespace, configuration, runner, and environment identity | GitLab normalization is separate from GitHub normalization |
| Kubernetes topology spread: https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/ | Region, zone, node, and other topology keys model failure domains | Region and zone are explicit identities, not free-form claims of resilience |
| AWS fault-isolation boundaries: https://docs.aws.amazon.com/whitepapers/latest/aws-fault-isolation-boundaries/abstract-and-introduction.html | Regions, Availability Zones, and control/data planes provide different isolation boundaries | Cloud geography and control-plane tenancy are recorded separately |
| AWS Organizations best practices: https://docs.aws.amazon.com/organizations/latest/userguide/orgs_best-practices.html | Account boundaries are a basic isolation mechanism | One account cannot be presented as several independent accounts |
| Azure regions and availability zones: https://learn.microsoft.com/en-us/azure/well-architected/resiliency/regions-availability-zones | Zones have separate power, cooling, and networking; zone numbering is subscription-specific | Zone identity must include the tenant/subscription context |
| Google Cloud resource hierarchy: https://docs.cloud.google.com/docs/get-started/organize-resources | Organizations, folders, and projects establish administrative and policy boundaries | Project identity is distinct from provider and operator identity |
| Google Cloud infrastructure reliability: https://docs.cloud.google.com/architecture/infra-reliability-guide | Regions and zones support workload placement across failure domains | Geographic distribution is one component of independence, not the complete proof |

## 3. Required Identity Dimensions

Trust-policy v0.6 fixes this ordered set:

1. `provider_id`: the service provider or execution-provider trust boundary.
2. `operator_id`: the organization with administrative control.
3. `control_plane_id`: the CI, orchestration, or attestation control plane.
4. `account_id`: the provider tenant, account, subscription, or namespace owner.
5. `project_id`: the repository/project/workload administrative boundary.
6. `runner_pool_id`: the runner group, executor fleet, or scheduling pool.
7. `infrastructure_id`: the host cluster, node pool, hardware fleet, or equivalent substrate.
8. `region_id`: the provider-scoped region.
9. `zone_id`: the account/provider-scoped availability zone or local failure zone.

Every value is a stable URI-like component ID. Missing, empty, unknown, or extra dimensions fail closed. Deployments should use resolvable or registry-controlled namespaces where available, for example `github:repository:1234`, `aws:account:123456789012`, or `k8s:cluster:production-a`. The schema permits provider-specific URI schemes; it does not treat display names as stable identities.

## 4. Correlation Rule

The rule is deliberately conservative:

```text
If verifier A and verifier B share any required component value,
they are correlated.

Correlation is transitive.
```

The runtime constructs an undirected correlation graph and computes connected components with union-find. Each component becomes one deterministic `VID-<digest>` domain. Therefore:

- different declared group labels do not separate a shared account;
- separate accounts do not separate a shared runner pool;
- A sharing an account with B and B sharing infrastructure with C places A, B, and C in one domain;
- only verifier sets disjoint across all required dimensions form separate domains under the strict v0.6 policy.

Unknown identity is never inferred to be independent. A policy can require a higher `minimum_independent_domains` than the campaign, but never a lower value.

## 5. Contracts and Decision Points

### 5.1 Trust-policy v0.6

`independence_assurance` pins the correlation rule, exact dimension set, and minimum domain count. The existing `minimum_independence_groups` field remains for backward-readable campaign contracts, but v0.6 satisfies it with computed `VID-*` domains.

### 5.2 Runtime-policy v0.2

Every assigned profile records all nine identities. Pre-dispatch readiness computes domains from these profiles. The policy must assign exactly one complete purpose-authorized profile to every active verifier.

### 5.3 Execution-evidence v0.2

The execution adapter submits the identities it observed for that invocation. They must exactly match the selected runtime profile. The Cannae v0.2 execution predicate places them inside `cannae_environment`; both the trusted builder and verifier sign the same DSSE bytes.

### 5.4 Cycle-order v0.6

The supervisor projects required dimensions, profile bindings, computed domains, threshold, satisfaction, and blocking codes. The semantic validator reconstructs the graph from the projection and rejects altered domain IDs, membership, claims, counts, or quorum bindings.

### 5.5 Post-execution quorum

Receipt and comparative attestation verification reloads each execution-evidence artifact. Under trust-policy v0.6, the quorum uses the execution verifier's computed `VID-*` result, not the attestation's signed legacy group label. Correlated attestations may remain individually valid but cannot satisfy a multi-domain quorum.

## 6. Provider Adapter Requirements

A production adapter must derive component IDs from authenticated provider evidence, not from agent text or environment variables supplied by the workload. At minimum it must:

1. verify issuer, audience, signature, validity, and replay controls for the provider credential;
2. map provider-native immutable IDs into the nine common fields;
3. bind region/zone IDs to the provider and account context;
4. reject mutable display names where an immutable numeric or resource ID exists;
5. bind the result to the builder-signed execution statement;
6. document claims that the provider does not expose and fail closed rather than inventing them.

The current common contract already canonicalizes the provider ID as `cannae:provider:<profile-provider>`, binds `builder.key_id` to `control_plane_id`, and binds these available stable claims:

| Profile | Canonical bindings |
| --- | --- |
| Every profile | `builder.key_id -> control_plane_id` |
| `generic_oci` | `tenant -> account_id`, `runner_pool -> runner_pool_id` |
| `github_actions` | `repository_id -> project_id`, `runner_environment -> runner_pool_id` |
| `gitlab_ci` | `job_project_id -> project_id`, `runner_id -> runner_pool_id` |
| `local_sandbox` | `host_attestor_id -> infrastructure_id`, `sandbox_instance_id -> runner_pool_id` |
| `tee` | `appraisal_policy_sha256 -> control_plane_id`, `measurement -> infrastructure_id` |

The canonical value format is `cannae:<provider>:<kind>:<percent-encoded-native-id>`. A runtime policy that supplies a contradictory common field is invalid before dispatch.

The current `generic_oci` adapter verifies a policy-pinned builder assertion. Native GitHub, GitLab, cloud, local-host, and TEE claim derivation remains adapter work. Consequently, Phase 12C prevents label-based quorum inflation within its verified inputs, but cannot make a compromised trusted builder or dishonest provider control plane truthful.

## 7. Operation

Validate contracts and the correlation suite:

```bash
node validator-cli-prototype/validate.js trust-policy.json verifier-trust-policy
node validator-cli-prototype/validate.js runtime-policy.json verifier-runtime-policy
node run-verifier-independence-fixtures.js
```

For trust-policy v0.6, create execution evidence with the adapter-produced observation:

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
  --expires-at 2026-07-22T09:06:01Z
```

## 8. Failure Codes

| Code | Meaning |
| --- | --- |
| `INDEPENDENCE_POLICY_INVALID` | v0.6 assurance rule, dimensions, or threshold is malformed |
| `INDEPENDENCE_RUNTIME_POLICY_INVALID` | runtime-policy v0.2 is missing or bound to another trust policy |
| `INDEPENDENCE_ASSIGNMENT_INVALID` | an active verifier lacks exactly one usable profile |
| `INDEPENDENCE_CLAIMS_INVALID` | a profile omits or invents a required identity dimension |
| `INDEPENDENCE_DOMAIN_QUORUM_UNAVAILABLE` | valid profiles collapse into fewer domains than required |
| `EXECUTION_EVIDENCE_INDEPENDENCE_MISMATCH` | observed execution identity differs from the selected profile |
| `ATTESTATION_GROUP_DIVERSITY_NOT_MET` | valid receipt attestations do not span enough computed domains |
| `COMPARATIVE_ATTESTATION_GROUP_DIVERSITY_NOT_MET` | valid comparative attestations do not span enough computed domains |

## 9. Remaining Boundaries

- Phase 12C does not prove that two providers have no shared upstream dependency, certificate authority, network backbone, software vulnerability, or geopolitical failure mode.
- A strict all-dimensions policy may require cross-provider execution and can reduce availability. Lower-assurance deployments should define a future policy version rather than silently weakening v0.6.
- Builder/operator compromise remains a trust-root failure. Native provider adapters, protected signing keys, and independent audit are required.
- Region and zone labels are provider-scoped and not globally comparable without account/provider context.
- Phase 13 must add long-term transparency consistency, root rotation, witness/monitor operation, gossip, revocation, and equivocation response.
