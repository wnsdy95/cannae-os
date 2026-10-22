# Disciplined Method Runtime

## Scope

This reference path connects a USER-reviewed exact method baseline to real local
dispatch admission, result-bound SITREPs, lease completion and wave reporting.
It advances goal 2 of the eight-part program without completing the entire
disciplined-initiative doctrine or replacing any other goal.

The baseline is not the proposed `disciplined-initiative-ruleset.schema.json`:
that separate candidate still requires a complete machine-readable DI rule
catalog. This path covers reviewed finite substitutions, strict mandatory-step
order, before/after reporting, mechanical drift and actual revocation. Novel
methods, arbitrary effect equivalence, optional verification insertion, step
reordering, semantic purpose drift, every degeneration pattern, readiness
recovery and protected production execution remain open.

## Reviewed Baseline

Add `method_control` to a captured `MissionWavePlan` v0.2 before proposal,
individual backbriefs, rehearsal and USER adoption. It contains a
`MethodControlBaseline` covering the exact agent roster and task commitments.
Each agent has a finite ordered list of mandatory work/safeguard steps. Each
step identifies one planned tool/input/rule and zero or more reviewed
alternatives. Input digests use the dispatch wrapper's `hash-input` operation,
not an unrelated JSON serializer. Every method also carries bounded, usable
receiver-facing `instructions` describing the exact input. Do not put raw
credentials in these instructions; a digest is a commitment, not a recoverable
input or an effect proof.

Every method must already match an exact-input rule in that agent's
preauthorized policy, preserve the same mission action and operation class,
and remain Green through the existing intent intersection. All individual
backbriefs acknowledge their complete exact method baseline. The normal signed
operator consent binds the full plan; method metadata does not replace it.

The plan is immutable after adoption/opening. Do not remove `method_control`,
edit an alternative, omit a safeguard, relabel a legacy wave or replace a policy
to manufacture compatibility. Prepare a newly reviewed plan when the frame
changes. Legacy waves without a baseline remain readable and follow their
existing controls; they do not acquire this method guarantee retroactively.
Making reviewed method control mandatory for every newly deployed workflow is
a separate rollout requirement, not supplied by this opt-in reference path.

## Operation

`open` delivers `method_assignment` with only the receiver's own baseline,
task/plan commitments, report deadline and trusted control-plane channel. It
also adds the exact method SOP and required pure contract control without
changing the original capability query or pretending to cover a domain gap.
Missing, sibling-substituted or edited pockets, or stripped procedures, deny
actual policy/dispatch consumption. Do not send the complete roster merely to
let an agent discover its own methods.

These wrappers are trusted CoS/operator control-plane operations, outside the
acting agent's scoped tool session. The agent sends its exact structured method
choice/report request to that trusted host; the host runs the wrapper, returns
the retained reference, and only then allows the agent to request ordinary tool
admission. A Green choice does not need a new approval, but it still needs this
retained control record. A Read-only agent must not invoke Bash, gain metadata
write privileges or edit its policy to run the wrapper. Automated provider
message delivery is separate from this CLI. The optional newly reviewed v0.2
[local method channel](method-control-channel.md) supplies three bounded MCP
operations after dormant bootstrap and exact session enrollment. It does not
automatically retrofit v0.1 plans, attest native client startup, supply broader
CoS integration or grant task, shell, approval or release authority.

The trusted operator uses the wrapper in either provider skill:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_methods.js \
  status --repository <repo> --mission <mission-id> --wave <wave-id>

node codex-skills/controls-doctrine-operator/scripts/operate_controls_methods.js \
  propose --repository <repo> --input <method-request.json>
```

A method request contains exactly `leaseId`, `stepId`, `methodId` and
`rationale`. The controller derives the current plan, context, exact intent,
policy, active checkpoint, lease and finite expiry itself. Propose before the
alternative tool call. A valid deviation never grants execution or release:
the ordinary provider hook and gateway still perform their separate admission.
Executing the exact planned step needs no deviation record.
The consumer also enforces the baseline's own validity bound: the schema's
ten-minute ceiling cannot extend a shorter reviewed interval, plan or lease.

An `after` alternative creates an obligation when actual dispatch/result history
shows it executed. `before_next_tool_or_completion` is this baseline's explicit
report boundary, not an empirical military threshold. Report the actual result
before another covered call or a completion attempt:

```json
{
  "phase": "after",
  "deviationRef": {
    "artifact_id": "MDEV-...",
    "relative_path": "repositories/.../method-deviation-events/MDEV-....json",
    "sha256": "<exact retained file digest>"
  }
}
```

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_methods.js \
  report --repository <repo> --input <after-report-request.json>
```

