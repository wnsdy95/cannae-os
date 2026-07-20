# Prompt Templates

## 0. Purpose

This document is a collection of practical templates for converting military document systems into LLM prompts.

Usage principles:

- Start complex tasks with an OPORD.
- If information is still insufficient, prepare with a WARNO.
- Record mid-course changes with a FRAGO.
- Obtain a Backbrief before execution.
- Report progress with SITREP and CCIR.
- Learn with an AAR at the end.

## 1. WARNO: Advance Preparation Order

```text
WARNO: [Task Name]

1. Situation
- Background:
- What is currently known:
- What is not yet known:

2. Mission
- What to prepare:
- Purpose of preparation:
- Expected main task:

3. Execution
- Material to collect first:
- Constraints to confirm:
- Preparatory deliverables to create:
- Things not to do:

4. Sustainment
- Tools to use:
- Materials to use:
- Time/cost limits:

5. Command and Signal
- Preparation result reporting format:
- Immediate-report conditions:
- Whether to wait before the main OPORD is issued:
```

## 2. OPORD: Main Execution Order

```text
OPORD: [Task Name]

1. Situation
- Background:
- Operating environment:
- Related materials:
- Constraints:
- Information gaps:
- Key risks:

2. Mission
- Who:
- What:
- By when:
- Where:
- Why:
- Success conditions:

3. Execution
- Commander's Intent:
  - Purpose:
  - End state:
  - Key priorities:
  - Restrictions:
- Concept of Operations:
  - Overall approach:
  - Phases:
  - Key deliverables:
- Tasks:
  - S2:
  - S3:
  - S4:
  - Red Team:
  - Executor:
  - Recorder:
- Coordinating Instructions:
  - Verification criteria:
  - Quality criteria:
  - Stop conditions:
  - Conditions requiring approval:

4. Sustainment
- Tools:
- Materials:
- Token/time/cost limits:
- Alternatives:

5. Command and Signal
- Approver:
- Regular reporting:
- Immediate reporting (CCIR):
- FRAGO handling method:
- Completion reporting format:
```

## 3. Backbrief: Pre-Execution Understanding Confirmation

```text
BACKBRIEF

1. The final purpose as I understand it:
2. Success conditions:
3. Items that must not be altered:
4. Items I can decide autonomously:
5. Items that require approval:
6. Execution plan:
7. Verification plan:
8. Expected risks:
9. Conditions for immediate reporting:
10. Clarifying questions:
```

## 4. FRAGO: Fragmentary Order

```text
FRAGO [Number]: [Task Name]

Reference document:
Reason for change:
Priority:

1. Situation
- No change / Change details:

2. Mission
- No change / Change details:

3. Execution
- No change / Change details:

4. Sustainment
- No change / Change details:

5. Command and Signal
- No change / Change details:

Effective time:
Item that takes precedence in case of conflict with the existing order:
Whether approval is required:
```

## 5. SITREP: Situation Report

```text
SITREP: [Time/Phase]

1. Current status:
2. Completed:
3. In progress:
4. Blockers:
5. Risk:
6. Next action:
7. Decisions needed:
8. Whether a CCIR has occurred:
```

## 6. CCIR Report: Immediate Decision Report

```text
CCIR REPORT

1. Condition that occurred:
2. Why it matters:
3. Related decision point:
4. Currently known facts:
5. Uncertainties:
6. Available courses of action:
7. Risk of each course of action:
8. Approval required:
9. Recommendation:
```

## 7. Red Team Review

```text
RED TEAM REVIEW

1. Key claims:
2. Weakly-supported claims:
3. Hidden assumptions:
4. Counterexamples:
5. Failure scenarios:
6. Risk of exceeding authority:
7. Possibility of hallucination:
8. Additional verification questions:
9. Recommended corrections:
```

## 8. Completion Report

```text
COMPLETION REPORT

1. Completed deliverables:
2. Work performed:
3. Files/results changed:
4. Verification method:
5. Verification results:
6. Success conditions met:
7. Remaining risk:
8. Follow-up actions:
```

## 9. AAR

```text
AAR: [Task Name]

1. Expected
- Original intent:
- Success conditions:
- Plan:

2. Actual
- Actual outcome:
- Verification results:
- Problems encountered:

3. Delta
- Difference:
- Cause:

4. Sustain
- Procedures to keep:

5. Improve
- Procedures to change:
- Items to reflect in the SOP:
- Items to reflect in the next prompt:
```

## 10. Quick Prompt: Abbreviated Form for a Single Agent

```text
Purpose:
Success conditions:
Materials:
Constraints:
Autonomous judgment allowed:
Approval required:
Immediate-report conditions:
Output format:
Verification method:
```

## 11. Quick Prompt: For Research

```text
Research mission:
Scope:
Priority sources:
Sources to exclude:
Questions to confirm:
Separation of fact/inference/opinion:
Source citation method:
Uncertainty marking:
Final deliverable:
```

## 12. Quick Prompt: For Code Work

```text
Code mission:
Related files:
Scope of change:
Prohibited actions:
Test command:
Completion criteria:
Risk to report:
Final reporting format:
```
