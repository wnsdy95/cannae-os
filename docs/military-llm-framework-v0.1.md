# Military LLM Framework v0.1

## 0. Document Status

- Status: Draft
- Purpose: Translate the military's command and control, order dissemination, delegation of authority, reporting, and after-action review systems into practices for LLM usage and multi-agent operations.
- Core question: When higher intent is passed down to lower execution units, what must be documented, what must be approved, and what should be allowed to execute autonomously in order to reduce distortion?

## 1. Basic Perspective

A military's document system is not a simple transmission system. It is a system in which each subordinate unit rewrites the document into an executable form suited to its own environment, resources, and mission, while preserving the intent of the higher commander.

In this framework, LLM operation is viewed as follows.

| Military Concept | LLM Operation Concept |
|---|---|
| Commander's Intent | The user's ultimate objective, success conditions, and prohibited actions |
| Operation Order (OPORD) | Standard task instruction prompt |
| Warning Order (WARNO) | Advance preparation instruction, data-gathering instruction |
| Fragmentary Order (FRAGO) | Mid-course change instruction |
| Staff Organization | Role-based agents |
| CCIR | Critical information that must be reported immediately |
| Confirmation Brief | The stage where the AI first restates the mission as it understands it |
| Backbrief | The stage where the AI reports and confirms its detailed execution plan |
| Rehearsal | Pre-execution simulation, verification, and red-teaming |
| AAR | Post-task retrospective and SOP improvement |

## 2. Why Orders Are Disseminated Without Distortion

The reason a military's orders can be executed relatively stably even after passing through multiple layers is that the following mechanisms overlap.

### 2.1 Standard Terminology

Only when terminology is standardized can meaning be preserved as a document moves down through the layers. In the LLM framework as well, a glossary must be established first.

Example:

| Term | Definition |
|---|---|
| Mission | The specific task and purpose to be carried out |
| Intent | Why this mission is being carried out and what the success state is |
| Constraint | A condition that must be observed |
| Prohibited Line | An action the agent must never cross |
| CCIR | Critical information that requires the user's judgment |
| FRAGO | An order that partially changes an existing instruction |

### 2.2 Standard Document Format

An OPORD is normally composed of the following 5 paragraphs.

1. Situation: current situation, environment, adversary, friendly forces, constraints.
2. Mission: who, what, when, where, and why.
3. Execution: how it will be carried out, intent, concept, detailed tasks.
4. Sustainment: resources, data, tools, cost, support.
5. Command and Signal: reporting lines, approval authority, communication methods, method of change.

The LLM OPORD uses the same structure.

### 2.3 Preserving Higher Intent

A subordinate unit does not simply copy the higher-level document verbatim. It rewrites it to fit its own situation. However, the higher intent and success conditions must be preserved.

In LLM operations, the following items are designated as "items that must not be altered."

| Item Not to Be Altered | Description |
|---|---|
| Ultimate Objective | The result the user actually wants to obtain |
| Success Conditions | What constitutes success |
| Prohibited Conditions | Things that must not be done |
| Quality Standards | Level of accuracy, evidence, format, and verification |
| Approval Conditions | Whether user approval is required before execution |

Conversely, the following items may be rewritten by the subordinate agent.

| Item That May Be Rewritten | Description |
|---|---|
| Execution Order | May be adjusted if a better sequence exists |
| Detailed Method | May be chosen as long as the purpose is maintained |
| Intermediate Output Format | May be changed to improve final quality |
| Role Allocation | May be adjusted according to each agent's strengths |

### 2.4 Confirmation Brief and Backbrief

Distortion occurs most frequently immediately after an order is received. That is why the following two steps are needed before execution.

| Stage | Purpose | LLM Application |
|---|---|---|
| Confirmation Brief | Immediately confirm that the order was understood correctly | "The goal/constraints/output I understand are as follows" |
| Backbrief | Explain the detailed plan to the superior after it has been created | "I will execute in this order, and manage this risk in this way" |

### 2.5 Rehearsal and Red Team

Hidden contradictions surface when a document is converted into actual execution. Pre-execution rehearsal is a procedure for finding gaps, conflicts, and risks in the plan.

In LLM operations, this is implemented as follows.

- Simulate the execution plan step by step.
- Write down the input, output, and failure conditions for each step.
- A red team agent reviews assumptions, evidence, omissions, and overconfidence.
- If the risk is significant, do not execute; instead switch to a FRAGO or user approval.

