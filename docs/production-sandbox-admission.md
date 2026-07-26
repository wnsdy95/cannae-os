# Production Sandbox Admission

## 1. Status And Scope

Phase 17B2C1 implements a provider-neutral production-sandbox admission
contract and binds it to the protected tool gateway.

The repository now answers this question:

> May one exact managed gateway deployment and one exact OCI executor policy
> enter a production tool transaction when independently appraised evidence is
> current, diverse, and bound to an external linearizable coordinator?

It does not operate a TPM, TEE, KMS, HSM, SPIFFE control plane, registry,
builder, transparency service, production Docker host, or distributed
coordinator. Provider adapters must supply those controls and produce the
appraisal result consumed by this contract.

The implemented assurance is:

```text
active USER-controlled production policy
+ exact repository and managed gateway deployment
+ two or more signed appraiser results
+ one agreed host, runtime, image, credential, MAC, seccomp, filesystem,
   network, coordination, and exclusive-path deployment identity
+ computed failure-domain quorum
+ exact OCI executor policy and request scope
+ live external coordinator handle with matching adapter/configuration,
   transaction, admission, revision, fencing token, lease, and expiry
= managed production execution may be authorized
```

The result never grants release:

```text
production_execution_authorized: true
production_deployment_verified: true
release_authorized: false
```

## 2. Standards Basis

