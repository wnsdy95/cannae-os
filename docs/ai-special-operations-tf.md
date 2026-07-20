# AI Special Operations Task Force

## 0. Purpose

This document references U.S. military SOF material to define an "AI Special Operations TF" operating model.

Here, SOF does not mean mimicking actual military tactics. It is a small, highly-skilled, highly-verified, highly-enabled task force model used in LLM/agent operations for tasks such as:

- Tasks with high time-sensitivity and high failure cost
- Tasks entangled with sensitive context, release review, and approval boundaries
- Tasks where a normal agent workflow would incur large coordination cost
- Tasks requiring strong source discipline, tool discipline, and AAR

Core conversion:

```text
SOF = small, selected, trained, enabled, mission-commanded force
AI SOF TF = small, selected, tested, tool-enabled, commander-bounded agent team
```

Multinational-application caution:

- The SOF Truths and core activities in this document are US-derived heuristics taken from official USSOCOM material.
- Do not present them as representative of another nation's special-operations doctrine.
- For multinational/civilian application, `AI SOF TF` may be aliased as `high-risk task force` or `protected incident cell`; the actual name should be set after a local doctrine review.

## 1. Official Source Anchors

- JP 3-05, Special Operations: https://www.jcs.mil/Doctrine/DOCNET/JP-3-05-Special-Operations/
- FM 3-05, Army Special Operations, June 2025: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44116-FM_3-05-000-WEB-1.pdf
- USSOCOM SOF Truths: https://www.socom.mil/about/sof-truths
- USSOCOM Core Activities: https://www.socom.mil/about/core-activities
- USSOCOM Army Special Operations Command page: https://www.socom.mil/ussocom-enterprise/components/army-special-operations-command

## 2. Converting SOF Truths into AI Operating Principles

| SOF Truth | AI SOF TF Principle | Runtime Application |
| --- | --- | --- |
| Humans are more important than hardware | Human intent, approval, and review matter more than the model | Retain Commander/user authority |
| Quality is better than quantity | A few verified agents are better than many | Deploy only agents at or above task readiness T/P |
| SOF cannot be mass produced | A highly-skilled agent workflow cannot be created on the spot | Accumulate via SOP, fixture, rehearsal, AAR |
| Competent SOF cannot be created after emergencies occur | Roster and gates must exist before an emergency | Maintain a standing TF template and preflight checks |
| Most special operations require non-SOF support | Even an elite executor fails without enablers | Attach S2/S4/S6/Red Team/release reviewer |

## 3. Conditions Requiring an AI SOF TF

Use an AI SOF TF rather than a normal agent workflow when:

- There is tool risk close to Red/Black.
- There is external release, credential, production, or legal/compliance risk.
- Source conflict, hallucination risk, or adversarial prompt risk is high.
- The mission is short but requires integrating multiple functions simultaneously.
- Failure would require rollback, an incident SITREP, or a commander decision.

Do not use it for:

- A simple Green file edit.
- Summarizing a single document.
- Rapidly producing a large volume of output without verification.
- Autonomous execution while the authority boundary is unclear.

## 4. AI SOF TF Organization

| Position | Role | Authority | Deliverable |
| --- | --- | --- | --- |
| Commander/User | Intent, end state, retained authority | Approve/reject/FRAGO/risk acceptance | Commander intent, decision packet |
| TF Lead / CoS | Mission integration, battle rhythm, CCIR | Tasking, pause, escalate | TF charter, SITREP |
| S2 Recon Cell | Source discovery, claim verification, threat/context analysis | Judge source confidence, block unsupported claims | Source annex, evidence packet |
| S3 Execution Cell | Tool sequence, implementation, dry run | Green execution, Amber report | Task order, execution log |
| S4/S6 Enabler Cell | Tool/resource/context readiness, fallback, environment | Degraded mode, repair task | Maintenance report, PACE |
| OPSEC/Release Reviewer | EEFI, releasability, final output review | Release block/review pass | Release review |
| Red Team | Failure mode, hallucination, abuse-case review | Critical finding, no-go recommendation | Red-team findings |
| Recorder/KM | Source of truth, event log, handoff | Audit integrity | Event log, handoff packet, AAR |

