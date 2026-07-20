# Military Operating Deep Research Queue

## 0. Purpose

This document is the research backlog that manages the areas requiring deeper investigation going forward, in order to translate how the military operates into an LLM operating framework.

The OPORD, mission command, CCIR, authority, battle rhythm, risk, assessment, training, sustainment, targeting, and ROE material already organized form the framework's primary skeleton. The next step is to extract, in finer detail, the detailed operating mechanisms that actually let the military move a massive organization without distortion.

Core questions:

1. Why does a senior commander's intent still translate into real action even after passing through intermediate echelons?
2. What approval authority, reporting obligations, discretionary judgment authority, and after-the-fact accountability does each position hold?
3. How do documents, meetings, reports, rehearsals, liaison, and knowledge management reduce distortion?
4. How can this structure be implemented in a single LLM, a multi-agent system, or a tool-using runtime?

## 1. Research Evaluation Criteria

Sources are classified into four tiers.

| Tier | Criteria | Framework use |
| --- | --- | --- |
| A | Official doctrine, statutes, directives, official handbooks | Primary basis for structure, terminology, and the authority model |
| B | Military educational institutions, CALL, Joint Staff J7 focus papers, lessons learned | Basis for operating procedures and real-world application patterns |
| C | Academic papers, analytical reports, think tanks | Basis for effectiveness, limitations, and comparative studies |
| D | Blogs, interviews, informal anecdotes | Hypothesis candidates only. Not used as direct evidence |

Documentation rules:

- Facts confirmed in the source text are labeled `Claim`.
- Interpretation carried over into the LLM framework is labeled `Interpretation`.
- Implementation design is labeled `Application`.
- Uncertain parts are labeled `Research Gap`.

## 2. Areas Currently Covered

| Area | Current output | Remaining gap |
| --- | --- | --- |
| Mission command | `agent-roles-and-authority.md`, `military-operating-system.md` | Model disciplined initiative more rigorously as runtime policy |
| OPORD/WARNO/FRAGO/SITREP/AAR | `prompt-templates.md`, `prompt-dsl.md`, `schema-files/`, `orders-production-pipeline.md`, `opord-annex-model.md`, `schema-files/annex.schema.json`, `schema-files/frago-scope-change.schema.json`, `rehearsal-to-ccir-router.js`, `information-to-operations-router.js` | Awaiting new priority assignment |
| CCIR/PIR/FFIR/EEFI | `decision-risk-assessment.md`, `agent-battle-rhythm.md`, `information-to-operations-cycle.md`, `schema-files/information-report.schema.json`, `schema-files/intelligence-assessment.schema.json`, `information-to-operations-router.js` | Integrate dashboard projection with the actual UI queue |
| Authority/approval | `tool-use-roe.md`, `approval-ui-patterns.md`, `policy-engine-prototype/`, `approval-scope-policy.md`, `risk-acceptance-authority.md`, `schema-files/approval-scope.schema.json`, `schema-files/approval-consumption-event.schema.json`, `schema-files/approval-revocation-event.schema.json`, `schema-files/approval-renewal-event.schema.json`, `schema-files/approval-delegation-event.schema.json`, `schema-files/approval-delegation-revocation-event.schema.json`, `schema-files/release-gate-decision-event.schema.json`, `schema-files/risk-acceptance.schema.json`, `policy-engine-authority-integration.js`, `policy-engine-release-integration.js`, `release-gate-dashboard-runner.js`, `authority-delegation-projection-runner.js`, `maintenance-dashboard-runner.js`, `aar-to-readiness-update.js`, `rehearsal-to-ccir-router.js`, `dashboard-ui-prototype/release-gate-dashboard-state.json`, `dashboard-ui-prototype/authority-delegation-projection-state.json`, `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json` | Awaiting new priority assignment |
| Staff organization/interdepartment collaboration | `llm-agent-org-chart.md`, `functional-domains.md`, `b2c2wg-operating-model.md`, `interdepartment-collaboration-policy.md`, `schema-files/department-collaboration-charter.schema.json`, `department-collaboration-runner.js` | Integrate dashboard collaboration panel with dependency projection |
| Organization activation/deactivation/expansion-reduction | `force-structure-change-policy.md`, `schema-files/force-structure-change-order.schema.json`, `force-structure-change-runner.js`, `run-force-structure-change-fixtures.js` | Integrate dashboard force-structure panel with readiness/authority projection |
| Document/context access control | `role-document-access-policy.md`, `schema-files/document-access-manifest.schema.json`, `document-access-runner.js`, `run-document-access-fixtures.js`, `context-releasability-policy.md`, `context-filter-prototype/` | Integrate dashboard document-access/audit panel |
| Personnel loss/replacement/rotation | `personnel-continuity-model.md`, `schema-files/continuity-plan.schema.json`, `continuity-drill-runner.js`, `run-continuity-drill-fixtures.js` | Integrate dashboard continuity panel with authority projection |
| SOF TF / high-risk mission task organizations | `ai-special-operations-tf.md`, `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js`, `run-sof-tf-fixtures.js` | Integrate dashboard activation panel with readiness/authority projection |
| Multinational doctrine consistency | `multinational-doctrine-consistency-review.md`, `schema-files/doctrine-consistency-review.schema.json`, `doctrine-consistency-runner.js`, `run-doctrine-consistency-fixtures.js` | Once access to official Australian ADF doctrine is secured, review adding a source family |
| Evaluation/AAR | `evaluation-metrics.md`, `agent-readiness-ledger.md`, `backbrief-and-rehearsal-sop.md` | Procedure by which rehearsal friction points convert into CCIR/AAR |
| Runtime implementation | `runtime-demo-runner.js`, `event-replay-prototype/`, `dashboard-ui-prototype/` | Sustained execution of the event store, projection, and approval gate |