## 3. Command Hierarchy and Agent Roles

What matters more than rank itself is duty position, command relationship, delegated authority, and reporting standards. LLM systems must also define responsibilities by role first.

| AI Position | Military Equivalent | Primary Duty |
|---|---|---|
| Commander | Commander | Ultimate objective, intent, risk tolerance, approval |
| Chief of Staff | Chief of Staff | Overall coordination, task decomposition, conflict resolution |
| S2 Intelligence | Intelligence Officer | Data collection, source verification, uncertainty management |
| S3 Operations | Operations Officer | Execution plan, phasing, prioritization, synchronization |
| S4 Sustainment | Logistics/Support Officer | Resources, tools, cost, sustainability |
| S6 Signal | Signal Officer | Channels, reporting methods, logs, status sharing |
| Red Team | Independent Review Team | Review of errors, hallucinations, vulnerabilities, counterexamples |
| Executor | Executing Unit | Writing code, drafting documents, running analysis |
| Recorder | Record Keeper | Decision log, change history, AAR |

## 4. Approval Scope

Approval authority is determined not by "who ranks higher" but by "the risk of the action and the degree to which it can be reversed."

| Approval Tier | Autonomous Agent Execution | User Approval Required | Example |
|---|---|---|---|
| L0 Observation | Possible | Not required | Reading files, summarizing data, drafting |
| L1 Reversible Task | Possible | Usually not required | Local draft edits, running tests |
| L2 Limited Execution | Conditionally possible | Depends on the situation | Code changes within a defined scope, document generation |
| L3 External Impact | Limited | Required | External API calls, incurring cost, deployment preparation |
| L4 Irreversible Task | Not permitted | Explicit approval required | Deletion, deployment, payment, public publication |
| L5 High-Risk Judgment | Not permitted | User or expert approval required | Major decisions involving legal, medical, financial, or security matters |

Conditions for autonomous execution:

1. It is consistent with higher intent.
2. It is within the scope of the order.
3. It can be reversed.
4. Cost, security, and legal risk are low.
5. It does not touch a CCIR reporting condition.
6. The level of evidence is sufficient.
7. Even if it fails, it will not significantly damage the overall objective.

## 5. Reporting Scope

If all information is reported, the commander cannot make decisions. Reporting must be limited to information that aids decision-making.

| Report Type | Timing | Content |
|---|---|---|
| SITREP | Periodic or at end of phase | Current status, progress, next actions |
| Exception Report | On deviation from the plan | Failure, delay, tool error, conflict |
| CCIR Report | Immediate | Critical changes requiring the user's judgment |
| Completion Report | On completion | Deliverables, verification results, remaining risk |
| AAR | Post-task | Intent, actual outcome, gap, improvements |

### 5.1 CCIR Criteria

The following must be reported immediately.

- The user's ultimate objective is ambiguous or in conflict.
- A key assumption has broken down.
- There is insufficient evidence but a definitive statement is required.
- Cost, security, or legal risk has arisen.
- An irreversible action is required.
- A change beyond the scope of the task is required.
- Conclusions among agents conflict.
- Reliable sources contradict each other.

## 6. Areas of Autonomous Judgment and Execution

Agents have autonomy in the following areas.

| Area | Autonomous Judgment Allowed | Restriction |
|---|---|---|
| Data Research | Search terms, reading order, summarization method | Prohibited from asserting facts without a source |
| Document Writing | Structure, sentences, examples | Prohibited from changing the user's intent |
| Code Modification | Localized changes, adding tests | Deletions/large-scale structural changes must be reported |
| Verification | Tests, comparisons, checklists | Prohibited from concealing failures |
| Role Allocation | Splitting subordinate tasks | The responsible party and final approver must be maintained |
| Schedule Adjustment | Changing execution order | Prohibited from changing deadlines/goals |

## 7. After-Action Management

A task does not end with the completion report. After-action management leaves behind the following deliverables.

| Deliverable | Purpose |
|---|---|
| Decision Log | Who made what judgment, and why |
| Change Log | What instruction changed, and how |
| Evidence Map | Linking claims to their evidentiary sources |
| Risk Register | Remaining risks and responses |
| AAR | Lessons to be reflected in the next task |
| SOP Update | Incorporation into a repeatable procedure |

### 7.1 Basic AAR Questions

