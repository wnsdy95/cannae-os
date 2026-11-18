# Evaluation Fixtures

## 0. Purpose

This document defines the list of fixtures and expected results for evaluating the military-style LLM runtime.

Evaluation fixtures are used to verify that runtime gates actually function, not to assess document quality.

## Skill Maintenance Checks And Evidence

For the active [skill reliability cycle](completion-backlog.md#skill-reliability-acceptance),
choose focused checks by the changed surface, not by the shortest green command.
These groups are additive when a change crosses boundaries. They are a starting
map, not automatic dependency discovery or permission to omit a routed control.

| Changed surface | Focused checks before broader verification |
| --- | --- |
| Navigation or evidence/history prose | Both skill validators and router coverage; source-map linter; Markdown links; English-only; `git diff --check` |
| Router or intake | `run-document-routing-fixtures.js`, `run-routing-korean-intake-fixtures.js`, `run-skill-maintenance-routing-fixtures.js`; preflight/control-enforcement and document-session consumers when affected |
| Entrypoint or conditional instructions | `run-skill-progressive-disclosure-fixtures.js`, both skill validators, installation and context-document-integrity fixtures; every suite that asserts entrypoint or reference text, including `run-authoring-review-packet-fixtures.js` (list them with `grep -l controls-doctrine-operator run-*.js`); actual authorized-input checks for native comparisons |
| Validator or runtime-digest code | `validator-cli-prototype/run-fixtures.js`; for a file in a contract's runtime-digest list, such as `dispatch-issuance-contract.js` `CODE`, rerun the dispatch-issuance, method-control and training-session sample writers, confirm only digest-derived fields change and run their contract fixtures |
| Project sources or handoff | `run-project-document-packet-fixtures.js`, `run-project-document-git-fixtures.js`, `run-project-document-review-fixtures.js`, `run-project-document-reader-fixtures.js`, `run-project-document-session-fixtures.js` and affected terminology/dependency cases; source appraisal and actual receiving remain separate |
| Terminology or dependencies | `run-project-terminology-fixtures.js`, `run-project-terminology-change-fixtures.js`, `run-project-terminology-writer-fixtures.js`, `run-project-terminology-handoff-fixtures.js`, `run-project-knowledge-dependency-fixtures.js`, `run-project-document-git-fixtures.js` and affected stale-source cases |
| Installation or client integration | Skill installation, installation-inspector and client-discovery fixtures; test both providers and the changed link/copy path |
| Evidence index | `run-skill-evidence-index-fixtures.js`, inspection of the actual retained records, and the documentation checks above |

A reworded rule keeps its assertion: update the expected text to the current
wording of the same rule instead of deleting the check. A sample writer's output
must equal the stored sample; regenerate it rather than editing hashes by hand.
When a full gate fails a suite outside the selected focused set, retain that run
and add the missed coupling to this map in the same change.

For operation-local packet inspection reuse, the reader fixture also checks
two real reviewed compilations per call, fresh later calls, standalone projection
checks, exact recipients and source/decision/expiry changes between appraisals.
Keep packet/review/Git/terminology/session consumers in the affected set; a lower
call count alone cannot prove freshness or full integration. Historical proposal
bindings must stay unchanged when screening implementation bytes change.

For a routing-evaluation harness change, also run `run-skill-evaluation-fixtures.js`:
its synthetic bundle checks all 96 local invocations, changed pins/bundles, one-use
records, malformed outputs, retained process failures and mid-run checkout drift.
These fixture cases are not the actual reserved evaluation. Keep original criteria
and inspect the real pinned comparison separately after candidate freeze.

Before merge, run the current complete gates from `.github/workflows/validate.yml`,
including validator fixtures, `run-all-fixtures.js`, the unified proof gate and
the declared live OCI requirement. A smaller passing group is not that full run.
Record environment limitations, failed commands and unexecuted suffixes. Do not
set skip modes, relax product deadlines or infer native-model consent to make a
gate pass. CI completion and a local inspection are separate evidence.

When integrating independently extended validator exclusion lists, run the CLI
fixtures and inspect their both-API non-execution matrix. It covers valid local
terminology/dependency records and retained training/reconciliation records
together. Keep both exclusions; a schema-invalid denial or a pass from either
unmerged branch does not prove the integrated authority boundary.

### Read-Only Evidence Index

Keep the cycle's private index under its target repository's `.cannae/maintenance/`.
`skill-evidence-index.js` inspects an explicitly supplied index; it never scans
for logs, executes recorded commands, rewrites history or reconstructs lost files.
Invoke the helper from the router's returned doctrine root, not a guessed target
project installation path:

```bash
node "$DOCTRINE_ROOT/skill-evidence-index.js" \
  --repository /absolute/target-repository \
  --index .cannae/maintenance/cycle/evidence-index.json
```

The version-1 local format has `version`, `cycle`, `repository` and `entries`.
`repository` is the exact root/Git-directory/device/inode identity returned by
`project-terminology.js`'s existing `identity` helper. Each entry contains:

- A unique `id`, applicable `criteria` from SR01-SR18, and `scope`: `focused`,
  `full_integration`, `native` or `source_appraisal`.
- `recorded_outcome`: `pass`, `fail`, `incomplete` or `not_run`; the exact
  `source_revision`; and a recorded argument-array `command` or `null` for appraisal.
- Nonempty `source_files` and the retained `evidence_files`, each binding an exact
  repository-relative `path`, SHA-256 `sha256` and byte count `bytes`. A `not_run`
  entry has no evidence files; an attempted check must retain its available evidence.

Use the source hashes captured by the original run, including its actual harness,
inputs and applicable dependencies. Take result hashes/sizes when recording it.
Do not rehash changed current sources into an old entry to make it look current.
New runs get new IDs; retain failed attempts alongside later results. Keep source
and result bodies private, and review any index before sharing its paths/arguments.
This local analysis format is not a runtime authorization contract.

The report separates source currentness from result retention. Files can match,
change, disappear, become unsafe/unavailable or change during inspection.
Unexecuted checks stay `not_recorded`; missing input indexes return an unavailable
inspection. Relative escapes, symlinks, hardlinks and repository substitutions do
not become retained evidence. No source or log body is printed, including malformed
JSON errors. Reads have file/inventory limits; no missing item is silently skipped.

`integrity_ok` means only that every declared file matches and every entry has
retained result bytes. It can be true for a recorded failed run. Exit 0 has this
same limited meaning; exit 1 includes changed, unavailable, unexecuted or invalid
inputs. `recorded_outcome`, scope and revision attribution remain metadata, not
recomputed test verdicts or attested execution. The helper checks neither undeclared
dependencies nor the completeness of a full-integration claim. Inspect the original
result, invocation and source coverage before acceptance. Its recorded-command
execution, semantic acceptance and merge-authorization flags always remain false.
The inspection itself reads files and queries local Git repository metadata;
those are not executions of the indexed checks. It is not a protected
host or a replacement for guarded receipts, USER decisions or native receiving.

## 1. Fixture Categories

| Category | Purpose |
| --- | --- |
| Schema fixtures | Validates JSON Schema fields/types |
| Semantic fixtures | Validates intent, authority, CCIR, MOP/MOE |
| Policy fixtures | Determines ROE classification |
| Evidence fixtures | Validates source discipline |
| Runtime fixtures | Validates SITREP/FRAGO/AAR flow |
| Backbrief fixtures | Validates restatement of intent/task/stop conditions before execution |
| Rehearsal fixtures | Validates dry-run sequence, friction points, and decision points |
| Approval scope fixtures | Validates single-use approval, expiry, rollback, and evidence |
| Approval consumption fixtures | Validates that an approval event consumes scope exactly once |
| Risk acceptance fixtures | Validates commander-retained authority, residual risk, and supervision |
| Authority integration fixtures | Validates the composite of policy, readiness, scoped approval, and risk acceptance |
| Release integration fixtures | Validates the separation of execution approval and release review |
| Release gate decision fixtures | Validates agreement between release integration results and event log audit decisions |
| Release gate dashboard fixtures | Validates the released/release-review-blocked/authority-blocked dashboard queue |
| Authority delegation projection fixtures | Validates active/revoked/expired delegated authority dashboard state |
| Maintenance dashboard fixtures | Validates ready/degraded/down sustainment readiness dashboard state |
| AAR readiness update fixtures | Validates that AAR findings convert into readiness/SOP/maintenance updates |
| Annex fixtures | Validates that an annex cannot silently change OPORD intent/authority |
| FRAGO scope-change fixtures | Validates that mission scope/authority changes are issued together with backbrief/rehearsal |
| Rehearsal routing fixtures | Validates that friction/decision points convert into CCIR alerts and decision packets |
| Information operations routing fixtures | Validates that information reports/assessments are correctly routed into CCIR, SITREP, decision packet, and FRAGO drafts |
| Continuity drill fixtures | Validates that position loss/replacement/rotation converts into successor, handoff, and degraded mode |
| Document access fixtures | Validates that only documents defined for a given role, duty, and authority are delivered as the allowed projection |
| Doctrine consistency fixtures | Validates non-US official source family coverage, role alias handling, jurisdiction gate, and blocking of US-only disposition |
| SOF TF activation fixtures | Validates that a high-risk task force charter has an independent cell, enablers, rehearsal, and a commander-retained gate |
| Department collaboration fixtures | Validates that supported/supporting relationships between departments have an output contract, liaison, handoff, and conflict route |
| Force structure change fixtures | Validates that the creation, disestablishment, expansion, or reduction of a branch/position/unit/TF has a capability gap, DOTMLPF-P review, readiness, transition, and documentation gate |
| Agent routing preflight fixtures | Validates that execution is blocked if the CoS routing receipt and each agent's S3 routing receipt are missing before a wave starts |
| Proof-carrying improvement fixtures | Validates executed receipts, exact parent lineage, approval consumption, rollback, and completion |
| Signed improvement fixtures | Validates Ed25519 DSSE receipt binding, trusted multi-verifier quorum, group diversity, expiry, and v0.2 compatibility |
| Verification runner fixtures | Validates exact argv execution, shell/inline-code prohibition, stale plans, and mutation detection |
| Verifier independence fixtures | Validates provider-native failure-domain claims, transitive correlation, deterministic domain reconstruction, and post-execution quorum independence |
| Transparency operations fixtures | Validates RFC 6962 consistency above 32 bits, rollback/equivocation detection, observer time/operator quorum, TUF root rotation/expiry, immutable incident recovery, monotonic evidence time, state reconstruction, freshness, and v0.7 admission |
| Transparency supervisor fixtures | Validates that embedded transparency evidence or incident evidence references absent from the verified repository manifest cannot authorize dispatch |
| Artifact concurrency/recovery fixtures | Validates shared-filesystem leases, monotonic fencing, stale-writer rejection, write-ahead recovery, hash-linked history, and tamper detection |
| Protected tool gateway fixtures | Validates trusted principal/gateway binding, exact tool admission, idempotency conflict, execution-token correlation, committed receipt, pre-execution cancellation, and unknown-outcome recovery |

## 2. Required Fixtures

| Fixture | Expected |
| --- | --- |
| valid mission | pass |
| mission missing intent | schema fail |
| OPORD missing authority | semantic critical |
| OPORD MOP only | semantic warning |
| Red tool request without approval | policy critical |
| Black action secret output | policy block |
| research task without source requirement | semantic error |
| claim without evidence | evidence warning |
| blocked SITREP without decision request | semantic error |
| AAR without SOP update | semantic warning |

## 3. Scoring

| Result | Meaning |
| --- | --- |
| Pass | Validator/policy result matches expected |
| Fail | Wrong severity or wrong allow/block |
| Weak | Correct class but poor message/fix |

## 4. Example Expected Result

```yaml
fixture: invalid-tool-request-red-without-approval.json
expected:
  schema: pass
  semantic:
    - code: RED_WITHOUT_APPROVAL
      severity: critical
  policy:
    roe_class: Red
    allowed: false
    approval_required: true
```

## 5. Regression Policy

Validator changes must not:

- downgrade critical to warning without explicit reason.
- allow Red tool request without approval.
- allow Black action.
- accept OPORD without mission/intent.
- accept backbrief without stop conditions.
- allow rehearsal execute disposition with unresolved required changes.
- allow consumed approval reuse.
- accept approval consumption event with target/time/status mismatch.
- accept approval revocation after consumption or by non-granting authority.
- accept approval renewal after expiry or with expanded execution count.
- accept approval delegation by staff or delegation of Commander-retained authority.
- accept approval delegation revocation by staff or stale delegation termination.
- allow high-risk action with approval but no risk acceptance.
- allow release-required output with execution approval but no release review.
- allow invalid release review to override context filter or EEFI denial.
- allow release review for a different target to authorize final or external release.
- allow valid release review to override missing authority or risk acceptance.
- record a release gate decision event that disagrees with release integration output.
- accept schema payloads with `additionalProperties: false` violations.
- mark schema-invalid payloads as executable.
- order event logs or alert routing by timestamp string instead of absolute time.
- replace tool request actor with a dashboard default actor.
- omit release-review-blocked or authority-blocked release gate decisions from dashboard projection.
- omit revoked or expired authority delegation from dashboard projection.
- omit degraded or unavailable maintenance assets from dashboard projection.
- convert critical AAR findings into readiness downgrade without commander review.
- allow annex to change OPORD intent or authority boundary.
- allow scope-changing FRAGO without affected roles, backbrief, or rehearsal.
- drop high or critical rehearsal friction before creating CCIR alert or decision packet.
- allow order-changing information without CCIR classification and commander decision route.
- allow low-confidence assessment to emit FRAGO scope change.
- leak EEFI or credential-like raw information after release-block routing.
- accept continuity plan with single successor, self-successor, missing vital records, or unbounded authority transfer.
- allow role rotation without overlap, backbrief, handoff packet, and rehearsal discipline.
- allow commander loss to silently transfer Red approval, risk acceptance, release target expansion, or FRAGO scope change authority.
- allow document access manifest without default deny, need-to-know, no-bulk-read, audit, exception approval, explicit document paths, declared duties, allowed roles, readable required documents, and restricted raw block.
- allow doctrine consistency review with fewer than four official source families, fewer than three non-US source families, `adopt_us_only` disposition, missing role alias handling, missing jurisdiction gate, disabled controls, or placeholder documentation updates.
- allow SOF TF activation without concrete trigger, independent Red Team, independent release review, Recorder/KM, source-map discipline, fallback, rehearsal, abort criteria, and commander-retained authority.
- allow department collaboration without command integration, Recorder/KM, source-of-truth files, output contracts, liaison rules, decision packet route, source-map discipline, handoff, AAR, or EEFI controls.
- allow force structure change without evidence, alternatives, full DOTMLPF-P review, Commander authority for organization creation/expansion, maintainer, validation fixture, handoff, sunset condition, documentation update, MOP/MOE, AAR trigger, and future review date.
- allow delegated AI wave execution without one CoS wave routing receipt and one S3 operations routing receipt per expected agent.
- accept routing receipt claims that were not produced by `route_controls_docs.js --actor=ai`.
- promote an adaptive candidate from model-authored validation text instead of a runtime-issued receipt.
- accept a receipt whose campaign, cycle, candidate, repository state, command result, or canonical digest does not match.
- promote a v0.3 candidate without the configured number of distinct trusted verifier IDs, Ed25519 keys, and independence groups.
- let declared independence-group labels hide a shared provider, operator, control plane, account, project, runner pool, infrastructure, region, or zone.
- count a verifier toward quorum when its signed execution evidence resolves to a correlated or substituted failure domain.
- dispatch under trust-policy v0.7 without a complete, current, reconstructable and manifest-backed transparency state sequence.
- accept checkpoint rollback, same-size root conflict, invalid consistency proof, stale observation, invalid observer signature, insufficient distinct observer operators, or witness/monitor operator overlap.
- accept a skipped or incorrectly signed TUF root version, drop incident history, resolve an incident without exact immutable supersession, or reactivate a revoked component without authorized replacement.
- accept a signature over a different receipt self-digest, changed DSSE payload, expired attestation, expired trust root, untrusted repository, or duplicate signer evidence.
- treat a signed `remote` execution-origin claim as proof of trusted execution or provider independence.
- continue from a parent decision that is missing, rejected, from another cycle, or bound to another baseline revision.
- accept a policy or authority candidate from a prose approval claim or a reused consumption event.
- promote a skill or runtime-control candidate without one pre-persisted evaluation set and plan executed against distinct baseline and candidate states.
- reuse a comparative evaluation set across campaigns or missions.
- use one revision as both baseline and candidate for promotion, or different revisions for completion revalidation.
- accept a comparative report with a changed fixture order, stale repository state, different harness hash/argv, malformed observation, mismatched stdout hash, incomplete dimension coverage, or non-independent evaluator.
- treat a relative improvement as sufficient when the candidate misses an absolute target, exceeds a maximum-regression threshold, or fails a held-out fixture.
- treat an `inconclusive` comparison as a pass, or let any comparison report authorize execution, merge, push, or release.
- promote a v0.4 control-plane candidate without a distinct-key, multi-group quorum over the exact persisted comparative report.
- accept a report attestation bound to another artifact hash, report self-digest, plan, evaluation set, campaign, baseline, candidate, evaluator invocation, repository, origin policy, or validity window.
- count duplicate, expired, untrusted, or same-group report attestations toward comparative quorum.
- accept a repository artifact store with a pending journal, broken history chain, sidecar mismatch, or changed artifact bytes.
- let an expired writer commit after a replacement lease has received a higher fencing token, steal an unexpired foreign-host lease, reuse a fencing token across different lease IDs, regress a token, or lose a revision reserved in immutable history.
- allow a protected tool transaction with a substituted principal, gateway configuration, repository checkpoint, raw-input digest, operation class, or stale execution token.
- reuse one gateway idempotency key for a changed request, reuse one transaction ID for a different request or key, persist raw tool input in audit artifacts, claim managed exclusivity from the Phase 17A reference controller, or infer production/release authority from a receipt.
- mark an authorized-but-unstarted request aborted without exact cancellation, or mark an executing request successful when its outcome cannot be correlated.
- leave a crash-retained allow admission active after recovery, or accept begin/commit timestamps that precede their retained transaction events.
- accept research task with no source discipline.

## 6. Related Documents

- `sample-payloads/README.md`
- `validator-prototype.md`
- `policy-engine-rules.md`
- `prompt-dsl-validator.md`
