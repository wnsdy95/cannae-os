# Completion Backlog

## Scope

This is the cross-cutting completion queue for the existing Controls program.
It preserves outstanding work rather than treating the latest merged feature
as overall completion. The [runtime roadmap](runtime-automation-roadmap.md)
owns phase contracts; the [implementation registry](implementation-candidate-registry.md)
owns per-doctrine candidate mappings and executable checks. Consult both.

The statuses below are a review baseline on 2026-09-28, not an automatically
refreshed operational dashboard. Runtime state and CI evidence must be re-read
before an operation. No row grants approval or changes the USER's final authority.

## Ordered Work

| Order | Workstream and current state | Concrete completion evidence |
| --- | --- | --- |
| 1 | Dependency compatibility: `ip-address` and `brace-expansion` fixes merged; verifier 4.1.2/protobuf 0.5.2, exact historical-producer replay, and fresh v0.2 evidence merged in PR #51 after complete CI. | Actual lockfile and version contracts updated; local 73/73 suites and 280/280 validator fixtures passed, followed by successful exact-head PR CI. Future producer changes still need explicit compatibility review. Live monitor operation remains separate in row 10. |
| 2 | Mission lifecycle: wave termination, supervisor/deadline admission, publication guards, retained unknown-effect holds, hook settlement and exact orphan/OCI-reference gateway settlement are implemented. Other containment adapters, managed coordination, full campaign stop/settlement/restart, and supervisor order/challenge publication integration remain open. | Persist exact terminal scope, reconcile all agents/tool effects, forbid stale continuations, and test USER-authorized cancellation/resumption through campaign and wave integration. Each ownership class requires its own review and discharge, shared one-use USER/execution proof, separate containment/coordination evidence and post-settlement failed-agent revocation. Publication tests must retain crash ordering and block stop/check/write races without blocking result settlement. Wave termination or a local admission guard alone does not close the campaign; trusted time and hard process deadlines are not provided by the reference runtime. |
| 3 | Implementation inventory: source-bound registry and CI audit merged in PR #50; 125 requirements accounted for, 37 implemented, 18 partial, 70 planned. | Every current candidate accounted for, mapped aliases reviewed, unfinished behavior explicit, drift/omission/false-completion tests, CI audit, and both skill entrypoints updated. This closes inventory coverage, not all candidates. |
| 4 | General request-to-OPORD compiler: structured order runners exist, general request intake remains open. | Preserve original request and evidence references; distinguish facts, assumptions, unknowns, and retained USER decisions; produce schema-valid draft intent/OPORD/task orders and backbrief requirements; reject unsupported authority or invented facts. No automatic execution from a draft. |
| 5 | Intent lineage and disciplined initiative: written policies, incomplete runtime. | Parent-child boundary subset checks, mandatory key-task continuity, bounded method deviation, correct before/after reporting, and stop/escalate/revoke regression tests wired into dispatch/report admission. |
| 6 | COP, reporting, and CoS integration: event projections and individual linters exist, unified operational controls remain partial. | Event-derived, freshness-aware role views; exception-first reporting thresholds; critical alerts cannot be suppressed; board/packet integration and anti-noise checks across actual mission lifecycle. |
| 7 | Capability and force lifecycle: gap routing creates a mission-scoped cell and requires USER approval for standing activation; no complete cross-mission capability registry/reconciliation. | Stable capability ownership, repeat-demand evidence, explicit create/expand/merge/reduce/deactivate decisions, bounded task organization, and reconciliation of active agents, model/resource assignments, and authority after each change. Include liaison, partner boundaries, readiness ceilings, and training regression. |
| 8 | Sustainment and controlled boundary outputs: budget/fallback checks and disclosure gates exist; candidate-level orchestration remains partial. | Checkpoint recovery drills, resource priority/preemption, audited filter exceptions, handoff quality gates, and release-packet assembly/revocation with adversarial fixtures. Consult each registry entry; a detector is not an end-to-end output filter. |
| 9 | Evidence API and actual approval/COP UI: local manifest store and static HTML/projections exist; product workflow remains open. | Queryable repository-isolated evidence, authenticated bounded API, real approval consumption, stale/conflicting decision handling, audit history, and browser-tested operator flows on desktop/mobile. Static renderers do not meet this criterion. |
| 10 | Release monitor operation: main run `36388009953` is blocked by credential HTTP 401 and `GITHUB_RELEASE_BOOTSTRAP_RECOVERY_NOT_ELIGIBLE`. Last successful run `33013444227` (2026-08-26) currently has no artifacts in its provider API listing. | Renew the selected-repository Administration-read credential, separately reconcile predecessor availability, and retain a fresh ready first-attempt observation/root/checkpoint triplet. Credential repair alone is not continuity repair. Never copy a broad local OAuth token, skip failed history, or reuse bootstrap recovery as an established-lineage reset; any reset requires the separate contract and USER decision in row 12. |
| 11 | Production trust infrastructure: provider admission contracts/reference adapters exist; externally operated infrastructure is not supplied by this repository. | Deploy and independently appraise real coordinator/fencing, hardened hosts, TPM/TEE or equivalent trust evidence, KMS/HSM, exclusive tool path, and durable storage; verify integrated execution and failure recovery. Fixture adapters cannot satisfy deployment proof. |
| 12 | Long-term transparency/release operations: local checkpoint continuity exists; independent retention, liveness, rotation, and established-lineage incident reset need operations/design. | Independently operated append-only checkpoint store and witnesses, trusted time, short-lived credential rotation, failure/rollback exercises, and a separately USER-approved reset contract. Bootstrap recovery is not an established-lineage reset. |

