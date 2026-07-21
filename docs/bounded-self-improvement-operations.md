# Bounded Self-Improvement Operations

## 0. Purpose

This operating model lets an AI campaign improve both its in-progress work and the framework that guides it without granting the AI open-ended authority.

```text
human intent
  -> bounded campaign
  -> manifest-backed finite cycle order
  -> working baseline
  -> observe
  -> propose one candidate
  -> execute a verification plan
  -> persist a verification receipt
  -> obtain signed attestations from independent verifiers
  -> validate receipt, signatures, trust policy, and quorum
  -> run one sealed evaluation contract against baseline and control-plane candidate
  -> accept / revise / rollback / escalate
  -> reconstruct campaign chain and issue the next finite cycle order
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

- A procedure candidate needs independent evaluation before promotion.
- A runtime-control or skill candidate needs independent evaluation plus a manifest-backed baseline-versus-candidate report from the same sealed evaluation set and harness.
- A policy candidate also needs explicit USER approval scoped to that candidate.
- That approval must be represented by a valid `ApprovalScope` and one matching `ApprovalConsumptionEvent`; prose approval in a checkpoint has no authority.
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
- allowed verification executables, command/time/output budgets, and proof persistence rules;
- control-plane target types, maximum report age, and per-dimension maximum regression thresholds;
- for v0.3, the exact verifier trust-policy artifact, signature threshold, independence-group threshold, and maximum attestation age;
- stop conditions.

The quality dimensions use a normalized `0..1` scale. Weights must sum to `1`. For a `maximize` dimension, higher is better. For a `minimize` dimension, lower is better and the controller reverses it when calculating the weighted score.

### 2.2 `VerificationPlan` and `VerificationReceipt`

A plan binds exact executable/argument arrays to one campaign, candidate, cycle, repository identity, Git head, and worktree fingerprint. `verification-runner.js` resolves each executable, uses `spawnSync` with `shell: false`, enforces the campaign timeout/output budget, hashes the executable and both output streams, and records the exit code and duration.

The runner checks repository state before and after execution. Mutation during verification fails the receipt and blocks later checks. A passing receipt therefore proves what command ran, where it ran, which candidate state it checked, what it returned, and that the checked state did not move underneath it. The runner is not a general sandbox: allowed executables and the scripts they invoke still require normal tool ROE and least privilege.

Both plan and receipt must be persisted in the repository artifact namespace. A checkpoint cites the receipt's manifest path and SHA-256; a model-authored status string is not accepted as validation evidence.

### 2.3 `VerifierTrustPolicy` and `VerificationAttestation`

Schema v0.3 adds a public-key trust layer without replacing the executable receipt. The human-controlled campaign binds one exact `VerifierTrustPolicy` artifact by ID, repository-relative path, and SHA-256. The policy lists active Ed25519 public keys, verifier IDs, independence groups, allowed repository keys, allowed local/remote origins, validity windows, and quorum requirements. Private keys never belong in the repository, campaign, policy, checkpoint, or artifact store.

`verification-attestation-runner.js` can run on another host after receiving the receipt bytes and their persisted manifest reference. It emits a DSSE envelope containing an in-toto statement whose subject is the persisted receipt SHA-256. The signed predicate binds the receipt self-digest, campaign, mission, cycle, candidate, candidate revision, repository identity, verifier/key/group, execution origin, invocation ID, nonce, issue time, and expiry.

Promotion requires all of the following:

- every cited attestation is schema-valid, digest-valid, signature-valid, unexpired, and issued inside the verifier and trust-policy validity windows;
- each attestation binds a receipt already accepted by the executable receipt gate;
- verifier IDs and public-key IDs are distinct;
- the minimum number of independent verifier groups is present;
- the checkpoint time is within the maximum attestation age;
- every cited policy, receipt, and attestation is reloaded from the repository manifest by exact path and hash.

Repeating one attestation, creating several names for one key, using two verifiers from one required-independent group, replaying expired proof, or changing the exposed fields outside the signed payload blocks promotion.

### 2.4 Comparative evaluation contracts

`ComparativeEvaluationSet` is persisted before candidate execution and bound to one campaign and mission. It assigns a version and stable order to held-out or open fixtures and records three contamination controls: sealing before execution, exclusion of expected outputs from candidate context, and identical fixture order. The manifest SHA-256 is the runtime identity of the set; a cross-mission artifact reference is rejected before harness execution.

`ComparativeEvaluationPlan` binds that set to two isolated subjects and declares an `evaluation_purpose`. `candidate_promotion` requires distinct baseline and candidate revisions. `completion_revalidation` requires the same accepted revision in separate worktrees, providing a fresh absolute-threshold check without pretending that a no-change completion is a new promotion. Each revision must equal its Git head or exact `WT-<worktree_fingerprint>` identity. The plan also fixes one repository-relative Node harness, exact argv, timeout, expected exit codes, harness SHA-256, and independent evaluator invocation. The plan itself must already exist in the repository manifest when execution starts.

`comparative-evaluation-runner.js` copies the sealed set into separate read-only temporary files, executes the exact harness in baseline and candidate worktrees with `shell: false`, and checks the fixture bytes and each repository state again afterward. The harness emits one structured observation per subject. The runner requires matching evaluation-set identity, evaluator binding, fixture order, quality dimensions, argv, and harness hash.

For each campaign quality dimension, the runner applies both:

- the campaign's absolute target; and
- the campaign's `maximum_regression` relative to the accepted baseline, after accounting for maximize/minimize direction.

The report outcome is `promotable` only when both executions are valid, every candidate fixture passes, and every dimension passes both thresholds. A measured failure is `rollback`. Invalid identity, stale state, changed harness, malformed output, or contract mismatch is `inconclusive`. All three outcomes keep `execution_authorized: false` and `release_authorized: false`; the controller, not the comparison runner, owns the bounded working-state decision.

### 2.5 `SelfImprovementCheckpoint`

Each checkpoint records one candidate against one baseline:

- trigger and cycle number;
- parent accepted decision and manifest-backed artifact reference (`none` only for cycle 1);
- target state and repository-relative paths;
- observed gap and evidence;
- candidate disposition, changed files, permissions, rollback, and expected delta;
- metric values before and after, each citing verified receipt IDs;
- manifest-backed verification receipt references and required check IDs;
- for v0.3, manifest-backed signed attestation references identifying their receipt and verifier;
- independent evaluation where required;
- for runtime-control and skill targets, the exact comparative report manifest reference;
- scope, authority, policy, release, destructive, and cross-repository externalities;
- exact approval-scope and consumption-event references where required;
- completed/open acceptance criteria and budget counters.

Checkpoint paths may not be absolute or contain `..`. Different repositories require separate campaigns and artifact namespaces.

### 2.6 `SelfImprovementDecision`

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

The decision also records the accepted candidate revision and a proof summary: verified receipt IDs, verified parent decision ID, consumed approval event ID, and the artifact-manifest revision/hash used during evaluation. A v0.3 decision additionally records verified attestation IDs, verifier key IDs, independence groups, and whether the required quorum was satisfied.

### 2.7 `SelfImprovementCycleOrder`

`campaign-supervisor.js` is the deterministic campaign-level state machine. It verifies the repository artifact store, locates exactly one campaign artifact, reloads every checkpoint and decision for that campaign, and reconstructs the chain without relying on conversation memory.

The supervisor emits one manifest-backed order:

| Transition | Required predecessor | Result |
| --- | --- | --- |
| `start` | No checkpoint or decision exists | Open cycle 1, attempt 1 from the campaign baseline |
| `retry` | Latest decision is `revise_and_retry`, `rollback`, or `continue` | Stay in the same cycle and increment the attempt within the retry budget |
| `advance` | Latest decision accepted a working state | Open the next cycle from the exact accepted revision and decision path/hash |
| `before_completion` | Accepted decision explicitly requires the completion checkpoint | Open the next finite completion cycle with the accepted decision as parent |
| `hold` | Completion, termination, escalation, invalid lineage, incomplete pair, or exhausted budget | Emit no execution authority |

The supervisor rejects duplicate IDs, a checkpoint without exactly one decision, a decision without a checkpoint, skipped cycles, records after an accepted or terminal decision, a baseline that does not match the prior accepted revision, a forged parent reference, repository mismatch, and finite-budget exhaustion. It copies the controller's task order exactly for follow-on work and records the campaign, source checkpoint, source decision, accepted parent, proof requirements, budget snapshot, and observed manifest digest.

`SelfImprovementCycleOrder` never approves merge, push, release, policy, trust roots, or authority. Only `status: ready` with `execution_authorized: true` may be dispatched. Re-running the supervisor against the same reconstructed state returns the existing persisted order instead of creating another manifest revision.

## 3. Required Battle Rhythm

### 3.1 Campaign start

1. Route the mission for the declared AI role and create routing receipts.
2. Bind the campaign to the target repository identity.
3. State the objective, acceptance criteria, non-goals, and protected invariants.
4. Define quality dimensions that can be evidenced independently of model confidence.
5. Set finite budgets and stop conditions.
6. Record the initial baseline.
7. Run the campaign supervisor and execute only its persisted `start` order when status is `ready`.

### 3.2 Every implementation wave

1. Run the campaign supervisor against the verified artifact store. Stop unless it emits a current `ready` order.
2. Run a `wave_start` checkpoint when the working state, scope, or agent roster changed.
3. Execute only the task order carried by that cycle order, using its cycle, attempt, baseline, parent, trigger, and proof requirements.
4. Generate a repository-state-bound `VerificationPlan`, run it through `verification-runner.js`, and persist its receipt.
5. For a v0.3 campaign, send the persisted receipt and its manifest digest to the required independent verifiers. Persist every returned signed attestation without editing it.
6. Run the required checkpoint that cites the exact receipts and attestations.
7. Accept only one bounded candidate at a time; carry its accepted state forward as the next baseline.
8. Persist the checkpoint and controller decision, then run the supervisor again. Do not calculate the next cycle or retry from conversational memory.
9. On validation failure, run the failure checkpoint before attempting repair.
10. On scope change, stop and checkpoint before editing outside the existing task.

### 3.3 Completion

The agent may not report the mission complete from a normal wave-end result. It must create a `before_completion` checkpoint with:

- no open acceptance criteria;
- no unvalidated candidate;
- every hard gate passing;
- the minimum weighted quality score met;
- repository-scoped decision evidence.
- a new passing verification receipt for the exact completion candidate state.
- for v0.3, a fresh signed quorum for that new receipt; prior-wave signatures cannot be carried into completion.

`complete` freezes the working state and opens a human merge/release decision. It does not authorize either action.

## 4. Authority Matrix

| Action | Work product | Procedure/runtime | Skill | Policy/authority | Merge/push/release |
| --- | --- | --- | --- | --- | --- |
| Inspect and measure | AI | AI | AI | AI | AI may prepare evidence |
| Draft isolated candidate | AI | AI | AI | AI | No |
| Run bounded tests | AI | AI | AI | AI | No |
| Promote to in-progress working state | AI if proof gates pass | AI if independently evaluated with receipt evidence | AI if independently evaluated with receipt evidence | Consumed USER approval required | No |
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

To create a v0.3 campaign, first persist a human-approved `VerifierTrustPolicy`, then bind its exact artifact reference:

```bash
node self-improvement-campaign-init.js \
  --repository . \
  --mission MIS-example \
  --campaign SIC-example-v3 \
  --objective "Improve the implementation using signed independent proof." \
  --end-state "Every promotion carries a fresh two-verifier quorum." \
  --criterion "Two independent verifier groups attest every accepted receipt." \
  --trust-policy-id VTP-example \
  --trust-policy-path repositories/<repository-key>/missions/MIS-example/C0/verifier-trust-policies/VTP-example.json \
  --trust-policy-sha256 <sha256> \
  --minimum-attestations 2 \
  --minimum-independence-groups 2 \
  --write-artifact
