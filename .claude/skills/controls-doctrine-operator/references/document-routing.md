# Document Routing

Use this map after running `scripts/route_controls_docs.js`, or when a task is obvious enough to route manually.

## Inventory Coverage

For unknown tool outcomes, route `docs/tool-effect-review.md` and
`docs/tool-effect-settlement.md`. Evidence preparation does not clear holds;
settlement needs historical/current verifier admission and an exact USER
decision. Both fixture suites are required when changing this boundary.

For implementation-candidate audits and existing-program completion, route to
`docs/implementation-candidate-registry.md` and `docs/completion-backlog.md`.
Run `node implementation-candidate-registry.js audit`; use its source-bound
entries rather than regex filename counts or a changelog's closure wording.
Execute selected mapped checks with `verify` before declaring implementation.

The router scans tracked and unignored candidate corpus artifacts, including Markdown/HTML docs, JSON schemas, sample payloads, runtime payloads, fixtures, runner scripts, prototype scripts, dashboard state, and skill metadata. Git-ignored local state such as `.cxt` and `.cannae`, plus `.git` and `node_modules`, is not doctrine inventory. A non-Git fallback retains the explicit directory exclusions. Every routable corpus artifact must have at least one route category.

Run coverage after adding, renaming, deleting, or moving any corpus artifact:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
```

The report must return `valid: true` and `unrouted_artifact_count: 0`. If it does not, update `ROUTE_HINTS`, `RULES`, or the artifact naming so the item has a clear route.

## Operator Mode

| Mode | Trigger | Routing Rule | Escalation |
| --- | --- | --- | --- |
| Human final decision authority | The chat user asks directly, researches, decides, or asks "how should we use this?" | Route for efficiency and evidence, not to restrict the user's visibility. Read the minimum useful docs, then brief options and tradeoffs. | Warn before high-risk, release, or irreversible actions, but the user decides. |
| Delegated AI operator | The user asks an AI agent, role, department, staff function, or TF to perform work | Route by role, department, authority, task, release target, risk, and need-to-know. Start with role/access/approval policy before task docs. | Escalate to the human user for anything outside delegated authority, cross-boundary release, or high-risk tool use. |

For delegated AI routing, declare as much context as available:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --actor=ai --role=S3 --department=operations --authority=scoped-execution "<mission request>" .
```

## Capability Gap Routing

The router assesses doctrine capability from the request text only; role,
department, and authority options affect access and control documents but do
not prove that the corpus owns the requested domain. For manual wave/agent
receipts, pass the same mission objective through `--capability-query` on every
call and use the positional query for the narrower task.

When `capability_routing.status` is `gap_detected`:

1. Do not return "outside the corpus" and continue as general, unowned work.
2. Task-organize the returned mission-scoped capability cell for analysis and reversible drafting under existing authority.
3. Preserve its deterministic `CELL-*` ID and the paired `DEPT-*` standing-department candidate across CoS, agent receipts, and context packs.
4. Run `run-force-structure-change-fixtures.js` as a mandatory control and assess DOTMLPF-P alternatives.
5. Keep authority expansion and standing activation false. Only the USER can decide whether a validated `ForceStructureChangeOrder` should activate the candidate.
6. Disband the provisional cell at mission handoff unless the standing change is approved.

For delegated execution, routing must create a receipt and pass preflight before any agent starts work:

```bash
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --receipt --scope=wave --mission=MIS-... --wave=W2 --agent=chief-of-staff --actor=ai --role=COS --department=coordination --authority=tasking "<wave mission>" .
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --receipt --scope=agent --mission=MIS-... --wave=W2 --agent=plans-agent --actor=ai --role=S3 --department=operations --authority=scoped-execution "<agent task>" .
node agent-routing-preflight-runner.js <agent-routing-preflight-bundle.json>
```

Preflight requires one CoS wave receipt and one S3 operations receipt for each expected agent. A missing, stale, manually claimed, or wrong-role receipt blocks the wave.

Routing preflight proves that the agent received the correct doctrine context.
It does not authorize tool execution. Before opening a dispatch-controlled wave,
put each exact policy-draft digest and agent/provider/policy tuple in the
USER-authorized mission plan. After `open`, compile that draft and issue the
single repository-, mission-, wave-, agent-, and session-bound lease lineage;
place the provider hook adapter on the execution path. A resumed or forked
session requires explicit lineage continuation after checkpoint review;
restored conversational context never restores authority.

