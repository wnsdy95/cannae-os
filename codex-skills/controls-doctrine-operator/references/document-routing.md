# Document Routing

Use this map after running `scripts/route_controls_docs.js`, or when a task is obvious enough to route manually.

## Inventory Coverage

The router scans tracked corpus artifacts, including Markdown/HTML docs, JSON schemas, sample payloads, runtime payloads, fixtures, runner scripts, prototype scripts, dashboard state, and skill metadata. It excludes `.cannae`, `.git`, and `node_modules`; repository-scoped runtime evidence is not doctrine inventory. Every routable corpus artifact must have at least one route category.

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
| OPORD/WARNO/FRAGO/SITREP/AAR prompting | `docs/prompt-templates.md`, `docs/orders-production-pipeline.md` | `schema-files/opord.schema.json`, `schema-files/frago.schema.json`, `schema-files/sitrep.schema.json`, `schema-files/aar.schema.json` |
| Annex vs FRAGO change | `docs/opord-annex-model.md` | `schema-files/annex.schema.json`, `schema-files/frago-scope-change.schema.json`, `run-rehearsal-to-ccir-fixtures.js` |
| Backbrief/rehearsal | `docs/backbrief-and-rehearsal-sop.md` | `schema-files/backbrief.schema.json`, `schema-files/rehearsal.schema.json`, `orders-dissemination-runner.js` |
| Information to operations | `docs/information-to-operations-cycle.md` | `information-to-operations-router.js`, `run-information-to-operations-fixtures.js` |

## Authority, Release, Risk

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| Role authority | `docs/agent-roles-and-authority.md` | `schema-files/authority-matrix.schema.json`, `readiness-gate-prototype/` |
| Tool use policy | `docs/tool-use-roe.md`, `docs/policy-engine-rules.md` | `policy-engine-prototype/`, `policy-engine-authority-integration.js` |
| Enforced tool dispatch and explicit resume | `docs/enforced-dispatch-and-resume.md`, `docs/tool-use-roe.md` | `dispatch-runtime-controller.js`, `dispatch-hook-adapter.js`, `install-dispatch-hooks.js`, dispatch policy/lease/admission/checkpoint schemas |
| Approval lifecycle | `docs/approval-scope-policy.md` | `approval-consumption-runner.js`, `approval-renewal-runner.js`, `approval-revocation-runner.js`, `approval-delegation-runner.js` |
| Risk acceptance | `docs/risk-acceptance-authority.md` | `schema-files/risk-acceptance.schema.json`, `run-authority-integration-fixtures.js` |
| Release review | `docs/context-releasability-policy.md`, `docs/opsec-classification-model.md` | `release-review-runner.js`, `policy-engine-release-integration.js`, `release-gate-decision-runner.js` |

## Multi-Agent Organization

| Task | Primary Docs | Executable Surface |
| --- | --- | --- |
| Org chart / roles | `docs/llm-agent-org-chart.md`, `docs/agent-roles-and-authority.md` | `schema-files/agent.schema.json` |
| Department collaboration | `docs/interdepartment-collaboration-policy.md`, `docs/b2c2wg-operating-model.md` | `schema-files/department-collaboration-charter.schema.json`, `department-collaboration-runner.js` |
| Agent routing preflight | `docs/role-document-access-policy.md`, `docs/agent-roles-and-authority.md`, this routing reference | `schema-files/routing-receipt.schema.json`, `agent-routing-preflight-runner.js`, `run-agent-routing-preflight-fixtures.js` |
| Operational mission lifecycle | `docs/skill-operational-mission-lifecycle.md`, `docs/agent-battle-rhythm.md`, `docs/knowledge-management-sop.md` | `skill-mission-controller.js`, mission-wave/context/report/closeout schemas, `scripts/operate_controls_mission.js`, `run-skill-mission-controller-fixtures.js` |
| One lease lineage per delegated mission agent | `docs/enforced-dispatch-and-resume.md`, `docs/repository-artifact-isolation-policy.md` | `dispatch-runtime-controller.js`, `scripts/operate_dispatch_runtime.js`, `scripts/enforce_controls_dispatch.js`, `scripts/install_dispatch_hooks.js`, `run-dispatch-runtime-fixtures.js` |
| SOF / high-risk TF | `docs/ai-special-operations-tf.md` | `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js` |
| Force structure changes | `docs/force-structure-change-policy.md` | `schema-files/force-structure-change-order.schema.json`, `force-structure-change-runner.js` |
| Mission-based model allocation and dispatch | `docs/model-force-assignment-policy.md`, `docs/model-force-v0.2-operations.md`, `docs/agent-metl.md`, `docs/agent-readiness-ledger.md` | `schema-files/model-registry.schema.json`, `schema-files/model-assignment-request.schema.json`, `model-assignment-compiler.js`, `integrated-mission-preflight-runner.js`, `run-model-force-v0.2-fixtures.js` |
| Continuity and handoff | `docs/personnel-continuity-model.md`, `docs/knowledge-management-sop.md` | `schema-files/continuity-plan.schema.json`, `handoff-generator.js`, `continuity-drill-runner.js` |

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
| Maintenance/readiness | `docs/maintenance-readiness-model.md`, `docs/agent-readiness-ledger.md` | `maintenance-readiness-runner.js`, `maintenance-dashboard-runner.js` |
| Repository-isolated artifacts | `docs/repository-artifact-isolation-policy.md`, `docs/knowledge-management-sop.md` | `repository-artifact-store.js`, `repository-lease.js`, `repository-artifact-verify.js`, `schema-files/repository-artifact-manifest.schema.json`, isolation/concurrency/recovery fixtures |
| Enforced dispatch, interruption, and resume | `docs/enforced-dispatch-and-resume.md`, `docs/skill-operational-mission-lifecycle.md` | `dispatch-runtime-controller.js`, `dispatch-hook-adapter.js`, `install-dispatch-hooks.js`, `run-dispatch-runtime-fixtures.js` |
| Bounded self-improvement and active work evolution | `docs/bounded-self-improvement-operations.md`, `docs/sigstore-verifier-workload-admission.md`, `docs/verifier-execution-integrity.md`, `docs/github-actions-native-verifier-adapter.md`, `docs/gitlab-ci-native-verifier-adapter.md`, `docs/verifier-pre-dispatch-challenge.md`, `docs/verifier-independence-assurance.md`, `docs/transparency-operations.md`, `docs/evaluation-metrics.md`, `docs/runtime-automation-roadmap.md`, `docs/knowledge-management-sop.md` | `self-improvement-campaign-init.js`, `campaign-supervisor.js`, `verifier-trust-readiness.js`, `verifier-identity-evidence.js`, `sigstore-trusted-root.js`, `sigstore-verifier-identity-evidence.js`, `verifier-execution-evidence.js`, `verifier-execution-runner.js`, `github-actions-oidc.js`, `github-actions-oidc-runner.js`, `gitlab-ci-oidc.js`, `gitlab-ci-oidc-runner.js`, `verifier-challenge-set.js`, `verifier-independence.js`, `transparency-operations.js`, `transparency-operations-runner.js`, `verification-runner.js`, `verification-attestation-runner.js`, `comparative-evaluation-runner.js`, `comparative-evaluation-attestation-runner.js`, `autonomous-improvement-controller.js`, campaign/cycle-order/proof/trust/root/identity/runtime/execution/challenge/independence/transparency/admission/comparison schemas and fixtures |