```

Validate the proof and control contracts:

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

node validator-cli-prototype/validate.js \
  sample-payloads/valid-verification-plan.json \
  verification-plan
```

Execute and persist a verification plan before creating the checkpoint:

```bash
node verification-runner.js \
  campaign.json \
  verification-plan.json \
  --repository ../target-repository \
  --artifact-root .cannae/artifacts \
  --write-artifact
```

When stdout must also be retained, write it outside the target repository and move it into local control storage only after the process succeeds. Shell redirection creates the destination before verification starts; a partial file inside the workspace can alter checks that scan local files even when the directory is Git-ignored. Prefer `--write-artifact` as the durable receipt path.

An independent verifier signs the persisted receipt. The key file must be a regular Ed25519 PKCS#8 PEM file with no group/other permissions:

```bash
node verification-attestation-runner.js \
  verifier-trust-policy.json \
  verification-receipt.json \
  --verifier VERIFIER-provider-a \
  --private-key /secure/verifier-a-key.pem \
  --receipt-relative-path repositories/<repository-key>/missions/MIS-example/C1/verification-receipts/VR-example.json \
  --receipt-sha256 <persisted-receipt-sha256> \
  --invocation-id INV-provider-a-001 \
  --origin remote
```

The verifier may return stdout as a portable artifact. Capture it outside the target repository until the command succeeds. The repository operator then persists the returned JSON under `verification-attestations`, or the verifier may add `--write-artifact --repository <repo> --artifact-root <root>` when it has authorized artifact-store access. Repeat with a distinct trusted key and independence group until the campaign quorum is met.