## Core Navigation

| Task | Read First | Then Read |
| --- | --- | --- |
| Understand the whole framework | `README.md`, `docs/military-llm-framework-v0.1.md` | `docs/military-operating-system.md`, `docs/glossary.md` |
| Contribute or review project governance | `CONTRIBUTING.md`, `GOVERNANCE.md` | `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md` |
| Find source backing | `docs/source-map.md` | `docs/research-compendium.md`, `docs/source-reliability-rubric.md` |
| Choose docs for a request | `README.md`, router output | `docs/military-operating-deep-research-queue.md` |
| Add external military sources | `docs/source-map.md` | `docs/research-compendium.md`, `source-map-linter.js` |

## Mission, Orders, Reporting

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| OPORD/WARNO/FRAGO/SITREP/AAR prompting | `docs/prompt-templates.md`, `docs/orders-production-pipeline.md` | `schema-files/opord.schema.json`, `schema-files/warno.schema.json`, `schema-files/frago.schema.json`, `schema-files/sitrep.schema.json`, `schema-files/aar.schema.json` |
| Commander's intent and disciplined initiative | `docs/mission-command-runtime-policy.md`, `docs/disciplined-initiative-rules.md`, `docs/commander-handbook.md` | `schema-files/authority-matrix.schema.json`, `policy-engine-prototype/` |
| Source-plan annex | `docs/opord-annex-model.md` | `schema-files/source-plan.schema.json`, `schema-files/verification-plan.schema.json` |
| Annex vs FRAGO change | `docs/opord-annex-model.md` | `schema-files/annex.schema.json`, `schema-files/frago-scope-change.schema.json`, `run-rehearsal-to-ccir-fixtures.js` |
| Backbrief/rehearsal | `docs/backbrief-and-rehearsal-sop.md`, `docs/dry-run-approval-ui.md` | `schema-files/backbrief.schema.json`, `schema-files/rehearsal.schema.json`, `orders-dissemination-runner.js`, `event-fixtures/rehearsal-event-fixtures.json`, `run-rehearsal-event-fixtures.js` |
| CCIR reporting thresholds and COP | `docs/reporting-threshold-policy.md`, `docs/common-operational-picture-state.md`, `docs/ccir-alerting-model.md` | `ccir-linter.js`, `run-ccir-linter-fixtures.js`, `alert-router-prototype/` |
| Information to operations | `docs/information-to-operations-cycle.md` | `information-to-operations-router.js`, `run-information-to-operations-fixtures.js` |

