# Interop Release Packet

## 0. Purpose

This document defines the contract for partner-facing output: the release packet. It extends `docs/context-releasability-policy.md` and `docs/opsec-classification-model.md` across the organization boundary, and it is the artifact contract behind the `partner_release` target already present in `schema-files/release-review.schema.json`.

Core conversion:

```text
Military disclosure = information crosses to a partner only as a reviewed, marked,
caveated product released by a designated disclosure authority
AI interop release = information crosses the framework boundary only as an approved
release packet produced by the context filter, release review, and release gate pipeline
```

The rule this document enforces is absolute: a release packet is the only artifact that crosses the boundary. Internal reasoning, working notes, evidence stores, and agent-to-agent traffic never cross, no matter how cooperative the relationship is.

## 1. Official Source Anchors

Sources with URLs verified in `docs/source-map.md`:

- JCS Joint Task Force and Command and Control Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf
- DoD Terminology Program: https://www.jcs.mil/doctrine/dod-terminology-program/
- NATO Allied Joint Doctrine AJP-01 official GOV.UK page: https://www.gov.uk/government/publications/ajp-01-d-allied-joint-doctrine

Additional primary sources (linked in `docs/source-map.md`):

- Commander and Staff Guide to Mission Partner Environment: https://api.army.mil/e2/c/downloads/2025/04/29/59b51ef8/no-25-1004-commander-and-staff-guide-to-mission-partner-environment-apr-25.pdf
- Commander and Staff Guide to Multinational Interoperability: https://api.army.mil/e2/c/downloads/2023/01/31/3dadfaa2/20-12.pdf
- Interorganizational Cooperation Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/interorgan_coop_fp.pdf

## 2. Doctrinal Basis

- `Claim`: The Commander and Staff Guide to Mission Partner Environment treats partner information sharing as a designed environment with explicit releasability decisions, not as ad hoc copying between networks; information intended for partners is produced at the appropriate releasability from the start.
- `Claim`: Multinational interoperability doctrine (AJP-01; Commander and Staff Guide to Multinational Interoperability) makes common terminology and agreed formats a precondition for sharing, because a partner reads a product through its own doctrine and vocabulary.
- `Claim`: Disclosure to a partner is a deliberate act by a designated authority, with markings and caveats that travel with the product and constrain further dissemination.
- `Interpretation`: A partner cannot distinguish this organization's draft reasoning from its official position. Anything that crosses the boundary will be treated by the partner as the organization's position, quoted onward, and acted upon. Therefore the boundary must carry only artifacts that were built to be quoted: approved, marked, expiring, and attributable.
- `Interpretation`: For an LLM organization the danger is sharper than for a human staff: raw model output is fluent enough to look official, and internal chain-of-thought can contain EEFI, source fragments, and speculative claims that were never verified. Fluency without a release decision is a leak that reads like a statement.
- `Application`: Partner-facing output is severed from generation. No agent, including the liaison, ever streams live output across the boundary. The only exportable artifact type is the release packet defined below.

## 3. The Release Packet Is the Only Boundary-Crossing Artifact

- The release packet is the unit of disclosure. One packet per release decision; no incremental appendices outside the packet.
- The liaison agent (`docs/liaison-agent-model.md`) transmits packets but cannot author, modify, or approve them.
- The declared partner command relationship (`docs/partner-command-relationship.md`) determines what a partner may request; it never lowers what a packet must contain. Even a directive-authority partner receives release packets, not internal state.
- Inbound direction is symmetric in form: partner material enters as a foreign report through the information intake path (`docs/information-to-operations-cycle.md`), never directly into internal orders or context packs.

## 4. Required Contents

| Field group | Content | Why required |
| --- | --- | --- |
| Approved summary | The reviewed statement of findings, status, or request, written to stand alone | The partner must be able to act on the packet without asking for internal context |
| Terms mapping | Glossary block mapping every internal term used to the partner's term, per the liaison glossary and role alias map (`docs/multinational-doctrine-consistency-review.md`) | Prevents the same word meaning different things on each side |
| Caveats | Assumptions, confidence limits, known gaps, and use restrictions (including any prohibition on onward dissemination) | Keeps the partner from over-reading the summary as stronger than it is |
| Releasability marking | Classification level, releasability audience, and handling rule carried in the packet itself | The marking must travel with the product, not live only in internal logs |
| Expiry | Validity window after which the packet may no longer be relied on, plus the recheck path | Stale releases are a distortion source; expiry forces refresh through the pipeline |
| Point of contact / return channel | The liaison identity and the declared channel for questions, corrections, and partner responses | Prevents the partner from contacting arbitrary internal agents and reopening bypass channels |

