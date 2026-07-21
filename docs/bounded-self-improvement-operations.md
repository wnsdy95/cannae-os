# Bounded Self-Improvement Operations

## 0. Purpose

This operating model lets an AI campaign improve both its in-progress work and the framework that guides it without granting the AI open-ended authority.

```text
human intent
  -> bounded campaign
  -> working baseline
  -> observe
  -> propose one candidate
  -> validate and measure
  -> accept / revise / rollback / escalate
  -> next checkpoint
  -> human merge or release decision
```

Self-improvement is not a permission to pursue unspecified goals, rewrite authority, approve its own evidence, or run forever. It is a controlled sequence of reversible experiments inside a human-defined objective, repository, budget, and authority envelope.

## 1. Two Improvement Targets

### 1.1 Work already in progress

The controller may improve an active draft, implementation, test, report, plan, or other work product when:

- the target belongs to the campaign's repository binding;
- the campaign explicitly permits that target type and action;
- the change remains inside the file, cycle, retry, failure, and time budgets;
- the candidate has a baseline and rollback plan;
- validation and hard quality gates pass;
- the weighted quality score improves by the declared minimum;
- no protected invariant, authority boundary, release boundary, or destructive action is involved.

An accepted candidate becomes the next **working state**. It does not become an externally released or merged result.

### 1.2 The control plane itself

Procedures, runtime controls, skills, and policies may be examined and changed as isolated candidates. They require stricter treatment because they can alter future behavior.

- A procedure or runtime candidate needs independent evaluation before promotion.
- A skill candidate needs independent evaluation and its own validation/forward test.
- A policy candidate also needs explicit USER approval scoped to that candidate.
- Authority changes, merge, push, and external release remain human-retained.
- A failed control-plane candidate is never promoted merely because the same model says it is safe.

## 2. Control Objects

### 2.1 `SelfImprovementCampaign`

The campaign is the standing order. It binds:

- mission and repository identity;
- intent, end state, acceptance criteria, and non-goals;
- command team and independent evaluator;
- autonomous target types, actions, and maximum change class;
- protected invariants;
- normalized quality dimensions and weights;
- cycle, retry, file, failure, no-progress, and elapsed-time budgets;
- mandatory checkpoint triggers;
- experiment, rollback, and promotion rules;
- stop conditions.

The quality dimensions use a normalized `0..1` scale. Weights must sum to `1`. For a `maximize` dimension, higher is better. For a `minimize` dimension, lower is better and the controller reverses it when calculating the weighted score.

### 2.2 `SelfImprovementCheckpoint`

Each checkpoint records one candidate against one baseline:

- trigger and cycle number;
- parent accepted decision (`none` only for cycle 1);
- target state and repository-relative paths;
- observed gap and evidence;
- candidate disposition, changed files, permissions, rollback, and expected delta;
- metric values before and after;
- validation results and evidence;
- independent evaluation where required;
- scope, authority, policy, release, destructive, and cross-repository externalities;
- exact human approval claim where required;
- completed/open acceptance criteria and budget counters.

Checkpoint paths may not be absolute or contain `..`. Different repositories require separate campaigns and artifact namespaces.

### 2.3 `SelfImprovementDecision`

`autonomous-improvement-controller.js` emits one of:

| Decision | Meaning | AI may continue? |
| --- | --- | --- |
| `accept_working_state` | Candidate passed and measurably improved the working state | Yes, inside the same envelope |
| `revise_and_retry` | Candidate is safe but the gain is insufficient | Yes, within retry and cycle budgets |
| `rollback` | Candidate failed validation or a hard gate | Only revert the campaign's own uncommitted candidate |
| `escalate` | Approval, evidence, scope, authority, or budget blocks continuation | No |
| `continue` | No change was selected; inspect the next open criterion | Yes |
| `complete` | Completion checkpoint passed | No release; prepare human decision |
| `terminate` | Destructive or cross-repository behavior was proposed | No |

Every decision sets `release_authorized: false`. Release is handled by the existing approval and release-review system, never by this controller.

## 3. Required Battle Rhythm

### 3.1 Campaign start

1. Route the mission for the declared AI role and create routing receipts.
2. Bind the campaign to the target repository identity.
3. State the objective, acceptance criteria, non-goals, and protected invariants.
4. Define quality dimensions that can be evidenced independently of model confidence.
5. Set finite budgets and stop conditions.
6. Record the initial baseline.

### 3.2 Every implementation wave

1. Run a `wave_start` checkpoint when the working state, scope, or agent roster changed.
2. Execute only the task order produced by the latest accepted decision.
3. Preserve test, validator, review, and artifact evidence.
4. Run a `wave_end` checkpoint.
5. Accept only one bounded candidate at a time; carry its accepted state forward as the next baseline.
6. Set every follow-on checkpoint's `parent_decision_id` to the decision that accepted its baseline. A rejected or rollback decision cannot become the hidden parent state.
7. On validation failure, run the failure checkpoint before attempting repair.
8. On scope change, stop and checkpoint before editing outside the existing task.

### 3.3 Completion

The agent may not report the mission complete from a normal wave-end result. It must create a `before_completion` checkpoint with:

- no open acceptance criteria;
- no unvalidated candidate;
- every hard gate passing;
- the minimum weighted quality score met;
- repository-scoped decision evidence.

`complete` freezes the working state and opens a human merge/release decision. It does not authorize either action.