Row 2 separates the non-authorizing review packet from the exact hook settlement
controller. Hook settlement now consumes a USER scope decision and execution-bound
proof, with historical replay and guarded publication. Effect completeness remains
USER judgement, not a machine guarantee. Unsupported gateway containment and
coordination, and full campaign stop/restart remain open; a local USER log is not
authentication.
Gateway ownership and retained-obligation guards now reject direct hook
completion/cancellation and preserve holds across legacy terminal leases, new
waves, and report/closeout/termination publication. These guards do not resolve
an executing transaction's unknown effects by themselves.
The [gateway intake/review contract](gateway-effect-review.md) now classifies
retained history, preserves orphan none references, and binds finite admission,
effect, containment and coordination scopes to inspection evidence. It does not
discharge admissions or clear holds. The separate
[gateway settlement controller](gateway-effect-settlement.md) now consumes exact
USER/execution-bound proof for orphan admissions and OCI reference execution,
clears only bound obligations, and requires post-settlement failed-agent revocation.
Successor authority is not inferred.
The hook path now preserves a reconciled-failure marker across legacy terminal
states and resumed descendants, and requires post-settlement revocation before
new authority or wave publication. Gateway reconciliation now integrates the same
invariant without turning original denied/recovered/failed history into success.
OCI cleanup now requires positive exact-target absence evidence, including on
recovery replay. This repairs containment verification, not gateway transaction
settlement, daemon identity attestation, or campaign restart.
The v0.2 envelope and separate signed containment observation now retain
reported-daemon and exact-target evidence for later review. Managed external
coordination, legacy-envelope recovery and independent daemon attestation are
not supplied by this reference contract. Bounded-process and external-adapter
containment, managed coordination/fencing and full campaign restart remain open.

Orders 10-12 include external operator dependencies and can progress alongside
repository work, but may not be reported complete without actual evidence.
Credential renewal does not authorize a lineage reset. If any row's exact scope
requires a new policy or external deployment decision, return that decision to
the USER and continue independent in-scope work.

## Closure Discipline

At each checkpoint record implemented behavior, checks actually run, residual
work, and any required USER decision. Update both installed skill source trees
with a reusable operational lesson, not a restatement of the code change.
Keep unrelated worktree changes intact. Commit coherent verified batches and
merge only after their required checks pass under the repository policy.

Before claiming the whole program complete, re-audit every row and candidate,
re-read the roadmap's residual limitations, verify retained mission evidence,
and check current main CI and provider monitoring. Any unfinished or externally
blocked item remains visible. A clean worktree, all local tests passing, or a
registry status change alone cannot establish overall completion.