## Authority, Release, Risk

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| Role authority | `docs/agent-roles-and-authority.md` | `schema-files/authority-matrix.schema.json`, `readiness-gate-prototype/` |
| Tool use policy | `docs/tool-use-roe.md`, `docs/policy-engine-rules.md` | `policy-engine-prototype/`, `policy-engine-authority-integration.js` |
| Enforced tool dispatch and explicit resume | `docs/enforced-dispatch-and-resume.md`, `docs/tool-use-roe.md` | `dispatch-runtime-controller.js`, `dispatch-hook-adapter.js`, `install-dispatch-hooks.js`, dispatch policy/lease/admission/checkpoint schemas |
| Protected tool transaction, idempotency, and recovery | `docs/protected-tool-gateway-contract.md`, `docs/enforced-dispatch-and-resume.md` | `protected-tool-gateway.js`, gateway request/decision/receipt/event schemas, `run-protected-tool-gateway-fixtures.js` |
| Authenticated gateway principal, mTLS, SPIFFE, TLS exporter, challenge, or replay | `docs/gateway-identity-admission.md`, `docs/protected-tool-gateway-contract.md` | `gateway-identity-adapter.js`, `gateway-identity-evidence.js`, identity policy/challenge/evidence schemas, `run-gateway-identity-adapter-fixtures.js` |
| Protected native process, exact executable/argv, envelope, observation, timeout, shebang rejection, or no-rerun recovery | `docs/protected-process-execution.md`, `docs/protected-tool-gateway-contract.md` | `protected-process-executor.js`, `protected-execution-evidence.js`, protected-execution schemas, `scripts/operate_protected_executor.js`, `run-protected-process-executor-fixtures.js` |
| OCI Linux sandbox, immutable image, seccomp, no-new-privileges, capabilities, namespaces, read-only mounts, cgroup, network none, kernel probe, or container cleanup | `docs/oci-linux-sandbox-provider.md`, `docs/protected-tool-gateway-contract.md`, `docs/protected-process-execution.md` | `oci-linux-sandbox-provider.js`, `oci-linux-sandbox-evidence.js`, `oci-linux-sandbox-probe.go`, OCI sandbox schemas/samples, `runtime-profiles/`, `scripts/operate_oci_sandbox.js`, `run-oci-linux-sandbox-provider-fixtures.js` |
| Production sandbox, RATS/EAT appraisal, OCI/SLSA provenance, managed exclusivity, independent deployment quorum, external coordinator, or storage fencing | `docs/production-sandbox-admission.md`, `docs/protected-tool-gateway-contract.md`, `docs/gateway-identity-admission.md`, `docs/oci-linux-sandbox-provider.md` | `production-sandbox-admission.js`, `production-sandbox-admission-adapter.js`, production schemas/samples, `scripts/operate_production_sandbox.js`, `run-production-sandbox-admission-fixtures.js`, `run-production-sandbox-gateway-fixtures.js` |
| Approval lifecycle | `docs/approval-scope-policy.md` | `approval-consumption-runner.js`, `approval-renewal-runner.js`, `approval-revocation-runner.js`, `approval-delegation-runner.js` |
| Risk acceptance | `docs/risk-acceptance-authority.md` | `schema-files/risk-acceptance.schema.json`, `run-authority-integration-fixtures.js` |
| Readiness to authority | `docs/readiness-to-authority-policy.md`, `docs/training-progression-model.md`, `docs/agent-metl.md` | `schema-files/agent-metl.schema.json`, `schema-files/readiness-event.schema.json`, `readiness-gate-prototype/` |
| Release review | `docs/context-releasability-policy.md`, `docs/opsec-classification-model.md`, `docs/sensitive-output-filter.md` | `release-review-runner.js`, `policy-engine-release-integration.js`, `release-gate-decision-runner.js`, `opsec-linter.js`, `evidence-redactor.js`, `eefi-detector.js`, `schema-files/classification-label.schema.json`, `schema-files/releasability-review.schema.json`, `schema-files/eefi-alert.schema.json`, `schema-files/context-release.schema.json` |
| GitHub repository release-immutability policy activation | `docs/github-release-immutability.md`, `docs/github-release-authorization.md` | `github-release-immutability.js`, policy authorization/receipt schemas and samples, `scripts/operate_github_release_immutability.js`, `run-github-release-immutability-fixtures.js` |
| GitHub immutable-policy drift, release-attestation monitoring, trust-checkpoint continuity, or initial bootstrap recovery | `docs/github-release-integrity-monitoring.md`, `docs/github-release-independent-verification.md`, `docs/github-release-trust-checkpoint-continuity.md`, `docs/github-release-immutability.md`, `docs/github-release-authorization.md` | `.github/release-integrity-policy.json`, `github-release-integrity-monitor.js`, `github-release-trusted-root.js`, `github-release-trust-checkpoint.js`, `github-release-checkpoint-store.js`, `github-release-bootstrap-recovery.js`, `github-release-bootstrap-recovery-operator.js`, `github-release-bundle-verifier.js`, integrity/trust/recovery schemas and fixtures, `scripts/operate_github_release_integrity.js`, `scripts/operate_github_release_verification.js`, `.github/workflows/release-integrity.yml` |
| Exact GitHub tag/release authorization and publication | `docs/github-release-authorization.md`, `docs/github-release-independent-verification.md`, `docs/github-release-trust-checkpoint-continuity.md`, exact tracked release notes | `github-release-publisher.js`, trusted-root, trust-checkpoint, and independent-verification runtimes, authorization/receipt/trust schemas, `scripts/operate_github_release.js`, `scripts/operate_github_release_verification.js`, publisher, checkpoint, and independent-verification fixtures |