Principle: an AI SOF TF is not a "strong executor" but "a small team placed under strong integration and control."

## 5. Safe AI Mapping of Core Activities

| USSOCOM Core Activity | AI SOF TF Mapping | Line Not to Cross |
| --- | --- | --- |
| Direct Action | Narrow-scope, high-risk code/tool action | No production/credential action without approval |
| Special Reconnaissance | Verification of sensitive or uncertain source/context | No asserting a claim as certain without a source |
| Foreign Internal Defense / Security Force Assistance | Training the user's team/agent workflow and building SOPs | No autonomous decision-making that bypasses the user |
| Civil Affairs | Analysis of stakeholders, dependencies, and human impact | Do not hide impact on people/organizations |
| Military Information Support Operations | Honest user-facing communication, change-adoption support | No persuasion aimed at deception, manipulation, or concealment |
| Counterterrorism / Counter-proliferation analogy | Blocking abuse cases, exploits, secret leakage, harmful output | No conversion into actual harmful tactics or targeting |
| Foreign Humanitarian Assistance analogy | Incident recovery, user support, service restoration | No unauthorized data access |

## 6. TF Lifecycle

```text
1. Activate
   - Confirm commander intent, trigger, urgency, retained authority

2. Select
   - Confirm agent readiness, tool readiness, source access, release risk

3. Isolate
   - Set up need-to-know context packet, EEFI, allowed roles

4. Plan
   - OPORD + annex + approval scope + PACE + CCIR

5. Backbrief / rehearse
   - Task owner restates intent, stop condition, approval boundary
   - Route friction points to CCIR/decision packet

6. Execute
   - Green executes, Amber reports, Red requires approval, Black is prohibited

7. Extract / handoff
   - Record result, evidence, unresolved risk, rollback state

8. AAR / reset
   - Readiness update, SOP update, TF disband or standing watch
```

## 7. Activation Charter

An AI SOF TF does not begin without the following charter.

```yaml
ai_sof_tf:
  id: SOF-TF-001
  mission_id: M-...
  trigger: "Why a TF is needed instead of a normal workflow"
  commander_intent:
    purpose:
    end_state:
    failure_to_avoid:
  authority:
    allowed:
    approval_required:
    prohibited:
    retained_by_commander:
  cells:
    lead:
    s2_recon:
    s3_execution:
    s4_s6_enabler:
    opsec_release:
    red_team:
    recorder:
  ccir:
    pir:
    ffir:
    eefi:
    decision_points:
  exit_criteria:
    success:
    abort:
    handoff:
```

This repository has `schema-files/sof-tf-charter.schema.json`, which machine-validates this charter. A valid charter must separate out the following properties.

- `trigger`: the reason the normal workflow is insufficient, and the risk/urgency.
- `activity_mapping`: mapping the SOF core activity to a safe AI operating analogy.
- `authority`: allowed, approval required, prohibited, and commander-retained authority.
- `cells`: lead, S2, S3, S4/S6, OPSEC/release, Red Team, Recorder.
- `ccir`: PIR, FFIR, EEFI, decision point.
- `isolation`: need-to-know context packet and EEFI control.
- `enablers`: source-map, release review, maintenance readiness, fallback.
- `rehearsal`: backbrief, rehearsal, dry run, go/no-go authority.
- `exit_criteria`: success, abort, handoff.

Order of use:

```text
1. Write the SofTfCharter
2. Validate the activation contract with the validator
3. Generate a go/no-go projection with the activation runner
4. If go, transition into OPORD/task/backbrief/rehearsal
5. If no-go, send the preflight block to a decision packet or an S3/S6/Recorder task
```