- [RFC 9334](https://www.rfc-editor.org/rfc/rfc9334.html) separates an
  Attester, Verifier, Attestation Result, and Relying Party. Cannae treats each
  appraiser as a Verifier and the protected gateway as the Relying Party.
- [RFC 9711](https://www.rfc-editor.org/rfc/rfc9711.html) defines Entity
  Attestation Token claims and freshness concepts. The policy fixes an EAT
  profile and requires a fresh nonce, but the generic contract does not parse
  vendor token formats.
- [RFC 9999](https://www.rfc-editor.org/rfc/rfc9999.html) preserves the
  distinction among Evidence, Reference Values, Endorsements, Appraisal
  Policy, and Attestation Results. The evidence contract records exact digests
  for each input instead of treating one quote as a complete trust decision.
- [OCI Image descriptor](https://github.com/opencontainers/image-spec/blob/main/descriptor.md)
  makes a digest a content identifier and requires SHA-256 verification
  support. Production policy accepts only an immutable OCI manifest digest.
- [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md)
  binds an attestation to subject digests and identifies its predicate type.
- [SLSA provenance v1](https://slsa.dev/spec/v1.2/build-provenance) uses
  `https://in-toto.io/Statement/v1` and
  `https://slsa.dev/provenance/v1`. Cannae records both exact types and the
  provenance statement digest.
- [SLSA artifact verification](https://slsa.dev/spec/v1.2/verifying-artifacts)
  requires consumers to compare provenance with protected expectations before
  use. A signed statement without policy-pinned source, builder, or subject
  expectations is insufficient.
- [Sigstore verification](https://docs.sigstore.dev/cosign/verifying/verify/)
  verifies image digest plus signer identity and issuer. A provider must not
  disable claim checking and report only signature success.
- [SPIFFE Workload API](https://spiffe.io/docs/latest/spiffe-specs/spiffe_workload_api/)
  delivers short-lived workload identities and trust bundles. The evidence
  contract records custody, rotation, revocation, and workload-identity
  appraisal; it does not run the Workload API.
- [NIST SP 800-190](https://csrc.nist.gov/pubs/sp/800/190/final) treats image,
  registry, orchestrator, runtime, and host risks as separate container
  security layers.
- [Docker rootless mode](https://docs.docker.com/engine/security/rootless/)
  runs the daemon and containers in a user namespace without root privileges.
  Policy also permits independently appraised user-namespace remapping.
- [Docker seccomp](https://docs.docker.com/engine/security/seccomp/) explains
  that the general default profile prioritizes compatibility. Production
  evidence requires a policy-specific minimal profile with deny-by-default
  behavior.
- [Docker AppArmor](https://docs.docker.com/engine/security/apparmor/) and
  [Linux Landlock](https://docs.kernel.org/security/landlock.html) provide
  mandatory or additive access-control layers. One enforcing, digest-pinned
  MAC profile is mandatory.
- [etcd concurrency API](https://etcd.io/docs/v3.6/dev-guide/api_concurrency_reference_v3/)
  binds locks to leases, while the [etcd API](https://etcd.io/docs/v3.6/learning/api/)
  provides atomic compare-and-swap transactions. The gateway accepts only an
  external adapter that supplies equivalent linearizable acquisition,
  renewal, release, revision, and fencing semantics.

## 3. Contracts

| Artifact | Authority | Purpose | Production effect |
| --- | --- | --- | --- |
| `ProductionSandboxPolicy` v0.1 | USER | Pins repository, gateway, admission key, appraisers, quorum, RATS/EAT profile, OCI policies, controls, and validity | none |
| `ProductionSandboxEvidence` v0.1 | one policy-pinned appraiser | Signs one fresh RATS appraisal and complete deployment projection | none |
| `ProductionSandboxAdmission` v0.1 | policy-pinned admission authority | Recomputes consensus and failure-domain quorum over exact manifest evidence refs | permits only the admitted deployment and scope |
| `ToolGatewayRequest` v0.3 | delegated caller under dispatch authority | Binds the exact production admission and OCI execution mode | requests, but does not grant |
| `ToolGatewayDecision` v0.3 | protected gateway | Records admission and external coordination proof | may set production execution true |
| `ToolExecutionReceipt` v0.5 | protected gateway after settlement | Revalidates deployment and coordinator at the terminal transition | may set deployment verification true |

Policy and individual evidence retain production authorization as false.
Only the admission authority can sign the aggregated admission, and its key
must differ from every appraiser key. Admission authority remains subordinate
to the USER policy and cannot grant release.

## 4. Evidence Requirements

Every valid appraiser result binds:

| Layer | Required evidence |
| --- | --- |
| RATS | fresh policy-sized nonce, pass result, Evidence digest, Attestation Result digest, Appraisal Policy digest, Reference Values digest, Endorsements digest |
| appraiser identity | exact SPIFFE ID/trust domain, credential digest, active credential, verified proof, nine observed independence dimensions |
| host | platform/host/boot identity, boot measurement, host configuration, attestation-result binding |
| runtime | Docker daemon/runtime/configuration digests and rootless or remapped/private user namespace |
| image | immutable OCI manifest, in-toto Statement v1, SLSA provenance v1, verified provenance/signature/transparency, builder and source identity |
| credentials | KMS, HSM, or Workload API custody plus rotation and revocation management |
| MAC and seccomp | enforcing AppArmor, SELinux, or Landlock profile and application-minimal `SCMP_ACT_ERRNO` seccomp |
| filesystem and network | read-only root/repository, prohibited host mounts, no network or authenticated allowlist with DNS/proxy appraisal |
| coordination | external linearizable backend, exact adapter/configuration digests, storage fencing and lease-expiry tests |
| exclusive path | gateway-only access, direct path denial, gateway/sandbox outage denial, adversarial test-suite digest |

The generic verifier checks the signed appraisal result and all exact
bindings. A provider adapter remains responsible for parsing and appraising
the original TPM/TEE/vendor evidence. Recording a digest is not proof that the
underlying quote was honestly verified.

## 5. Independence And Consensus

Each appraiser declares and signs nine policy-fixed identity dimensions:

```text
provider, operator, control plane, account, project, runner pool,
infrastructure, region, zone
```

Any shared required component creates a correlation edge. Transitive connected
components form deterministic production-sandbox failure domains. Labels do
not create independence.

Admission requires:

- at least two valid evidence records;
- distinct evidence IDs, appraiser IDs, and signing keys;
- the policy-required number of computed failure domains;
- byte-equivalent deployment identity and execution scope across every
  counted record;
- active policy, appraiser identity, evidence, and admission windows.

A stale, offline, untrusted, correlated, or disagreeing appraiser is excluded.
If the remaining evidence cannot satisfy quorum, admission fails closed.

## 6. Operation

### 6.1 Persist policy

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_production_sandbox.js \
  persist-policy --repository <repo> --artifact-root <artifact-root> \
  --mission <mission-id> --wave <wave-id> --input <policy.json>
```

### 6.2 Sign and persist evidence

Each appraiser signs outside the acting-agent boundary:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_production_sandbox.js \
  sign-evidence --input <unsigned-evidence.json> \
  --private-key <appraiser-ed25519-private-key.pem>

node codex-skills/controls-doctrine-operator/scripts/operate_production_sandbox.js \
  persist-evidence --repository <repo> --artifact-root <artifact-root> \
  --mission <mission-id> --wave <wave-id> --input <signed-evidence.json> \
  --at <evaluation-time>
```

The signing key is never stored in the artifact payload. Production key
custody must use a separately protected process, KMS, HSM, or equivalent
provider.

### 6.3 Issue admission

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_production_sandbox.js \
  issue --repository <repo> --artifact-root <artifact-root> \
  --mission <mission-id> --wave <wave-id> \
  --policy-ref <policy-ref.json> \
  --evidence-refs <evidence-ref-array.json> \
  --admission-id <admission-id> \
  --private-key <admission-authority-private-key.pem> \
  --at <issue-time>
```

The issuer reloads every artifact from the verified repository manifest,
revalidates signatures and controls, recomputes correlation and consensus, and
sets admission expiry to no later than the earliest evidence or policy expiry.

### 6.4 Verify exact request scope

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_production_sandbox.js \
  verify --repository <repo> --artifact-root <artifact-root> \
  --admission-ref <admission-ref.json> \
  --request <tool-gateway-request-v0.3.json> \
  --tool-input <oci-sandbox-tool-input.json> \
  --executor <executor-projection.json> \
  --at <evaluation-time>
```

Verification requires the exact managed gateway, repository, operation class,
`oci_linux_sandbox_reference` mode, and manifest-backed OCI policy authorized
by the production policy.

Claude Code uses the equivalent wrapper under
`.claude/skills/controls-doctrine-operator/scripts/`.

## 7. Gateway Integration

The managed gateway service must inject a coordinator adapter through
`productionCoordinator`. The adapter interface is:

```js
const productionCoordinator = {
  adapterSha256,
  configurationSha256,
  acquire(binding) {},
  renew(handle) {},
  release(handle) {}
};
```

The returned handle must bind:

- `backend: external_linearizable`;
- the policy-appraised adapter and configuration digests;
- repository key and identity fingerprint, transaction, idempotency key, and
  admission digest;
- positive manifest revision and fencing token;
- a current finite expiry.

Admission, begin, commit, and recovery acquire a fresh handle and reverify the
production evidence. Artifact writes renew both the local repository lease and
external coordinator lease. A missing, stale, malformed, mismatched, or failed
coordinator denies the transition.

The repository CLI intentionally has no production coordinator adapter.
Therefore a managed request sent through the standalone reference CLI remains
denied. A deployment must integrate `protected-tool-gateway.js` as a service
with a real coordinator and storage-side fencing. The deterministic coordinator
in `run-production-sandbox-gateway-fixtures.js` is a test double, not a
production backend.

## 8. Failure Rules

| Failure | Result |
| --- | --- |
| policy, evidence, admission, or manifest ref invalid | deny |
| appraiser signature, identity, freshness, or trust mismatch | exclude evidence; fail quorum when insufficient |
| shared failure-domain component | correlate appraisers; fail diversity when insufficient |
| deployment or scope disagreement | fail consensus |
| image provenance, host/runtime, key custody, MAC, seccomp, filesystem, network, or exclusive-path control missing | exclude evidence |
| admission outside validity | deny every gateway transition |
| OCI policy or execution mode substitution | deny before executor load |
| coordinator unavailable or acquire failure | deny before dispatch admission is consumed |
| coordinator handle, adapter, config, repository, transaction, admission, revision, fencing, or expiry mismatch | deny |
| gateway crash after execution began with unknown outcome | block lease and require reconciliation; never infer success |
| successful production execution | retain release false until the separate release-review and release-gate path authorizes the exact release target |

## 9. Residual Limits

The implementation does not yet provide:

- a TPM 2.0, confidential-computing, TEE, or cloud-attestation provider;
- a standard EAT/CMW wire-format parser or vendor endorsement/reference-value
  resolver;
- a production SLSA/Sigstore registry adapter;
- KMS/HSM or SPIFFE Workload API key delivery and rotation;
- a hardened rootless Docker deployment or verified userns/AppArmor/SELinux/
  Landlock installation;
- automatic application-minimal seccomp generation;
- etcd, Consul, database, or cloud coordination adapter and storage-enforced
  fencing;
- provider-native filesystem, MCP, network-allowlist, or delegation
  executors;
- installation-level proof that every direct shell, Docker, MCP, filesystem,
  network, and delegation path is unreachable;
- multi-user administration, incident response, break-glass, revocation, and
  reconciliation operations;
- release approval.

Consequently, this repository can validate a provider's evidence and deny
unsafe production claims, but it cannot make an ordinary local workstation a
production deployment by changing one boolean.

## 10. Validation

```bash
node validator-cli-prototype/run-fixtures.js
node run-production-sandbox-admission-fixtures.js
node run-production-sandbox-gateway-fixtures.js
node run-protected-tool-gateway-fixtures.js
node run-gateway-identity-adapter-fixtures.js
node run-oci-linux-sandbox-provider-fixtures.js
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js \
  "production sandbox RATS SLSA coordinator admission"
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js \
  --coverage .
```
