# Enforced Dispatch And Resumable Execution

## 1. Purpose

The operational mission lifecycle proves that an agent received a current routing
receipt and a digest-bound context pack. It does not, by itself, force every tool
call to use that route.

Phase 16 adds a provider-neutral admission state machine between mission opening
and protected tool execution:

```text
policy draft -> canonical SHA-256
  -> USER-authorized MissionWavePlan dispatch_control row
  -> ready routing preflight
  -> AgentContextPack
  -> controller-compiled DispatchToolPolicy
  -> short-lived AgentDispatchLease
  -> PreToolUse admission
  -> provider permission checks
  -> tool execution
  -> result-bound PostToolUse checkpoint
```

No active lease means no admitted protected tool call. A lease never grants
commit, push, merge, risk acceptance, policy change, authority change, or
release.

## 2. Control Objects

### 2.1 DispatchToolPolicy

The caller first creates a policy draft. Before `open`, the canonical SHA-256
of that exact draft must appear in the USER-authorized
`MissionWavePlan.dispatch_control.policy_authorizations` row for the same
mission agent, provider, and policy ID. After `open`, `authorize-policy` reloads
the persisted plan and exact agent context pack, verifies the digest, and
compiles the final `DispatchToolPolicy`. A raw draft cannot issue a lease.

The compiled policy is deny-by-default and belongs to one mission, wave,
mission agent, and provider. Every rule fixes:

- one exact action copied from that agent's plan `allowed_actions`;
- one exact provider tool name;
- one operation class;
- one deterministic input matcher;
- one per-rule use budget.

Input matchers are:

| Mode | Use |
| --- | --- |
| `exact_sha256` | Match the canonical digest of the complete tool input |
| `path_prefix` | Resolve declared JSON-pointer path fields inside the repository |
| `patch_paths` | Parse every path declared by an `apply_patch` envelope |

The runtime rejects missing paths, absolute paths, traversal, symlink escape,
protected control paths, ambiguous matching rules, obvious retained-action
commands, exhausted rule budgets, and exhausted lease budgets. The local
guardrail does not compile approval-required, prohibited, network, or
delegation actions. Those require a new human-authorized wave or an independently
protected gateway with the applicable approval contract.

### 2.2 AgentDispatchLease

The controller issues an immutable, short-lived lease only from a compiled
policy after reloading the exact plan, routing preflight, context pack, and
policy from the verified repository artifact manifest.

The lease binds:

- mission, wave, and mission agent;
- provider session and provider-agent identity;
- exact plan, preflight, context, and policy references;
- Git repository identity and initial repository state;
- one random 32-byte nonce;
- an admission budget and finite time window;
- retained `USER` authority and `release_authorized: false`.

Only one initial lease lineage may exist for a repository/mission/wave/agent.
Policy compilation is serialized per agent, lease issuance is serialized across
the repository namespace, and a second provider session cannot create a
parallel lineage under the same agent assignment. Explicit `resume` may
continue the existing lineage after review; it does not create an independent
initial authority path.

Issuance is also serialized across the repository namespace. No policy can
become active while another lease is nonterminal. The local controller does not
trust caller-declared operation classes enough to create a parallel read-only
exception. This creates an ordered multi-agent handoff for all covered tool work
in one repository namespace.

The lease is a local capability record, not an authenticated human signature.
At Level 2, the plan's USER authorization is a retained-authority assertion,
not cryptographic proof of a human signer. Production deployments must protect
the plan, artifact store, policy issuer, hook configuration, and runtime code
outside the agent's writable boundary.

### 2.3 ToolAdmissionEvent

Every covered `PreToolUse` call is bound to:

- the active lease and current checkpoint;
- provider session and provider-agent identity;
- tool-use ID, exact tool name, and canonical input digest;
- current Git HEAD, worktree fingerprint, and dirty state;
- the matched rule and operation class;
- one allow or deny decision with reason codes.

A tool-use ID can be consumed only once. Reuse is replay and is denied.
An allowed call becomes an unresolved in-flight admission until a matching
post-tool event presents the same tool-use ID, exact tool name, and exact
canonical input digest.

### 2.4 AgentExecutionCheckpoint

One lease has a linear checkpoint chain:

```text
baseline -> admitted tool -> post-tool checkpoint -> next admitted tool
```

Only one tool may be in flight per lease. The next call is denied until the
provider's post-tool event records the provider-result digest, execution status,
external-effect disposition, and resulting repository state. A mismatched tool
name or input digest cannot settle the admission. A failed tool or unknown
external effects block the lease for reconciliation. Read-only operations that
change the repository block the lease. A changed Git HEAD also blocks the lease
when the policy requires exact HEAD continuity.

This intentionally favors accountable serial execution. In one
repository-bound wave, covered-tool agents use separate mission-agent
assignments and top-level sessions but take authority in ordered stages against
the same target worktree and artifact namespace. Independent worktrees are
separate repository identities: use them as separately reported sub-missions
and integrate their outputs through a later controlling wave, not as invisible
parallel writers in one report.