## Multi-Agent Organization

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| Org chart / roles | `docs/llm-agent-org-chart.md`, `docs/agent-roles-and-authority.md` | `schema-files/agent.schema.json` |
| Department collaboration | `docs/interdepartment-collaboration-policy.md`, `docs/b2c2wg-operating-model.md` | `schema-files/department-collaboration-charter.schema.json`, `department-collaboration-runner.js` |
| Chief of staff and battle rhythm | `docs/chief-of-staff-agent.md`, `docs/b2c2wg-operating-model.md`, `docs/agent-battle-rhythm.md` | `schema-files/board-decision.schema.json`, `schema-files/battle-rhythm-event.schema.json`, `schema-files/battle-rhythm-scheduler.schema.json`, `battle-rhythm-scheduler.js`, `run-battle-rhythm-scheduler-fixtures.js` |
| Liaison and partner interop | `docs/liaison-agent-model.md`, `docs/interop-release-packet.md`, `docs/partner-command-relationship.md` | `schema-files/context-release.schema.json`, `release-review-runner.js`, `release-gate-decision-runner.js` |
| Agent routing preflight | `docs/role-document-access-policy.md`, `docs/agent-roles-and-authority.md`, this routing reference | `schema-files/routing-receipt.schema.json`, `agent-routing-preflight-runner.js`, `run-agent-routing-preflight-fixtures.js` |
| Operational mission lifecycle, expiry, abort, and supersession | `docs/skill-operational-mission-lifecycle.md`, `docs/agent-battle-rhythm.md`, `docs/knowledge-management-sop.md` | `skill-mission-controller.js`, mission-wave/context/report/closeout/termination schemas, `scripts/operate_controls_mission.js`, `run-skill-mission-controller-fixtures.js` |
| One lease lineage per delegated mission agent | `docs/enforced-dispatch-and-resume.md`, `docs/repository-artifact-isolation-policy.md` | `dispatch-runtime-controller.js`, `scripts/operate_dispatch_runtime.js`, `scripts/enforce_controls_dispatch.js`, `scripts/install_dispatch_hooks.js`, `run-dispatch-runtime-fixtures.js` |
| SOF / high-risk TF | `docs/ai-special-operations-tf.md` | `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js` |
| Force structure changes | `docs/force-structure-change-policy.md` | `schema-files/force-structure-change-order.schema.json`, `force-structure-change-runner.js` |
| Unmatched mission capability | `docs/force-structure-change-policy.md`, `docs/interdepartment-collaboration-policy.md`, `docs/b2c2wg-operating-model.md` | routing receipt/context-pack v0.2 `capability_routing`, `run-force-structure-change-fixtures.js`, `skill-mission-controller.js` |
| Mission-based model allocation and dispatch | `docs/model-force-assignment-policy.md`, `docs/model-force-v0.2-operations.md`, `docs/agent-metl.md`, `docs/agent-readiness-ledger.md` | `schema-files/model-registry.schema.json`, `schema-files/model-assignment-request.schema.json`, `model-assignment-compiler.js`, `integrated-mission-preflight-runner.js`, `run-model-force-v0.2-fixtures.js` |
| Continuity and handoff | `docs/personnel-continuity-model.md`, `docs/knowledge-management-sop.md`, `docs/handoff-packet-template.md` | `schema-files/continuity-plan.schema.json`, `handoff-generator.js`, `continuity-drill-runner.js` |

## Source, Culture, Multinational Use

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| Korean adaptation | `docs/korean-military-sources.md`, `docs/korean-org-culture.md` | source-map coverage and local policy notes |
| Multinational consistency | `docs/multinational-doctrine-consistency-review.md` | `schema-files/doctrine-consistency-review.schema.json`, `doctrine-consistency-runner.js` |
| Source reliability | `docs/source-reliability-rubric.md` | source-map linter and evidence samples |
| Research backlog | `docs/military-operating-deep-research-queue.md` | new docs/schemas/runners as justified |