## 4. Authority Matrix

| Action | Work product | Procedure/runtime | Skill | Policy/authority | Merge/push/release |
| --- | --- | --- | --- | --- | --- |
| Inspect and measure | AI | AI | AI | AI | AI may prepare evidence |
| Draft isolated candidate | AI | AI | AI | AI | No |
| Run bounded tests | AI | AI | AI | AI | No |
| Promote to in-progress working state | AI if gates pass | AI if independently evaluated | AI if independently evaluated | USER approval required | No |
| Revert own uncommitted failed candidate | AI | AI | AI | Only within approved candidate | No |
| Expand scope or authority | No | No | No | USER | No |
| Merge, push, or release | No | No | No | No | USER through separate gate |

The USER remains final decision authority. A campaign can make AI work persistent and self-correcting without making the AI sovereign over the repository.

## 5. Multi-Agent Organization

| Function | Default role | Responsibility |
| --- | --- | --- |
| Campaign owner | `COS` | Maintains intent, priorities, budgets, and decision queue |
| Improvement controller | `S3` | Produces one bounded candidate and executes accepted task orders |
| Evidence/knowledge | `S6` / `RECORDER` | Persists baselines, checkpoints, decisions, and validation evidence |
| Independent evaluator | `EVALUATOR` or `RED_TEAM` | Assesses control-plane candidates without inheriting the controller's conclusion |
| Final authority | `USER` | Approves policy/authority changes and merge, push, or release |

Each worker still requires its own role-routed receipt and integrated mission preflight. The self-improvement campaign does not replace routing, model assignment, tool ROE, approval, or release review.

## 6. Runtime Commands

Bootstrap a safe campaign bound to the current Git repository:

```bash
node self-improvement-campaign-init.js \
  --repository . \
  --mission MIS-example \
  --campaign SIC-example \
  --objective "Improve the active implementation without widening scope." \
  --end-state "Every acceptance criterion passes with repository-scoped evidence." \
  --criterion "All deterministic checks pass." \
  --criterion "The completion checkpoint has no open criteria." \
  --write-artifact
```

The bootstrap uses conservative default roles, protected invariants, quality dimensions, finite budgets, and human-retained merge/push/release authority. `--allow-commit` may remove the per-cycle human commit requirement, but it never grants push, merge, policy, authority, or release permission.

Validate the three contracts:

```bash
node validator-cli-prototype/validate.js \
  sample-payloads/valid-self-improvement-campaign.json \
  self-improvement-campaign

node validator-cli-prototype/validate.js \
  sample-payloads/valid-self-improvement-checkpoint.json \
  self-improvement-checkpoint

node validator-cli-prototype/validate.js \
  sample-payloads/valid-self-improvement-decision.json \
  self-improvement-decision
```

Evaluate a checkpoint:

```bash
node autonomous-improvement-controller.js \
  campaign.json \
  checkpoint.json
```

Persist the checkpoint and decision into the bound repository namespace:

```bash
node autonomous-improvement-controller.js \
  campaign.json \
  checkpoint.json \
  --write-artifact \
  --repository ../target-repository \
  --artifact-root .cannae/artifacts
```

The CLI validates campaign and checkpoint contracts before making a decision. When persistence is requested, it also resolves the actual Git repository, blocks execution if its key or fingerprint does not match the campaign binding, and records both the checkpoint and resulting decision under the same mission/cycle namespace.

CLI exit codes are `0` for a decision the harness may consume without human unblock, `1` for `escalate` or `terminate`, and `2` for malformed input or CLI usage failure. A nonzero exit never removes the JSON decision from stdout when a decision could be formed.

## 7. Failure and Anti-Hallucination Rules

- Model confidence, self-approval, or a prose assertion of quality is not sufficient evidence.
- Every quality result must cite deterministic or independent evidence.
- Every changed candidate needs a rollback plan.
- Failed validation or a failed hard gate routes to rollback, not rationalization.
- Repeated no-progress, repeated failure, cycle exhaustion, or time exhaustion routes to human review.
- A protected-invariant impact blocks promotion even when the measured score improves.
- Destructive or cross-repository behavior terminates autonomous execution.
- A controller may generate a policy candidate but may not approve that candidate itself.
- A completion decision may not authorize execution or release.

## 8. Regression Gate

```bash
node run-self-improvement-fixtures.js
node validator-cli-prototype/run-fixtures.js
node run-repository-artifact-isolation-fixtures.js
```

The fixture suite covers accepted improvement, insufficient gain, validation rollback, policy escalation, destructive termination, completion, repository drift, no-progress budgets, independent control-plane evaluation, permission drift, and repository-scoped persistence.

## 9. Current Limitations

- The controller verifies contract structure and decision logic; it does not independently rerun arbitrary validation commands embedded in a checkpoint.
- Evidence references are auditable strings, not cryptographic attestations.
- A human approval claim in a checkpoint is structurally checked but is not yet consumed from a signed approval ledger.
- The controller produces the next task order; the active AI harness must execute it and return a new checkpoint.
- Bootstrap quality dimensions are safe engineering defaults; mission-specific campaigns should replace them when another measurable quality model is more appropriate.
- Repository manifest locking protects concurrent writers, but artifact and manifest updates are not yet backed by a write-ahead journal for crash recovery between the two atomic renames.

These are explicit engineering boundaries, not permissions for an agent to fill gaps with self-reported confidence.
