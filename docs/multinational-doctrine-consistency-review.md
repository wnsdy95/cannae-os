# Multinational Doctrine Consistency Review

## 0. Purpose

This document reviews the points where the current military-style LLM operating framework is overly dependent on US military sources, which could break when applied to other military systems.

Conclusion:

```text
US military doctrine is the primary scaffolding of the current framework.
However, the framework contract must not be a US-only doctrine, but a command/control contract
that is also portable to multinational doctrine.
Therefore, terms such as S2/S3/S4/S6, OPORD, ROE, DOTMLPF-P, and SOF Truths are not imported as-is,
but are neutralized into role alias, jurisdiction gate, local doctrine supplement,
and commander-retained decision.
```

## 1. Official Source Families

| Source family | Official sources | Scope used for comparison |
| --- | --- | --- |
| US | ADP 6-0 Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf, JCS Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf | Current framework baseline. Treated as the original source for mission command, authority, staff function, and force management terminology. |
| NATO / Allied | Allied Joint Doctrine AJP-01 official GOV.UK publication page: https://www.gov.uk/government/publications/ajp-01-d-allied-joint-doctrine, PDF: https://assets.publishing.service.gov.uk/media/659ea238e96df5000df843f3/AJP_01_EdF_with_UK_elements.pdf | Allied joint doctrine, interoperability, common terminology. Confirms whether OPORD/terminology can be maintained as a multinational contract. |
| UK | UK Defence Doctrine JDP 0-01: https://www.gov.uk/government/publications/uk-defence-doctrine-jdp-0-01, PDF: https://assets.publishing.service.gov.uk/media/63776f4de90e0728553b568b/UK_Defence_Doctrine_Ed6.pdf, UK Joint Operations Doctrine JDP 01: https://www.gov.uk/government/publications/campaigning-a-joint-doctrine-publication | Examines the generalizability of US-style naming from the perspective of UK command, joint operations, understanding/decision-making, and terminology supplements. |
| Canada | Canadian Armed Forces public page: https://www.canada.ca/en/services/defence/caf.html, DND reports/publications: https://www.canada.ca/en/department-national-defence/corporate/reports-publications.html, CAF Ethos: Trusted to Serve: https://www.canada.ca/en/department-national-defence/corporate/reports-publications/canadian-armed-forces-ethos-trusted-to-serve.html | CAF organization, ethos, DND/CAF publication and governance context. Confirms that command, authority, culture, and data governance must be localized. |
| Korea | Ministry of National Defense (MND): https://www.mnd.go.kr/, Korea Law Information Center: https://www.law.go.kr/, Korea Institute for Defense Analyses (KIDA): https://www.kida.re.kr/ | Republic of Korea Armed Forces / Korean legal context. The context of orders, authority, service, policy, and public research requires a jurisdiction gate. |

The official Australian Defence Force (ADF) site could not be reliably verified for body text in this execution environment. Therefore it was not included in the basis for this audit's determinations. It will be added as a separate source family once accessibility is confirmed later.

## 2. Consistency Principles

| Principle | Application |
| --- | --- |
| US is not default | US military sources are only a baseline, not an automatic default when applying to other armed forces. |
| Internal IDs are not ranks | `COMMANDER`, `COS`, `S2`, `S3`, `S4`, `S6` are internal function IDs. They are not to be interpreted as actual ranks, positions, or staff section names. |
| Alias before adoption | When applying to another armed force or organization, create the role alias map first. |
| Authority beats terminology | Even if terminology differs, approval authority, reporting authority, discretion, and prohibition lines matter more. |
| Jurisdiction gate | ROE, legal affairs, personal information, public release, and real organizational impact require local legal/policy review. |
| Runtime contract stays stable | Runtime contracts such as OPORD, SITREP, AAR, and release review are maintained, but external names and annex names must be mappable. |
| Conflict is commander-retained | Conflicts over scope, release, risk, legal matters, and irreversible actions are not resolved arbitrarily by subordinate agents. |

## 3. Conflict Taxonomy

| Conflict type | Risk | Resolution method |
| --- | --- | --- |
| Terminology mismatch | The same function is called by a different name, or the same name carries a different meaning | glossary + role alias map |
| Authority model variance | The scope of mission command, delegation, and approval authority differs by armed force/legal system | authority matrix + commander-retained decisions |
| Orders format variance | OPORD/FRAGO/annex format and naming may differ | normalized runtime contract + doctrine-specific aliases |
| Legal/ROE variance | ROE, legal affairs, personal information, and public release approval criteria differ by country | jurisdiction gate + expert/user approval |
| Information security variance | OPSEC, classification, and releasability categorization may differ | context releasability policy + local labels |
| Force management vocabulary | US-style terms such as DOTMLPF-P and force development are not universal terms | generalized via capability lifecycle review |
| Culture/reporting variance | Reporting style, discussion culture, and the scope of autonomous judgment differ | backbrief/rehearsal + CCIR reporting criteria |