## 3. Priority Research Lines

### 3.1 Commander's intent and mission orders

Research questions:

- What essential elements make up commander's intent?
- To what extent is the method delegated to subordinates, and what must always remain controlled?
- What boundaries keep disciplined initiative from degenerating into unauthorized action?

Primary sources:

- ADP 6-0, Mission Command
- ADP 5-0, The Operations Process
- Joint Staff Mission Command Focus Paper
- Army University Press mission command articles

LLM mapping:

- Rather than a goal, the Commander prompt first fixes `purpose`, `key tasks`, `end state`, `failure to avoid`, and `authority boundary`.
- The agent may propose methods, but it may not cross the Red/Black boundary.
- Through the backbrief, the agent restates "what am I trying to do / why / where do I stop."

Output artifacts:

- `commander-handbook.md`
- `mission-command-runtime-policy.md`
- `disciplined-initiative-rules.md`

### 3.2 OPORD, annex, orders production

Research questions:

- What specific mechanism does a standardized order format use to reduce distortion?
- What division of labor exists between the five paragraphs of the base order and the annexes?
- How is the information volume/speed tradeoff among WARNO, OPORD, and FRAGO determined?

Primary sources:

- FM 5-0, Planning and Orders Production
- STANAG 2014, Formats for Orders
- MDMP handbook and CALL planning products

LLM mapping:

- A user request does not become a "prompt" directly; it passes through mission analysis and a draft OPORD.
- Complex work is separated into annexes: source plan, tool plan, risk plan, verification plan, rollback plan.
- A scope change is recorded as a FRAGO event, not as a new conversation.

Output artifacts:

- `opord-annex-model.md`
- `orders-production-pipeline.md`
- `runtime-demo-payloads/warno.json`
- `runtime-demo-payloads/frago.json`

Current implementation:

- `orders-production-pipeline.md`
- `opord-annex-model.md`
- `runtime-demo-payloads/backbrief.json`
- `runtime-demo-payloads/rehearsal.json`
- `orders-dissemination-runner.js`

### 3.3 Confirmation brief, backbrief, rehearsal

Research questions:

- What must a subordinate restate immediately after receiving an order?
- What errors does rehearsal catch before actual execution?
- How do rehearsal results feed into order revision, risk control, and CCIR updates?

Primary sources:

- Commander and Staff Guide to Rehearsals
- FM 5-0 confirmation brief/backbrief sections
- CALL rehearsal handbooks

LLM mapping:

- Before execution, the agent backbriefs `understanding`, `planned actions`, `risk`, `stop conditions`, and `needed approvals`.
- Before tool execution, a dry-run or rehearsal output is generated.
- Based on the rehearsal result, the commander chooses one of approve, revise, reject, or fragment order.

Output artifacts:

- `backbrief-and-rehearsal-sop.md`
- `rehearsal-fixtures.json`
- `dry-run-approval-ui.md`

Current implementation:

- `backbrief-and-rehearsal-sop.md`
- `schema-files/backbrief.schema.json`
- `schema-files/rehearsal.schema.json`
- `sample-payloads/valid-backbrief.json`
- `sample-payloads/valid-rehearsal.json`

### 3.4 Staff integration, COS, B2C2WG

Research questions:

- How does the Chief of Staff integrate the staff to support the commander's decisions?
- What problems do boards, bureaus, centers, cells, and working groups solve?
- Which meetings should the battle rhythm create, and which should it prohibit?

Primary sources:

- FM 6-0, Commander and Staff Organization and Operations
- Joint Headquarters Organization, Staff Integration, and Battle Rhythm Focus Paper
- Chief of Staff Roles and Functions Focus Paper
- Knowledge and Information Management Focus Paper

LLM mapping:

- The CoS/Orchestrator is not a superior over every agent; it is the staff integration layer.
- B2C2WG is implemented in the LLM runtime as a "recurring decision-packet generation event."
- Not every agent reports directly to the commander at length. The CoS compresses reporting around the CCIR.

Output artifacts:

- `b2c2wg-operating-model.md`
- `chief-of-staff-agent.md`
- `battle-rhythm-scheduler-schema.json`

### 3.5 CCIR, COP, reporting system

Research questions:

- What information becomes commander's critical information?
- What dashboard alert does each of PIR, FFIR, and EEFI turn into?
- How often must reporting occur, and when is reporting not required?

Primary sources:

- Joint Staff CCIR Focus Paper
- ADP 5-0/6-0 shared understanding and assessment sections
- Knowledge and Information Management Focus Paper

LLM mapping:

- CCIR is not "something worth mentioning" but "information that changes a decision."
- A dashboard alert is not created unless it is linked to a CCIR.
- The agent prioritizes exception reports over completion reports.

Output artifacts:

- `ccir-alerting-model.md`
- `common-operational-picture-state.md`
- `reporting-threshold-policy.md`

### 3.6 Authority, approval, retained authority

Research questions:

- How is authority delegated, and which authority does the senior echelon retain?
- How is risk-acceptance authority divided by echelon?
- How are an authority's scope, duration, target, and condition documented?

Primary sources:

- Joint Staff Authorities Focus Paper
- ATP 5-19, Risk Management
- ROE/SRUF public references
- Public statutes/regulations

LLM mapping:

- Agent authority is not a function of role alone but of role + task + target + time + risk + readiness.
- An approval object must have scope, expiry, rollback, and an evidence requirement.
- Approval of a Red action is never a blanket approval.

Output artifacts:

- `schema-files/authority-matrix.schema.json`
- `approval-scope-policy.md`
- `risk-acceptance-authority.md`

Current implementation:

- `schema-files/approval-scope.schema.json`
- `schema-files/approval-consumption-event.schema.json`
- `schema-files/approval-revocation-event.schema.json`
- `schema-files/approval-renewal-event.schema.json`
- `schema-files/approval-delegation-event.schema.json`
- `schema-files/approval-delegation-revocation-event.schema.json`
- `schema-files/release-gate-decision-event.schema.json`
- `schema-files/risk-acceptance.schema.json`
- `approval-consumption-runner.js`
- `run-approval-consumption-fixtures.js`
- `approval-revocation-runner.js`
- `run-approval-revocation-fixtures.js`
- `approval-renewal-runner.js`
- `run-approval-renewal-fixtures.js`
- `approval-delegation-runner.js`
- `run-approval-delegation-fixtures.js`
- `approval-delegation-revocation-runner.js`
- `run-approval-delegation-revocation-fixtures.js`
- `policy-engine-authority-integration.js`
- `run-authority-integration-fixtures.js`
- `policy-engine-release-integration.js`
- `run-release-integration-fixtures.js`
- `release-gate-decision-runner.js`
- `run-release-gate-decision-fixtures.js`
- `release-gate-dashboard-runner.js`
- `run-release-gate-dashboard-fixtures.js`
- `dashboard-ui-prototype/release-gate-dashboard-state.json`
- `maintenance-dashboard-runner.js`
- `run-maintenance-dashboard-fixtures.js`
- `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`
- `authority-delegation-projection-runner.js`
- `run-authority-delegation-projection-fixtures.js`
- `dashboard-ui-prototype/authority-delegation-projection-state.json`