1. What was the original intent?
2. What actually happened?
3. Why did the gap occur?
4. What should be sustained?
5. What should be improved?
6. What should be reflected in the next SOP or prompt?

## 8. AI OPORD Template

```text
OPORD: [Task Name]

1. Situation
- Background:
- Current State:
- Available Resources:
- Constraints:
- Uncertainties:

2. Mission
- Who:
- What:
- By When:
- Where:
- Why:
- Success Conditions:

3. Execution
- Commander Intent:
- Execution Concept:
- Phases:
- Subordinate Tasks:
- Prohibited Actions:
- Quality Standards:
- Verification Method:

4. Sustainment
- Tools Needed:
- Data Needed:
- Cost/Token/Time Limits:
- Alternative Means:

5. Command and Signal
- Approval Required Conditions:
- Immediate Reporting Conditions:
- Periodic Reporting Cycle:
- Change Order Handling Method:
- Completion Report Format:
```

## 9. Backbrief Template

```text
BACKBRIEF

1. Ultimate Objective As I Understand It:
2. Intent/Constraints That Must Not Be Altered:
3. Mission Assigned to Me:
4. Execution Plan:
5. Anticipated Risks:
6. Questions Requiring Confirmation:
7. Scope That May Proceed Without Approval:
8. Scope Requiring Approval:
```

## 10. FRAGO Template

```text
FRAGO: [Change Order Number]

Reference Document:
Reason for Change:

1. Situation: No Change / Change Details
2. Mission: No Change / Change Details
3. Execution: No Change / Change Details
4. Sustainment: No Change / Change Details
5. Command and Signal: No Change / Change Details

Immediate Application:
Priority in Case of Conflict With Existing Instructions:
```

## 11. AAR Template

```text
AAR: [Task Name]

1. Expected
- Original Goal:
- Success Criteria:

2. Actual
- Actual Outcome:
- Verification Results:

3. Delta
- Gap:
- Cause:

4. Sustain
- Procedures to Maintain:

5. Improve
- Procedures to Improve:
- Reflection in the Next SOP:
```

## 12. Document Set

Current document set:

1. `military-llm-framework-v0.1.md`: Overall conceptual doctrine.
2. `military-operating-system.md`: Models military operating methods as an operating system.
3. `agent-roles-and-authority.md`: Approval authority, reporting lines, autonomy scope, and after-action management by agent.
4. `decision-risk-assessment.md`: CCIR, decision support, risk, assessment.
5. `prompt-templates.md`: Practical OPORD, WARNO, FRAGO, SITREP, AAR formats ready for use.
6. `orders-production-pipeline.md`: Converts a request into mission analysis, OPORD, task order, backbrief, rehearsal, execution, and AAR.
7. `opord-annex-model.md`: Separation of responsibility between the OPORD body and annexes.
8. `backbrief-and-rehearsal-sop.md`: SOP for pre-execution understanding confirmation and dry-run.
9. `sop-library.md`: Standard procedures for research, documentation, coding tasks, verification, deployment, and AAR.
10. `agent-battle-rhythm.md`: Reporting, synchronization, and decision cycle for single/multi-agent tasks.
11. `functional-domains.md`: Translates military warfighting functions, training, sustainment, targeting, and ROE into LLM operational functions.
12. `source-map.md`: Basis for mapping military documents to the LLM framework.
13. `case-studies.md`: Real-world application cases from OPORD through AAR.
14. `glossary.md`: Common dictionary of military terms and LLM operational terms.
15. `evaluation-metrics.md`: Measurement metrics for AI METL, MOP/MOE, and readiness rating.
16. `experiments.md`: Comparative experiment design for military-style LLM operating methods.
17. `korean-military-sources.md`: Application notes on Republic of Korea military public materials, statutes, policy, and KIDA materials.
18. `implementation-guide.md`: Implementation guide for actual LLM app/agent runtimes.
19. `prompt-dsl.md`: Machine-readable schema for OPORD, WARNO, FRAGO, SITREP, AAR.
20. `tool-use-roe.md`: ROE for the use of file, shell, browser, API, DB, and deployment tools.
21. `llm-agent-org-chart.md`: Agent org chart, command relationships, RACI, reporting lines.
22. `korean-org-culture.md`: How to calibrate backbrief, reporting, Red Team, and approval processes for Korean organizational culture.
23. `reference-architecture.md`: Reference architecture for orchestrator, policy engine, tool gateway, and evidence store.
24. `sample-runtime-state.md`: Example state for mission, OPORD, task order, tool request, SITREP, AAR.
25. `prompt-dsl-validator.md`: Validation rules for OPORD/WARNO/FRAGO/SITREP/AAR.
26. `approval-ui-patterns.md`: User approval UI patterns before executing Amber/Red tools.
27. `schema-files/`: Actual JSON Schema for the Prompt DSL and runtime state.
28. `validator-prototype.md`: Pseudocode and test cases for the Prompt DSL validator.
29. `agent-runtime-playbook.md`: Actual runtime operating procedures and incident response.
30. `military-ai-risk-register.md`: Military-style list of AI operation risks and controls.
31. `agent-readiness-ledger.md`: Readiness rating and training plan per agent.
32. `sample-payloads/`: Valid/invalid JSON examples for testing schema and validator.
33. `policy-engine-rules.md`: Green/Amber/Red/Black ROE determination rules.
34. `command-post-dashboard.md`: Design of mission board, approval queue, CCIR, evidence viewer.
35. `runtime-automation-roadmap.md`: Implementation roadmap from the document framework to a tool-gated runtime.
36. `evaluation-fixtures.md`: Definition of regression test fixtures for validator/policy/evidence/runtime.
37. `validator-cli-prototype/`: Draft Node CLI executing a JSON Schema subset and semantic rules.
38. `dashboard-wireframes.md`: Screen wireframes for the command post dashboard.
39. `data-model.sql.md`: SQL storage model for mission/evidence/audit/readiness.
40. `runtime-demo-scenario.md`: End-to-end demo flowing from intake through AAR.
41. `source-reliability-rubric.md`: Criteria for evaluating source reliability and interpretation risk.
42. `validator-cli-prototype/run-fixtures.js`: Automatic runner for validator fixture expectations.
43. `policy-engine-prototype/`: Draft separating ROE determination functions into actual code.
44. `runtime-demo-payloads/`: Set of actual JSON payloads for the demo mission.
45. `dashboard-ui-prototype/`: Static HTML prototype of the command post dashboard.
46. `event-sourcing-model.md`: Design of the mission event log and projections.
47. `policy-engine-prototype/run-policy-fixtures.js`: Automatic test of expected policy engine decisions.
48. `runtime-demo-runner.js`: End-to-end runner for demo payloads and policy checks.
49. `dashboard-ui-prototype/dashboard-state.json`: JSON state for driving the dashboard prototype.
50. `event-fixtures/`: Demo event log for event sourcing replay.
51. `event-replay-prototype/`: Node prototype that replays the event log into a mission projection.
52. `dashboard-ui-prototype/render-state.js`: Converts the event replay projection into `dashboard-state.json` format.
53. `event-replay-prototype/run-event-fixtures.js`: Automatic verification of replay projection and dashboard conversion expectations.
54. `runtime-demo-payloads/opord.json`: OPORD payload for the demo mission.
55. `military-operating-deep-research-queue.md`: Queue of missing military operating areas and next research deliverables.
56. `commander-handbook.md`: Practical guide for a human operating as an AI commander regarding intent, authority, approval, and reporting.
57. `b2c2wg-operating-model.md`: Multi-agent operating model for boards, bureaus, centers, cells, working groups.
58. `ccir-alerting-model.md`: Converts PIR/FFIR/EEFI/decision points into dashboard alerts and routing.
59. `opsec-classification-model.md`: Control model for context sharing, EEFI, releasability, and sensitive output.
60. `knowledge-management-sop.md`: Operating procedure for decision log, evidence store, event log, and handoff packet.
61. `agent-metl.md`: Role-based mission essential task list and its connection to readiness-to-authority.
62. `schema-files/authority-matrix.schema.json`: Authority matrix schema based on role/task/tool/target/risk/readiness.
63. `sample-payloads/valid-authority-matrix.json`: Valid authority matrix fixture.
64. `sample-payloads/invalid-authority-matrix-red-without-approver.json`: Fixture for Red authority semantic validation.
65. `schema-files/decision-packet.schema.json`: Schema for the option/risk/evidence/authority packet presented to the commander board.
66. `schema-files/working-group.schema.json`: Schema for B2C2WG charter and disband conditions.
67. `schema-files/ccir-alert.schema.json`: Schema for the alert object and routing contract.
68. `schema-files/handoff-packet.schema.json`: Schema for the packet that conveys current state before a context transition.
69. `alert-router-prototype/`: Node prototype converting the event log into a CCIR alert projection.
70. `readiness-gate-prototype/`: Prototype combining the authority matrix and readiness rating to determine execution rights.
71. `context-releasability-policy.md`: Role-based context packet filtering and EEFI release policy.
72. `schema-files/context-item.schema.json`: Schema for classification, EEFI, allowed roles, and final release metadata.
73. `schema-files/release-review.schema.json`: Schema for final output/external release review.
74. `context-filter-prototype/`: Generator for role-based raw/summary/redacted/reference/denied context packets.
75. `handoff-generator.js`: Generates a handoff packet from event replay and alert projections.
76. `decision-packet-linter.js`: Validator for board packet option/risk/evidence/deadline.
77. `event-fixtures/working-group-event-fixtures.json`: Event log for WG opened/prepared/decided/closed.
78. `maintenance-readiness-model.md`: Model of tool/resource availability and sustainment readiness.
79. `schema-files/maintenance-readiness.schema.json`: Schema for the critical asset readiness report.
80. `schema-files/backbrief.schema.json`: Schema for the task owner's restatement of intent/task/stop condition/approval boundary.
81. `schema-files/rehearsal.schema.json`: Schema for execution sequence, friction point, decision point, and disposition.
82. `schema-files/approval-scope.schema.json`: Metadata for single-use approval, expiry, rollback, evidence, and consumption.
83. `schema-files/approval-consumption-event.schema.json`: Audit event schema for when a scoped approval is actually consumed by execution.
84. `schema-files/approval-revocation-event.schema.json`: Audit event schema for when a scoped approval is revoked before execution.
85. `schema-files/approval-renewal-event.schema.json`: Audit event schema for when only the validity period of a scoped approval is extended before execution.
86. `schema-files/approval-delegation-event.schema.json`: Audit event schema for delegating approval authority in a limited manner.
87. `schema-files/approval-delegation-revocation-event.schema.json`: Audit event schema for the projection of approval authority delegation revocation/expiration.
88. `schema-files/release-gate-decision-event.schema.json`: Audit event schema for the composite decision of execution approval and information release approval.
89. `schema-files/risk-acceptance.schema.json`: Residual risk, authority, duration, supervision, and AAR trigger.
90. `maintenance-readiness-runner.js`: Converts critical runner results into a readiness report.
91. `maintenance-dashboard-runner.js`: Converts the maintenance readiness report into a ready/degraded/down dashboard projection.
92. `run-maintenance-dashboard-fixtures.js`: Ready, degraded, and unavailable sustainment projection fixtures.
93. `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`: Sustainment readiness dashboard projection state.
94. `orders-dissemination-runner.js`: Verifier for connectivity among OPORD, task order, backbrief, and rehearsal.
95. `approval-consumption-runner.js`: Cross-checks the approval scope against the consumption event's mission/action/tool/target/time/evidence.
96. `approval-revocation-runner.js`: Cross-checks the approval scope against the revocation event's active status/authority/time/notification/evidence.
97. `approval-renewal-runner.js`: Cross-checks the approval scope against the renewal event's active status/authority/window/execution-count/evidence.
98. `approval-delegation-runner.js`: Cross-checks the authority matrix against the delegation event's base rule/ROE/risk/context/subdelegation restrictions.
99. `approval-delegation-revocation-runner.js`: Cross-checks the delegation event against the termination event's status/authority/time/snapshot/evidence.
100. `policy-engine-authority-integration.js`: Composite gate combining policy, authority matrix, approval scope, and risk acceptance.
101. `run-authority-integration-fixtures.js`: Fixtures for consumed-approval reuse and missing-risk-acceptance blocking.
102. `policy-engine-release-integration.js`: Composite gate combining the authority gate and release review.
103. `run-release-integration-fixtures.js`: Fixtures for valid release, missing review, invalid review, and authority-blocked release.
104. `release-gate-decision-runner.js`: Cross-checks the release integration output against the release gate decision event's final decision/snapshot/evidence.
105. `run-release-gate-decision-fixtures.js`: Fixtures for release allow, missing-review allow claim, and authority-blocked release events.
106. `release-gate-dashboard-runner.js`: Projects a ReleaseGateDecided event into a release/authority/review dashboard queue.
107. `run-release-gate-dashboard-fixtures.js`: Fixtures for released, release-review-blocked, and authority-blocked projections.
108. `dashboard-ui-prototype/release-gate-dashboard-state.json`: Release gate dashboard projection state.
109. `authority-delegation-projection-runner.js`: Converts the delegated approval authority lifecycle event into a dashboard projection.
110. `run-authority-delegation-projection-fixtures.js`: Fixtures for active, revoked, and expired delegation projections.
111. `dashboard-ui-prototype/authority-delegation-projection-state.json`: Delegated authority dashboard projection state.
112. `release-review-runner.js`: Compares the context filter output against the release review.
113. `dashboard-ui-prototype/working-group-projection-dashboard-state.json`: B2C2WG dashboard projection state.
114. `approval-scope-policy.md`: Policy for approval once, constraints, expiry, and rollback.
115. `risk-acceptance-authority.md`: Risk acceptance authority and commander retained authority.
116. `source-map-linter.js`: Verifies coverage of official source domains.
117. `source-map-url-coverage-report.json`: Snapshot of source-map coverage by official source host.
118. `aar-to-readiness-update.js`: Converts AAR findings into readiness/SOP/maintenance update recommendations.
119. `schema-files/aar-readiness-update.schema.json`: Contract for AAR readiness updates.
120. `run-aar-readiness-update-fixtures.js`: Fixtures for normal improvement, critical source failure, and sustain-only AAR.
121. `schema-files/annex.schema.json`: Contract separating the OPORD body from role-specific annex detail.
122. `schema-files/frago-scope-change.schema.json`: FRAGO contract separating mission scope/authority changes from annex updates.
123. `rehearsal-to-ccir-router.js`: Converts rehearsal friction points and decision points into CCIR alerts/decision packets.
124. `run-rehearsal-to-ccir-fixtures.js`: Fixtures for medium/high/sensitive rehearsal routing.
125. `ai-special-operations-tf.md`: Converts US SOF principles into an operating model for an AI high-risk task force.
126. `schema-files/sof-tf-charter.schema.json`: Contract for SOF TF activation, cell separation, enabler, isolation, and rehearsal.
127. `sof-tf-activation-runner.js`: Projects the SOF TF charter into go/no-go, approval gate, context distribution, and preflight block.
128. `run-sof-tf-fixtures.js`: Fixtures for valid SOF TF activation and blocking an unbounded TF.
129. `interdepartment-collaboration-policy.md`: Converts branch/function integration principles into an inter-departmental policy for supported/supporting, liaison, handoff, and conflict routing.
130. `schema-files/department-collaboration-charter.schema.json`: Contract for department relationship, liaison, synchronization, and conflict routing.
131. `department-collaboration-runner.js`: Projects the collaboration charter into relationship edges, missing liaison, commander queue, and preflight block.
132. `run-department-collaboration-fixtures.js`: Fixtures for valid cross-functional collaboration and blocking siloed collaboration.
133. `force-structure-change-policy.md`: Converts force management principles into a policy for establishing, disestablishing, expanding, or reducing AI branches/duty positions/units/TFs.
134. `schema-files/force-structure-change-order.schema.json`: Contract for capability gap, DOTMLPF-P, authority, readiness, transition, and documentation update.
135. `force-structure-change-runner.js`: Projects an organizational change order into preflight block, commander queue, transition task, documentation queue, and readiness requirement.
136. `run-force-structure-change-fixtures.js`: Fixtures for justified organizational establishment and blocking unsubstantiated expansion.
137. `information-to-operations-cycle.md`: Procedure by which information collection/evaluation is converted into CCIR, running estimate, SITREP, decision packet, and FRAGO.
138. `schema-files/information-report.schema.json`: Contract for raw information intake and handling metadata.
139. `schema-files/intelligence-assessment.schema.json`: Contract for assessed information's confidence, CCIR, and output routing.
140. `information-to-operations-router.js`: Converts information reports and assessments into operational deliverables.
141. `run-information-to-operations-fixtures.js`: Fixtures for order change, FFIR SITREP, and EEFI release-block routing.
142. `personnel-continuity-model.md`: Continuity model in which duty positions and authority carry over even through personnel loss/replacement/rotation.
143. `schema-files/continuity-plan.schema.json`: Contract for essential function, successor chain, vital records, and degraded mode.
144. `continuity-drill-runner.js`: Converts a role loss/rotation event into successor activation and paused functions.
145. `run-continuity-drill-fixtures.js`: Continuity drill fixtures for Commander unavailable and S6 rotation.
146. `role-document-access-policy.md`: Need-to-know document access policy that allows only designated documents to be read according to role, duty, and authority.
147. `schema-files/document-access-manifest.schema.json`: Contract for the per-mission document access manifest.
148. `document-access-runner.js`: Cross-checks the manifest against role/duty/authority to produce an allowed/denied document projection.
149. `run-document-access-fixtures.js`: Fixtures for S2/Executor/S6 document access and blocking overbroad access.
150. `multinational-doctrine-consistency-review.md`: Audit document that cross-checks US-centric assumptions against NATO/UK/Canadian/Korean official sources to reconcile them into aliases, jurisdiction gates, and policy dispositions.
151. `schema-files/doctrine-consistency-review.schema.json`: Contract for source family coverage, policy finding, resolution control, and documentation update.
152. `doctrine-consistency-runner.js`: Projects the doctrine consistency review into coverage, unresolved conflict, and policy update queue.
153. `run-doctrine-consistency-fixtures.js`: Verification of valid multinational review and US-only invalid review fixtures.
154. `research-compendium.md`: Integrated repository of research materials and interpretations.
155. `model-force-assignment-policy.md`: Mission-based allocation policy for deterministic, line, specialist, command, SOF, assurance, and reserve model profiles.
156. `schema-files/model-force-assignment-plan.schema.json`: Contract separating model readiness and capability from billet role and authority.
157. `model-force-assignment-runner.js`: Projects active model billets, escalation paths, assurance, PACE, resource summary, and preflight blocks.
158. `run-model-force-assignment-fixtures.js`: Fixtures for a validated mixed force and an unsafe model monoculture.