## 4. Per-Policy Audit Results

| Local policy | Risk | Verdict | Required action |
| --- | --- | --- | --- |
| `docs/agent-roles-and-authority.md` | Medium | S2/S3/S4/S6 are useful but could be mistaken for US military/US Army-style staff labels | Keep as internal IDs. `role_alias_map` is mandatory when applying to another armed force. |
| `docs/commander-handbook.md` | High | It is dangerous if mission command is read as blanket autonomy | Intent-based autonomy is permitted only within the authority matrix. Scope/release/risk/legal remain commander-retained. |
| `docs/prompt-templates.md` | Medium | Treating the OPORD five-paragraph format as the sole military document format is overgeneralization | Keep the five-paragraph order as a runtime normalization contract, and allow NATO/UK/local annex aliases. |
| `docs/tool-use-roe.md` | Critical | The ROE/legal support analogy can obscure country-specific legal differences | Use only as a tool-use control analogy. Legal/real-world/personal information/public release matters go through the local jurisdiction gate. |
| `docs/context-releasability-policy.md` | Medium | Classification names differ by country/organization | Keep the raw/summary/redacted/reference/denied delivery modes and provide local label mapping. |
| `docs/role-document-access-policy.md` | Medium | The need-to-know principle applies broadly, but document classification names and approval authority differ | Keep the role/duty/authority-based access contract. Classification aliases are needed per source family. |
| `docs/force-structure-change-policy.md` | High | DOTMLPF-P is US-derived vocabulary | Keep DOTMLPF-P as a checklist, but leave the multinational-application name to the capability lifecycle review. |
| `docs/ai-special-operations-tf.md` | Medium | SOF Truths originates from USSOCOM, so it must not be used as universal SOF doctrine | Mark as a US-derived high-risk TF heuristic. Requires local doctrine review before applying to another country's special operations system. |
| `docs/interdepartment-collaboration-policy.md` | Medium | Warfighting function/combined arms terminology has country-specific doctrinal differences | Keep the supported/supporting, liaison, and output contract, and alias the function names. |
| `docs/knowledge-management-sop.md` | Low | KM principles apply broadly, but repository/record-retention rules are organization-specific | Keep source of truth, event log, handoff. Retention/legal hold go through the local policy gate. |
| `docs/risk-acceptance-authority.md` | High | Risk acceptance authority differs by organization/legal system | Keep high/critical residual risk as user/Commander retained. Requires an expert/local authority gate. |

## 4.1 Consistency Verdicts for Remaining Operational Documents

The documents below define runtime mechanisms rather than directly mandating US-style naming, so their structure is retained. However, when applying them to an external armed force/organization, alias and jurisdiction gates are applied up front.

| Local document | Verdict | Reason |
| --- | --- | --- |
| `docs/approval-scope-policy.md` | Keep with jurisdiction gate | Single-use approval, expiry, and rollback are universal controls, but the approving authority is organization-specific. |
| `docs/backbrief-and-rehearsal-sop.md` | Keep | Backbrief/rehearsal is a mechanism to prevent order distortion and is applicable multinationally. Only the terminology is aliased to local briefing terms. |
| `docs/b2c2wg-operating-model.md` | Keep with alias | The board/cell/working group structure is retained, but the B2C2WG name is treated as US-derived staff shorthand. |
| `docs/ccir-alerting-model.md` | Keep | PIR/FFIR/EEFI/decision point are kept as an information-requirement routing contract. The actual reporting names are a local alias. |
| `docs/command-post-dashboard.md` | Keep | The dashboard is not tied to a specific military doctrine, since it consists of the decision queue, CCIR, approval, and readiness projection. |
| `docs/data-model.sql.md` | Keep | The persistence schema stores the audit/event/source-of-truth contract rather than military terminology. |
| `docs/event-sourcing-model.md` | Keep | The command/event separation is a general runtime pattern that resolves order-distortion and audit issues. |
| `docs/implementation-guide.md` | Keep with source family check | The implementation guide must first update the source map and doctrine review when applying a new source family. |
| `docs/information-to-operations-cycle.md` | Keep | The flow that prevents raw information from becoming an order change directly has high multinational consistency. |
| `docs/maintenance-readiness-model.md` | Keep | Sustainment/readiness concepts are broadly applicable. Only the rating labels are mapped to the local readiness system. |
| `docs/military-operating-system.md` | Keep with alias | The operating loop is retained, but command/staff labels go through the role alias map. |
| `docs/opord-annex-model.md` | Keep with alias | Annex separation is retained. Annex names and numbering are aliased to match NATO/UK/local format. |
| `docs/opsec-classification-model.md` | Keep with local labels | The raw/summary/redacted/reference/denied delivery modes are retained. Classification labels are matched to local policy. |
| `docs/personnel-continuity-model.md` | Keep | Succession, vital records, and degraded mode are retained as continuity principles. Actual succession-of-position authority goes through the local authority gate. |
| `docs/policy-engine-rules.md` | Keep | Green/Amber/Red/Black are runtime risk classes. They are used only as tool gateway classes, not actual legal ROE. |
| `docs/reference-architecture.md` | Keep | Orchestrator, policy engine, tool gateway, and evidence store are implementation architecture. |
| `docs/sop-library.md` | Keep | The SOP structure is retained, but each SOP's authority and reporting labels follow the local alias map. |
| `docs/source-reliability-rubric.md` | Keep | Evaluation of authority/directness/currency/scope/interpretive risk is needed regardless of source family. |
| `docs/dashboard-wireframes.md` | Keep | The UI wireframe is a queue/projection display method rather than military doctrine, so there is no direct conflict. |

