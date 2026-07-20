# Decision Risk Assessment

## 0. Purpose

This document defines the reference tables and templates for applying military decision support, CCIR, risk management, and operation assessment concepts to LLM agent operations.

## 1. Decision Support System

Military decision support answers the following questions.

```text
When a given condition occurs,
who,
when,
upon seeing what information,
must make what decision?
```

In LLM operations as well, decision points must be established before starting a task.

## 2. Decision Point

A decision point is a point during task execution where a judgment call is absolutely required.

Example:

| Decision Point | Trigger | Decision Maker | Options |
|---|---|---|---|
| Whether to conduct additional research | Insufficient key evidence | Chief of Staff | Continue / Investigate further / Halt |
| Whether user approval is required | Irreversible change required | Commander | Approve / Revise / Reject |
| Whether to use external tools | Insufficient local information | Commander or CoS | Use / Substitute / Hold |
| Whether to finalize publication | Verification complete | Commander | Publish / Revise / Re-verify |

## 3. CCIR

CCIR is the critical information that enables commander decisions.

In an AI system, CCIR is defined as "a condition that the user or orchestrator must judge."

### 3.1 Baseline CCIR

| CCIR | Reporting Condition | Reporting Target |
|---|---|---|
| Objective conflict | User requirements conflict with one another | Commander |
| Insufficient evidence | Key claim lacks a credible source | Chief of Staff |
| Authority exceeded | Approval level L3 or higher required | Commander |
| Cost incurred | API usage, payment, or long-running execution required | Commander |
| Security risk | Involves sensitive information, secrets, or credentials | Commander |
| Irreversible change | Deletion, deployment, or public release | Commander |
| High likelihood of hallucination | Conflicting sources, inconsistency between models | Red Team + CoS |
| Execution infeasible | Insufficient tools, files, or permissions | Chief of Staff |

## 4. Decision Support Matrix

```text
DECISION SUPPORT MATRIX

Mission:
Commander Intent:

| DP | Trigger | CCIR | Info Source | Options | Risk | Decision Maker | Deadline | Action |
|---|---|---|---|---|---|---|---|---|
| DP1 | | | | | | | | |
| DP2 | | | | | | | | |
```

Drafting principles:

- Every CCIR must be linked to a decision point.
- If there is only an information requirement with no decision attached, it is not a CCIR.
- If the decision maker is unclear, designate one before execution.
- Without a deadline, reporting will be delayed.

## 5. Risk Management

Military risk management can generally be described in the following steps.

1. Identify hazards.
2. Assess hazards.
3. Develop controls and make risk decisions.
4. Implement controls.
5. Supervise and evaluate.

AI application:

| Step | Question |
|---|---|
| Identify | What could go wrong? |
| Assess | What is the likelihood and impact? |
| Control | How can it be mitigated? |
| Decide | Who can accept this risk? |
| Supervise | Is the risk increasing during execution? |
| Evaluate | What should be incorporated into the next SOP? |

## 6. AI Risk Matrix

| Likelihood \ Impact | Low | Medium | High | Critical |
|---|---|---|---|---|
| Low | Low | Low | Medium | High |
| Medium | Low | Medium | High | Critical |
| High | Medium | High | Critical | Critical |
| Near Certain | High | Critical | Critical | Critical |

Handling by risk level:

| Level | Handling |
|---|---|
| Low | Handled autonomously by the agent |
| Medium | Proceed after reporting to Chief of Staff |
| High | Approval required after controls are established |
| Critical | Halt pending Commander approval |

## 7. AI Risk Register

```text
RISK REGISTER

| ID | Risk | Cause | Impact | Likelihood | Level | Control | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| R1 | | | | | | | | |
```

Example:

| ID | Risk | Control | Owner |
|---|---|---|---|
| R1 | Asserting facts without a source | S2 source verification, Red Team review | S2 |
| R2 | Misunderstanding user intent | Mandatory backbrief | CoS |
| R3 | Scope creep | OPORD scope fixed, use of FRAGO | S3 |
| R4 | Irreversible change | L4 approval rule | Commander |

## 8. Assessment

Assessment is a procedure for observing effects, not outputs.

### 8.1 MOP and MOE

| Concept | Question | AI Example |
|---|---|---|
| MOP | Was the task performed? | Document generation, test execution, source collection |
| MOE | Was the purpose achieved? | User can act on it, reduced hallucination, easier decision-making |

### 8.2 Indicator

An indicator is an observable signal showing success or failure.

Example:

| Objective | Indicator |
|---|---|
| Document systematization | All documents are linked from the README |
| Research quality | Each claim has a source and an applied opinion |
| Authority control | Approval levels and CCIR are clearly defined |
| Hallucination reduction | Facts, inferences, and opinions are separated |

## 9. Assessment Plan

```text
ASSESSMENT PLAN

Mission:
Success Criteria:

| Objective | MOP | MOE | Indicator | Data Source | Frequency | Owner |
|---|---|---|---|---|---|---|
| | | | | | | |
```

## 10. Go / No-Go Gate

Before execution, the following gate must be passed.

```text
GO / NO-GO

1. Is the objective clear?
2. Are the success criteria clear?
3. Have no-deviation items been separated out?
4. Have approval-required conditions been defined?
5. Has CCIR been defined?
6. Are risk controls in place?
7. Is there a verification method?
8. Is there a storage location for the AAR?
```

If even one answer is "No," revert to the WARNO or Backbrief stage depending on the scale of the task.

## 11. References

- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf
- Operation Assessment MTTP: https://www.alssa.mil/mttps/assessment/
- JP 5-0, Joint Planning: https://www.esd.whs.mil/Portals/54/Documents/FOID/Reading%20Room/Joint_Staff/18-F-1152_JP_5-0_Joint_Planning_2020.pdf
- JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- MDMP Handbook: https://api.army.mil/e2/c/downloads/2023/11/17/f7177a3c/23-07-594-military-decision-making-process-nov-23-public.pdf