## 3. Multi-Agent Operating Procedure

1. Create one deny-by-default policy draft per mission agent and provider.
2. Hash each exact draft and place its digest and identity tuple in the
   USER-authorized `MissionWavePlan.dispatch_control`.
3. Open the exact plan with `operate_controls_mission.js open`. Require context
   readiness while tool execution and dispatch remain false.
4. Give each agent only its exact `AgentContextPack`.
5. Run each agent in a separate top-level provider session, but stage those
   sessions against the same mission repository namespace. Complete or
   otherwise settle one lease before issuing the next.
6. Compile each preauthorized draft with `authorize-policy`, then issue its
   initial lease lineage only when repository handoff is clear.
7. Start the provider with the required Cannae environment variables and
   lifecycle hooks enabled.
8. Require a persisted allow event before every covered tool call and a
   result-bound post-tool checkpoint before the next one.
9. Complete a successful agent's lease. Revoke, interrupt, or reconcile on
   scope change, authority change, unexpected drift, unresolved post-tool
   failure, or operator stop.
10. Report only manifest-backed work evidence. The lifecycle report gate
    requires every dispatch-controlled agent to have one settled lineage.

One agent never shares a lease with another agent. Model capability never
changes lease authority.

## 4. Commands

Install the skills first:

```bash
./install-ai-cli-skills.sh
```

Preview project-local hook configuration:

```bash
node install-dispatch-hooks.js --provider all --repository . --dry-run
```

Write the project-local hook configuration:

```bash
node install-dispatch-hooks.js --provider all --repository .
```

Create a policy draft, then calculate its canonical digest:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  hash-input dispatch-tool-policy-draft.json \
  --repository .
```

Put the returned SHA-256 in the exact plan row:

```json
{
  "dispatch_control": {
    "required": true,
    "enforcement_level": "guardrail",
    "gateway_exclusive": false,
    "policy_authorizations": [
      {
        "agent_id": "plans-agent",
        "provider": "codex",
        "policy_id": "DTP-example",
        "draft_sha256": "<returned-sha256>"
      }
    ]
  }
}
```

Open that exact plan. Ready means context is available; the result deliberately
keeps tool execution and dispatch unauthorized:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_mission.js \
  open mission-wave-plan.json \
  --repository . \
  --artifact-root .cannae/artifacts
```

Compile the exact preauthorized draft:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  authorize-policy \
  --repository . \
  --artifact-root .cannae/artifacts \
  --policy dispatch-tool-policy-draft.json
```

Create the provider environment before launching an agent session:

```bash
export CANNAE_REPOSITORY="$PWD"
export CANNAE_ARTIFACT_ROOT="$PWD/.cannae/artifacts"
export CANNAE_MISSION_ID="MIS-example"
export CANNAE_WAVE_ID="W1"
export CANNAE_AGENT_ID="plans-agent"
export CANNAE_PROVIDER_AGENT_ID="main"
```

Issue the one initial lease after the provider session ID is known:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  issue \
  --repository . \
  --artifact-root .cannae/artifacts \
  --policy-id DTP-example \
  --session provider-session-id \
  --provider-agent main
```

Close successful execution authority before submitting a complete agent result:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  complete \
  --repository . \
  --artifact-root .cannae/artifacts \
  --lease ADL-example \
  --reason EXECUTION_COMPLETED
```

Inspect current state:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  status \
  --repository . \
  --artifact-root .cannae/artifacts \
  --mission MIS-example \
  --wave W1 \
  --agent plans-agent
```

Revoke:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  revoke \
  --repository . \
  --artifact-root .cannae/artifacts \
  --lease ADL-example \
  --reason OPERATOR_REVOKED
```

Resume only after repository-state review:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js \
  resume \
  --repository . \
  --artifact-root .cannae/artifacts \
  --lease ADL-example \
  --session provider-session-id \
  --provider-agent main
```

`resume` does not reactivate the old lease. It marks the interrupted lease
superseded and issues a lineage-continuation lease with a new nonce, time
window, and baseline checkpoint under the same manifest-backed policy.

## 5. Interruption And Resume

Provider conversation history is not execution authority.

For `resume`, `clear`, or `fork` lifecycle starts:

1. the session hook never grants or renews authority;
2. an active old lease is moved to `interrupted` if its last checkpoint still
   matches the repository;
3. every protected tool remains denied;
4. the operator or orchestrator reconstructs state from the manifest and
   reviews the repository;
5. explicit `resume` creates a new lease only when there is no unresolved
   admitted tool and the current state exactly matches the interruption
   checkpoint.

Any post-checkpoint drift blocks resume. A fork requires an explicit new
provider-session or provider-agent binding. Revoking or blocking a lease with
unresolved work does not permit a replacement initial lease; the work must be
reconciled or a new human-authorized wave must be created.