Before promoting a runtime-control or skill candidate, persist a sealed `ComparativeEvaluationSet` under `comparative-evaluation-sets` and its plan under `comparative-evaluation-plans`. The candidate repository and baseline worktree must share the same normalized Git origin while retaining distinct repository-state bindings.

```bash
node comparative-evaluation-runner.js \
  campaign.json \
  comparative-evaluation-plan.json \
  --repository ../candidate-repository \
  --baseline-repository ../baseline-worktree \
  --artifact-root .cannae/artifacts \
  --write-artifact
```

Exit code `0` means `promotable`, `1` means `rollback` or `inconclusive`, and `2` means malformed input, missing pre-persisted evidence, or proof-store failure. The caller must reference the persisted report from `checkpoint.comparative_evaluation_ref`; the report is not itself an execution or release approval.

Evaluate a checkpoint against its repository proof store:

```bash
node autonomous-improvement-controller.js \
  campaign.json \
  checkpoint.json \
  --repository ../target-repository \
  --artifact-root .cannae/artifacts
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

The controller always requires the runtime repository. It verifies the artifact manifest and history, reloads every receipt, attestation, trust policy, comparative report/plan/set, parent decision, approval scope, and consumption event referenced by the checkpoint, and compares their hashes and semantic bindings before deciding. For skill and runtime-control candidates it recomputes the comparison and requires the checkpoint's metric values to match it. `--write-artifact` additionally records the checkpoint and decision under the same mission/cycle namespace.

Open or resume only the next finite campaign step after the campaign artifact, or after each persisted controller decision:

```bash
node campaign-supervisor.js \
  --repository ../target-repository \
  --campaign SIC-example \
  --artifact-root .cannae/artifacts \
  --write-artifact