- `Application`: Packet identity is mandatory: packet id, mission id, release review id, release gate decision id, and issue timestamp bind every packet to its audit trail.

## 5. Production Pipeline

A release packet is produced by exactly one pipeline. Every stage exists already in this framework; this contract composes them for the partner boundary.

```text
1. Context filter
   - Candidate content is filtered per docs/context-releasability-policy.md
   - Delivery mode for the partner audience is computed (raw/summary/redacted/reference_only/denied)
   - EEFI detection halts the candidate and raises a CCIR alert

2. Release review
   - schema-files/release-review.schema.json with target = partner_release
   - Reviewer decides approve / approve_redacted / revise / reject per item
   - Output constraints become packet caveats

3. Packet assembly
   - Approved items, terms mapping, caveats, marking, expiry, and point of contact
     are assembled into the packet contract
   - Assembly may only reduce content relative to the review; it may never add

4. Release gate decision
   - The composite gate (policy-engine-release-integration.js pattern) checks
     authority, approval scope, and review validity
   - The decision is recorded as a release gate decision event
     (schema-files/release-gate-decision-event.schema.json) before transmission
   - The liaison transmits the packet and records the relay event
```

Rules:

- No stage may be skipped, merged, or self-approved by the packet's author.
- A packet that fails the gate does not exist for the partner; partial or "informal preview" transmission is a release violation.
- Urgency changes who is paged, not which stages run.

## 6. What Must Never Appear

| Prohibited content | Reason |
| --- | --- |
| Internal reasoning | Drafts, chain-of-thought, agent deliberation, and rejected options are unreviewed positions; a partner cannot un-read them |
| Raw evidence | Evidence store records carry source URIs, classification, and provenance beyond the partner's need-to-know; only the approved summary of a finding crosses |
| EEFI | Credentials, private user data, production target detail, vulnerability detail, and non-public plans are denied at the context filter regardless of partner trust (`docs/opsec-classification-model.md`) |
| Internal identifiers | Internal role IDs, agent names, file paths, event log ids, and infrastructure names map to the terms mapping or are omitted; they expose structure and create bypass targets |

- `Interpretation`: The test is not "is this item sensitive?" but "was this item built to cross?" Anything not assembled by the pipeline fails the test by construction.

## 7. Revocation and Correction

- `Claim`: Disclosure practice includes correcting or withdrawing released information through the same authority that released it.
- `Application`: Revocation and correction procedure:

```text
1. Trigger
   - Internal finding invalidated, EEFI discovered post-release, expiry of a packet
     the partner still relies on, or partner-reported discrepancy via the return channel

2. Recall notice
   - A revocation packet referencing the original packet id is produced through the
     same pipeline at priority; it states what is withdrawn and what, if anything,
     replaces it

3. Correction packet
   - If a corrected position exists, it is released as a new packet superseding the
     original; supersession is explicit by id, never implied

4. Audit
   - Revocation is recorded as an event tied to the original release gate decision;
     post-release EEFI exposure additionally raises a CCIR alert and an AAR trigger
```

- Silent expiry is not revocation: if the partner is known to rely on an expired packet, an explicit recall or refresh is required.
- The return channel is monitored by the liaison; a partner correction request is routed as an information report, and the correction decision stays with the release authority.

## 8. Research Gaps

- `Research Gap`: The body text of the Mission Partner Environment guide and the Interorganizational Cooperation Focus Paper has not been verified in this environment; the required-contents list should be re-checked against their releasability and foreign disclosure sections once their URLs are added to `docs/source-map.md`.
- `Research Gap`: Machine-to-machine packet exchange with a foreign agent framework needs a negotiated envelope format; whether the terms mapping can be enforced schematically on the partner side is unknown.
- `Research Gap`: Doctrinal guidance for revocation latency (how fast a recall must reach a partner relative to the harm of continued reliance) has not been located.

## 9. Implementation Candidates

The [implementation registry](implementation-candidate-registry.md) tracks these requirements, equivalent paths, checks, and remaining work. A proposed filename is not proof of completion.

- `schema-files/interop-release-packet.schema.json`
- `schema-files/release-revocation-event.schema.json`
- `release-packet-assembly-runner.js`
- `run-release-packet-fixtures.js`
- `dashboard-ui-prototype/partner-release-queue-state.json`