The controller finds the unique real admission and post-tool checkpoint,
retains the derived SITREP first, then the result-bound
`InitiativeDeviationReport`. Caller-selected result digests, invented evidence,
tool output pasted in chat and a schema-valid report alone do not discharge the
obligation. Reports remain observable after lease expiry or revocation; they
never renew authority or clear unknown effects.

For `before_and_after`, first obtain an exact retained USER scope decision with
option `acknowledge_method:<deviation-id>`, authority reference equal to that
deviation ID, and affected artifacts equal to its one exact path. A before
report request adds `phase: "before"` and the exact `decisionRef` to
`deviationRef`. The controller holds execution until this acknowledgment and
derived SITREP are retained. It still requires the ordinary post-result report.
No CoS acknowledgment adapter or additional approval grade is implied by this
first local path. A USER log is not authenticated human-presence proof; broader
authenticated decision transport remains goal 7 work.

## Drift And Actual Response

The actual tool admission records the exact baseline/step/method/deviation
binding. Replay uses verified manifest introduction history, not inventory
array order or lexicographic timestamps. A manifest's artifact list is sorted
inventory and is not an execution log. History caches are confined to one
verified store snapshot and never authorize a later publication.

Skipping a step, using an unplanned input or attempting another call before a
required after report persists a `METHOD_DRIFT_*` denial before effect. That
retained denial fences further mission admission even if the process crashes
before response publication. After releasing the tool lock, the controller
uses the real revocation consumer and retains a `DegenerationIncidentEvent`
bound to the actual revocation checkpoint. Unknown/in-flight effects can leave
that checkpoint blocked; a blocked revocation is not completed containment.

`respond --input <json>` with exactly one `denyRef` retries response publication,
never the tool. Neither a later SITREP nor an incident saying "revoke" clears
the mission fence. A separately reviewed recovery contract is still required;
do not invent a reset, wait out the hold, self-promote readiness or rename the
same stopped task to claim renewed authority. Existing admitted callbacks,
effect settlement, revocation and failed reporting remain available.

Completion and successful wave report publication recheck mandatory steps,
actual result records, all required reports and drift state. The new records,
their byte copies and whole-JSON MIME-disguised copies are control metadata,
not work evidence. Native dispatch policies, leases, admission events and execution
checkpoints are also control records, whether cited directly, copied byte-for-byte,
or reformatted as JSON/text/binary deliverables. A checkpoint's recorded result
binding cannot replace the task's separately retained output.
This includes derived legacy SITREPs without a `type` tag: the report consumer
compares complete canonical JSON content against retained control records, not
only byte hashes or MIME/type labels. Its cache belongs to one verified manifest
and one binding appraisal. Publication performs a fresh appraisal after required
controls, so a newly introduced metadata alias cannot cross the final write.
Actual outputs must be retained separately. Whole-record equality does not prove
the semantic authenticity of arbitrary prose, wrappers or modified data.

## Validation And Limits

Run `node run-disciplined-initiative-fixtures.js`,
`node run-skill-control-evidence-fixtures.js`, generic validator fixtures,
dispatch, adoption/revision, lifecycle, routing, registry and both skill checks
against a frozen source tree before integration. Preserve failed exploratory
attempts and distinguish them from exact-head proof.

Exact reviewed input hashes are commitments, not proof of an arbitrary shell
command's effect or natural-language intent. Instructions are reviewed text,
not an independently verified parser for arbitrary tool inputs. The trusted local hook/provider
result path and same-host artifact custody have their existing limits. This
does not deploy an exclusive gateway, protected keys/hosts, independent time,
distributed coordination or monitoring. Deployment selection remains deferred
by the USER; all eight outcomes retain their actual remaining scope.