```

The supervisor reloads the campaign, checkpoints, decisions, and any existing cycle order from the verified repository manifest. Exit code `0` means the JSON order is `ready` or the campaign is already `completed`; the caller must still inspect `status` and may execute only `ready`. Exit code `1` means `awaiting_human`, `terminated`, or `blocked`. Exit code `2` means malformed input, artifact-store failure, or a conflicting persisted order.

CLI exit codes are `0` for a decision the harness may consume without human unblock, `1` for `escalate` or `terminate`, and `2` for malformed input or CLI usage failure. A nonzero exit never removes the JSON decision from stdout when a decision could be formed.

## 7. Failure and Anti-Hallucination Rules

- Model confidence, self-approval, or a prose assertion of quality is not sufficient evidence.
- Every quality result must cite a runtime-issued receipt that belongs to the exact campaign, cycle, candidate, revision, and repository.
- A v0.3 promotion must carry a fresh quorum of signatures from distinct trusted verifier IDs, Ed25519 key IDs, and the policy-required independence groups.
- The controller must compare each signed receipt self-digest with the exact receipt bytes it reloaded from the manifest. A valid signature over different receipt content is invalid proof.
- `execution_origin: remote` is a signed verifier claim, not proof of a trusted execution environment. Do not infer host isolation, provider independence, or honest execution from that field alone.
- The verifier trust policy is a human-controlled root. Agents may propose a replacement, but may not activate new keys, lower quorum, weaken group diversity, or extend validity without scoped USER approval.
- Shell strings, inline Node evaluation, stale worktree plans, mutated repositories, forged receipt hashes, and missing required checks do not count as proof.
- Every changed candidate needs a rollback plan.
- Failed validation or a failed hard gate routes to rollback, not rationalization.
- Repeated no-progress, repeated failure, cycle exhaustion, or time exhaustion routes to human review.
- A missing decision, duplicate decision, skipped cycle, mismatched baseline, forged parent path/hash, or record after a terminal decision blocks the supervisor before another order is issued.
- Agents must not infer the next cycle number, retry count, baseline, or parent from chat history. They consume the current persisted cycle order.
- A protected-invariant impact blocks promotion even when the measured score improves.
- A skill or runtime-control candidate without a fresh `promotable` paired report cannot become a working state. A rollback report triggers rollback; an inconclusive or recomputation-mismatched report escalates.
- Baseline and candidate must run the same pre-persisted plan, sealed evaluation-set bytes, fixture order, argv, and harness hash. A simple before/after claim is not comparative proof.
- Destructive or cross-repository behavior terminates autonomous execution.
- A controller may generate a policy candidate but may not approve it; an exact USER-granted scope must be consumed once by that checkpoint execution.
- Follow-on work must reload the immediately prior accepted decision; naming an ID without its manifest-backed bytes is insufficient.
- A completion decision may not authorize execution or release.

## 8. Regression Gate

```bash
node run-self-improvement-fixtures.js
node run-signed-self-improvement-fixtures.js
node run-verification-runner-fixtures.js
node run-verification-attestation-fixtures.js
node run-comparative-evaluation-fixtures.js
node validator-cli-prototype/run-fixtures.js
node run-repository-artifact-isolation-fixtures.js
node run-repository-artifact-concurrency-fixtures.js
node run-repository-artifact-recovery-fixtures.js
```

The fixture suite covers executed proof, missing/tampered receipts, Ed25519 DSSE verification, duplicate and expired attestations, two-key/two-group quorum, receipt-content binding, real baseline/candidate worktree execution, sealed evaluation sets, absolute and non-regression thresholds, harness mismatch, comparison rollback/inconclusive outcomes, consumed and reused approval events, forged parent lineage, policy escalation, destructive termination, completion, repository-scoped persistence, concurrent fencing, crash recovery, and byte-level tamper detection.

## 9. Current Limitations

- The controller produces the next task order; the active AI harness must execute it and return a new checkpoint.
- Bootstrap quality dimensions are safe engineering defaults; mission-specific campaigns should replace them when another measurable quality model is more appropriate.
- Ed25519 signatures authenticate possession of a trusted private key and integrity of the signed statement. They do not prove that the verifier ran on an isolated host, used a different provider, executed the declared checks honestly, or was free from compromise. Independence groups and execution origins remain policy assertions unless backed by external infrastructure.
- Comparative reports are locally digest-bound and manifest-verified but are not yet independently signed. The evaluator identity and invocation remain local claims until an external workload identity or report-attestation contract is added.
- Read-only temporary fixture permissions and before/after hashes detect mutation but are not a host security sandbox. A malicious harness running as the same OS user may read other accessible files, use the network, or attempt transient fixture access; production execution needs filesystem, network, process, and credential isolation.
- A sealed local fixture set limits accidental prompt leakage but cannot prove that a model or developer never saw equivalent examples before the campaign. Statistical confidence, repeated stochastic trials, and distribution-shift monitoring remain mission-specific evaluation responsibilities.
- The local trust policy, campaign, checkpoint, and repository manifest are not anchored in an online transparency log, hardware root, KMS, Sigstore identity, or external timestamp authority. Key revocation is enforced only after an updated human-approved policy is distributed and consumed.
- An actor that can replace the artifact root, trust policy, campaign input, and all retained history outside the controller can reconstruct a locally consistent false history. Protect the root with normal filesystem, account, backup, and review controls.
- The shared-filesystem lease backend assumes coherent atomic `mkdir`, hard-link creation, rename, and visibility semantics plus clocks accurate enough for expiry. It prevents cooperating stale writers with monotonic fencing tokens, but it is not safe under network partition or a filesystem that violates those assumptions. Distributed writers requiring partition tolerance need an external linearizable lease/transaction service and must reject stale fencing tokens at the storage commit point.
- Verification commands run without a shell and under bounded resources, but they are not OS-sandboxed. Network, external filesystem, and credential isolation still depend on the host harness and tool ROE.
- Approval scopes are hash-bound and single-consumption checked, but they are not cryptographically signed by an external identity provider.

These are explicit engineering boundaries, not permissions for an agent to fill gaps with self-reported confidence.