### 3.7 Knowledge management, records, audit

Research questions:

- How do knowledge management and information management differ, and why are both needed?
- How are the document repository, terminology, read-ahead, and decision log operated?
- How is memory loss reduced during long-running operations?

Primary sources:

- Joint Staff Knowledge and Information Management Focus Paper
- CJCSI 5780.01 Knowledge Management
- USFK Knowledge Management Program

LLM mapping:

- Conversation history is not the source of truth.
- The event log, evidence store, decision log, and doctrine docs are the source of truth.
- Every long-running task leaves a handoff packet and a current projection behind.

Output artifacts:

- `knowledge-management-sop.md`
- `decision-log-schema.json`
- `handoff-packet-template.md`

### 3.8 Training, METL, readiness

Research questions:

- By what criteria does a unit determine and train its essential tasks?
- How does the readiness rating connect to authority delegation?
- How is the crawl-walk-run approach applied to increasing agent autonomy?

Primary sources:

- ADP 7-0, Training
- FM 7-0, Training
- Joint Training Manual

LLM mapping:

- A Mission Essential Task List is created for each agent.
- An agent with low readiness does not gain automatic execution authority and holds only draft/report authority.
- AAR results revise the readiness ledger and the SOP.

Output artifacts:

- `agent-metl.md`
- `training-progression-model.md`
- `readiness-to-authority-policy.md`

### 3.9 Sustainment, logistics, maintenance

Research questions:

- How does operational sustainment handle personnel, supply, maintenance, budget, and time constraints?
- Which resource bottlenecks must be escalated to a commander's decision?
- How does maintenance/availability reporting feed back into actual operational planning?

Primary sources:

- ADP 4-0, Sustainment
- JP 4-0, Joint Logistics
- Related public maintenance/readiness doctrine

LLM mapping:

- The S4 agent manages token count, wall-clock time, API quota, tool availability, and context size.
- Long-running tasks require cache, checkpoint, retry, and degraded mode.
- A tool failure is both a technical problem and a command-decision problem.

Output artifacts:

- `maintenance-readiness-model.md`
- `sustainment-agent-sop.md`
- `resource-priority-policy.md`

### 3.10 Protection, OPSEC, classification

Research questions:

- How does the protection function guarantee operational continuity rather than mere security?
- What information disclosure do OPSEC and EEFI prevent?
- How are classification, releasability, and need-to-know applied to LLM context sharing?

Primary sources:

- ADP/FM operations and protection doctrine
- OPSEC public references
- classification and records management public rules

LLM mapping:

- Context sharing is restricted by need-to-know rather than allowed by default.
- EEFI is divided into "information forbidden from output" and "information forbidden from tool transfer."
- The evidence store must carry a sensitivity label and releasability.

Output artifacts:

- `opsec-classification-model.md`
- `context-releasability-policy.md`
- `sensitive-output-filter.md`

### 3.11 Interoperability, liaison, multinational/interorganizational work

Research questions:

- Why is liaison necessary when collaborating with other organizations?
- Why do common terminology, common templates, COP, and the disclosure process matter?
- How are authority conflicts between organizations handled?

Primary sources:

- Commander and Staff Guide to Mission Partner Environment
- Commander and Staff Guide to Multinational Interoperability
- Interorganizational Cooperation Focus Paper
- JTF C2 and Organization Focus Paper

LLM mapping:

- A liaison role is needed when connecting to external tools, external teams, or other agent frameworks.
- The interop adapter converts not only data formats but also authority, release, and reporting.
- Partner-facing output must be an approved release packet, not internal reasoning.

Output artifacts:

- `liaison-agent-model.md`
- `interop-release-packet.md`
- `partner-command-relationship.md`

## 4. Core Mechanisms of Distortion-Free Order Transmission

