# Evaluation Fixtures

## 0. Purpose

This document defines the list of fixtures and expected results for evaluating the military-style LLM runtime.

Evaluation fixtures are used to verify that runtime gates actually function, not to assess document quality.

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
| Artifact concurrency/recovery fixtures | Validates shared-filesystem leases, monotonic fencing, stale-writer rejection, write-ahead recovery, hash-linked history, and tamper detection |

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
- accept research task with no source discipline.

## 6. Related Documents

- `sample-payloads/README.md`
- `validator-prototype.md`
- `policy-engine-rules.md`
- `prompt-dsl-validator.md`
