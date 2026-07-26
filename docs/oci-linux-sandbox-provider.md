# OCI Linux Sandbox Provider

## 1. Status And Scope

Phase 17B2B is implemented as a Docker Engine reference provider for one
policy-pinned static Linux target. It adds directly measured Linux isolation
evidence to the Phase 17 gateway transaction, but it is not a production
deployment, a managed exclusive tool path, an independent host attestation, or
release authority.

The provider supports Linux `amd64` and `arm64` images on a Docker daemon with
cgroup v2 and seccomp. The current reference image is a `FROM scratch` image
containing only `/cannae-probe`; the live fixture builds that image. The
provider verifies the extracted probe bytes, entrypoint, and environment, but
does not inventory the full image filesystem or prove that no other file is
present. The probe supervises the exact target, collects kernel observations,
and emits one bounded JSON result.

This phase answers a narrow question:

> Can the gateway prove that one authorized target ran once in a container
> whose image, launch configuration, privilege state, mounts, resources, and
> network state match an exact retained policy?

It does not answer whether the Docker daemon, host, evidence key, gateway
deployment, or all alternate tool paths are independently trustworthy.

## 2. Assurance Equation

```text
current dispatch lease and gateway authorization
+ exact manifest-backed OCI policy and rule
+ immutable image ID and static probe digest
+ signed envelope retained before docker create
+ exact create argv and no image pull
+ Docker inspect configuration appraisal
+ in-container /proc, namespace, mount, cgroup, and network observation
+ read-only repository state preserved
+ container terminal state and verified removal
+ signed observation and independent gateway bundle appraisal
= result may enter ToolExecutionReceipt v0.4
```

Every term is mandatory. Configuration intent alone is not observation, and a
probe observation alone does not prove which Docker configuration created the
container. The gateway requires both and verifies their exact relationship.

## 3. Contracts

| Artifact | Purpose | Critical bindings |
| --- | --- | --- |
| `OciLinuxSandboxPolicy` v0.1 | USER-controlled execution policy | repository, gateway, adapter, Docker CLI, probe, image ID, seccomp profile, controls, rule, validity |
| `OciSandboxToolInput` v0.1 | Complete runtime input | one concrete policy reference and one rule ID |
| `OciSandboxExecutionEnvelope` v0.1 | Signed intent before container create | transaction, executing event, policy, image, probe command, target, limits, Docker argv digest, runtime, repository state |
| `OciSandboxProbeObservation` v0.1 | Kernel-side measurement | UID/GID, capabilities, `NoNewPrivs`, seccomp, namespace handles, mounts, cgroup, network, write tests, child result |
| `OciSandboxExecutionObservation` v0.1 | Signed terminal observation | envelope, probe artifact, Docker inspect projection, terminal state, cleanup, result, repository state |
| `ToolExecutionReceipt` v0.4 | Gateway terminal disposition | three concrete OCI evidence references and exact probe digest for `oci_linux_sandbox_reference` |

The receipt still exposes only three execution references. The signed
observation contains the concrete probe-observation reference, so the gateway
reloads a four-artifact chain:

```text
policy -> envelope -> probe observation -> signed execution observation
```

## 4. Policy-Fixed Controls

The reference policy requires:

- immutable `sha256:` image ID and `--pull never`;
- one static `/cannae-probe` target whose bytes are extracted from an unstarted
  appraisal container and must equal the measured host probe digest;
- non-root UID and GID;
- `--cap-drop ALL`;
- `no-new-privileges=true`;
- Docker init and private PID, IPC, UTS, cgroup, mount, and network namespace
  behavior;
- read-only root filesystem;
- recursively read-only repository bind mount at `/workspace`;
- `/tmp` tmpfs with `rw`, `noexec`, `nosuid`, and `nodev`;
- a repository-retained, digest-pinned seccomp profile with
  `SCMP_ACT_ERRNO` default action;
- cgroup v2 memory, memory-and-swap, PID, CPU period, and CPU quota limits;
- Docker `none` network mode;
- no DNS or proxy environment supplied to the target;
- empty target environment, ignored stdin, no shell, finite timeout, bounded
  stdout and stderr, and no repository effect.

The container supervisor inherits one fixed `PATH=` image variable because
Docker image configuration requires an environment entry for this reference
image. The measured probe launches the target with an explicitly empty
environment and an absolute path.

## 5. Direct Observations

### 5.1 Docker Runtime

Before the signed envelope, the provider measures:

- Docker CLI digest;
- client, server, and API versions;
- runtime name and version;
- daemon operating system, architecture, and kernel;
- cgroup version;
- reported security options;
- rootless and user-namespace-remap indicators.

After `docker create` and before `docker start`, Docker inspect must match the
signed launch:

- image ID, entrypoint, command, user, and fixed image environment;
- read-only rootfs;
- `none` network mode;
- all capabilities dropped;
- `no-new-privileges` and the exact seccomp JSON object;
- private cgroup and IPC modes and default-private PID and UTS modes;
- init enabled;
- exact tmpfs destination, size, and normalized mount options;
- exact cgroup resource values;
- exact repository source and destination with `RW: false` and `rprivate`
  propagation.

The provider compares the seccomp JSON retained by Docker with the
repository-retained profile structurally. It does not accept `unconfined`.

### 5.2 Kernel Probe

The static probe reads:

- `/proc/self/status` for four UID/GID values, five capability sets,
  `NoNewPrivs`, `Seccomp`, `Seccomp_filters`, and `NSpid`;
- `/proc/self/ns/*` for cgroup, IPC, mount, network, PID, and UTS namespace
  handles;
- `/proc/self/mountinfo` for VFS read-only state and recursive repository
  submount state;
- `/proc/self/cgroup` and cgroup v2 `memory.max`, `pids.max`, and `cpu.max`;
- `/proc/net/dev`, interface addresses, IPv4/IPv6 routes, and a bounded
  outbound connection attempt.

It also attempts writes to `/`, `/workspace`, and `/tmp`. The first two must
fail and the tmpfs write must succeed.

Docker Desktop may expose unaddressed tunnel devices inside a `none` network
namespace. The provider therefore records all names but evaluates effective
egress using addressed interfaces, non-loopback addresses, usable default
routes, the direct connection attempt, and Docker's retained `none` mode.
Only `lo` may have an address, no non-loopback address or usable default route
may exist, and outbound connect must fail.

## 6. Execution Sequence

1. Route doctrine and open the dispatch-controlled wave.
2. Retain USER authorization for the exact dispatch policy.
3. Build and measure the static Linux probe and probe-only image.
4. Construct and persist `OciLinuxSandboxPolicy`.
5. Admit a `ToolGatewayRequest` whose raw input is exactly one
   `OciSandboxToolInput`.
6. Run `operate_oci_sandbox.js execute`; do not call gateway `begin` manually.
7. Reload policy, request, decision, lease, checkpoint, and repository state.
8. Appraise Docker, probe, image, and seccomp profile before gateway begin.
9. Claim the executing event.
10. Sign and retain the envelope before `docker create`.
11. Recheck repository, image, profile, and exact create argv.
12. Create, inspect, start, wait, and inspect the container without a shell.
13. Retain and validate the probe observation.
14. Remove the container and verify that inspection now fails.
15. Sign and retain the execution observation.
16. Submit the exact evidence chain to the gateway.
17. Let the gateway independently reload and verify the bundle before dispatch
    completion and receipt creation.

## 7. CLI

Measure the installed adapter, Docker CLI, and compiled probe:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_oci_sandbox.js \
  measurements --probe <static-linux-probe>
```

Persist a policy:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_oci_sandbox.js \
  persist-policy --repository <repo> --artifact-root <artifact-root> \
  --mission <mission-id> --wave <wave-id> --policy <policy.json>
```

Execute an already authorized transaction:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_oci_sandbox.js \
  execute --repository <repo> --artifact-root <artifact-root> \
  --transaction <transaction-id> --tool-input <oci-tool-input.json> \
  --private-key <adapter-ed25519-private-key.pem> \
  --gateway-binding-sha256 <trusted-gateway-digest> \
  --verified-principal-sha256 <trusted-principal-digest> \
  --probe <static-linux-probe>