Military-style order transmission reduces distortion not because "many orders are issued," but because the following mechanisms operate together.

| Mechanism | Military-style function | LLM application |
| --- | --- | --- |
| Standard documents | OPORD/WARNO/FRAGO/SITREP/AAR reduce omissions | prompt DSL and schema validation |
| Commander's intent | Purpose and end state are preserved even as detailed methods change | commander intent block |
| nested intent | Links senior intent to subordinate tasks | mission -> OPORD -> task order id linkage |
| confirmation brief | Subordinate restates the mission as understood | agent backbrief required |
| rehearsal | Discovers conflicts and omissions before execution | dry-run/tool simulation |
| CCIR | Only information needed for a decision is reported upward | dashboard alert thresholds |
| authority matrix | Specifies who can approve what | policy engine + approval object |
| running estimate | Staff judgment is continuously updated | agent working state and evidence notes |
| succession and continuity | Duty positions/succession lines/vital records absorb personnel loss | continuity plan, drill runner, degraded mode |
| supported/supporting relationship | Clarifies the main effort and supporting functions per phase | department collaboration charter relationship edges |
| force management and documentation | Organizations are created and dissolved through capability requirements and documented authorization | force structure change order, DOTMLPF-P review, transition gate |
| liaison | Stabilizes meaning conversion and information flow between organizations | liaison rules and missing liaison projection |
| doctrine consistency review | Identifies conflicts between US-style terminology and other nations' doctrine/legal systems in advance | source family coverage, role alias map, jurisdiction gate |
| AAR | Feeds post-execution learning back into procedure | readiness ledger and SOP updates |

## 5. Order of Upcoming Research Deliverables

Completed:

