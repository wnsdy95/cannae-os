# Dry-Run Approval UI

## 0. Purpose

This document specifies the approval surface on which a rehearsal or dry-run result is presented to the commander for disposition.

`backbrief-and-rehearsal-sop.md` defines when a backbrief and rehearsal must occur and which judgment rules block execution. `approval-ui-patterns.md` defines the general approval card and decision levels. Neither document specifies what the commander actually sees after a dry-run completes, or how the four commander dispositions become recorded events. This document closes that gap. It does not duplicate the SOP or the general approval patterns; it references and extends them.

The purpose of this surface is not to display the dry-run log. It is to let the risk acceptor decide, from evidence, whether the remaining risk is controllable within the authority scope.

## 1. Doctrinal Basis

- `Claim`: The Commander and Staff Guide to Rehearsals describes the rehearsal as a deliberate event that exposes friction, synchronization gaps, and decision points before execution, so that the plan is corrected while correction is still cheap.
- `Claim`: FM 5-0 places the confirmation brief and backbrief between orders production and execution, so that the subordinate's understanding is verified before any action is taken.
- `Interpretation`: A dry-run result is not a courtesy preview. It is the evidence packet on which the commander exercises retained decision authority; without it, approval degenerates into approving a sentence rather than an action.
- `Application`: In the LLM runtime, every rehearsal/dry-run output that carries an Amber or Red action is projected onto this surface, and execution is impossible until a disposition event exists.
- `Research Gap`: How much dry-run fidelity (simulated tool call vs. read-only real call vs. staging call) is required per ROE tier is not yet fixed in doctrine terms.

## 2. Position in the SOP

```text
Receive OPORD / Task Order
-> Confirmation Brief
-> Backbrief
-> Rehearsal / Dry Run              (backbrief-and-rehearsal-sop.md)
-> DRY-RUN APPROVAL SURFACE         (this document)
-> Disposition Event Recorded
-> Execute / Revise / Abort / FRAGO
```

Entry conditions for the surface:

| Condition | Rule |
| --- | --- |
| Rehearsal object exists | Must validate against `schema-files/rehearsal.schema.json` |
| Backbrief linkage | The rehearsal must reference at least one backbrief |
| Router output attached | Friction/decision points already routed by `rehearsal-to-ccir-router.js` |
| ROE tier resolved | Every planned action carries a Green/Amber/Red/Black rating |

Green-only rehearsals may bypass this surface under standing policy; the bypass itself is logged.

## 3. Required Contents of a Dry-Run Result

A dry-run result presented for approval must show all of the following. A result missing any block is not approvable; the surface renders it in the blocked state of section 7.

| Block | Contents | Source object |
| --- | --- | --- |
| Planned tool calls | Ordered list: actor, tool, action, target, expected result, evidence required | `sequence` in the rehearsal object |
| Predicted effects | What changes where: rows, files, endpoints, cost, external visibility | Dry-run execution output |
| Risk deltas | Risk level before vs. after mitigations; new risks the dry-run surfaced | `friction_points` plus dry-run findings |
| Stop conditions | The conditions under which execution halts immediately | Carried from the backbrief; must be restated, not linked |
| Rollback | Per irreversible step: rollback method, or an explicit "no rollback" flag | Dry-run output plus order annex |
| Required changes | Unresolved changes that block an execute disposition | `required_changes` in the rehearsal object |
| Approval scope status | Which approval scope covers each Amber/Red action, or "none" | `schema-files/approval-scope.schema.json` objects |

Display rules inherited from `approval-ui-patterns.md` and `dashboard-wireframes.md`:

- Risk and rollback are never hidden or collapsed by default.
- The approval scope and its expiry are always visible.
- Evidence for each predicted effect is one drill-down away, not embedded prose.

## 4. Commander Dispositions as UI Actions

After reviewing the dry-run result, the commander chooses exactly one of four dispositions. These are the only actions on the surface.

