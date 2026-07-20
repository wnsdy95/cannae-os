# Agent METL

## 0. Purpose

METL is the mission essential task list. The military does not train every task to the same standard. It designates the tasks essential to mission accomplishment, and evaluates training and readiness against those tasks.

The same applies to LLM agents. General capability alone — "the model is smart" — cannot be the basis for granting autonomy. Essential tasks by role, evaluation criteria, readiness rating, and scope of authority must all be linked together.

## 1. Readiness rating

The current framework uses four ratings.

| Rating | Meaning | Authority |
| --- | --- | --- |
| T | Trained. Capable of independent execution | Green autonomy; some Amber actions may be performed after reporting |
| P | Practiced. Capable of execution under supervision | Green execution, Amber requires prior reporting, Red not permitted |
| U | Untrained. Draft/assistance only | Only draft/report permitted |
| X | Not assessed or unsafe | Execution prohibited, training required |

Readiness is assigned per task, not to the agent as a whole.

Examples:

- `S2:public source research = T`
- `S2:legal interpretation = U`
- `S3:local validation = T`
- `S3:production deployment = X`

## 2. METL by Role

### 2.1 Commander

Essential tasks:

- Drafting mission intent.
- Determining priorities and main effort.
- Accepting Red risk.
- Issuing FRAGOs.
- Approving doctrine/readiness changes in the AAR.

Evaluation:

- Does the intent include an observable end state?
- Are authority boundaries clear?
- Is the CCIR centered on decision-relevant information?
- Does risk acceptance carry a scope and an expiry?

### 2.2 CoS

Essential tasks:

- Agent tasking.
- Operating the B2C2WG/battle rhythm.
- Consolidating decision packets.
- Compressing SITREPs.
- Deconflicting conflicting guidance.

Evaluation:

- Is the packet submitted to the commander actually decidable?
- Have duplicate work and conflicts been eliminated?
- Are pending decisions and blocked tasks free of omissions?

### 2.3 S2 Research

Essential tasks:

- Source discovery.
- Source reliability rating.
- Separating claim/inference/open question.
- Answering PIRs.
- Producing evidence records.

Evaluation:

- Were official, academic, and unofficial sources distinguished?
- Was recency uncertainty flagged?
- Were direct evidence and LLM interpretation kept separate?

### 2.4 S3 Operations

Essential tasks:

- Drafting task orders.
- Establishing the local execution plan.
- Generating tool requests.
- Escalating blocked actions.
- Producing the current-ops SITREP.

Evaluation:

- Is the task linked to commander's intent?
- Is the Red/Amber/Green classification accurate?
- Was the stop condition flagged before execution?

### 2.5 S4 Sustainment

Essential tasks:

- Estimating token/time/quota/tool availability.
- Fallback and degraded-mode planning.
- Recommending resource priorities.
- Planning checkpoints for long-running tasks.

Evaluation:

- Was the resource bottleneck escalated to a commander decision?
- Is the fallback actually executable?
- Is context-loss preparedness in place?

### 2.6 S6 Knowledge

Essential tasks:

- Maintaining the README/source-map/compendium.
- Managing the event log and projections.
- Producing handoff packets.
- Managing classification/releasability metadata.
- Reflecting SOP updates.

Evaluation:

- Can the next operator continue without chat history?
- Is the source of truth clear?
- Was sensitive information kept from spreading unnecessarily?

### 2.7 Red Team

Essential tasks:

- Challenging assumptions.
- Discovering failure modes.
- Attempting policy bypass.
- Critiquing source interpretation.
- Reviewing approval risk.

Evaluation:

- Was an actually executable risk identified?
- Is the finding linked to a commander decision?
- Did the Red Team avoid abusing its execution authority?

### 2.8 Evaluator

Essential tasks:

- Separating MOP/MOE.
- Evaluating test and verification results.
- Producing the AAR.
- Recommending readiness updates.
- Recommending SOP updates.

Evaluation:

- Was output completion distinguished from effect achievement?
- Did the AAR lead to a subsequent action?
- Was the basis for the readiness change stated explicitly?

## 3. Readiness-to-authority policy

| Readiness | Green | Amber | Red | Black |
| --- | --- | --- | --- | --- |
| T | Autonomous | Limited execution after reporting | Approval request only | Prohibited |
| P | Autonomous | Approval or supervision required | Approval request only | Prohibited |
| U | Draft only | Draft only | Not permitted | Prohibited |
| X | Not permitted | Not permitted | Not permitted | Prohibited |

Additional restrictions:

- Production, credential, and external-mutation actions are Red or higher regardless of readiness.
- Black can never be approved at any readiness level.
- Even at readiness T, there is no authority outside mission scope.

## 4. Crawl-Walk-Run training model

| Stage | Description | Example |
| --- | --- | --- |
| Crawl | Draft produced according to a template | S2 drafts the source table |
| Walk | Execution within a limited scope, including verification | S3 runs the local validator |
| Run | Autonomous execution within the actual mission flow | S6 performs a bulk update of the source-map/README/compendium |

Promotion conditions:

- Success on the same task 3 or more times.
- No critical finding in the AAR.
- Validator/test or reviewer evidence exists.
- The agent identifies authority boundaries on its own.

Demotion conditions:

- A Red action was not reported.
- Sources were exaggerated or a hallucination occurred.
- Sensitive information was exposed.
- Repeated handoff failure.

## 5. Evaluation event

Readiness updates are recorded as events.

```json
{
  "event_type": "ReadinessUpdated",
  "mission_id": "M-DEMO-001",
  "actor": "EVALUATOR",
  "payload": {
    "agent_id": "S3",
    "task": "runtime prototype",
    "previous_rating": "P",
    "new_rating": "T",
    "evidence": [
      "runtime-demo-runner passed",
      "event replay fixture runner passed"
    ],
    "limitations": [
      "No production execution authority"
    ]
  }
}
```

## 6. METL review rhythm

| Point in time | Action |
| --- | --- |
| Mission start | Confirm readiness of the required role/task |
| Before Red/Amber approval | Confirm readiness of the relevant task |
| End of phase | Update readiness based on the AAR |
| Repeated failure | Generate a training task |
| New tool introduced | Task readiness starts at X |

## 7. Prompt guard

```text
Before acting, confirm role/task readiness.
- Where do I stand on this task: T/P/U/X?
- What is the ROE class of this action?
- Given the combination of readiness and ROE, is autonomous execution permitted?
- If not, which of draft, report, or approval request should I do instead?
```

## 8. Implementation candidates

schema:

- `agent-metl.schema.json`
- `readiness-event.schema.json`

prototype:

- `readiness-gate-prototype/readiness-gate.js`: takes role/task/readiness/roe_class and determines allowed/report_required/approval_required/prohibit.
- `aar-to-readiness.js`: converts AAR findings into readiness update recommendations.

## 9. Source anchors

- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716
- FM 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf

## 10. Conclusion at the current stage

Agent authority must not be granted on the basis of "the model is good." Authority must be computed from the combination of mission, task, tool, target, risk, and readiness.

Accordingly, the agent METL is both a training document and a runtime policy input.