## Validation Sets

| Change Type | Minimum Commands |
| --- | --- |
| Schema or sample | `node validator-cli-prototype/run-fixtures.js`, targeted `node validator-cli-prototype/validate.js ...` |
| Any runner | targeted `node run-...-fixtures.js`, then all `run-*.js` if shared logic changed |
| English-only corpus | `node .github/scripts/check-english-only.js` |
| Source-map or official URL | `node source-map-linter.js --write-report` |
| Release/authority/risk | `node run-authority-integration-fixtures.js`, `node run-release-integration-fixtures.js`, relevant lifecycle runner |
| Orders/backbrief/rehearsal | `node runtime-demo-runner.js`, `node orders-dissemination-runner.js ...`, relevant routing fixture |
| Skill update | `node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .`, `python3 /Users/work/.codex/skills/.system/skill-creator/scripts/quick_validate.py codex-skills/controls-doctrine-operator` |
| Delegated agent routing | `node validator-cli-prototype/validate.js sample-payloads/valid-routing-receipt-agent-s3.json routing-receipt`, `node run-agent-routing-preflight-fixtures.js` |
| Operational skill lifecycle | `node run-skill-mission-controller-fixtures.js`, `node validator-cli-prototype/run-fixtures.js`, Codex and Claude route coverage |
| Dispatch policy, lease, hooks, or resume | `node run-dispatch-runtime-fixtures.js`, targeted validation of dispatch policy/lease/checkpoint samples, Codex and Claude route coverage |
| Model allocation or routing | `node validator-cli-prototype/validate.js sample-payloads/valid-model-registry.json model-registry`, `node run-model-force-assignment-fixtures.js`, `node run-model-force-v0.2-fixtures.js` |
| Multi-repository artifacts | `node run-repository-artifact-isolation-fixtures.js`, `node run-repository-artifact-concurrency-fixtures.js`, `node run-repository-artifact-recovery-fixtures.js`, `node validator-cli-prototype/validate.js sample-payloads/valid-repository-artifact-manifest.json repository-artifact-manifest` |
| Bounded self-improvement | `node run-self-improvement-fixtures.js`, `node run-signed-self-improvement-fixtures.js`, `node run-campaign-supervisor-fixtures.js`, `node run-verifier-trust-readiness-fixtures.js`, `node run-verifier-identity-evidence-fixtures.js`, `node run-sigstore-verifier-identity-fixtures.js`, `node run-verifier-execution-evidence-fixtures.js`, `node run-github-actions-oidc-fixtures.js`, `node run-gitlab-ci-oidc-fixtures.js`, `node run-verifier-challenge-fixtures.js`, `node run-verifier-independence-fixtures.js`, `node run-transparency-operations-fixtures.js`, `node run-transparency-supervisor-fixtures.js`, `node run-workload-identity-admission-fixtures.js`, `node run-cycle-order-admission-fixtures.js`, `node run-verification-runner-fixtures.js`, `node run-verification-attestation-fixtures.js`, `node run-comparative-evaluation-fixtures.js`, `node run-comparative-evaluation-attestation-fixtures.js`, `node validator-cli-prototype/validate.js sample-payloads/valid-verifier-runtime-policy-v0.3.json verifier-runtime-policy`, `node validator-cli-prototype/validate.js sample-payloads/valid-github-actions-oidc-evidence.json github-actions-oidc-evidence`, `node validator-cli-prototype/validate.js sample-payloads/valid-gitlab-ci-oidc-evidence.json gitlab-ci-oidc-evidence`, `node validator-cli-prototype/validate.js sample-payloads/valid-verifier-challenge-set.json verifier-challenge-set`, `node validator-cli-prototype/validate.js sample-payloads/valid-transparency-state.json transparency-state` |
| GitHub/community infrastructure | `node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .`, `node .github/scripts/check-json.js`, `node .github/scripts/check-english-only.js`, `node .github/scripts/check-markdown-links.js`, `git diff --check` |