- `commander-handbook.md`: Organizes what a person, acting as an AI commander, must decide and what must be delegated.
- `b2c2wg-operating-model.md`: Multi-agent board/working-group model.
- `schema-files/authority-matrix.schema.json`: Defines approval authority and retained authority in machine-readable form.
- `ccir-alerting-model.md`: Report thresholds and dashboard alert rules.
- `opsec-classification-model.md`: Context sharing, EEFI, releasability.
- `knowledge-management-sop.md`: Decision log, evidence store, handoff packet.
- `agent-metl.md`: Mission essential task list per role.
- `schema-files/decision-packet.schema.json`: Board decision packet structure.
- `schema-files/working-group.schema.json`: B2C2WG charter structure.
- `schema-files/ccir-alert.schema.json`: CCIR alert and routing structure.
- `alert-router-prototype/`: Converts the event log into an alert projection.
- `context-releasability-policy.md`: Context filter rules per role.
- `readiness-gate-prototype/`: Execution-authority determination combining the authority matrix and readiness.
- `schema-files/handoff-packet.schema.json`: Context transition packet structure.
- `schema-files/context-item.schema.json`: Context unit carrying classification, EEFI, and releasability metadata.
- `context-filter-prototype/`: Takes a role and context item and produces a raw/summary/redacted/reference/denied packet.
- `schema-files/release-review.schema.json`: Final output release decision schema.
- `handoff-generator.js`: Automatically generates a handoff packet from event projections and current queues.
- `decision-packet-linter.js`: Automates verification of board packet option/risk/evidence/deadline.
- `event-fixtures/working-group-event-fixtures.json`: WG opened/prepared/closed event replay fixtures.
- `maintenance-readiness-model.md`: Tool/resource availability and readiness.
- `schema-files/maintenance-readiness.schema.json`: Tool/resource/context/fallback readiness object.
- `maintenance-readiness-runner.js`: Converts critical runner execution results into a readiness report.
- `release-review-runner.js`: Verifies whether context filter output satisfies the final release constraints.
- `dashboard-ui-prototype/working-group-projection-dashboard-state.json`: Dashboard projection of active/closed WGs and decision packets.
- `approval-scope-policy.md`: Detailed policy for approval once/constraints/expiry/rollback.
- `risk-acceptance-authority.md`: Risk-acceptance authority and commander retained authority.
- `schema-files/approval-scope.schema.json`: Single-use approval, expiry, rollback, evidence, and consumption metadata.
- `schema-files/approval-consumption-event.schema.json`: Audit event for an approval scope being consumed by actual execution.
- `schema-files/approval-revocation-event.schema.json`: Audit event for an approval scope being revoked before execution.
- `schema-files/approval-renewal-event.schema.json`: Audit event for extending only the validity period of an approval scope before execution.
- `schema-files/approval-delegation-event.schema.json`: Audit event for delegating approval authority in a limited way.
- `schema-files/approval-delegation-revocation-event.schema.json`: Audit event projecting revocation/expiry of a delegated approval authority.
- `schema-files/release-gate-decision-event.schema.json`: Audit event compositing execution approval and information release approval into a final decision.
- `schema-files/risk-acceptance.schema.json`: Residual risk, authority, duration, supervision, and AAR trigger.
- `approval-consumption-runner.js`: Cross-checks the mission/action/tool/target/time/evidence between an approval scope and a consumption event.
- `run-approval-consumption-fixtures.js`: Active consumption, target mismatch, and reused-approval fixtures.
- `approval-revocation-runner.js`: Cross-checks the active status/authority/time/notification/evidence between an approval scope and a revocation event.
- `run-approval-revocation-fixtures.js`: Active revocation, consumed revocation, and wrong-authority fixtures.
- `approval-renewal-runner.js`: Cross-checks the active status/authority/window/execution-count/evidence between an approval scope and a renewal event.
- `run-approval-renewal-fixtures.js`: Active renewal, expired renewal, and scope-expansion fixtures.
- `approval-delegation-runner.js`: Cross-checks the authority matrix against the delegation event's base rule/ROE/risk/context/subdelegation limits.
- `run-approval-delegation-fixtures.js`: Bounded delegation, staff retained-authority attempt, and Red base-rule delegation fixtures.
- `approval-delegation-revocation-runner.js`: Cross-checks the status/authority/time/snapshot/evidence between a delegation event and a termination event.
- `run-approval-delegation-revocation-fixtures.js`: Commander revocation, recorder expiry projection, and staff revocation attempt fixtures.
- `policy-engine-authority-integration.js`: Composite gate over policy, authority matrix, approval scope, and risk acceptance.
- `run-authority-integration-fixtures.js`: Fixtures blocking reuse of a consumed approval and blocking a missing risk acceptance.
- `policy-engine-release-integration.js`: Composite gate over the authority gate and release review.
- `run-release-integration-fixtures.js`: Valid release, missing review, invalid review, and authority-blocked release fixtures.
- `release-gate-decision-runner.js`: Cross-checks the final decision/snapshot/evidence between the release integration output and a release gate decision event.
- `run-release-gate-decision-fixtures.js`: Release allow, missing-review allow claim, and authority-blocked release event fixtures.
- `release-gate-dashboard-runner.js`: Projects the ReleaseGateDecided event into the release/authority/review dashboard queue.
- `run-release-gate-dashboard-fixtures.js`: Released, release-review-blocked, and authority-blocked projection fixtures.
- `dashboard-ui-prototype/release-gate-dashboard-state.json`: Release gate dashboard projection state.
- `maintenance-dashboard-runner.js`: Converts a maintenance readiness report into a ready/degraded/down dashboard projection.
- `run-maintenance-dashboard-fixtures.js`: Ready, degraded, and unavailable sustainment projection fixtures.
- `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`: Sustainment readiness dashboard projection state.
- `authority-delegation-projection-runner.js`: Converts a delegated approval authority lifecycle event into a dashboard projection.
- `run-authority-delegation-projection-fixtures.js`: Active, revoked, and expired delegation projection fixtures.
- `dashboard-ui-prototype/authority-delegation-projection-state.json`: Active/revoked/expired delegated authority dashboard state.
- `source-map-linter.js`: Verifies new URLs and source-map coverage.
- `source-map-url-coverage-report.json`: Source-map coverage snapshot by official source host.
- `aar-to-readiness-update.js`: Converts an AAR finding into a readiness recommendation and follow-up action.
- `schema-files/aar-readiness-update.schema.json`: AAR readiness update contract.
- `run-aar-readiness-update-fixtures.js`: Normal improvement, critical source failure, and sustain-only AAR fixtures.
- `schema-files/annex.schema.json`: Contract separating the OPORD body from role-specific annex detail.
- `schema-files/frago-scope-change.schema.json`: FRAGO contract separating a mission scope/authority change from an annex update.
- `rehearsal-to-ccir-router.js`: Converts rehearsal friction points and decision points into a CCIR alert/decision packet.
- `run-rehearsal-to-ccir-fixtures.js`: Medium/high/sensitive rehearsal routing fixtures.
- `ai-special-operations-tf.md`: Converts US SOF principles into an operating model for an AI high-risk task force.
- `schema-files/sof-tf-charter.schema.json`: Contract for SOF TF activation, cell separation, context isolation, enabler, and rehearsal.
- `sof-tf-activation-runner.js`: Projects the SOF TF charter into go/no-go, approval gate, context distribution, and preflight block.
- `run-sof-tf-fixtures.js`: Valid SOF TF activation and blocked-unbounded-TF fixtures.
- `interdepartment-collaboration-policy.md`: Converts branch/functional integration principles into a policy for supported/supporting relationships, liaison, handoff, and conflict routing between departments.
- `schema-files/department-collaboration-charter.schema.json`: Contract for department relationship, liaison, synchronization, and conflict route.
- `department-collaboration-runner.js`: Projects the collaboration charter into a relationship edge, missing liaison, commander queue, and preflight block.
- `run-department-collaboration-fixtures.js`: Valid cross-functional collaboration and blocked-siloed-collaboration fixtures.
- `force-structure-change-policy.md`: Converts force management principles into a policy for AI branch/duty-position/unit/TF activation, deactivation, expansion, and reduction.
- `schema-files/force-structure-change-order.schema.json`: Contract for capability gap, DOTMLPF-P, authority, readiness, transition, and documentation update.
- `force-structure-change-runner.js`: Projects a force structure change order into preflight block, commander queue, transition task, documentation queue, and readiness requirement.
- `run-force-structure-change-fixtures.js`: Justified organization activation and blocked-unjustified-expansion fixtures.
- `role-document-access-policy.md`: Need-to-know document access policy that lets each role read only the documents matching its duty and authority.
- `schema-files/document-access-manifest.schema.json`: Document access manifest contract per mission.
- `document-access-runner.js`: Cross-checks the manifest against role/duty/authority to generate an allowed/denied document projection.
- `run-document-access-fixtures.js`: S2/Executor/S6 document access and blocked-overbroad-access fixtures.
- `information-to-operations-cycle.md`: Procedure by which information collection/assessment converts into a running estimate, CCIR, SITREP, decision packet, and FRAGO.
- `schema-files/information-report.schema.json`: Raw information intake, source reliability, CCIR candidate, and handling metadata.
- `schema-files/intelligence-assessment.schema.json`: Contract for confidence, CCIR classification, operational impact, and recommended output.
- `information-to-operations-router.js`: Converts information reports/assessments into operational outputs.
- `run-information-to-operations-fixtures.js`: Order-changing, FFIR, and EEFI routing regression fixtures.
- `personnel-continuity-model.md`: Model for role continuity, succession, vital records, degraded mode, and rotation gate.
- `schema-files/continuity-plan.schema.json`: Contract for essential function, successor chain, vital records, and degraded mode.
- `continuity-drill-runner.js`: Converts a role loss/rotation event into successor activation and paused functions.
- `run-continuity-drill-fixtures.js`: Commander unavailable and S6 rotation continuity drill fixtures.
- `multinational-doctrine-consistency-review.md`: Audit document that cross-checks US-centric assumptions against official NATO/UK/Canada/Korea sources.
- `schema-files/doctrine-consistency-review.schema.json`: Contract for source family coverage, policy finding, and resolution control.
- `doctrine-consistency-runner.js`: Projects the doctrine consistency review into source coverage, unresolved conflict, and policy update queue.
- `run-doctrine-consistency-fixtures.js`: Valid multinational review and US-only invalid review fixtures.