| UI action | Meaning | Maps to rehearsal disposition | Next step |
| --- | --- | --- | --- |
| Approve | Remaining risk is controllable within the authority scope | `execute` | Execution proceeds through the tool/readiness gate, consuming the matching approval scope |
| Revise | The plan is wrong or incomplete; the order stands | `revise_order` | Task order or annex is revised; a new backbrief/rehearsal cycle runs |
| Reject | The action will not be executed | `abort` | Reason recorded; routed to SITREP/AAR |
| Fragment order | The mission scope, priority, or authority itself must change | (see `Research Gap` below) | A FRAGO scope-change object is issued; affected subordinates re-backbrief |

Rules:

- Approve is never a blanket approval. It binds to this rehearsal id, these tool calls, and the displayed approval scope, consistent with `approval-scope-policy.md`.
- Revise and Fragment order are distinct: Revise changes how the same mission is executed; Fragment order changes what the mission is. Choosing Revise when authority boundaries changed is an anti-pattern.
- Reject requires a reason field. A rejection without a recorded reason cannot be committed.
- `Research Gap`: the `disposition` enum in `schema-files/rehearsal.schema.json` (`execute`, `revise_order`, `request_approval`, `abort`) has no value for a fragment order. Until the schema is extended, a Fragment order disposition is recorded as a FRAGO scope-change event that references the rehearsal id.

## 5. Disposition-to-Event Mapping

Every disposition becomes exactly one event in the event log before anything else happens. The projection, not the button press, is the source of truth.

| Disposition | Event | Event payload highlights | Downstream projection |
| --- | --- | --- | --- |
| Approve | `RehearsalApproved` | rehearsal id, approval scope id, approver, expiry | Execution queue; approval scope marked pending consumption |
| Revise | `RehearsalRevisionOrdered` | rehearsal id, required changes accepted, revision owner | Task board; new backbrief/rehearsal expected |
| Reject | `RehearsalRejected` | rehearsal id, reason, risk snapshot | SITREP; AAR input |
| Fragment order | `FRAGOIssued` | frago scope-change id, referenced rehearsal id | Orders pipeline; affected agents re-backbrief |

Consistency rules:

- An Approve event without a valid, unexpired, unconsumed approval scope for every Red action is invalid and must be rejected by the policy gate, not merely warned.
- Actual execution then consumes the scope via the existing approval-consumption path; this surface never executes anything itself.
- All four events carry the dry-run evidence hash so the AAR can compare predicted effects with actual effects.

## 6. Wireframes

Consistent with the layout principles of `dashboard-wireframes.md`: decision first, logs second, risk visible, evidence nearby.

Primary surface, approvable state:

```text
+--------------------------------------------------------------------------------+
| Dry-Run Result: RH-0042            Mission: M-0173        Backbrief: BB-0089   |
| Disposition proposed by rehearsal: request_approval        ROE (max): RED      |
| Approval scope: AS-0021 (Red: database.update, expires 12:00) status: ACTIVE   |
+--------------------------------------------------------------------------------+
| Planned Tool Calls                                                             |
| 1. [S3] database.select    target: prod.customers   expected: 42 rows  GREEN   |
| 2. [S3] database.update    target: prod.customers   expected: 42 rows  RED     |
| 3. [S6] docs.write         target: decision log     expected: 1 entry  GREEN   |
+----------------------------------------+---------------------------------------+
| Predicted Effects                      | Risk Deltas                           |
| - 42 rows updated, 0 deleted           | - data corruption: HIGH -> MEDIUM     |
| - cost: $0                             |   (mitigation: verified backup)       |
| - no external visibility               | - new: lock contention LOW            |
+----------------------------------------+---------------------------------------+
| Stop Conditions                        | Rollback                              |
| - affected rows != 42                  | - step 2: restore from backup B-0007  |
| - validator failure                    | - steps 1,3: no rollback needed       |
| - any schema mismatch                  |                                       |
+----------------------------------------+---------------------------------------+
| Required Changes: none                 Evidence: [Open dry-run log] [Diff]     |
+--------------------------------------------------------------------------------+
| [Approve once] [Revise] [Reject] [Fragment order]                              |
+--------------------------------------------------------------------------------+
```