```

Claude Code uses the equivalent wrapper under
`.claude/skills/controls-doctrine-operator/scripts/`.

## 8. Failure And Recovery

| Failure point | Required disposition |
| --- | --- |
| Policy, adapter, probe, image, profile, or runtime mismatch before begin | deny execution; transaction remains authorized for explicit correction or cancellation |
| Repository drift before create | do not create; recover the claimed transaction |
| Docker create or pre-start inspect mismatch | force-remove container; `recovery_required` |
| Timeout or output overflow with complete probe result | retain failed result and commit that exact failed disposition |
| Crash after envelope | never create or start again; reconcile and recover |
| Crash after create or start | contain with force-remove when possible; never rerun; recover |
| `recovery_required` replay after cleanup failure | retry force-remove without rerunning the target; expose unverifiable cleanup as `provider_failure` |
| Probe, terminal state, cleanup, signature, ref, or result mismatch | do not commit; recover |
| Container removal cannot be verified | no signed successful observation; recover |

The envelope is the no-rerun marker. Once retained, retry may return an existing
terminal state or perform containment cleanup, but it cannot invoke the target
again.

## 9. Production Composition

Phase 17B2B remains a reference executor and never self-promotes to
production. Phase 17B2C1 can compose its exact manifest-backed
`OciLinuxSandboxPolicy` into a `ProductionSandboxPolicy` only when independent
appraisers additionally verify the host, daemon/runtime, OCI provenance,
credential custody, rootless or user-namespace isolation, mandatory access
control, application-minimal seccomp, filesystem/network policy, external
coordination, storage fencing, and exclusive gateway path.

The managed request must use `ToolGatewayRequest` v0.3, preserve
`oci_linux_sandbox_reference`, cite the exact production admission, and pass a
live external coordinator check at every gateway transition. The OCI execution
bundle remains independently required at commit. Production admission does not
replace runtime evidence, and runtime evidence does not replace production
admission.

See `production-sandbox-admission.md`.

## 10. Residual Limits

The local Phase 17B2B provider still does not prove:

- independent trust in the Docker daemon, host kernel, Docker socket, runtime,
  or local evidence key;
- image signature, provenance, registry policy, or reproducible-build identity;
- rootless Docker or user-namespace remapping;
- AppArmor, SELinux, Landlock, or another mandatory access-control profile;
- a minimal application-specific seccomp allowlist; the vendored Moby default
  profile remains broad and must be treated as one layer, not complete
  confinement;
- secret brokering or output redaction;
- storage-enforced fencing or multi-host linearizable coordination;
- provider-native MCP, filesystem mutation, network allowlist, or delegation
  adapters;
- independent deployment/configuration attestation for the provider and
  gateway;
- proof that the acting agent cannot access Docker, the host shell, MCP, or
  another side-effect path directly;
- production execution, managed exclusivity, deployment verification, release,
  or authority expansion.

`content_trust_verified`, `production_execution_authorized`,
`production_deployment_verified`, and `release_authorized` remain false on the
standalone reference path. Only a separately evidenced Phase 17B2C1 managed
deployment may set the two production fields true; release remains false.

## 11. Validation

```bash
node validator-cli-prototype/run-fixtures.js
node run-protected-tool-gateway-fixtures.js
node run-protected-process-executor-fixtures.js
node run-oci-linux-sandbox-provider-fixtures.js
node run-production-sandbox-admission-fixtures.js
node run-production-sandbox-gateway-fixtures.js
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js \
  "OCI Linux sandbox seccomp cgroup network evidence"
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js \
  --coverage .
```

The OCI fixture compiles the real static probe, builds a probe-only scratch
image without network access, executes live Docker containers, and tests:

- successful single execution and replay;
- caller-declared result rejection;
- seccomp profile drift before begin;
- missing image digest before begin;
- substituted image-probe rejection before begin;
- privileged probe-evidence rejection;
- measured timeout failure;
- post-create interruption, cleanup, and no-rerun recovery;
- recovery replay with unavailable cleanup, explicit failure reporting, and
  later containment retry;
- post-container interruption, cleanup, and no-rerun recovery.

When Docker or Go is unavailable, local runs report explicit skips. Repository
CI sets `CANNAE_REQUIRE_LIVE_OCI=1`, so a missing live runtime fails validation.
Such a skip is not evidence that the provider works on that host.

## 11. Primary Sources

- OCI Runtime Specification, Linux configuration:
  <https://github.com/opencontainers/runtime-spec/blob/main/config-linux.md>
- Docker container create:
  <https://docs.docker.com/reference/cli/docker/container/create/>
- Docker seccomp:
  <https://docs.docker.com/engine/security/seccomp/>
- Docker `none` network:
  <https://docs.docker.com/engine/network/drivers/none/>
- Docker bind mounts:
  <https://docs.docker.com/engine/storage/bind-mounts/>
- Linux proc filesystem:
  <https://docs.kernel.org/filesystems/proc.html>
- Linux cgroup v2:
  <https://docs.kernel.org/admin-guide/cgroup-v2.html>
- Linux capabilities:
  <https://man7.org/linux/man-pages/man7/capabilities.7.html>
- NIST SP 800-190:
  <https://csrc.nist.gov/pubs/sp/800/190/final>