## 8. Scope of Authority

| Action | Default Authority |
| --- | --- |
| Local draft, source search, schema validation | Green |
| Large context reshaping, broad file edits, degraded fallback | Amber |
| Production mutation, credential use, external release, irreversible change | Red |
| Secret exfiltration, unauthorized access, deception/manipulation, harmful instruction | Black |

Commander-retained authority:

- Approving a Red action
- Approving external disclosure/release
- Accepting high/critical residual risk
- Issuing a FRAGO to change mission scope
- Disbanding the TF or converting it to a standing watch

## 9. Connecting AI SOF TF to Existing Runtime Artifacts

| TF Function | Existing Artifact |
| --- | --- |
| Mission command | `docs/commander-handbook.md` |
| Source discipline | `docs/source-map.md`, `source-map-linter.js` |
| Authority gate | `policy-engine-authority-integration.js` |
| Release gate | `policy-engine-release-integration.js`, `release-review-runner.js` |
| Sustainment | `maintenance-readiness-runner.js`, `maintenance-dashboard-runner.js` |
| Backbrief/rehearsal | `orders-dissemination-runner.js`, `rehearsal-to-ccir-router.js` |
| Event/handoff | `event-replay-prototype/`, `handoff-generator.js` |
| AAR/readiness | `aar-to-readiness-update.js` |
| SOF TF activation | `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js`, `run-sof-tf-fixtures.js` |

## 10. Activation Runner

`sof-tf-activation-runner.js` converts a `SofTfCharter` into a pre-execution projection.

```bash
node sof-tf-activation-runner.js sample-payloads/valid-sof-tf-charter.json
```

The output produces the following items.

- `activation_decision`: `go` or `no_go`.
- `active_cells`: the cells and roles actually deployed.
- `context_distribution`: the need-to-know packet, or redacted/denied.
- `approval_gates`: approval_required and commander-retained decisions.
- `required_support`: source-map, release review, maintenance readiness, fallback.
- `preflight_blocks`: blockers that must be resolved before execution.
- `commander_queue`: decision points.
- `recorder_actions`: event log, source-map delta, handoff, AAR/readiness update.

An SOF TF does not execute while `preflight_blocks` remain. In this model, "special" does not mean a fast bypass of controls; it means attaching stronger pre-execution verification to a high-risk mission.

## 11. Prompt Template

```text
You are operating as an AI Special Operations Task Force, not as a single general assistant.

Mission:
- Purpose:
- End state:
- Failure to avoid:

Authority:
- Allowed:
- Approval required:
- Prohibited:
- Commander-retained decisions:

Cells:
- S2: verify sources and uncertainty.
- S3: sequence execution and tool calls.
- S4/S6: check tool/resource/context readiness and fallback.
- OPSEC/Release: filter EEFI and release risk.
- Red Team: identify failure modes and abuse cases.
- Recorder: preserve evidence, event log, handoff, AAR.

Rules:
1. Do not execute Red actions without approval.
2. Do not release restricted/sensitive context without release review.
3. Convert friction points into CCIR alerts or decision packets.
4. Stop on Black actions.
5. End with evidence, unresolved risk, AAR, and readiness update.
```

## 12. Anti-patterns

- Loosening control under the name of "special operations."
- Launching many agents and leaving coordination to chance.
- Reinforcing only the executor without a source/release/authority reviewer.
- Trying to improvise an elite workflow only after an emergency has occurred.
- Handling a high-risk task "quickly because it's a small team."
- Disbanding without an AAR, repeating the same failure.

## 13. Conclusion

The core of an AI SOF TF is not secretive or aggressive action. The core is a small team, strict selection, sufficient training, strong enablers, clear authority, rapid reporting, and post-action readiness updates.

In LLM operations, this model is summarized in one sentence:

> High-risk, high-uncertainty missions need not more autonomy, but a smaller team, stronger control, better support, and a faster decision loop.
