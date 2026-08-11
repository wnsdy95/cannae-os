# Liaison Agent Model

## 0. Purpose

This document defines the liaison agent duty for the LLM operating framework: the role that stands between this organization and any external organization, external tool platform, external team, or foreign agent framework.

`docs/interdepartment-collaboration-policy.md` already defines liaison rules between internal departments of the same organization. This document extends that rule outward. It covers the case where the other side does not share this framework's glossary, templates, authority matrix, release policy, or source of truth, and therefore cannot be trusted to interpret internal artifacts correctly.

Core conversion:

```text
Military liaison = a commander's representative who preserves meaning, expectations,
and reporting flow across an organizational boundary without holding command authority
AI liaison agent = a bounded interface role that converts terminology, templates,
and reporting across a framework boundary without holding approval, risk, or release authority
```

## 1. Official Source Anchors

Sources with URLs verified in `docs/source-map.md`:

- Liaison appendix, FM 6-0 excerpt: https://www.globalsecurity.org/military/library/policy/army/fm/6-0/appe.htm
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- JCS Joint Task Force and Command and Control Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf

Additional primary sources (linked in `docs/source-map.md`):

- Commander and Staff Guide to Multinational Interoperability: https://api.army.mil/e2/c/downloads/2023/01/31/3dadfaa2/20-12.pdf
- Commander and Staff Guide to Mission Partner Environment: https://api.army.mil/e2/c/downloads/2025/04/29/59b51ef8/no-25-1004-commander-and-staff-guide-to-mission-partner-environment-apr-25.pdf
- Interorganizational Cooperation Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/interorgan_coop_fp.pdf

## 2. Why Liaison Is Necessary

- `Claim`: FM 6-0 and its liaison appendix describe liaison as the personal and official contact between commands that maintains mutual understanding, unity of purpose, and information flow; the liaison officer represents the sending commander but does not command.
- `Claim`: The JTF C2 Focus Paper stresses that complex organizations fail when command relationships and coordination channels between headquarters are left implicit.
- `Claim`: The Commander and Staff Guide to Multinational Interoperability and the Interorganizational Cooperation Focus Paper both treat exchanged liaison as a primary tool for bridging doctrine, terminology, procedure, and trust gaps between organizations that do not share a common headquarters.
- `Interpretation`: The boundary problem is semantic before it is technical. Two organizations can exchange perfectly valid JSON and still disagree about what "approved", "done", "blocked", or "safe" means. A liaison exists to keep meaning, expectations, and reporting stable where the shared contract ends.
- `Interpretation`: Without a designated liaison, every internal role becomes an accidental interface, and each one leaks internal terminology, internal state, and unwarranted commitments in its own way.
- `Application`: In this framework, any dependency that crosses the organization boundary must have exactly one designated liaison agent, a declared partner command relationship (`docs/partner-command-relationship.md`), and a release packet channel (`docs/interop-release-packet.md`). No liaison, no external dependency.

## 3. When a Liaison Is Mandatory

A liaison agent is mandatory whenever the counterpart does not operate under this framework's authority matrix and source of truth.

| Boundary type | Example | Why internal roles cannot interface directly |
| --- | --- | --- |
| External tool platform | Third-party SaaS API, external CI system, hosted model endpoint | The platform's vocabulary (status codes, webhooks, quotas) does not map 1:1 to mission state; queries and payloads can leak EEFI |
| External team | Another human team, vendor, or department outside this command structure | The team has its own priorities, templates, and approval chain; internal reporting formats would be misread as commitments |
| Foreign agent framework | Another multi-agent system with its own orchestration, roles, and message contract | Role names, confidence conventions, and authority assumptions differ; a foreign "approve" event is not an approval in this framework |

Rules:

- One liaison per boundary, not per message. Parallel unmanaged contact points recreate the problem the liaison exists to solve.
- The liaison is declared in the collaboration charter (`schema-files/department-collaboration-charter.schema.json` `liaison_rules`), and a missing liaison on an external dependency is a preflight block, mirroring the missing-liaison projection in `department-collaboration-runner.js`.
- Purely public, read-only consumption of a stable published interface (for example, fetching public doctrine pages) does not require a liaison; the boundary becomes mandatory the moment anything flows outward or the external side's state feeds internal decisions.

## 4. What the Liaison Owns

