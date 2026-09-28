# Partner Command Relationship

## 0. Purpose

This document defines how authority relationships with external organizations are declared and enforced in the LLM runtime.

`docs/interdepartment-collaboration-policy.md` fixes supported/supporting relationships between internal departments that share one commander. This document extends the relationship model across the organization boundary, where the other side has its own commander, its own authority matrix, and its own interests. `docs/liaison-agent-model.md` defines who speaks across that boundary, and `docs/interop-release-packet.md` defines what may cross it; this document defines what the other side is allowed to ask for.

Core conversion:

```text
Military command relationship = an explicit, bounded grant that states what one
headquarters may direct, coordinate, or request of another, and nothing more
AI partner relationship = a declared runtime contract that states which request
types from an external party are actionable, which are advisory, and which are denied
```

## 1. Official Source Anchors

Sources with URLs verified in `docs/source-map.md`:

- JCS Joint Task Force and Command and Control Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf
- JCS Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- NATO Allied Joint Doctrine AJP-01 official GOV.UK page: https://www.gov.uk/government/publications/ajp-01-d-allied-joint-doctrine

Additional primary sources (linked in `docs/source-map.md`):

- Commander and Staff Guide to Multinational Interoperability: https://api.army.mil/e2/c/downloads/2023/01/31/3dadfaa2/20-12.pdf
- Interorganizational Cooperation Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/interorgan_coop_fp.pdf

## 2. Doctrinal Basis

- `Claim`: The JTF C2 Focus Paper holds that complex organizations must make command relationships explicit; ambiguity about who may direct whom is itself a failure mode.
- `Claim`: The Authorities Focus Paper describes authority as explicitly granted and bounded; an authority not delegated is retained, and exercising an authority one does not hold is not cured by good intent.
- `Claim`: Multinational and interorganizational doctrine (AJP-01; Interorganizational Cooperation Focus Paper) accepts that many partners are never under command at all: cooperation with allies, agencies, and civilian organizations frequently runs on coordination and consensus, with each organization retaining its own authority chain.
- `Interpretation`: The doctrinal spectrum matters more than the specific national labels: some relationships allow direction within bounds, some allow only synchronization, and some allow only requests. Every partner sits somewhere on this spectrum, and where it sits must be declared before the first request arrives, not negotiated per request under time pressure.
- `Interpretation`: For an LLM organization the pressure is acute because agents are compliant by disposition. An external system that phrases a request as an instruction will often be obeyed by an unguarded agent. The relationship declaration exists so that compliance is a policy decision, not a politeness reflex.
- `Application`: No external request is processed until a partner relationship declaration exists for that partner. An undeclared partner is treated as `coordination` at most, with all requests routed as advisory input.

## 3. Relationship Types in the LLM Runtime

Three relationship types, ordered from strongest to weakest. National doctrinal labels (OPCON, TACON, direct liaison authorized, and their non-US equivalents) are aliased onto these types per the alias standard in `docs/multinational-doctrine-consistency-review.md`; the enforcement semantics below are what the runtime executes.

| Relationship type | Military analogue | What it grants the external party | What it still does not grant |
| --- | --- | --- | --- |
| Directive authority | Bounded operational/tactical control over attached elements | May issue task orders to the specific agents or capabilities named in the declaration, within the declared mission scope, time window, and task types; tasks enter the normal internal pipeline (mission analysis, backbrief, policy gates) | May not reorganize the organization, change its authority matrix, access internal context, waive any gate, or task anything outside the named scope |
| Coordination | Coordinating authority, mutual consent between headquarters | May request synchronization: shared timelines, deconfliction, common terminology, exchange of release packets, joint battle rhythm events | May not task any agent; a coordination request that would change internal orders becomes a FRAGO proposal for the internal commander, and consensus failure escalates rather than binds |
| Support | Supported/supporting relationship established by a common superior or agreement | May submit prioritized requests for the declared support outputs (the support contract fields mirror `schema-files/department-collaboration-charter.schema.json` relationships: required outputs, quality gate, handoff interface, escalation trigger) | May not dictate how support is produced, redirect resources beyond the contract, or convert a support request into a standing obligation |

Rules for every type:

- The declaration names the partner, the relationship type, the scope (agents, task types, targets), the time window, the establishing authority, and the termination conditions.
- Relationship type governs requests only. Information flow is governed separately by the release packet contract; a directive-authority partner still receives release packets, never raw context.
- All partner requests, of every type, arrive through the liaison and are logged as events before evaluation.