Next documentation tasks:

1. The current deep research/documentation/runtime contract queue remains in a completed state.
2. The next expansion will be opened as a separate queue once the user specifies new priorities.

## 13. References

- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- JP 3-0, Joint Campaigns and Operations: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/
- ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715
- FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282
- JP 3-05, Special Operations: https://www.jcs.mil/Doctrine/DOCNET/JP-3-05-Special-Operations/
- FM 3-05, Army Special Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44116-FM_3-05-000-WEB-1.pdf
- USSOCOM SOF Truths: https://www.socom.mil/about/sof-truths
- NATO/Allied Joint Doctrine AJP-01 official GOV.UK page: https://www.gov.uk/government/publications/ajp-01-d-allied-joint-doctrine
- UK Defence Doctrine JDP 0-01: https://www.gov.uk/government/publications/uk-defence-doctrine-jdp-0-01
- Canadian Armed Forces public page: https://www.canada.ca/en/services/defence/caf.html
- USSOCOM Core Activities: https://www.socom.mil/about/core-activities
- AR 71-32, Force Development and Documentation: https://history.army.mil/Portals/143/Images/Covid/PDF/r71_32.pdf
- DA PAM 71-32 / Army Force Management School digital library: https://www.afms.edu/digitallibrary.html
- How the Army Runs reference material: https://warroom.armywarcollege.edu/reference-materials/
- Force Management Functional Area, DA PAM 600-3 excerpt: https://api.army.mil/e2/c/downloads/2024/04/03/1074fa08/force-management-fa-50-da-pam-600-3.pdf
- Federal Continuity Directive planning framework: https://www.fema.gov/sites/default/files/documents/fema_federal-continuity-directive-planning-framework.pdf
- JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- JCS Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- JCS Joint Task Force and Command and Control Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf
- STANAG 2014, Formats for Orders: https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf
- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf
- DoD Terminology Program: https://www.jcs.mil/doctrine/dod-terminology-program/
- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716
- FM 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335
- ADP 4-0, Sustainment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796
- JP 4-0, Joint Logistics: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/
- JP 3-60, Joint Targeting: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/
- FM 3-60, Army Targeting: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1030750
- FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282
- ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715
- Republic of Korea Ministry of National Defense public materials: https://www.mnd.go.kr/
- Korea Law Information Center (National Law Information Center): https://www.law.go.kr/
- Korea Institute for Defense Analyses (KIDA): https://www.kida.re.kr/
