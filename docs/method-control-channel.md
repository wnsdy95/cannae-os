# Local Method Control Channel

## Boundary

This local reference connects a reviewed method baseline to a narrowly scoped
stdio MCP server. It is control metadata transport, not a task execution tool,
human approval, authority renewal or protected production identity.

Legacy method baseline v0.1 keeps its trusted CoS/operator CLI procedure.
Only a newly reviewed v0.2 baseline may contain `broker`. Its full-plan adoption
and each receiver's backbrief must bind the exact channel policy. Do not edit an
opened plan, change its version or add a broker to an existing lease's context.
Preserve old results and prepare a newly reviewed wave.

The policy fixes the source-entry/dependency-lock digest, request count,
channel lifetime, per-request deadline and response size. Each context contains
only that agent's deterministic server name and three allowed operations.
It does not include a private credential, enrollment path or sibling assignment.

## Trusted Operator Setup

Before proposing a v0.2 plan, obtain the exact `runtime_sha256` with
`scripts/operate_controls_channel.js fingerprint`. Bind that value and the
finite limits in the full plan reviewed by USER and every receiver. A fingerprint
is a local source-entry/lock commitment, not proof that protected code executed.
After a code/lock change, obtain a new reviewed plan rather than patching a live
assignment or extending its old enrollment.

Install the pinned root dependencies with `npm ci --ignore-scripts`. The operator
first completes adoption, routing and exact policy compilation. Prepare a
dormant launch slot **before** launching the native top-level provider session:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_channel.js \
  prepare --repository /absolute/target --policy-id DTP-EXACT \
  --private-file /absolute/private-state/enrollment.json
```

Claude Code preparation additionally pins its expected native `mcp_server.source`
with `--mcp-source project`, `user`, `local` or `sdk`. Unknown or missing Claude
provenance denies the control call. Never infer trust from a prefix alone.

The private parent directory must be owner-only, outside the target repository
and free of symlink traversal. The file is single-link, owner-only and created
exclusively. Its credential never enters an artifact, tool argument or model
context. Public enrollment records retain only its digest and exact public
scope. Do not copy, overwrite or rotate it to repair a failed wave.

Use `describe --private-file ...` to inspect the non-secret launch descriptor,
even while enrollment is pending. Configure that exact server in the native client's trusted local
configuration; use the descriptor's absolute Node executable, server path,
arguments and working directory. Export `CANNAE_METHOD_CONTROL_ENROLLMENT` to
the already-installed dispatch hooks. Keep the normal mission/session environment.
Do not give the acting agent Bash, artifact writes, a configuration editor or
permission to run these operator commands. Configuration changes belong before
capturing the repository state used to issue the lease. The prepared server may
start and expose its three tool definitions, but discovery cannot enroll a
session, write evidence or consume a request.

The native `SessionStart` hook with source `startup` retains a non-authorizing
`MethodControlSessionObservation` and tells the agent to await enrollment.
The trusted operator inspects its exact session/agent identity, then issues the
ordinary lease for that observed session. Finally bind the prepared file once:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_channel.js \
  enroll --repository /absolute/target --lease ADL-EXACT \
  --private-file /absolute/private-state/enrollment.json
```

The same already-connected MCP server can now serve admitted requests. The
ordinary work gate independently appraises the verified introduction order
`launch slot -> session observation -> lease -> enrollment`, exact scope and
expiry. A manually issued lease or a control-tool prefix does not replace that
chain. Do not invent the provider session ID before startup, share a slot across
agents, or replay `SessionStart` with a new identity. Resume/fork/clear are not
initial enrollment and do not rotate, renew or rebind it automatically.
An initial-only channel policy v0.1 cannot be reused for a resumed lease.
Only a newly reviewed channel policy v0.2 may enable the separate continuation
procedure below. The old private file is never rebound.

## Reviewed Same-Wave Continuation

Before full-plan adoption, a channel policy v0.2 must contain
`continuation: { "mode": "observed_session_lineage", "max_handoffs": N }`,
where `N` is 1 through 16. Every receiver acknowledges that exact pocket.
The policy's root deadline and metadata request count survive all handoffs.
For this explicit profile, task-policy total admissions and per-rule uses are
also counted over the same plan/context/policy lineage, not reset per lease.
Legacy channel policy v0.1 retains its initial-only semantics.

The trusted operator first finishes all admitted callbacks, actual after-reports
and metadata delivery, then explicitly interrupts the old lease. Unknown tool
effects, gateway obligations, drift, scope changes, pending work or missing
reports cannot become a continuation. Inspect the exact interruption checkpoint
and retain its reference JSON outside captured repository state.

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_channel.js \
  prepare-continuation --previous-file /absolute/private-old/enrollment.json \
  --checkpoint-ref /absolute/review/interruption-ref.json \
  --private-file /absolute/private-next/enrollment.json --source resume