Next:

1. The current deep research/documentation/runtime contract queue is left in a completed state.
2. Once access to the official Australian ADF doctrine site is secured, review adding a multinational source family.
3. The next expansion is opened as a separate queue once the user assigns a new priority.

## 6. Research Operating SOP

When adding a new source:

1. Mark whether the source is official/educational/academic/informal.
2. Summarize in one sentence the military concept it directly supports.
3. Keep the LLM application in a separate sentence.
4. Link it in `source-map.md`.
5. Store detailed notes in `research-compendium.md`.
6. Reflect it in schema, fixture, or prototype where needed.

When creating a new document:

1. First select a research question from this queue.
2. Link at least two related sources.
3. Do not mix the military concept with the LLM interpretation.
4. Leave candidate executable artifacts at the end.

## 7. Major Source Bundles

Command and planning:

- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- JP 3-0, Joint Campaigns and Operations: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/
- ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715
- FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- STANAG 2014, Formats for Orders: https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf

Staff integration and knowledge:

- Joint Headquarters Organization, Staff Integration, and Battle Rhythm: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_hq_org_fp.pdf
- Chief of Staff Roles and Functions: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/cos_fp.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507
- CJCSI 5780.01 Knowledge Management: https://www.jcs.mil/Portals/36/Documents/Library/Instructions/CJCSI%205780.01.pdf