## 5. Role Alias Map Standard

When applying this to another armed force or a civilian organization, write the mapping below first.

```json
{
  "source_family": "UK",
  "role_aliases": {
    "COMMANDER": ["final decision authority", "accountable owner"],
    "COS": ["orchestrator", "chief integrator"],
    "S2": ["intelligence/source verification function"],
    "S3": ["operations/execution planning function"],
    "S4": ["sustainment/resource function"],
    "S6": ["knowledge/information systems function"],
    "RED_TEAM": ["independent challenge function"],
    "RECORDER": ["knowledge management/audit function"]
  },
  "non_aliasable": [
    "legal authority",
    "public release authority",
    "risk acceptance authority"
  ]
}
```

Rules:

- An alias changes only the name. It does not lower approval authority.
- `COMMANDER` is not an actual general/commander rank, but the final decision authority.
- `S2/S3/S4/S6` are function IDs. They are not assumed to map 1:1 to the actual organization's staff section names.
- Items that cannot be aliased are left to local authority or user approval.

## 6. Application to the Order Promulgation System

The core element that can be retained even after multinational comparison is not the document name itself, but the distortion-prevention structure.

```text
Intent
Mission
Authority boundary
Information requirement
Task ownership
Backbrief
Execution evidence
SITREP / FRAGO route
AAR / readiness update
```

This structure is not a direct copy of the US military OPORD, but a control flow that reduces distortion as higher-level intent flows down to lower-level execution. The common terminology and joint doctrine in NATO/UK sources also support the same directional need. In the Korean/Canadian context, legal authority, organizational culture, and public disclosure policy differ, so a local gate is needed.

## 7. Force Structure Calibration

If `DOTMLPF-P` is used as-is, it becomes fixed as US-style force management. In multinational application, the neutral terms below are used in parallel.

| US-derived term | Neutral framework term |
| --- | --- |
| Force development | Capability design |
| Force documentation | Organization contract record |
| DOTMLPF-P | Capability lifecycle review |
| Unit activation | Capability activation |
| Unit deactivation/disbandment | Capability sunset/transfer |
| Readiness gate | Execution readiness gate |

Policy conclusions:

- The schema field name `dotmlpf_p` is retained for compatibility with existing fixtures.
- In documentation, it is written together as `DOTMLPF-P / capability lifecycle review`.
- When creating a new unit/branch/role, regardless of which armed force's naming is used, capability gap, authority, readiness, sustainment, handoff, and sunset must always be verified.

## 8. SOF TF Calibration

The AI SOF TF model comes from USSOCOM sources. Therefore it must not be written as representing another armed force's special operations system.

Parts that can be retained:

- Small teams
- Vetted personnel/agents
- Strong enablers
- Need-to-know isolation
- Commander-retained authority
- Rehearsal, dry run, AAR

Parts that must be neutralized:

- SOF Truths is not used as universal doctrine.
- Actual military activity names such as direct action and special reconnaissance are used only as AI safety analogies.
- When applying this to an external organization, neutral names such as high-risk task force or protected incident cell are permitted.

## 9. Verification Contract

New verification contract:

- `schema-files/doctrine-consistency-review.schema.json`
- `sample-payloads/valid-doctrine-consistency-review.json`
- `sample-payloads/invalid-doctrine-consistency-review-us-only.json`
- `doctrine-consistency-runner.js`
- `run-doctrine-consistency-fixtures.js`
- `doctrine-consistency-fixtures/README.md`

Semantic gate:

- Fails if there are fewer than 4 source families.
- Fails if there are fewer than 3 non-US source families.
- Fails if the disposition is `adopt_us_only`.
- Fails if a role/staff terminology finding lacks alias handling.
- Fails if a ROE/legal finding lacks a jurisdiction gate.
- Fails if there is no source-map/compendium/schema/sample/runner documentation update.

## 10. Conclusion

The current framework maintains multinational consistency in the following ways.

1. US military sources are used as a baseline but are not made the default.
2. Internal role IDs are separated from external position titles.
3. The OPORD-type document structure is maintained as a runtime contract, and local document names and annex structures are aliased.
4. Legal/ROE/release/risk matters must always be escalated to local authority and Commander/user approval.
5. Force structure and SOF TF are marked as US-derived vocabulary and generalized into capability lifecycle/high-risk TF.
