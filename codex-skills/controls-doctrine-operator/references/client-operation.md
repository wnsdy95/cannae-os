# Client Operation

Read when diagnosing discovery, invoking a native client, or investigating a
client/tool-channel failure. This guide does not authorize a native model call.

When a copy may be stale or bound to the wrong corpus, inspect it from the
already trusted checkout before running its scripts. Use that checkout's
`skill-installation-inspector.js --provider codex|claude --installed <absolute-loaded-skill-directory>`.
Compare the reported file/guide/script hashes and default root binding. A match
means current working-tree bytes, not last-commit-only provenance, native discovery
or permission to execute. Invocation overrides and client settings are not read.
A difference may be an older copy or an intentional local edit; appraise it before
refreshing. Preserve the copy, report missing/unsafe files, and never automatically
rewrite a marker, run the suspect router, reinstall or use `--force` to hide drift.
This is a troubleshooting/upgrade check, not extra context for every document task.

Verify discovery in the client's effective startup mode before diagnosing a
missing skill. A metadata listing is not body consumption or task execution;
Claude bare mode skips automatic discovery of the ordinary user skill directory.
Excluding user setting sources can also exclude installed user skills. Check
login in the exact launch environment without copying credentials or changing
persistent settings. Distinguish documented progress events from tool activity;
an interrupted or error-bearing response is not a completed review.
For tool-assisted phases, distinguish an advertised helper from a completed
current-route/source call. If the client cannot invoke it, hold dependent work
without inventing source contents or substituting a previous agent's route.
An empty MCP-call log alone does not exclude rejected tool attempts; inspect
client errors before choosing a bounded retry.

For explicitly supplied-context comparisons, bind each body's source revision and
exact prompt byte range before dispatch. Do not silently supply the current
installed guide to a historical baseline. Keep original task/source bodies apart
from evaluator answers and include applicable conditional guides for the tested
revision. If the recipient has no tools, a preparer must supply needed bodies;
report unsupplied dependencies and unperformed checks instead of inventing reads.
`skill-authoring-evaluation.js prepare-baseline` preserves the historical full-body
selection. `prepare-candidate` needs a separate clean exact revision and adds the
applicable project-content/reporting guide, plus project-terms for the fixed handoff
case. Compare each candidate task hash with its baseline, and inspect actual guide
spans; a link or unchanged task name is not body delivery. Both commands prepare
only development inputs and send nothing. Candidate preparation is neither the
global withheld-candidate freeze nor permission to reuse baseline transfer consent.
Record selection, preparation, client input delivery, completed response and
source-appraised quality separately. Explicitly supplying a skill does not test
implicit discovery, agent-invoked routing or cold-start receiving of its output.

For a paired context experiment, first check whether the fixed requests actually
include their promised task sources. Freeze a separate source supplement if needed;
preserve the original requests and give both revisions identical complete bodies.
Do not substitute a missing-input reply for finished work on only one side.
`skill-context-evaluation.js prepare` and `inspect` bind the six R2 cases to clean
revisions and private snapshots without client execution. Both sides may choose
selective reading; never inflate the baseline by forcing its whole catalog.
Keep the reading interface and accounting comparable, count later reads and
framing, and appraise the finished work before reporting savings. A smaller
initial prompt or inspected snapshot is not a complete native trace. An R2 input
snapshot is not the global withheld-candidate freeze or a transfer decision;
superseding it must not rewrite its original evidence or consume an unstarted call.

For tool-assisted context measurement, reconcile each completed native call with
the exact response written to that client and the frozen source selection. Count
repeated reads, navigation, error responses and setup/schema framing; do not count
a transcript echo as another delivery or discard failed cases from the comparison.
A completed process with an unmatched, duplicate or truncated trace is unverified.
Keep client-bound wire totals distinct from source-body bytes and unknown backend
context. A zero-read or shorter trace still needs source-based output appraisal.
Record one absolute process deadline and attempt limit outside the tool process;
reconnecting a helper must not renew either. Stop the batch on an incomplete
attempt, preserve it, and obtain any required fresh approval before retrying.

Before a native retry, replay the captured startup/turn/tool/result ordering
against the observer locally. Codex can emit completed diagnostic items after
thread creation but before `turn.started`; they are not tool execution or a
completed review. Retain the diagnostics and require an actual complete turn.
In explicitly supplied-context comparisons, a denied live global instruction
file may reflect the intended isolation profile; check the bound input instead
of enabling discovery or suppressing warnings. A failed assigned-source read
still holds dependent work. A repaired parser never changes the failed attempt
or renews the stopped batch's transfer consent.

For cross-client workflow evaluation, use the chain protocol in
`docs/evaluation-metrics.md`. Preserve one original task and predecessor artifact
bindings per direction; do not join separate runs into a complete chain. Keep
preparer routes apart from native agent routing and prepared briefs apart from
actual parent delivery. After a changed source, distinguish retained independent
work from a stale packet; a refreshed dependency record does not clear the USER
continuation hold. Assemble the exact next receiving unit from observed outputs
before seeking its applicable transfer consent, not from predicted responses.
For adapter-bound delegated phases, compare the recipient, role, department,
authority and phase in the actual model input with the adapter configuration.
Hidden configuration alone does not deliver that context; distinguish the
worker's bounded assignment from the USER's retained final decision authority.

Before a brief-only native phase, inspect both the client allowlist and the
adapter's advertised tools; neither may expose task-source reading. Run a local
protocol preflight in the intended process environment/profile, without invoking
the model. Preserve the helper's required corpus access rather than weakening
source checks to accommodate an incompatible profile. This checks a local tool
boundary, not protected-host isolation or native agent behavior. Bind the absolute
deadline outside the helper and do not renew it or route limits on reconnect.
On denial or timeout, check the child process actually exited: a `closed` audit
entry can precede process termination. Negative tests must distinguish connection
closure from request timeout; a generic rejected promise is not proof of the
intended stop. Retain failed preflights and obtain any required new model consent.

When appraising a native phase, reconcile the client's completed route calls with
the local helper's exact arguments and returned text/structured result. A route
present in only one trace is not observed worker routing. Check phase, recipient,
original assignment, held source catalog and unchanged authority against the bound
input; reject a preparer's token, extra advertised tools or an incomplete call.
Keep the final response separate from actual parent notice delivery. A successful
exit and reconciled trace still require source-based review of the brief and plan;
they do not authorize the next phase or clear a stopped batch's unstarted suffix.