Decision, authority, assessment:

- CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- Assessment and Risk Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/assessment_risk2020.pdf?ver=2020-03-31-150705-920
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf

Rehearsal and interoperability:

- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf
- Commander and Staff Guide to Mission Partner Environment: https://api.army.mil/e2/c/downloads/2025/04/29/59b51ef8/no-25-1004-commander-and-staff-guide-to-mission-partner-environment-apr-25.pdf
- Commander and Staff Guide to Multinational Interoperability: https://api.army.mil/e2/c/downloads/2023/01/31/3dadfaa2/20-12.pdf
- Interorganizational Cooperation Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/interorgan_coop_fp.pdf

Special operations:

- JP 3-05, Special Operations: https://www.jcs.mil/Doctrine/DOCNET/JP-3-05-Special-Operations/
- FM 3-05, Army Special Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44116-FM_3-05-000-WEB-1.pdf
- USSOCOM SOF Truths: https://www.socom.mil/about/sof-truths
- USSOCOM Core Activities: https://www.socom.mil/about/core-activities

Force management:

- AR 71-32, Force Development and Documentation: https://history.army.mil/Portals/143/Images/Covid/PDF/r71_32.pdf
- DA PAM 71-32 / Army Force Management School digital library: https://www.afms.edu/digitallibrary.html
- How the Army Runs reference material: https://warroom.armywarcollege.edu/reference-materials/
- Force Management Functional Area, DA PAM 600-3 excerpt: https://api.army.mil/e2/c/downloads/2024/04/03/1074fa08/force-management-fa-50-da-pam-600-3.pdf

Multinational doctrine consistency:

- NATO/Allied Joint Doctrine AJP-01 official GOV.UK page: https://www.gov.uk/government/publications/ajp-01-d-allied-joint-doctrine
- UK Defence Doctrine JDP 0-01: https://www.gov.uk/government/publications/uk-defence-doctrine-jdp-0-01
- UK Joint Operations Doctrine JDP 01: https://www.gov.uk/government/publications/campaigning-a-joint-doctrine-publication
- Canadian Armed Forces public page: https://www.canada.ca/en/services/defence/caf.html
- DND reports and publications: https://www.canada.ca/en/department-national-defence/corporate/reports-publications.html
- CAF Ethos, Trusted to Serve: https://www.canada.ca/en/department-national-defence/corporate/reports-publications/canadian-armed-forces-ethos-trusted-to-serve.html
- Korean public anchors: https://www.mnd.go.kr/, https://www.law.go.kr/, https://www.kida.re.kr/

Training and sustainment:

- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716
- FM 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335
- ADP 4-0, Sustainment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796
- JP 4-0, Joint Logistics: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/

## 8. Current-Stage Conclusion

The framework's next direction of development is not "more prompt templates." The strength of military-style operations lies in the fact that document formats, authority, reporting, rehearsal, knowledge management, and AAR are bound together into a single loop.

The next iteration is therefore condensed into three items.

1. Fix the input the commander will provide into a handbook.
2. Mechanize authority and CCIR into schema/policy.
3. Make the event log and dashboard projection the runtime source of truth.
