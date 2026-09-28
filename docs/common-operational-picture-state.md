# Common Operational Picture State

## 0. Purpose

The common operational picture is the single shared display of relevant information that lets the commander and staff decide from the same facts. In this framework, the COP is the shared runtime state model: one projection of mission truth that every role reads from, and that no role writes to by hand.

This document extends `ccir-alerting-model.md`. That document defines which events become alerts; this document defines the state model those alerts live in, how the state is derived, when it may be trusted, who may see which part of it, and what is deliberately kept out of it.

Without a defined COP, LLM operations degrade in predictable ways:

- Each agent answers from its own conversation memory, so "current status" differs by who is asked.
- The dashboard becomes a log viewer instead of a decision surface.
- Approvals, readiness, and risk are re-derived ad hoc, and the derivations disagree.
- Handoffs transfer prose instead of state.

Core principle:

```text
The event log is the source of truth.
The COP is a projection of it.
Nobody edits the COP; they emit events, and the COP follows.
```

## 1. Doctrinal Basis

- `Claim`: ADP 6-0 treats shared understanding as the foundation of mission command; commanders and staffs build and maintain it deliberately, because subordinates exercising initiative must act from the same picture of the situation as the commander (ADP 6-0, Mission Command).
- `Claim`: ADP 5-0 describes the operations process as driven by continuous assessment against a commonly understood situation, with the COP tailored to the commander's requirements and based on common data (ADP 5-0, The Operations Process).
- `Claim`: The Joint Staff CCIR Focus Paper links CCIRs to the commander's decisions, not to general awareness; the staff filters the information flow so the commander sees decision-relevant state (Joint Staff CCIR Focus Paper).
- `Claim`: The Knowledge and Information Management Focus Paper (https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf) distinguishes managing information artifacts from managing shared understanding, and makes the staff responsible for keeping the common picture current and trusted.
- `Interpretation`: For an LLM runtime, "shared understanding" cannot live in conversation history, because conversation history is per-agent, lossy, and compactable. The only durable shared substrate is the event log, so the COP must be a deterministic projection of that log.
- `Application`: The runtime maintains one COP projection per mission, rebuilt from events by projection runners, and rendered as role-filtered views in `dashboard-ui-prototype/`.
- `Research Gap`: Doctrine describes COP tailoring by echelon and function, but public sources give little detail on conflict resolution when two staff sections assert contradictory state; the current design resolves this by event ordering only.

## 2. COP Contents

The COP is the minimum state needed to decide, not the maximum state available. It contains the following blocks.

| Block | Contents | Feeding events | Existing projection analog |
| --- | --- | --- | --- |
| Mission state | Mission id, title, phase, status, intent summary, decision count | mission intake, phase transition, closeout | `dashboard-state.json` mission block |
| Order lineage | Current OPORD id, WARNO/FRAGO chain, annex versions, which order authorizes the current task | order issued, FRAGO applied, annex updated | SITREP "Current order" line |
| Active approvals | Pending, granted, consumed, revoked, expired approval scopes with owner and deadline | approval scope lifecycle events | approval queue, `authority-delegation-projection-state.json` |
| CCIR alert queue | Open PIR/FFIR/EEFI/Decision Point alerts by severity, per `ccir-alerting-model.md` | detection rules over the event stream | `ccir_alerts` panel |
| Readiness | Per-agent readiness rating, degraded tools, sustainment status | readiness updates, maintenance reports | `maintenance-readiness-dashboard-state.json`, readiness block |
| Risk board | Open risks, controls in effect, accepted residual risk with accepting authority | risk raised, control applied, risk accepted | risks block |
| Evidence links | Claim/interpretation pairs with links to evidence items, never raw evidence bodies | evidence recorded, review completed | evidence block |

Rules:

- Every COP entry must carry the id of the event that produced it. An entry without a source event id is invalid.
- The COP stores links to evidence, not evidence bodies. Raw source text stays in the evidence store.
- The CCIR alert queue in the COP is the same queue the alert router produces; the COP does not maintain a second alert list.

- `Interpretation`: These seven blocks correspond to the questions a commander asks before deciding: what is the mission, under what order, what awaits my approval, what needs my attention, what can my force do, what can go wrong, and what is the basis for the claims in front of me.
- `Application`: Each block is a separate projection section so that a role-based view can include or exclude blocks without re-deriving them.

## 3. Derivation From the Event Log

The COP is a projection, never a document anyone edits.

```text
event log (append-only, timestamp-ordered)
-> projection runner (deterministic replay)
-> COP state object (per mission)
-> role-filtered views
-> dashboard render
```

Rules:

1. The COP is rebuilt by replaying events; the same log always yields the same COP.
2. Replay orders events by parsed absolute timestamp, not string order, matching the `event-fixtures/` convention.
3. A hand edit to a COP state file is a policy violation. Corrections are made by emitting a correction event and re-projecting.
4. Projection runners are pure: no network calls, no clock reads except to stamp `projected_at`, no writes to the event log.
5. If projection fails, the COP is marked unavailable rather than silently serving the last good state as if current.