## 6. Provider Adapters

### 6.1 Codex

Codex `PreToolUse` can deny Bash, `apply_patch`, MCP calls, and most local
function tools. It can return a structured `permissionDecision: "deny"` before
execution. Codex does not run these hooks for hosted tools such as `WebSearch`,
and specialized paths can opt out. OpenAI therefore describes hooks as a
guardrail, not a complete enforcement boundary. Project hooks also require
project trust and exact hook-definition review. Managed hooks can be pinned by
administrative requirements and restricted to managed sources. See the
[official Codex hooks reference](https://learn.chatgpt.com/docs/hooks).

The documented Codex `PreToolUse` input does not expose a unique mission
subagent ID. Subagents also use the parent session ID. Strict per-agent leases
therefore require one top-level Codex session per mission agent, with explicit
environment binding, or an external tool gateway that owns agent identity.

### 6.2 Claude Code

Claude Code `PreToolUse` can deny a call before normal permission handling, and
the most restrictive result wins when multiple hooks match. Hook input inside a
subagent can include `agent_id`, which can be bound as the provider-agent
identity. `SessionStart` runs again on resume but cannot block the session.
Project hooks remain client-side controls; managed policy and endpoint controls
are needed when users must not disable or replace them. Claude also documents
paths that bypass `PreToolUse`, including direct `@` file references. See the
[official Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
and [settings reference](https://code.claude.com/docs/en/settings).

### 6.3 Adapter Decision Rule

An allow from the Cannae controller returns no provider auto-approval. Native
provider permission and sandbox checks still run. A deny is translated to the
provider's native structured deny output.

If the adapter catches an internal error after classifying a tool event, it
emits a structured deny. Malformed or unclassifiable input exits with status 2
so providers that support fail-closed hook errors can block the call.
Failure to launch the hook process, disabled hooks, malformed client behavior,
and excluded tool paths remain outside repository-local enforcement.

## 7. Deployment Strength

| Level | Control | Claim |
| --- | --- | --- |
| 1 | Skill instructions only | Advisory workflow |
| 2 | Trusted project hooks plus manifest runtime | Deterministic guardrail for covered calls |
| 3 | Externally installed managed hooks, separate worktrees, OS sandbox, native deny rules | Strong local enforcement for covered paths |
| 4 | Independently protected tool gateway or MCP service as the only side-effect path | Production-shaped admission boundary |

Do not describe Level 1 or Level 2 as non-bypassable security.

## 8. Failure-Closed Matrix

| Condition | Result |
| --- | --- |
| No lease or wrong session/agent/provider | deny |
| Expired, interrupted, revoked, superseded, or blocked lease | deny |
| Invalid artifact manifest or reference | deny |
| Context or routing preflight not ready | deny |
| Repository state differs from the last checkpoint | deny |
| Tool input does not match exactly one rule | deny |
| Tool-use ID replay | deny |
| Another tool is in flight | deny |
| Rule or lease budget exhausted | deny |
| Post-tool name/input mismatch or failed/unknown result | block lease |
| Gateway-authorized call is cancelled before execution with exact input | record cancelled checkpoint and keep lease active |
| Second initial session for one mission agent/wave | no new lease |
| Another nonterminal lease in the repository | no new lease |
| Resume state differs from interruption checkpoint | no new lease |
| Complete report with a non-completed lease | reject report |
| Release or obvious retained command | deny |

## 9. Residual Limits

- Repository-local hooks can be disabled, left untrusted, replaced, or bypassed
  by an unmanaged client.
- The local lease issuer does not authenticate a human identity or sign the
  USER-authorized mission plan. If the agent can rewrite the protected plan,
  artifact store, issuer, or runtime, it can undermine Level 2 controls.
- A matching exact input digest proves authorization of bytes, not that the
  command implementation is benign.
- Command classification cannot detect every encoded or indirect retained
  action.
- Post-tool hooks observe effects after execution and cannot undo them.
- Artifact writes are individually atomic, but a policy/lease/checkpoint
  transition spans multiple artifacts. A crash can leave fail-closed partial
  evidence that requires operator inspection or repair.
- The built-in runtime lock assumes a coherent shared filesystem and is not a
  distributed consensus protocol.
- Codex hosted tools and documented provider exclusions require separate
  controls.
- This phase does not provide a production scheduler, multi-user authorization
  service, or universal process isolation.

The production target is a separately protected gateway that verifies these
same contracts before exposing any side-effecting tool.

Phase 17A now defines that transaction boundary in
`protected-tool-gateway-contract.md`. It adds exact principal/gateway binding,
idempotent request state, one execution token, result receipts, pre-execution
cancellation, and unknown-outcome recovery. The reference controller remains a
Level 2 contract implementation. Phase 17B2A adds one policy-pinned local
process adapter with signed before/after evidence, but it does not establish an
OS/container sandbox, network isolation, or the Level 4 exclusive deployment
claim.