```

The result creates one dormant slot and a fresh owner-only file without issuing
or resuming task authority. Sources are exactly `resume`, `clear` or `fork`.
Configure the returned server descriptor and new hook enrollment path before
the new native start; never give those configuration operations to the agent.
After its actual start, use `describe --private-file ...` to inspect the exact
own-slot observation and session binding. Do not invent its session ID.

Run the ordinary dispatch `resume` against the predecessor lease using that
observed binding, then `enroll` the new file against the exact resulting lease.
The work gate requires its real supersession chain, original plan/context/
policy and reviewed method progress before another task. It rejects branch
slots, retrospective observations and extended deadlines even when individually
schema-valid. Old control files cannot admit new requests, including when a
provider reuses the same session identifier. Neutral delivery of old retained
results remains possible. No method, role, tool or release scope expands.

An exhausted control budget prevents new metadata calls; an exhausted task
budget blocks task admission without pretending that the intended action is
scope drift. Neither budget can be reset by another channel, session or nonce.
Use a newly reviewed wave if new resources or scope are needed.

Preserve partial private/public publications and inspect real retained state
before recovery. This metadata path does not repair the dispatch controller's
separate partial-resume transaction if it superseded the old lease but failed
before producing a complete new lease/checkpoint. Do not replay that unknown
issuance, invent checkpoints or overwrite a bound file to clear it.

No global client configuration is silently modified. Codex and Claude maintain
different configuration formats; a launch descriptor is not evidence that a
particular native process loaded it. Exact native client startup/configuration
attestation remains unproved: `provider_startup_verified` stays false. Codex
does not acquire Claude's provenance guarantees merely by sharing a tool name.

## Agent Operations

The three tools are:

- `method_status`: a fresh request ID, returning only the receiver's assignment
  and actual method state.
- `method_propose`: a fresh request ID, exact step and reviewed alternative IDs,
  and a bounded rationale. The response cites a retained deviation; it does not
  admit the task tool.
- `method_report_after`: a fresh request ID and the exact own-lease deviation
  reference. The operator service derives the real admission, result checkpoint
  and SITREP; the agent cannot provide substitute results or USER approval.

All tools write audit metadata, including status queries. Their MCP annotations
therefore do not claim read-only execution. MCP annotations and `clientInfo`
are not authorization. Discovery and protocol-negotiation probes consume no
enrollment, request budget or task permission.

Before-and-after methods still need the separately retained exact USER
acknowledgment and trusted operator's before report. The agent channel cannot
create that decision or turn an after report into a before report.

## Admission And Delivery

The provider hook binds the exact server/tool name, native session and agent,
input digest and one request ID to an immutable `MethodControlRequest`.
The broker refuses unsolicited SDK calls with no such native request. It
serializes with the same dispatch lease lock as task admission, derives actual
records and retains a `MethodControlReceipt` before returning its response.
The post-tool hook must match the returned response with that exact receipt
before retaining `MethodControlDelivery`.

The ordinary task gate, completion and resume consumers preserve unresolved
control-delivery holds. A broker record, response or delivery never satisfies
work-evidence requirements. Retain actual task outputs separately. Nothing in
this channel extends a task lease, expands its tool policy, clears unknown tool
effects, resumes stopped work or authorizes release.

## Failure And Recovery

Preserve the exact request and all partial publications after interruption.
Repeating the same broker request can return the already-retained receipt;
native tool-use replay or a different payload is not a fresh admission.
The trusted operator may use `execute-pending --request-ref ...` for the exact
original request, within its deadline. It reconstructs known retained metadata
or finishes metadata publication; it never reruns the underlying task tool.

After inspecting a completed actual receipt, the operator may use
`reconcile-delivery --request-ref ...` to record its delivery independently of
the lost callback. This is not a USER approval or completion of a failed task.
An absent receipt, expired request, substituted state or unknown partial outcome
remains a hold, not an invented success. Existing admitted task callbacks and revocation
remain available; the metadata channel must not prevent recording real effects.
Private-file and parser failures return fixed non-secret codes to the agent.
Inspect private state only through the trusted operator; never paste a raw
parse/filesystem exception or private contents into the agent's context to debug
an outage.

## Evidence And Limits

Run `node run-method-control-contract-fixtures.js`, broker transport/integration
fixtures, dispatch/method/adoption/lifecycle regressions, historical and current
release-verifier replay, source/routing checks and both provider skills before
integration. Pure contracts, synthetic hook payloads and an SDK pipe do not prove
an actual native agent client, remote identity, protected code execution or
non-bypassable operation. Record those scopes separately.

The local operator, configured native client and same-UID process custody are
trusted. The descriptor and entry/lock digests are configuration guardrails,
not independent process attestation or complete dependency-memory measurement.
Other processes running as the same OS user can interfere. Production needs
protected hosts/keys, verified native startup, exclusive paths, coordination and
independent monitoring. The USER has deferred deployment selection; all eight
required outcomes retain their actual remaining scope.

Use a separate native top-level session and enrollment for every independently
acting agent. Codex subagent hooks share the parent session ID; this channel does
not turn that identifier into isolated subagent identity. Do not share one file
among nested agents or treat a child process's `clientInfo` as its principal.

Primary implementation references are the official
[MCP SDK server](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server),
[protocol-era behavior](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28),
[Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp),
[Codex hooks](https://learn.chatgpt.com/docs/hooks), and
[Claude MCP hook provenance](https://code.claude.com/docs/en/hooks#pretooluse-input).
Provider documents explain supported interfaces, not proof of this deployment.