| Duty | Content | Failure it prevents |
| --- | --- | --- |
| Terminology conversion | Maintains the bidirectional glossary between internal terms (role IDs, classification labels, Green/Amber/Red/Black) and partner terms, extending the role alias map standard in `docs/multinational-doctrine-consistency-review.md` | The same word carrying different meanings on each side |
| Template conversion | Converts between internal contracts (OPORD, SITREP, task order, decision packet) and the partner's formats without altering substance | Partner misreads an internal draft as a final order, or vice versa |
| Expectation management | States what this organization will and will not deliver, by when, under which caveats; corrects partner assumptions early | Silent divergence between what the partner expects and what was actually promised |
| Reporting relay | Moves reports across the boundary in both directions on a declared cadence, tagging origin, time, and reliability; routes inbound partner information into the information intake path (`docs/information-to-operations-cycle.md`) rather than directly into orders | Partner reports mutating internal mission state without assessment |
| Authority-boundary explanation | Explains to the partner which requests this organization can act on directly, which require escalation, and who the real approval authority is | Partner escalating pressure on an agent that never had the authority to comply |

- `Interpretation`: Everything the liaison owns is conversion and flow. Nothing the liaison owns is decision.

## 5. What the Liaison Never Owns

The liaison speaks for its parent organization; it never decides for it.

- Committing the parent organization: the liaison may not accept tasks, deadlines, scope changes, or relationship changes on the organization's behalf. Every commitment request becomes a decision packet for the Commander/CoS queue.
- Accepting risk: residual risk acceptance stays with the authority defined in `docs/risk-acceptance-authority.md`. A partner's assurance ("this is safe on our side") never substitutes for an internal risk decision.
- Releasing information without a release packet: the liaison transmits only approved release packets (`docs/interop-release-packet.md`). It holds no redaction discretion and cannot "summarize around" the release gate.
- Executing on partner instruction: a partner request is an input to the internal tasking process, never a task order. This holds regardless of the declared relationship type (`docs/partner-command-relationship.md`).
- Modifying its own charter: liaison scope, cadence, and glossary authority change only by FRAGO from the parent organization.

## 6. Placement

- `Claim`: Military liaison practice distinguishes the liaison officer sent to reside at the partner headquarters from coordination elements retained at the home headquarters; the sent officer works inside the partner's battle rhythm while remaining under the sending commander's authority.
- `Application`: Two placements for the liaison agent:

| Placement | Meaning in the LLM runtime | Strength | Weakness |
| --- | --- | --- | --- |
| Embedded at partner | Liaison agent runs inside the partner's loop: subscribed to partner events, present in partner sync cycles, using partner templates first | Early warning of partner state changes; expectations corrected at the source | Higher going-native pressure; context exposed to partner infrastructure must be pre-filtered as if released |
| Resident at home | Liaison agent runs inside the home loop and interacts with the partner only through declared channels | Full access to home source of truth; low exposure | Learns of partner changes late; weaker expectation management |

Rules:

- An embedded liaison's context pack is prepared under `docs/context-releasability-policy.md` as if everything in it could be disclosed: nothing above the declared releasability ceiling enters an embedded liaison's context.
- Embedded and resident liaisons may be paired on one boundary; if so, one of the two is designated the single accountable relay owner for each information class.
- Placement is recorded in the collaboration charter and revisited at AAR.

## 7. Failure Modes

| Failure mode | Description | Control |
| --- | --- | --- |
| Liaison bypass | Internal roles or the partner open direct side channels around the liaison; terminology drift and unauthorized commitments follow | All boundary-crossing messages carry the liaison's relay record; a boundary-crossing event without one is a CCIR alert and a preflight block for the dependent task |
| Going native | The liaison progressively adopts the partner's priorities and framing, advocating partner requests instead of representing home intent | Fixed rotation window, periodic backbrief of home intent and authority boundary in the liaison's own words, Red Team review of liaison relay logs for framing drift |
| Single-point relay loss | The liaison is the only holder of the glossary, expectation state, and relay history; losing it severs the boundary | Liaison state lives in the shared source of truth, never only in liaison context; a successor is named in the continuity plan (`docs/personnel-continuity-model.md`); loss triggers degraded mode where the boundary drops to release-packet-only traffic |

- `Interpretation`: All three failures share one root: the liaison silently changing from an interface into either a decision-maker or a dependency. The controls force the liaison to stay observable, replaceable, and non-committal.

## 8. Research Gaps

- `Research Gap`: The body text of the Commander and Staff Guide to Mission Partner Environment and the Interorganizational Cooperation Focus Paper has not been verified in this environment; the liaison duty list above should be re-checked against them and against the liaison sections of the Multinational Interoperability guide once their URLs are added to `docs/source-map.md`.
- `Research Gap`: Rotation cadence and going-native detection thresholds for long-running liaison agents have no doctrinal quantification yet.
- `Research Gap`: Whether one liaison agent may serve multiple boundaries of the same partner organization (tool platform plus human team) without conflating relationship types is unresolved.

## 9. Implementation Candidates

- `schema-files/liaison-charter.schema.json`
- `schema-files/liaison-relay-event.schema.json`
- `liaison-boundary-runner.js`
- `run-liaison-boundary-fixtures.js`
- `dashboard-ui-prototype/liaison-boundary-state.json`