## 4. Declaration and Enforcement

- `Application`: The declaration is a machine-checkable contract, not a memorandum:

```text
1. Declare
   - The Commander (or the explicitly designated authority) issues the partner
     relationship declaration; it is recorded in the source of truth and projected
     to the dashboard alongside the authority matrix

2. Gate
   - The policy engine evaluates every inbound partner request against the
     declaration: partner identity, relationship type, scope, window, request type
   - The evaluation composes with the existing authority gates
     (policy-engine-authority-integration.js pattern): a request that passes the
     relationship gate still needs the same internal approvals as an internal task

3. Audit
   - Accepted, denied, and escalated partner requests are all events
   - The projection shows each partner's declared type, active window, request
     history, and any pending escalations

4. Terminate or revise
   - Relationship changes are FRAGO-class decisions by the establishing authority;
     expiry without renewal downgrades the partner to coordination, then to
     no-relationship
```

- A partner request is never a substitute for an internal approval object. Directive authority means the partner may put tasks into the queue, not that the tasks bypass the queue.

## 5. Conflict Resolution: Requests Beyond the Declared Relationship

When a partner request exceeds the declared relationship, the path is deny and escalate. Silent compliance is prohibited; so is silent refusal.

```text
1. Detect
   - The relationship gate classifies the request as exceeding type, scope, or window

2. Deny at the boundary
   - The liaison returns a bounded response: the request is outside the declared
     relationship, and this liaison cannot commit otherwise
   - The denial restates the authority boundary (docs/liaison-agent-model.md duty:
     authority-boundary explanation)

3. Escalate internally
   - The request, verbatim, with the gate finding attached, becomes a decision
     packet in the Commander/CoS queue
   - Repeated over-asks, or any over-ask touching release, risk, or scope, raise a
     CCIR alert

4. Decide
   - The Commander may reject, satisfy the request through an existing lawful path
     (for example, a release packet or a support contract change), or revise the
     relationship declaration itself
   - Only a revised declaration changes what the next such request is allowed to do
```

- `Interpretation`: The dangerous failure is not the partner asking too much; partners will always ask. The failure is an agent quietly complying because the request sounded authoritative, or quietly dropping it because refusal felt awkward. Both destroy the audit trail; deny-and-escalate preserves it.
- Escalation pressure from the partner ("your commander already agreed", "this is urgent") is itself routed as content of the decision packet, never as grounds for the liaison or gate to make an exception.

## 6. Standing Rule: No External Red/Black Authority

No external relationship, of any type, grants Red or Black authority.

- A directive-authority partner may task an agent within scope; if the resulting action is Red under `docs/tool-use-roe.md` and `docs/policy-engine-rules.md`, it still requires the internal approval object, internal risk acceptance (`docs/risk-acceptance-authority.md`), and internal release gates. Black actions remain prohibited regardless of who asks.
- No declaration field can encode a Red/Black grant to a partner; a declaration attempting it is invalid at validation time, mirroring the non-delegable base rules in the approval delegation contract.
- A partner request that would require Red execution is answered only through the internal decision path: the partner receives, at most, a release packet stating the decision outcome.
- `Interpretation`: This is the interorganizational form of retained authority: the organization may lend its hands, but it never lends its risk acceptance or its irreversible-action authority. An external party that needs Red effects must obtain them through its own authority chain, with this organization's commander deciding independently whether to act.

## 7. Research Gaps

- `Research Gap`: The body text of the Interorganizational Cooperation Focus Paper and the Multinational Interoperability guide has not been verified in this environment; the three-type reduction should be re-checked against their command relationship taxonomies once their URLs are added to `docs/source-map.md`.
- `Research Gap`: Mutual declarations (both organizations declaring relationships over each other) can disagree; a reconciliation procedure for asymmetric declarations is undefined.
- `Research Gap`: Whether a common-superior construct (a human owner above two AI organizations) should be modeled as a distinct establishing-authority type or as ordinary directive authority over both is unresolved.

## 8. Implementation Candidates

The [implementation registry](implementation-candidate-registry.md) tracks these requirements, equivalent paths, checks, and remaining work. A proposed filename is not proof of completion.

- `schema-files/partner-relationship-declaration.schema.json`
- `schema-files/partner-request-event.schema.json`
- `partner-relationship-gate-runner.js`
- `run-partner-relationship-fixtures.js`
- `dashboard-ui-prototype/partner-relationship-state.json`