- `Claim`: ADP 5-0 treats the COP as maintained from common data sources rather than composed independently by each echelon (ADP 5-0, The Operations Process).
- `Application`: This is the existing pattern of `dashboard-ui-prototype/` state files generated by projection runners; the COP generalizes it into a single mission-level state contract.

## 4. Staleness and Consistency Rules

A COP that may be stale must say so. Every COP object carries:

| Field | Meaning |
| --- | --- |
| `projected_at` | When the projection was built |
| `last_event_id` | The last event folded into this projection |
| `last_event_at` | Timestamp of that event |
| `staleness` | `current`, `stale`, or `unavailable` |

Rules:

- `current`: the projection includes every event known at render time.
- `stale`: events exist that the projection has not folded in. A stale COP may be read but must display its staleness, and Red/Black decisions must not be taken from a stale COP; the decision waits for re-projection.
- `unavailable`: projection failed or the log cannot be read. All execution gated on COP state is blocked, not defaulted to the last snapshot.
- Consistency is per mission, not global: one mission's stale projection does not block another mission.
- Two viewers reading the same `last_event_id` must see identical block contents; any divergence is a projection defect, never an acceptable rendering difference.
- The COP never shows a value with no event behind it. "Unknown" is displayed as unknown, not filled with the most plausible value.

- `Interpretation`: The military problem of reporting latency between echelons maps to projection lag between the event log and the rendered COP. Doctrine's answer is to time-stamp reports and state "as of" times; the runtime answer is the staleness contract above.
- `Research Gap`: Acceptable staleness windows per decision severity (for example, how old a COP may be for an Amber decision) are not yet fixed; current policy only distinguishes Red/Black, which require a current projection.

## 5. Role-Based COP Views

The COP is shared, but not uniformly visible. Views follow need-to-know as defined in `role-document-access-policy.md`: the default is deny, and a role sees a block only when its duty requires it.

| Role | Mission state | Order lineage | Active approvals | CCIR queue | Readiness | Risk board | Evidence links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| COMMANDER | full | full | full | full | full | full | full |
| COS | full | full | full | full | full | full | full |
| S2 | summary | summary | none | PIR only | none | related risks | full |
| S3 | full | full | own-mission | PIR/FFIR/DP | full | full | reference |
| S4 | summary | none | none | FFIR only | full | resource risks | none |
| S6 | summary | summary | none | EEFI only | tool readiness | protection risks | reference |
| RED_TEAM | summary | summary | reference | full, redacted | summary | full | reference |
| EXECUTOR | own task | own order chain | own approvals | own alerts | own readiness | own task risks | none |
| RECORDER | full | full | reference | reference | reference | reference | reference |

Rules:

- View filtering happens at projection output, not at render, so an over-broad client cannot recover a filtered block.
- `sensitive: true` alerts appear in non-Commander views as existence-only entries: id, severity, and owner, without title or body, consistent with the EEFI handling rule in `ccir-alerting-model.md`.
- A role needing a block outside its view requests it as a document-access exception, which is a Commander/CoS approval event, per `role-document-access-policy.md`.
- View membership is derived from the mission's document access manifest, not hardcoded per dashboard.

- `Interpretation`: Doctrine tailors the COP by echelon and function so each user sees decision-relevant detail without drowning in the rest; need-to-know filtering additionally protects EEFI. Both motives apply unchanged to agent views.

## 6. Deliberate Exclusions

The COP is kept decision-shaped by excluding the following, permanently:

| Excluded | Where it lives instead | Why excluded |
| --- | --- | --- |
| Raw evidence bodies and source archives | evidence store | COP links to evidence; copying bodies invites unreviewed release |
| Credentials, secrets, raw EEFI content | never stored in projections | prohibited from display by `ccir-alerting-model.md` |
| Chain-of-thought and agent working notes | agent-local scratch, running estimates | reasoning is not state; publishing it creates false authority |
| Full event log history | event log | the COP is current state, not history; history is replayed on demand |
| Completion chatter and progress prose | event log entries at Info severity | per `reporting-threshold-policy.md`, non-CCIR reports route to the log |
| Per-agent conversation transcripts | not a source of truth at all | transcripts are lossy and per-agent; state derived from them is unverifiable |
| Speculative or unsourced assessments | running estimates marked as such | the COP shows claims with event lineage only |

- `Interpretation`: The strongest anti-noise control is structural: if trivia cannot enter the COP, trivia cannot compete for the commander's attention. Exclusion is therefore a design rule, not a rendering choice.
- `Research Gap`: Whether running estimates should get a dedicated COP block (as staff estimates summarized to one line each) or stay outside the COP entirely is unresolved; current policy keeps them outside.

## 7. Source Anchors

- Joint Staff CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- Knowledge and Information Management Focus Paper (Joint Staff J7): https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf

## 8. Implementation Candidates

The [implementation registry](implementation-candidate-registry.md) tracks these requirements, equivalent paths, checks, and remaining work. A proposed filename is not proof of completion.

- `schema-files/cop-state.schema.json`
- `cop-projection-runner.js`
- `run-cop-projection-fixtures.js`
- `cop-view-filter.js`
- `dashboard-ui-prototype/cop-state.json`
- `cop-staleness-gate.js`
