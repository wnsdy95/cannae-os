# Protected Process Execution

## 0. Status

Phase 17B2A is implemented as a POSIX reference adapter for one policy-pinned
ELF or Mach-O local process. It joins a Phase 16 dispatch admission and Phase
17 gateway transaction to a measured executable, exact argument vector,
signed pre-execution envelope, and signed post-execution observation.

This adapter is a bounded process boundary, not an operating-system sandbox.
It deliberately records:

```text
filesystem_isolation: false
syscall_filter: false
privilege_drop: false
process_tree_containment: false
network enforcement: not_enforced
outbound network: unknown
production_execution_authorized: false
release_authorized: false
```

Those statements are part of the assurance result, not a future promise.

## 1. Purpose

Phase 17A could authorize, begin, and record a tool transaction, but its
`external_adapter` result was supplied by the caller. Phase 17B1 authenticated
the gateway principal, but still did not prove which executable ran.

Phase 17B2A closes that specific gap:

```text
exact authorized tool-input digest
+ exact manifest-backed executor policy and rule
+ measured executor code and Node runtime
+ canonical native executable path and file digest
+ exact argv, cwd, empty environment, no runtime-inserted shell, no stdin
+ signed envelope retained before spawn
+ signed observation retained after process close
+ gateway-side independent bundle verification
= result may enter a ToolExecutionReceipt v0.3
```

The acting model cannot submit a command string. The only process input is a
`ProtectedProcessToolInput` containing one retained policy reference and one
rule identifier.

## 2. Source Basis

The implementation applies the following primary guidance:

- [Node.js `child_process.spawn`](https://nodejs.org/api/child_process.html)
  separates the executable and argument array and defaults `shell` to false.
  The adapter fixes `shell: false`, supplies an exact argv array, clears the
  environment, ignores stdin, and sets a finite timeout.
- [CWE-78](https://cwe.mitre.org/data/definitions/78.html) identifies OS command
  injection as construction of commands from externally influenced input.
  The adapter accepts no caller command fragment, option, path, or environment
  variable after authorization.
- [Linux `no_new_privs`](https://www.kernel.org/doc/html/latest/userspace-api/no_new_privs.html)
  and [seccomp filter](https://www.kernel.org/doc/html/latest/userspace-api/seccomp_filter.html)
  document distinct kernel controls for privilege gain and syscall reduction.
  The reference adapter does not set either and therefore does not claim them.
- [OCI Runtime Specification, Linux](https://github.com/opencontainers/runtime-spec/blob/main/config-linux.md)
  defines namespaces, devices, resources, seccomp, masked paths, and related
  container controls. These belong in a later sandbox provider, not in a
  generic process receipt.
- [NIST SP 800-190](https://csrc.nist.gov/pubs/sp/800/190/final) treats container
  image, runtime, host, registry, and orchestration risks as separate
  operational concerns. A future container adapter must preserve those
  distinctions and cannot infer isolation from an image digest alone.

## 3. Contracts

| Contract | Purpose | Required binding |
| --- | --- | --- |
| `ProtectedExecutorPolicy` v0.1 | USER-controlled executable allowlist | repository, gateway, adapter/runtime/key, control profiles, exact rules, validity |
| `ProtectedProcessToolInput` v0.1 | Complete raw tool input | one concrete policy ref and one rule ID only |
| `ProtectedExecutionEnvelope` v0.1 | Signed intent retained before spawn | transaction refs, command, limits, controls, repository state, expiry |
| `ProtectedExecutionObservation` v0.1 | Signed result retained after close | envelope ref, process disposition, bounded output, result digest, before/after state |
| `ToolExecutionReceipt` v0.3 | Gateway terminal disposition | all earlier refs plus policy, envelope, and observation refs |

The policy's signing public key is retained. The private key is supplied from a
separate local file at execution time and is never written to a request,
policy, envelope, observation, receipt, or manifest.

## 4. Policy Rules

Each rule fixes all process-shaping values:

- one canonical absolute ELF or Mach-O executable path and SHA-256 digest;
- one exact argv array, including every option and operand;
- one canonical repository-relative cwd;
- timeout, stdout cap, stderr cap, and accepted exit codes;
- expected repository effect, either `none` or `recorded`.

The reference policy permits no runtime-inserted shell, detached child,
inherited environment, or stdin. It requires a non-root POSIX parent process.
The adapter rejects shebang scripts because their kernel-selected interpreter
would be an unmeasured executable. A policy may select a native interpreter
such as Node directly only when every script or code argument is fixed in the
policy. The adapter also rejects a symlinked or non-regular executable, a
changed executable digest, a cwd that escapes the repository, a mismatched
adapter/runtime measurement, an expired policy or decision, and a validity
window too short for the configured timeout. It repeats path, native-format,
and digest appraisal immediately before spawn and after process close.

Native format is not process-tree confinement. The selected executable may
perform another `exec` or create descendants. Phase 17B2A neither measures
those later executables nor prevents them; policy authors must select a direct
target, and stronger enforcement belongs to the Phase 17B2B provider.

`expected_repository_effect: none` is checked after execution. Any changed
repository fingerprint rejects commit and moves the transaction to
`recovery_required`. `recorded` permits a change to be recorded; it does not
grant commit, push, release, or authority.

## 5. Execution Sequence

```text
USER-approved mission and dispatch-policy draft
        |
        v
persist exact ProtectedExecutorPolicy
        |
        v
hash ProtectedProcessToolInput into dispatch policy and gateway request
        |
        v
gateway admit -> authorized
        |
        v
executor obtains repository-wide execution lease
        |
        v
gateway begin -> exact executing event
        |
        v
sign and persist envelope
        |
        v
spawn(executable, argv, shell=false, env={}, stdin=ignore)
        |
        v
sign and persist observation
        |
        v
gateway reloads and verifies policy + envelope + observation
        |
        v
dispatch post-tool checkpoint -> receipt v0.3 -> committed
```

The envelope is the execution claim marker. Once it exists, an incomplete
transaction is never automatically executed again. A retry returns the
terminal receipt or changes an unresolved transaction to
`recovery_required`.

## 6. Reference Operation

### 6.1 Measure the Installed Adapter

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_protected_executor.js \
  measurements
```

Use the returned adapter ID, version, adapter digest, runtime digest, and
execution mode exactly. Measure the chosen executable separately and construct
a schema-valid policy whose control-profile digests cover every declared
control field.

### 6.2 Persist the Policy

Persist the policy before finalizing the dispatch policy because the complete
policy artifact reference is part of `ProtectedProcessToolInput`:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_protected_executor.js \
  persist-policy \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --mission <mission-id> \
  --wave <wave-id> \
  --policy <protected-executor-policy.json>
```

Then:

1. create `ProtectedProcessToolInput` from the returned `policy_ref` and one
   exact rule ID;
2. authorize its canonical digest in the Phase 16 dispatch-policy draft;
3. bind that draft digest in the USER-authorized mission plan;
4. open the wave, authorize the policy, issue the lease, and admit the gateway
   request with the same input digest.

### 6.3 Execute

Do not manually call gateway `begin` or `commit` for
`ProtectedProcessToolInput`. The protected executor owns that sequence:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_protected_executor.js \
  execute \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --transaction <transaction-id> \
  --tool-input <protected-process-tool-input.json> \
  --private-key <executor-ed25519-private-key.pem> \
  --gateway-binding-sha256 <trusted-gateway-digest> \
  --verified-principal-sha256 <trusted-principal-digest>
```

Omit `--verified-principal-sha256` on the Phase 17B1
`authenticated_reference` path. The separate trusted gateway binding remains
required.

Successful process execution returns exit status zero from the CLI. A
policy-valid process failure is still durably committed as a failed execution
and returns exit status one. Contract, policy, or evidence failure returns exit
status two or produces `recovery_required`.

## 7. Gateway Verification

The gateway does not trust the executor's summary object. Before dispatch
completion it reloads all three evidence references from the verified
repository manifest and checks:

1. policy validity, repository and gateway bindings, signing key, and control
   profile digests;
2. envelope and observation signatures and complete-artifact digests;
3. exact request, decision, executing-event, policy, envelope, transaction,
   provider, input, rule, command, limit, adapter, runtime, and control
   bindings;
4. event, envelope, observation, decision, policy, and evaluation time order;
5. before/after repository state and the rule's expected effect;
6. retained stdout/stderr byte counts, truncation flags, hashes, and result
   digest;
7. exit code, signal, termination reason, timeout/output-limit flags, and
   succeeded/failed projection.

A `ProtectedProcessToolInput` paired with `fixture` or `external_adapter`
evidence is rejected. `bounded_process_reference` evidence paired with any
other tool input is also rejected.

## 8. Failure Behavior

| Failure point | State | Automatic retry |
| --- | --- | --- |
| Before gateway begin | remains `authorized` | allowed only after the policy/runtime problem is corrected |
| After begin but before envelope | `executing`; operator recovery required | no blind execution |
| After envelope, before process | `recovery_required` | never rerun |
| After process, before observation | `recovery_required` | never rerun; effect is unknown |
| After observation, before receipt | `recovery_required` | never rerun; reconcile retained evidence |
| Process exits nonzero | `committed` with failed result | never rerun under the same transaction |
| Timeout or output cap | `committed` with failed result | never rerun under the same transaction |
| Forbidden repository effect | `recovery_required` | never rerun |
| Evidence or reference substitution | commit rejected | never reinterpret as success |

`SIGKILL` is used when the timeout or output cap fires. Because process-tree
containment is false, descendants that escape the direct child are not proven
terminated. Treat that case as a deployment limitation and reconcile it.

## 9. Residual Limits

Phase 17B2A does not provide:

- filesystem namespaces, read-only mounts, chroot, or container isolation;
- seccomp, `no_new_privs`, capability bounding, UID/GID transition, or MAC
  policy;
- process-group or cgroup containment;
- network namespace, DNS control, proxy policy, or egress denial;
- secret brokering or environment allowlisting beyond an empty environment;
- independently protected executor key custody or deployment attestation;
- an immutable executable mount; repeated digest checks narrow but cannot
  eliminate a replace-execute-restore race;
- provider-native shell, filesystem, MCP, network, or delegation adapters;
- a multi-host linearizable coordinator;
- proof that every alternate path to the executable is unavailable;
- production execution, managed exclusivity, release, or authority expansion.

Phase 17B2B should introduce an OCI/Linux sandbox provider with independently
measured image, runtime configuration, namespaces, seccomp, privilege and
egress policy. It must preserve this policy/envelope/observation interface while
making stronger claims only when those controls are directly observed.

## 10. Validation

```bash
node validator-cli-prototype/run-fixtures.js
node run-protected-tool-gateway-fixtures.js
node run-protected-process-executor-fixtures.js
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js \
  "protected process executor exact argv envelope observation"
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js \
  --coverage .
```