Blocked state (Red action, no approval scope):

```text
+--------------------------------------------------------------------------------+
| Dry-Run Result: RH-0043            Mission: M-0173        Backbrief: BB-0090   |
| ROE (max): RED         Approval scope: NONE                                    |
| BLOCKED: Red action has no matching approval scope. Approve is unavailable.    |
+--------------------------------------------------------------------------------+
| Planned Tool Calls                                                             |
| 1. [S3] deploy.production  target: api service      expected: v2 live  RED     |
+--------------------------------------------------------------------------------+
| Required Changes                                                               |
| - obtain scoped approval for deploy.production (decision packet DP-0012 sent)  |
+--------------------------------------------------------------------------------+
| [Revise] [Reject] [Fragment order]        [Open decision packet DP-0012]       |
+--------------------------------------------------------------------------------+
```

Rendering rules:

- In the blocked state the Approve control is absent, not disabled-but-visible, so a projection replay can never show an approvable Red action without scope.
- Black actions never reach this surface with any disposition control except Reject; there is no approval path for a Black action, per `tool-use-roe.md` and `approval-ui-patterns.md`.
- On narrow views, order of collapse follows `dashboard-wireframes.md` section 8: header and dispositions stay, effect/risk blocks become drill-downs.

## 7. Blocked States

The surface renders a blocked state, with Approve removed, whenever any of the following holds:

| Blocked state | Trigger | Allowed actions |
| --- | --- | --- |
| No approval scope | A Red action has no active approval scope covering tool, action, and target | Revise, Reject, Fragment order, open decision packet |
| Scope expired or consumed | The referenced approval scope is past expiry or already consumed | Revise, Reject, Fragment order, request renewal |
| Unresolved changes | `required_changes` is non-empty | Revise, Reject, Fragment order |
| Missing linkage | No referenced backbrief, or backbrief/order mismatch | Reject, Fragment order (re-issue) |
| Black action present | Any planned call is Black-rated | Reject only |
| Readiness failure | Executing agent lacks the readiness rating required for the action | Revise (reassign), Reject, Fragment order |

Invariant: a Red action without approval scope can never be launched from this surface. There is no override control, no "approve anyway", and no path where the disposition event grants scope implicitly. Scope is granted only through the approval workflow of `approval-scope-policy.md`, and this surface only ever consumes proof that it exists.

## 8. Anti-Patterns

- Presenting the raw dry-run log as the approval request and asking "OK to proceed?".
- Rendering Approve as the default or leftmost action for a Red result; the safe disposition leads.
- Approving a revised plan against a stale dry-run; any Revise invalidates the previous result.
- Recording the disposition only in conversation, with no event; replay must reconstruct every disposition.
- Using Fragment order as a shortcut to widen authority without a scope-change object.

## 9. Source Anchors

- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf

## 10. Related Documents

- `backbrief-and-rehearsal-sop.md`
- `approval-ui-patterns.md`
- `dashboard-wireframes.md`
- `approval-scope-policy.md`
- `tool-use-roe.md`
- `schema-files/rehearsal.schema.json`
- `schema-files/approval-scope.schema.json`
- `schema-files/frago-scope-change.schema.json`
- `rehearsal-to-ccir-router.js`

## 11. Implementation Candidates

Schema candidates:

- `rehearsal-disposition-event.schema.json`
- `dry-run-result.schema.json`

Runner candidates:

- `dry-run-approval-runner.js`
- `run-dry-run-approval-fixtures.js`
- `dry-run-approval-projection-runner.js`
- `dashboard-ui-prototype/dry-run-approval-state.json`
