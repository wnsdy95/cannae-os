# Protected Tool Gateway Contract

## 0. Status

Phase 17A is implemented as a repository-manifest-backed contract and reference
controller. It does not deploy a production gateway and does not prove that the
gateway is the only path to a tool.

The controller deliberately fixes:

```text
production_execution_authorized: false
production_deployment_verified: false
release_authorized: false
```

Phase 17B must supply independently managed provider adapters, exclusive
network/process routing, authenticated configuration, and deployment evidence
before any production exclusivity claim is possible.

## 1. Purpose

Provider hooks can reject covered calls, but a project-local hook is controlled
by the same client that runs the agent. A protected gateway moves the
authorization check to the execution boundary and gives every attempted side
effect a durable transaction.

The admission equation is:

```text
authenticated principal
+ exact gateway configuration
+ current dispatch lease and policy
+ exact repository checkpoint
+ exact tool name, operation class, and input digest
+ unused idempotency key
= one bounded execution authorization
```

No model capability, routing receipt, context pack, prior conversation, or
successful earlier call substitutes for any term.

## 2. Source Basis

The contract adapts the following non-military security principles:

- [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final): do not grant
  implicit trust from network location; authenticate and authorize the subject
  and device before a resource session.
- [NIST SP 800-207A](https://csrc.nist.gov/pubs/sp/800/207/a/final):
  application and service identities plus gateways or sidecars can enforce
  granular policy between services.
- [NIST SP 800-53 Rev. 5.1](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final):
  audit records identify the event, time, source, outcome, and actor, and audit
  information is protected from unauthorized change or deletion.
- [RFC 8705](https://www.rfc-editor.org/rfc/rfc8705.html): sender-constrained
  credentials bind token use to proof of possession.
- [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html): proof-of-possession,
  audience, freshness, nonce, and replay controls reduce bearer-token replay.
- [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html): authorization
  deployments should use sender-constrained and audience-restricted access
  tokens with minimum privileges.
- [etcd v3.6 transactions](https://etcd.io/docs/v3.6/learning/api/): protected
  state updates require atomic comparison, revisions, and lease-aware
  coordination.

The resulting Controls interpretation is intentionally conservative: identity
proof, policy admission, repository state, and execution recording are separate
claims that must be joined by exact references.

## 3. Trust Boundaries

### 3.1 Trusted inputs

`admit`, `begin`, `commit`, and `recover` require two externally appraised
digests:

- `verifiedPrincipalSha256`: digest of the exact authenticated-principal
  projection produced by an identity adapter.
- `gatewayBindingSha256`: digest of the exact gateway deployment and
  configuration projection loaded from a trusted control plane.

The acting agent must not calculate these values and then treat them as
independent proof. The Phase 17A CLI accepts them so adapters can integrate with
the common contract; the CLI alone cannot establish their provenance.

### 3.2 Raw tool input

The exact tool input is passed separately to the controller. It is canonicalized
and compared with `tool_call.tool_input_sha256`, but it is not copied into a
gateway request, decision, receipt, or transaction event. Recovery before
execution requires the operator or adapter to supply the same raw input again.

Secrets still need adapter-side redaction and protected transport. A digest can
confirm equality but does not make a low-entropy secret unrecoverable.

### 3.3 Retained authority

Every contract fixes human final decision authority to `USER`, prohibits
self-approval, and leaves release unauthorized. A gateway allow only permits
the exact tool transaction. It does not authorize commit, push, merge, release,
risk acceptance, policy change, or authority change.

## 4. Contracts

| Contract | Purpose | Critical bindings |
| --- | --- | --- |
| `ToolGatewayRequest` | Immutable request envelope | gateway, principal, lease, policy, checkpoint, repository, exact tool digest, idempotency, validity |
| `ToolGatewayDecision` | Admission result | exact request and dispatch admission, principal/gateway digests, rule, repository state, coordination observation |
| `ToolExecutionReceipt` | Final execution disposition | exact request/decision/admission/checkpoint, executor measurements, result digest, before/after state |
| `ToolGatewayTransactionEvent` | Append-only state transition | transaction sequence, predecessor, immutable request bindings, decision/receipt references |

The repository artifact manifest is the custody layer. Conversation history is
not transaction state.

## 5. State Machine

```text
request persisted
      |
      v
  received
    |   \
    |    +--------------------------> denied
    v
 authorized
    |    \
    |     +-- exact cancellation --> aborted
    |     +-- uncertain cleanup ---> recovery_required
    v
 executing
    |    \
    |     +-- unknown outcome ------> recovery_required
    v
 committed
```

Rules:

1. `received` is sequence 1 and has no predecessor.
2. `authorized` requires a concrete allow decision and dispatch admission.
3. `executing` is created only from a current authorization and becomes the
   one execution token.
4. `committed` means that the post-tool result was correlated and recorded. It
   can contain a succeeded or failed tool result.
5. `aborted` proves the dispatch admission was cancelled before execution and
   records `external_effects: none`.
6. `recovery_required` records an unknown outcome, blocks the dispatch lease,
   and cannot be interpreted as success.
7. Terminal states are immutable. Retrying the same request returns the
   retained projection instead of creating another execution.

## 6. Reference Operation

### 6.1 Prepare

Complete the normal mission lifecycle first:

1. Open a routed wave.
2. Compile the exact USER-plan-authorized dispatch policy.
3. Issue one short-lived lease for the exact provider session and mission
   agent.
4. Canonically hash the raw tool input:

```bash
node protected-tool-gateway.js hash-input tool-input.json
```

Construct a schema-valid `ToolGatewayRequest` from the active lease, policy,
checkpoint, repository state, authenticated-principal projection, and trusted
gateway projection.

### 6.2 Admit

```bash
node protected-tool-gateway.js admit \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --request <tool-gateway-request.json> \
  --tool-input <tool-input.json> \
  --verified-principal-sha256 <trusted-principal-digest> \
  --gateway-binding-sha256 <trusted-gateway-digest>
```

Continue only when `state` is `authorized`. A denied result is terminal.

### 6.3 Begin

```bash
node protected-tool-gateway.js begin \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --transaction <transaction-id> \
  --verified-principal-sha256 <trusted-principal-digest> \
  --gateway-binding-sha256 <trusted-gateway-digest>
```

The returned `execution_event_ref` is the one current execution token. Phase
17A does not invoke the tool. An external adapter executes only after this
transition and keeps the raw input in protected transient memory.

### 6.4 Commit

The adapter records its own code, runtime, sandbox, and network-policy digests,
then submits the result:

```bash
node protected-tool-gateway.js commit \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --transaction <transaction-id> \
  --execution-ref <execution-event-ref.json> \
  --tool-input <tool-input.json> \
  --result <tool-result.json> \
  --executor <executor-evidence.json> \
  --status succeeded \
  --started-at <timestamp> \
  --finished-at <timestamp> \
  --exit-code 0 \
  --verified-principal-sha256 <trusted-principal-digest> \
  --gateway-binding-sha256 <trusted-gateway-digest>
```

The controller sends an exact post-tool correlation to the Phase 16 dispatch
runtime. A binding failure is not converted into success; it produces
`recovery_required`.

### 6.5 Recover

For an authorized but unstarted transaction, supply the exact input so the
dispatch admission can be cancelled:

```bash
node protected-tool-gateway.js recover \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --transaction <transaction-id> \
  --tool-input <tool-input.json> \
  --verified-principal-sha256 <trusted-principal-digest> \
  --gateway-binding-sha256 <trusted-gateway-digest>
```

For an `executing` transaction, omit the input. The controller cannot know
whether an external effect occurred, so it blocks the lease and writes
`recovery_required`. A human-led reconciliation must inspect the external
system and repository before any new lease is issued.

### 6.6 Inspect

```bash
node protected-tool-gateway.js status \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --mission <mission-id> \
  --wave <wave-id> \
  --agent <agent-id>
```

Status reconstructs each transaction from the verified manifest and validates
the event chain. It does not rely on mutable in-memory state.

## 7. Multi-Agent Operation

Each independently acting agent still needs a separate top-level provider
session, policy, lease lineage, authenticated principal, and transaction
namespace. In one repository worktree, agents execute in ordered lease
handoffs. Parallel worktrees are separate repository-scoped sub-missions and
need a later integration wave.

The gateway does not infer that a caller is harmless because it claims a
read-only operation class. The requested class must equal the dispatch rule's
class. A substitution causes exact cancellation and denial.

## 8. Idempotency And Crash Recovery

The idempotency key binds one canonical request:

- same key and same request: return existing state;
- same key and different request: hard conflict;
- same transaction and different request or key: hard conflict before a second
  request artifact is written;
- existing dispatch admission but missing decision: reload and finish the
  decision without replaying the tool;
- explicit recovery of an allow admission with no decision: cancel it when the
  exact raw input is available; otherwise block the lease before recording
  denial;
- existing post-tool checkpoint but missing receipt: reconstruct the receipt
  from that checkpoint;
- existing receipt but missing terminal event: append only the missing event;
- execution begun with no trustworthy completion: block and require recovery.

The reference controller serializes its repository gateway transaction store
with an expiring shared-filesystem lease. This makes transaction and
idempotency uniqueness checks atomic within one coherent filesystem. A
multi-host production gateway requires a linearizable coordinator and
storage-side fencing.

## 9. Failure Matrix

| Condition | Result |
| --- | --- |
| Principal or gateway digest mismatch | deny |
| Fixture identity or local reference controller claims managed exclusivity | deny |
| Lease, policy, checkpoint, session, agent, provider, or repository mismatch | deny |
| Raw input digest mismatch | deny before dispatch admission |
| Operation-class substitution | cancel exact admission, then deny |
| Reused tool-use ID | dispatch replay denial |
| Reused idempotency key with changed request | conflict |
| Reused transaction ID with a different request or key | conflict before write |
| Crash after allow admission but before decision | cancel exactly or block lease, then deny |
| Repository drift before begin | do not begin |
| Begin or execution timestamps precede their retained predecessor | do not begin or commit |
| Execution completion timestamp exceeds receipt time | do not commit |
| Wrong or stale execution token | do not commit |
| Authorized request stopped before begin | exact cancellation and abort |
| Executing request loses outcome | block lease and require recovery |
| Post-tool correlation failure | block lease and require recovery |

## 10. Phase 17B Requirements

A production claim requires all of the following outside this reference
controller:

- gateway process and policy configuration protected from the acting agent;
- authenticated mTLS, DPoP, or workload-OIDC adapter with issuer, audience,
  freshness, revocation, and proof-of-possession appraisal;
- provider-specific MCP, shell, filesystem, network, and delegation adapters;
- OS/container sandboxing and egress policy that prevent direct side paths;
- a linearizable coordinator and storage-enforced fencing;
- secrets handling that does not expose raw input to the model or audit store;
- deployment/code/configuration evidence independently verified by the
  operator;
- health, revocation, incident, reconciliation, and break-glass procedures;
- adversarial tests proving that direct tool access fails when the gateway is
  unavailable.

Until those conditions are measured, `contract_reference` is the only honest
assurance level.

## 11. Validation

```bash
node validator-cli-prototype/run-fixtures.js
node run-dispatch-runtime-fixtures.js
node run-protected-tool-gateway-fixtures.js
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
```

The fixtures cover successful commit, idempotent replay, key and transaction
conflict, backdated transition rejection, principal substitution,
managed-assurance overclaim, raw-input mismatch, operation-class substitution,
exact pre-execution cancellation, both exact and fail-closed orphan-admission
revocation, and unknown in-flight recovery.