## Runtime, UI, Persistence

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| Reference architecture | `docs/reference-architecture.md`, `docs/implementation-guide.md` | runner suite and prototype directories |
| Event sourcing | `docs/event-sourcing-model.md` | `event-replay-prototype/`, `event-fixtures/` |
| Dashboard | `docs/command-post-dashboard.md`, `docs/dashboard-wireframes.md` | dashboard runners and `dashboard-ui-prototype/*.json` |
| Data model | `docs/data-model.sql.md`, `docs/sample-runtime-state.md` | JSON samples and SQL notes |
| Maintenance/readiness | `docs/maintenance-readiness-model.md`, `docs/agent-readiness-ledger.md`, `docs/sustainment-agent-sop.md`, `docs/resource-priority-policy.md` | `maintenance-readiness-runner.js`, `maintenance-dashboard-runner.js`, `schema-files/resource-status.schema.json`, `resource-budget-checker.js`, `tool-fallback-planner.js` |
| Knowledge management review | `docs/knowledge-management-sop.md`, `docs/handoff-packet-template.md` | `schema-files/decision-log.schema.json`, `schema-files/source-record.schema.json`, `km-review-runner.js`, `run-km-review-fixtures.js` |
| Repository-isolated artifacts | `docs/repository-artifact-isolation-policy.md`, `docs/knowledge-management-sop.md` | `repository-artifact-store.js`, `repository-lease.js`, `repository-artifact-verify.js`, `schema-files/repository-artifact-manifest.schema.json`, isolation/concurrency/recovery fixtures |
| Enforced dispatch, interruption, and resume | `docs/enforced-dispatch-and-resume.md`, `docs/skill-operational-mission-lifecycle.md` | `dispatch-runtime-controller.js`, `dispatch-hook-adapter.js`, `install-dispatch-hooks.js`, `run-dispatch-runtime-fixtures.js` |
| Protected gateway transaction, authenticated identity, bounded process/OCI sandbox execution, production admission, and recovery | `docs/protected-tool-gateway-contract.md`, `docs/gateway-identity-admission.md`, `docs/protected-process-execution.md`, `docs/oci-linux-sandbox-provider.md`, `docs/production-sandbox-admission.md`, `docs/repository-artifact-isolation-policy.md` | `protected-tool-gateway.js`, `gateway-identity-adapter.js`, `protected-process-executor.js`, `oci-linux-sandbox-provider.js`, `production-sandbox-admission-adapter.js`, protected operation wrappers, gateway/executor/sandbox/production fixture runners |
| Bounded self-improvement and active work evolution | `docs/bounded-self-improvement-operations.md`, `docs/sigstore-verifier-workload-admission.md`, `docs/verifier-execution-integrity.md`, `docs/github-actions-native-verifier-adapter.md`, `docs/gitlab-ci-native-verifier-adapter.md`, `docs/verifier-pre-dispatch-challenge.md`, `docs/verifier-independence-assurance.md`, `docs/transparency-operations.md`, `docs/evaluation-metrics.md`, `docs/runtime-automation-roadmap.md`, `docs/knowledge-management-sop.md` | `self-improvement-campaign-init.js`, `campaign-supervisor.js`, `verifier-trust-readiness.js`, `verifier-identity-evidence.js`, `sigstore-trusted-root.js`, `sigstore-verifier-identity-evidence.js`, `verifier-execution-evidence.js`, `verifier-execution-runner.js`, `github-actions-oidc.js`, `github-actions-oidc-runner.js`, `gitlab-ci-oidc.js`, `gitlab-ci-oidc-runner.js`, `verifier-challenge-set.js`, `verifier-independence.js`, `transparency-operations.js`, `transparency-operations-runner.js`, `verification-runner.js`, `verification-attestation-runner.js`, `comparative-evaluation-runner.js`, `comparative-evaluation-attestation-runner.js`, `autonomous-improvement-controller.js`, campaign/cycle-order/proof/trust/root/identity/runtime/execution/challenge/independence/transparency/admission/comparison schemas and fixtures |

## Validation Sets

| Change Type | Minimum Commands |
| --- | --- |
| Schema or sample | `node validator-cli-prototype/run-fixtures.js`, targeted `node validator-cli-prototype/validate.js ...` |
| Any runner | targeted `node run-...-fixtures.js`, then all `run-*.js` if shared logic changed |
| English-only corpus | `node .github/scripts/check-english-only.js` |
| Source-map or official URL | `node source-map-linter.js --write-report` |
| Release/authority/risk | `node run-authority-integration-fixtures.js`, `node run-release-integration-fixtures.js`, relevant lifecycle runner |
| GitHub release-immutability policy authorization or receipt | `node run-github-release-immutability-fixtures.js`, targeted policy authorization/receipt validation, publisher regression fixtures, direct CLI module-entry validation, Codex and Claude wrapper resolution, routing coverage |
| GitHub release-integrity policy, observation, attestation, trusted root, trust checkpoint, initial recovery, bundle, workflow, or monitor credential | `node run-github-release-independent-verification-fixtures.js`, `node run-github-release-trust-checkpoint-fixtures.js`, `node run-github-release-integrity-fixtures.js`, `node run-github-release-publisher-fixtures.js`, targeted policy/root/checkpoint/recovery/observation validation with explicit clocks, fresh first-attempt full provider run after credential changes, API-digest and exact-triplet replay, Codex and Claude wrapper resolution, routing coverage |
| Exact GitHub release authorization or receipt | `node run-github-release-independent-verification-fixtures.js`, `node run-github-release-trust-checkpoint-fixtures.js`, `node run-github-release-publisher-fixtures.js`, targeted authorization/receipt/root/checkpoint validation, direct CLI module-entry validation, Codex and Claude wrapper resolution, routing coverage |
| Orders/backbrief/rehearsal | `node runtime-demo-runner.js`, `node orders-dissemination-runner.js ...`, relevant routing fixture |
| Skill update | `node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .`, `python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" .claude/skills/controls-doctrine-operator`, `python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" codex-skills/controls-doctrine-operator`, review both diffs for equivalent operational semantics |
| Delegated agent routing | `node validator-cli-prototype/validate.js sample-payloads/valid-routing-receipt-agent-s3.json routing-receipt`, `node run-agent-routing-preflight-fixtures.js` |
| Operational skill lifecycle | `node run-skill-mission-controller-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| Dispatch policy, lease, hooks, or resume | `node run-dispatch-runtime-fixtures.js`, targeted validation of dispatch policy/lease/checkpoint samples, Codex and Claude route coverage |
| Protected gateway contract or controller | `node run-protected-tool-gateway-fixtures.js`, `node run-dispatch-runtime-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| Protected process policy, executor, or evidence | `node run-protected-process-executor-fixtures.js`, `node run-protected-tool-gateway-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| OCI Linux sandbox policy, provider, probe, or evidence | `CANNAE_REQUIRE_LIVE_OCI=1 node run-oci-linux-sandbox-provider-fixtures.js` for release/CI validation, `node run-protected-tool-gateway-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| Production sandbox policy, appraiser evidence, admission, managed gateway, or coordinator binding | `node run-production-sandbox-admission-fixtures.js`, `node run-production-sandbox-gateway-fixtures.js`, `node run-protected-tool-gateway-fixtures.js`, `node run-gateway-identity-adapter-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| Model allocation or routing | `node validator-cli-prototype/validate.js sample-payloads/valid-model-registry.json model-registry`, `node run-model-force-assignment-fixtures.js`, `node run-model-force-v0.2-fixtures.js` |
| Multi-repository artifacts | `node run-repository-artifact-isolation-fixtures.js`, `node run-repository-artifact-concurrency-fixtures.js`, `node run-repository-artifact-recovery-fixtures.js`, `node validator-cli-prototype/validate.js sample-payloads/valid-repository-artifact-manifest.json repository-artifact-manifest` |
| Bounded self-improvement | `node run-self-improvement-fixtures.js`, `node run-signed-self-improvement-fixtures.js`, `node run-campaign-supervisor-fixtures.js`, `node run-verifier-trust-readiness-fixtures.js`, `node run-verifier-identity-evidence-fixtures.js`, `node run-sigstore-verifier-identity-fixtures.js`, `node run-verifier-execution-evidence-fixtures.js`, `node run-github-actions-oidc-fixtures.js`, `node run-gitlab-ci-oidc-fixtures.js`, `node run-verifier-challenge-fixtures.js`, `node run-verifier-independence-fixtures.js`, `node run-transparency-operations-fixtures.js`, `node run-transparency-supervisor-fixtures.js`, `node run-workload-identity-admission-fixtures.js`, `node run-cycle-order-admission-fixtures.js`, `node run-verification-runner-fixtures.js`, `node run-verification-attestation-fixtures.js`, `node run-comparative-evaluation-fixtures.js`, `node run-comparative-evaluation-attestation-fixtures.js`, `node validator-cli-prototype/validate.js sample-payloads/valid-verifier-runtime-policy-v0.3.json verifier-runtime-policy`, `node validator-cli-prototype/validate.js sample-payloads/valid-github-actions-oidc-evidence.json github-actions-oidc-evidence`, `node validator-cli-prototype/validate.js sample-payloads/valid-gitlab-ci-oidc-evidence.json gitlab-ci-oidc-evidence`, `node validator-cli-prototype/validate.js sample-payloads/valid-verifier-challenge-set.json verifier-challenge-set`, `node validator-cli-prototype/validate.js sample-payloads/valid-transparency-state.json transparency-state` |
| GitHub/community infrastructure | `node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .`, `node .github/scripts/check-json.js`, `node .github/scripts/check-english-only.js`, `node .github/scripts/check-markdown-links.js`, `git diff --check` |
