# Source Map

## 0. Purpose

This document is an evidentiary map that connects military doctrine, command-and-control documents, and training/sustainment/targeting/assessment materials to the concepts of the LLM operating framework.

If `research-compendium.md` is the repository of research notes, this document is the index for quickly finding which framework component each source supports.

Usage:

- Check this document first when looking for the evidentiary basis of a specific concept.
- When creating a new document, link its relevant sources into this table.
- When a source changes, update it here first, then update the related documents.

## 1. Source Map Standard

| Field | Meaning |
| --- | --- |
| Source | Original text or official page |
| Military concept | Military concept |
| Extracted principle | Extracted operating principle |
| LLM application | LLM operating application |
| Local documents | Linked local documents |

## 2. Command, Planning, Orders

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf | Operations process | Plan, prepare, execute, assess is a cyclical structure | LLM tasks should also have a plan, prepare, execute, assess loop | `military-operating-system.md`, `decision-risk-assessment.md` |
| FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf | MDMP, orders production | Analysis and orders production are separated but connected | Perform mission analysis before generating a prompt | `prompt-templates.md`, `sop-library.md`, `orders-production-pipeline.md` |
| STANAG 2014, Formats for Orders: https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf | OPORD/WARNO/FRAGO format | A standard format reduces distortion during dissemination | Convert user requests into OPORD-style prompts | `prompt-templates.md`, `opord-annex-model.md` |
| NATO Allied Joint Doctrine AJP-01 official GOV.UK page: https://www.gov.uk/government/publications/ajp-01-d-allied-joint-doctrine, PDF: https://assets.publishing.service.gov.uk/media/659ea238e96df5000df843f3/AJP_01_EdF_with_UK_elements.pdf | Allied joint doctrine, interoperability | Multinational operations require common principles and terminology but allow national supplements | Treat OPORD and staff roles not as a US-only format but as a normalized runtime contract and alias map | `multinational-doctrine-consistency-review.md`, `prompt-templates.md`, `glossary.md` |
| UK Defence Doctrine JDP 0-01: https://www.gov.uk/government/publications/uk-defence-doctrine-jdp-0-01, PDF: https://assets.publishing.service.gov.uk/media/63776f4de90e0728553b568b/UK_Defence_Doctrine_Ed6.pdf | UK defence doctrine | National doctrine adapts common command/control principles into local terminology and structure | Keep US-style role/staff terms as internal IDs and require UK/local terminology aliases | `multinational-doctrine-consistency-review.md`, `agent-roles-and-authority.md` |
| UK Joint Operations Doctrine JDP 01: https://www.gov.uk/government/publications/campaigning-a-joint-doctrine-publication, PDF: https://assets.publishing.service.gov.uk/media/5a7ea59e40f0b62305b82465/20141209-JDP_01_UK_Joint_Operations_Doctrine.pdf | Joint operations doctrine | Joint operations integrate command, information, sustainment, and assessment | Connect multi-agent departments through supported/supporting relationships and liaison | `multinational-doctrine-consistency-review.md`, `interdepartment-collaboration-policy.md` |
| DoD Terminology Program: https://www.jcs.mil/doctrine/dod-terminology-program/ | Common terminology | Common terminology reduces misunderstanding between organizations | Fix the framework glossary and role names | `research-compendium.md` |
| JP 5-0, Joint Planning: https://www.esd.whs.mil/Portals/54/Documents/FOID/Reading%20Room/Joint_Staff/18-F-1152_JP_5-0_Joint_Planning_2020.pdf | Joint planning, assessment | Planning and assessment are not separate | Evaluate deliverable completion and effect achievement separately | `decision-risk-assessment.md` |

## 3. Mission Command and Authority

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf | Mission command | Intent and the bounds of authority matter more than detailed control | Give agents intent, constraints, and CCIR, and delegate the method | `agent-roles-and-authority.md` |
| FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf | Staff roles, running estimates | Staff functions divide and integrate judgment | Separate S2/S3/S4/S6/Red Team agents | `agent-roles-and-authority.md`, `agent-battle-rhythm.md` |
| JCS Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf | Authorities | Authority is explicitly delegated and limited | Document per-agent approval scope and prohibited lines | `agent-roles-and-authority.md` |
| JCS Joint Task Force and Command and Control Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf | Command and control | Complex organizations must clarify command relationships | Multi-agent systems must define who holds final integration authority | `military-operating-system.md` |
| Federal Continuity Directive planning framework: https://www.fema.gov/sites/default/files/documents/fema_federal-continuity-directive-planning-framework.pdf | Continuity, succession, delegation, vital records | An organization is not disrupted only if it predetermines essential functions, lines of succession, delegation of authority, vital records, and training | Handle role loss/rotation through a continuity plan, handoff, degraded mode, and readiness gate | `personnel-continuity-model.md`, `schema-files/continuity-plan.schema.json`, `continuity-drill-runner.js` |
| Liaison appendix, FM 6-0 excerpt: https://www.globalsecurity.org/military/library/policy/army/fm/6-0/appe.htm | Liaison | Liaison officers stabilize the information flow between organizations | Assign interface owners between agents | `agent-battle-rhythm.md` |

## 4. Information Requirements and Reporting

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf | CCIR, PIR, FFIR | Not all information is reportable; only information needed for a decision is reportable | Restrict agent reporting criteria to CCIR | `decision-risk-assessment.md`, `agent-battle-rhythm.md` |
| JP 2-0, Joint Intelligence: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/2-0-Intelligence-Series/ | Intelligence process | Collected information goes through evaluation, analysis, and dissemination before it is reflected in operations | Separate raw information from assessment and route it to CCIR/decision/SITREP/FRAGO outputs | `information-to-operations-cycle.md`, `schema-files/information-report.schema.json`, `schema-files/intelligence-assessment.schema.json` |
| ADP 2-0, Intelligence: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1007507 | Intelligence support to operations | Intelligence must support the commander's decisions and understanding of operations | LLM information processing must end in commander-facing decision support, not a source note | `information-to-operations-cycle.md`, `information-to-operations-router.js` |
| ATP 2-01.3, Intelligence Preparation of the Operational Environment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1023498 | Intelligence preparation | Changes in environment/threat/assumptions update the running estimate and decision points | If new information changes an existing order's assumptions, escalate it to a FRAGO scope-change candidate | `information-to-operations-cycle.md`, `information-to-operations-fixtures/README.md` |
| ADP 6-0 | Shared understanding | Shared situational understanding determines the quality of subordinate judgment | Enforce context packets and backbriefs | `prompt-templates.md` |
| FM 6-0 | Running estimates | Staff maintain continuously updated judgment materials | Long-running tasks maintain status, risk, and source estimates | `agent-battle-rhythm.md` |
| Knowledge Management Primer: https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf | Knowledge management | Information has value only if it is findable and shareable | Accumulate all research and judgment in the document set | `research-compendium.md`, `source-map.md` |
| USFKI 5780.01 Knowledge Management Program: https://www.usfk.mil/Portals/105/Documents/Publications/Instructions/USFKI_5780-01_Knowledge-Management-Program.pdf | KM governance | Knowledge management requires an owner, procedures, and a repository | Establish an S6 Knowledge role and document storage rules | `sop-library.md` |

## 5. Rehearsal, Backbrief, and Verification

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf | Rehearsal | Verify key actions and transition points before execution | Agents submit a plan/backbrief before execution | `prompt-templates.md`, `agent-battle-rhythm.md`, `backbrief-and-rehearsal-sop.md` |
| FM 5-0: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf | Backbrief, confirmation brief | Subordinates restate the mission as they understood it | Have the LLM first output "the mission as I understood it" | `prompt-templates.md`, `backbrief-and-rehearsal-sop.md` |
| STANAG 2014 | Orders format | A standard sequence reduces omissions | Put Situation, Mission, Execution, Sustainment, Command/Signal into the prompt template | `prompt-templates.md` |
| ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf | Risk controls | Risk controls are decided before execution and overseen during execution | High-risk tasks have approval and verification gates | `decision-risk-assessment.md` |

## 6. Risk, Assessment, and Learning

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| ATP 5-19, Risk Management | Risk management process | Identification, assessment, control, and supervision are repeated | Maintain a risk register and approval gate | `decision-risk-assessment.md` |
| Operation Assessment MTTP: https://www.alssa.mil/mttps/assessment/ | Operation assessment | Distinguish whether the task was performed from whether it had an effect | Separate MOP/MOE/indicator | `decision-risk-assessment.md` |
| ATP 5-0.3, Operation Assessment: https://www.bits.de/NRANEU/others/amd-us-archive/ATP5-0x3%2815%29.pdf | Indicators | Assessment is only possible with observable indicators | Distinguish "the document exists" from "the next worker can execute on it" | `decision-risk-assessment.md` |
| AAR practice from Army doctrine and training culture | After action review | Convert post-execution gaps into learning | Update prompts and SOPs after an AAR | `sop-library.md` |

## 7. Training and Readiness

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716 | Training management | Mission performance capability is built through planned training and assessment | Agents also manage proficiency and readiness per SOP | `sop-library.md`, `functional-domains.md` |
| FM 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335 | Unit training management | Training tasks are set around the METL | Build a mission-essential task list for LLM operations | `functional-domains.md` |
| Army training management concepts | Crawl-walk-run | Progress in stages from low complexity to high autonomy | Start with a checklist, then supervised autonomy, then mission command | `sop-library.md` |
| METL concept | Mission essential task list | Do not try to do everything well; define the core mission | Define essential tasks and verification criteria per agent role | `agent-roles-and-authority.md` |

## 8. Sustainment and Logistics

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| ADP 4-0, Sustainment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796 | Sustainment | Operations cannot be sustained without resources, maintenance, or supply | S4 manages tokens, time, tools, APIs, and file access | `functional-domains.md`, `agent-battle-rhythm.md` |
| JP 4-0, Joint Logistics: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/ | Joint logistics | Sustainment across multiple organizations requires integration and prioritization | Manage resource bottlenecks and prioritization for multi-agent tasks | `agent-battle-rhythm.md` |
| Sustainment principles | Anticipation, responsiveness, simplicity, economy, survivability, continuity, improvisation | Sustainability comes from anticipation and simple flows | Long-running tasks need tool substitution, caching, logging, and checkpoints | `functional-domains.md` |
| FM 4-0, Sustainment Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN41683-FM_4-0-000-WEB-2.pdf | Sustainment operations | Sustainment determines operational continuity and readiness | Convert to a tool/resource/context/fallback readiness model | `maintenance-readiness-model.md` |
| Army Publishing Directorate ATP maintenance publications: https://armypubs.army.mil/ProductMaps/PubForm/ATP.aspx | Maintenance publications | Maintenance/upkeep procedures manage equipment availability and mission continuity | Runtime critical tool checks and fallback planning | `maintenance-readiness-model.md` |
| Army maintenance readiness article: https://home.army.mil/wood/contact/publications/engr_mag/Maintenance-Moving-Forward | Maintenance readiness update | maintenance doctrine evolves with operational needs | Reference basis for runner-based tool readiness checks | `maintenance-readiness-model.md` |

## 9. Targeting and Effects

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| JP 3-60, Joint Targeting: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/ | Targeting cycle | Objectives, effects, means, and assessment must be connected | LLM tasks must also clarify what change is needed for what target | `functional-domains.md` |
| FM 3-60, Army Targeting: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1030750 | Decide, detect, deliver, assess | Targeting is a decide, detect, deliver, assess cycle | Code/document changes also record target, desired effect, and verification | `decision-risk-assessment.md` |
| Joint fires/targeting doctrine | Effects-based planning | The desired effect matters more than the action itself | Set the goal as "enabling the next agent to execute" rather than "producing a document" | `military-llm-framework-v0.1.md` |

## 10. Rules of Engagement and Legal Controls

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| CJCSI 3121.01B, Standing Rules of Engagement / Standing Rules for the Use of Force: public references exist, verify current official release before operational use | ROE/SRUF | Permitted and prohibited actions are defined in advance | Set prohibited lines for agent tool-use, data-use, and irreversible actions | `agent-roles-and-authority.md` |
| JP 3-84, Legal Support: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/ | Legal support | A commander's decisions include legal restrictions and counsel | High-risk domains are handled through an approval/review path, not legal advice | `decision-risk-assessment.md` |
| ATP 5-19 | Risk decision authority | Risk acceptance authority differs by level | An agent is a risk reporter, not a risk acceptor | `agent-roles-and-authority.md` |

## 11. Warfighting Functions

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282 | Warfighting functions | Combat power arises from integration across functions | LLM operations also need per-function agents and an integration loop | `functional-domains.md`, `interdepartment-collaboration-policy.md` |
| ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715 | Operations, multidomain context | Operations are the simultaneous coordination of multiple functions and domains | Multi-agent systems must integrate research, execution, sustainment, protection, and information | `functional-domains.md`, `interdepartment-collaboration-policy.md` |
| JP 3-0, Joint Campaigns and Operations: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/ | Joint functions and integration | Joint operations integrate functional capabilities under a common purpose | Establish supported/supporting relationships and liaison contracts between departments | `interdepartment-collaboration-policy.md`, `schema-files/department-collaboration-charter.schema.json`, `department-collaboration-runner.js` |
| FM 6-0 | Command and control function | Command and control integrates all functions | The Chief/Commander agent holds final integration authority | `agent-battle-rhythm.md` |

## 12. AI / LLM Research Connections

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| LLM hallucination research | Verification and uncertainty | Model output must distinguish fact from inference | Mark unsourced claims as hypotheses and establish a verification procedure | `research-compendium.md` |
| Multi-agent LLM research | Role specialization | Specialized role differentiation can raise performance but incurs coordination cost | Use an S-staff structure but keep a CoS integration point | `agent-roles-and-authority.md` |
| Prompt engineering research | Structured prompting | Clear roles, constraints, and output format raise quality | Use OPORD, SITREP, and AAR templates | `prompt-templates.md` |
| RouteLLM: https://arxiv.org/abs/2406.18665 and FrugalGPT: https://arxiv.org/abs/2305.05176 | Economy of force and task organization | Strong/weak routing and cascades can preserve task quality while reducing model cost, but the routing policy is itself an evaluated component | Start eligible routine work on task-ready line capacity and escalate on measured failure or uncertainty | `model-force-assignment-policy.md`, `schema-files/model-force-assignment-plan.schema.json` |
| Language Model Cascades: https://proceedings.iclr.cc/paper_files/paper/2024/file/11f5520daf9132775e8604e89f53925a-Paper-Conference.pdf and RouterBench: https://arxiv.org/abs/2403.12031 | PACE and control measures | Routing quality depends on calibrated scoring; no model is uniformly optimal across quality, cost, and workload | Give the router its own readiness rating, held-out evaluation, retry ceiling, and fallback plan | `model-force-assignment-policy.md`, `model-force-assignment-runner.js` |
| HELM: https://crfm.stanford.edu/2022/11/17/helm.html and NIST AI RMF Core: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/ | METL, readiness, and operational assessment | Evaluation must cover the actual task and multiple operational metrics, disclose limitations, and continue after deployment | Rate readiness per immutable model profile, task, tool set, context class, harness, and environment | `model-force-assignment-policy.md`, `agent-metl.md`, `agent-readiness-ledger.md` |
| NIST AI RMF Generative AI Profile: https://doi.org/10.6028/NIST.AI.600-1 | Independent TEVV and risk management | Generative AI risk controls require documented testing, monitoring, and independent review proportionate to impact | High-impact assignments require deterministic checks, human review triggers, and independent assurance | `model-force-assignment-policy.md`, `run-model-force-assignment-fixtures.js` |
| Google SRE Workbook, Canarying Releases: https://sre.google/workbook/canarying-releases/ | Control/canary comparison and operational assessment | Before/after-only analysis is confounded by time; canary and control signals should be comparable and attributable, and relative results still need absolute service thresholds | Run the same sealed contract against baseline and candidate, require identical harness inputs, and combine non-regression limits with absolute quality targets | `bounded-self-improvement-operations.md`, `comparative-evaluation-runner.js`, `run-comparative-evaluation-fixtures.js` |
| OpenAI Working with evals: https://developers.openai.com/api/docs/guides/evals and Model guidance: https://developers.openai.com/api/docs/guides/latest-model | METL test contract and controlled experiment | An evaluation defines desired behavior and reusable criteria over representative test data; prompt or model changes should be compared by rerunning the same evaluations rather than assuming improvement | Seal a versioned fixture set, pin one harness, emit structured per-dimension observations, and reject resource savings or claimed improvement when the existing quality bar regresses | `schema-files/comparative-evaluation-set.schema.json`, `schema-files/comparative-evaluation-plan.schema.json`, `schema-files/comparative-evaluation-report.schema.json` |
| Berkeley Function-Calling Leaderboard: https://gorilla.cs.berkeley.edu/leaderboard and tau-bench: https://arxiv.org/abs/2406.12045 | Specialist qualification | General language quality does not establish tool-use or long-horizon policy readiness | Qualify specialist billets with tool- and policy-specific local fixtures before assignment | `model-force-assignment-policy.md`, `evaluation-metrics.md` |
| Judging LLM-as-a-Judge: https://arxiv.org/abs/2306.05685 and Confident or Seek Stronger: https://arxiv.org/abs/2502.04428 | Independent review and reporting reliability | Model judges exhibit systematic bias, and verbal confidence is not a sufficient routing or acceptance signal | Prefer different-family assurance, reference-guided rubrics, calibrated thresholds, and deterministic evidence | `model-force-assignment-policy.md`, `validator-cli-prototype/validate.js` |

## 13. Korean Public Sources

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| Ministry of National Defense (MND) public materials/Defense White Paper: https://www.mnd.go.kr/ | Defense policy, force structure, defense innovation | Confirm the Korean military context from official policy materials | Used as strategic/organizational background for the Korean-adapted framework | `korean-military-sources.md` |
| Korea Law Information Center: https://www.law.go.kr/ | Military service, orders, authority, directives | Orders operate within legitimate authority and legal regulations | Legal/organizational analogy basis for agent authority and ROE | `korean-military-sources.md`, `tool-use-roe.md` |
| Korea Institute for Defense Analyses (KIDA): https://www.kida.re.kr/ | Defense policy, AI, command and control, logistics research | Public research materials provide Korean institutional and policy context | Used as the implementation guide and Korean-adaptation reference material | `korean-military-sources.md`, `implementation-guide.md` |
| Canadian Armed Forces public page: https://www.canada.ca/en/services/defence/caf.html | Canadian Armed Forces organization | force structure and role terminology must be treated as local organization context, not US defaults | role alias map and local authority mapping for Canadian adaptation | `multinational-doctrine-consistency-review.md` |
| DND reports and publications: https://www.canada.ca/en/department-national-defence/corporate/reports-publications.html | DND/CAF publications and governance | public reports, ethos, data governance, and policy documents provide local source context | multinational consistency review must cite local public source families before adaptation | `multinational-doctrine-consistency-review.md`, `source-map.md` |
| CAF Ethos, Trusted to Serve: https://www.canada.ca/en/department-national-defence/corporate/reports-publications/canadian-armed-forces-ethos-trusted-to-serve.html | Canadian military ethos | culture, profession, and values affect authority, reporting, and judgement norms | do not assume US mission-command culture maps one-to-one into other forces | `multinational-doctrine-consistency-review.md`, `korean-org-culture.md` |
| Public military terminology references | Terminology standardization | Common terminology reduces distortion during dissemination | Stabilize the glossary and prompt DSL field names | `glossary.md`, `prompt-dsl.md` |

## 14. Supplemental Official Source Hosts

| Source host | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| Marine Corps publications, www.marines.mil | warfighting and planning references | Service-specific doctrine and operating philosophy serve as supplementary evidence for common principles | Supports glossary, doctrine comparison, and operating model | `research-compendium.md` |
| FEMA official site, www.fema.gov | continuity planning | Continuity includes succession, delegation, essential records, and test/training/exercise | Supports the role continuity and turnover model | `personnel-continuity-model.md` |
| USSOCOM official site, www.socom.mil | special operations, SOF truths, core activities | SOF emphasizes quality, readiness, enablers, and mission command | AI special operations task force model | `ai-special-operations-tf.md`, `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js` |
| Army Center of Military History public archive, history.army.mil | force development and documentation | Organizational change must be recorded as an approved capability requirement and documentation | Control agent/role/unit creation, resize, and deactivation through orders and schemas | `force-structure-change-policy.md`, `schema-files/force-structure-change-order.schema.json`, `force-structure-change-runner.js` |
| Army Force Management School, www.afms.edu | force management education and digital library | Force management connects capability requirement, resourcing, documentation, and readiness | New AI departments/positions must pass DOTMLPF-P alternative review and a sustainment check | `force-structure-change-policy.md` |
| U.S. Army War College War Room, warroom.armywarcollege.edu | How the Army Runs reference material | Large organizations are sustained through a loop of requirement identification, programming, documentation, and evaluation | AI organizations must also have a creation, growth, reduction, disband lifecycle | `force-structure-change-policy.md`, `run-force-structure-change-fixtures.js` |
| Army Safety, safety.army.mil | risk and safety cards | Risk management tools support on-the-ground checks before execution | Supports the risk prompt guard and checklist | `research-compendium.md` |
| Army University Press, www.armyupress.army.mil | professional military analysis | Doctrine application and case analysis provide supplementary evidence for framework interpretation | Case studies and research questions | `research-compendium.md` |
| Army public site, www.army.mil | official news and CALL references | Public articles and institutional announcements are useful for confirming current organization/material locations | Source discovery and source map coverage | `research-compendium.md` |
| UK official publications, www.gov.uk | UK and NATO doctrine publications | official national/allied doctrine pages provide non-US terminology and doctrine comparison anchors | multinational doctrine consistency review and alias map | `multinational-doctrine-consistency-review.md` |
| UK official assets, assets.publishing.service.gov.uk | doctrine PDFs | PDF source documents carry the underlying doctrine text and supplements | source verification and source-map URL coverage | `multinational-doctrine-consistency-review.md`, `source-map-linter.js` |
| Government of Canada, www.canada.ca | CAF/DND official public pages | non-US military organization, ethos, and governance context must be checked before adaptation | role authority, culture, and information governance localization | `multinational-doctrine-consistency-review.md` |

## 15. Cryptographic Attestation and Coordination Sources

| Source | Concept | Extracted principle | Cannae application | Local documents |
| --- | --- | --- | --- | --- |
| RFC 8032, EdDSA: https://www.rfc-editor.org/rfc/rfc8032.html | Ed25519 signatures | Use a standardized public-key signature primitive and bind verification to the exact public key | Verifier identities use SHA-256 of Ed25519 SPKI bytes and sign DSSE pre-authenticated encodings | `bounded-self-improvement-operations.md`, `verification-attestation.js` |
| DSSE protocol: https://github.com/secure-systems-lab/dsse/blob/master/protocol.md | Type-bound signing envelope | Authenticate both payload bytes and payload type without relying on JSON canonicalization | Receipt and comparative-report attestations use distinct predicate types and exact in-toto payload bytes under one Ed25519 DSSE signature | `bounded-self-improvement-operations.md`, `verification-attestation.js`, `comparative-evaluation-attestation.js` |
| in-toto Statement v1: https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md | Subject and predicate binding | Match immutable subjects by digest and identify assertion semantics with an unambiguous predicate type without prescribing predicate internals | Comparative reports and verifier-execution records put the exact persisted artifact in `subject`; typed predicates bind report lineage or execution policy, environment, repository and target details | `bounded-self-improvement-operations.md`, `docs/verifier-execution-integrity.md`, `schema-files/comparative-evaluation-attestation.schema.json`, `schema-files/verifier-execution-evidence.schema.json` |
| SLSA Verification Summary Attestation v1: https://slsa.dev/spec/v1.2/verification_summary | Delegated verification evidence | Verification checks the envelope signature, exact subject digest, predicate type, signer/verifier pair, intended resource, and result; trusted-verifier compromise remains out of scope | The controller independently checks the trusted key, purpose grant, report subject, predicate bindings, and comparison result instead of trusting a signature alone | `comparative-evaluation-attestation.js`, `autonomous-improvement-controller.js` |
| SLSA artifact verification: https://slsa.dev/spec/v1.2/verifying-artifacts | Root-of-trust and expectation checks | Verify trusted identity and signature, then compare provenance fields with preconfigured expected source, type, and parameters | `VerifierTrustPolicy` supplies roots while admission first confirms that purpose-authorized trusted identities can form the required quorum; checkpoint, plan, and report then supply exact expected campaign, repository, candidate, and evaluator values | `schema-files/verifier-trust-policy.schema.json`, `verifier-trust-readiness.js`, `comparative-evaluation-attestation-runner.js` |
| SLSA Build Provenance v1.2: https://slsa.dev/spec/v1.2/build-provenance and verification: https://slsa.dev/spec/v1.2/verifying-artifacts | Exact build identity and consumer expectations | A verifier checks the trusted builder/signature, subject digest, predicate type, build type and externally supplied parameters against expectations; provenance cannot make a compromised trusted builder truthful | Use a distinct policy-pinned builder signature and compare every runtime field, but explicitly retain builder compromise as a root-of-trust limitation | `docs/verifier-execution-integrity.md`, `schema-files/verifier-runtime-policy.schema.json`, `verifier-execution-evidence.js` |
| OCI image descriptor and manifest: https://github.com/opencontainers/image-spec/blob/main/descriptor.md and https://github.com/opencontainers/image-spec/blob/main/manifest.md | Immutable execution image identity | OCI descriptors bind content through media type, size and digest; a manifest identifies the exact configuration and layer graph | Require `name@sha256:<manifest digest>`, the expected manifest media type and exact digest rather than a mutable tag | `docs/verifier-execution-integrity.md`, `schema-files/verifier-runtime-policy.schema.json` |
| OCI Runtime Specification configuration: https://github.com/opencontainers/runtime-spec/blob/main/config.md and Linux configuration: https://github.com/opencontainers/runtime-spec/blob/main/config-linux.md | Runtime isolation controls | Runtime configuration exposes namespaces, mounts, process privileges, seccomp and filesystem controls that materially change the security boundary | Pin a sandbox profile digest and require read-only root, no new privileges, no privileged mode, no host network/PID namespace and no host mounts | `schema-files/verifier-runtime-policy.schema.json`, `verifier-execution-evidence.js` |
| GitHub Actions OIDC reference: https://docs.github.com/en/actions/reference/security/oidc, reusable workflow OIDC: https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows, live discovery: https://token.actions.githubusercontent.com/.well-known/openid-configuration, and artifact attestations: https://docs.github.com/en/actions/concepts/security/artifact-attestations | Workflow identity and signed build claims | GitHub tokens expose issuer, subject, audience, immutable repository/owner IDs, workflow refs/SHAs, commit, ref, run and runner-class claims; `job_workflow_ref` identifies a reusable workflow, while `runner_environment` does not identify physical infrastructure | Verify the compact token against a manifest-pinned `RS256` JWKS, require exact calling/reusable workflows and immutable IDs, and project unavailable infrastructure topology as shared unknown domains | `docs/verifier-execution-integrity.md`, `docs/github-actions-native-verifier-adapter.md`, `schema-files/github-actions-oidc-trust-bundle.schema.json`, `schema-files/github-actions-oidc-evidence.schema.json`, `github-actions-oidc.js` |
| IETF JSON Web Token RFC 7519: https://www.rfc-editor.org/rfc/rfc7519.html and JSON Web Key RFC 7517: https://www.rfc-editor.org/rfc/rfc7517.html | Offline JWT/JWK verification and claim validation | A relying party must verify the signature under an accepted algorithm/key and independently validate issuer, audience and temporal claims; a JWK `kid` selects key material but is not authority by itself | Accept only exact `RS256`, `kid`, issuer, audience, subject and bounded time claims under the exact manifest-approved GitHub JWKS artifact | `docs/github-actions-native-verifier-adapter.md`, `github-actions-oidc.js`, `run-github-actions-oidc-fixtures.js` |
| GitLab ID token authentication: https://docs.gitlab.com/ci/secrets/id_token_authentication/ and runner provenance: https://docs.gitlab.com/ci/runners/configure_runners/ | Pipeline and runner identity | GitLab ID tokens expose project, ref, config and runner-related claims whose stability and trust depend on protected CI configuration and runner ownership | Define exact project ID/path, config ref/SHA, commit, protected ref, runner ID and environment claims behind a separate provider adapter | `docs/verifier-execution-integrity.md`, `verifier-execution-evidence.js` |
| NIST SP 800-160 Vol. 2 Rev. 1: https://csrc.nist.gov/pubs/sp/800/160/v2/r1/final | Cyber-resiliency diversity and common-mode failure | Heterogeneous mechanisms reduce the chance that one common failure defeats every protection | Count independent verifier failure domains rather than process IDs or operator-assigned labels | `docs/verifier-independence-assurance.md`, `verifier-independence.js` |
| SLSA terminology and provenance: https://slsa.dev/spec/v1.1/terminology and https://slsa.dev/spec/v1.2/provenance | Build-platform trust closure | Platform identity includes the transitive software, hardware, people and organizations trusted to execute faithfully | Record provider, operator, control plane, tenant and infrastructure identity as quorum correlation inputs | `docs/verifier-independence-assurance.md`, `schema-files/verifier-runtime-policy.schema.json` |
| Kubernetes topology spread constraints: https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/ | Infrastructure failure domains | Region, zone, node and administrator-defined topology keys represent correlated placement domains | Normalize region, zone and infrastructure IDs and reject label-only independence | `docs/verifier-independence-assurance.md`, `verifier-independence.js` |
| AWS fault-isolation boundaries: https://docs.aws.amazon.com/whitepapers/latest/aws-fault-isolation-boundaries/abstract-and-introduction.html and AWS Organizations best practices: https://docs.aws.amazon.com/organizations/latest/userguide/orgs_best-practices.html | Region, Availability Zone, account and control-plane isolation | Geographic and administrative boundaries reduce different failure classes but are not interchangeable | Keep provider, account, control plane, region and zone as separate required dimensions | `docs/verifier-independence-assurance.md` |
| Azure regions and availability zones: https://learn.microsoft.com/en-us/azure/well-architected/resiliency/regions-availability-zones | Subscription-scoped availability zones | Zones separate power, cooling and networking, while zone numbering depends on subscription context | Bind zone IDs to provider/account scope rather than comparing display numbers globally | `docs/verifier-independence-assurance.md` |
| Google Cloud resource hierarchy and infrastructure reliability: https://docs.cloud.google.com/docs/get-started/organize-resources and https://docs.cloud.google.com/architecture/infra-reliability-guide | Organization, project, region and zone boundaries | Administrative hierarchy and geographic placement describe different trust and failure boundaries | Record project, operator, region and zone separately and correlate on any shared component | `docs/verifier-independence-assurance.md` |
| IETF RFC 9334 Remote ATtestation procedureS architecture: https://www.rfc-editor.org/rfc/rfc9334.html | Evidence, appraisal policy and attestation result separation | An attester supplies evidence to a verifier, which evaluates it under appraisal policy and produces an attestation result for a relying party | Keep raw provider/TEE evidence appraisal outside the common contract and project only policy-bound measurements and affirming results through a native adapter | `docs/verifier-execution-integrity.md`, `schema-files/verifier-runtime-policy.schema.json` |
| IETF RFC 9334 freshness, sections 10.2 and 10.4: https://www.rfc-editor.org/rfc/rfc9334.html#section-10.2 | Nonce-based evidence freshness | The appraising entity sends an unpredictable nonce, the attester signs it with the claims, and the appraiser checks exact equality while retaining nonce state | A policy-key-authenticated supervisor issues a unique nonce per verifier, and only dual-signed workload evidence containing that exact nonce can satisfy current dispatch admission | `docs/verifier-pre-dispatch-challenge.md`, `verifier-challenge-set.js`, `verifier-trust-readiness.js` |
| IETF RFC 9449 DPoP nonce and replay controls, sections 8 and 11.1: https://www.rfc-editor.org/rfc/rfc9449.html#section-11.1 | Server challenge, bounded proof lifetime and replay state | Reject a response whose nonce does not exactly match a recently supplied server nonce; limit proof lifetime and track proof identifiers or equivalent state to prevent reuse | Exact nonce equality, a short challenge deadline, manifest state and single-use dispatch binding reject stale and replayed verifier responses | `docs/verifier-pre-dispatch-challenge.md`, `schema-files/verifier-challenge-set.schema.json`, `run-verifier-challenge-fixtures.js` |
| W3C Web Authentication Level 3 challenge requirements: https://www.w3.org/TR/webauthn-3/#sctn-cryptographic-challenges | Challenge entropy and exact response comparison | Challenges need enough entropy to make guessing infeasible, should be at least 16 bytes, and returned challenge values are compared exactly | Cannae chooses a stricter 32-byte minimum per verifier and verifies the exact hex nonce inside signed identity evidence | `docs/verifier-pre-dispatch-challenge.md`, `schema-files/verifier-trust-policy.schema.json`, `verifier-challenge-set.js` |
| NIST SP 800-63B replay resistance: https://pages.nist.gov/800-63-4/sp800-63b.html#replay | Prevention of recorded-message reuse | Replay resistance prevents a recorded authentication message from succeeding again; random nonces are one mechanism for transaction uniqueness | A challenge is bound to one projected cycle/attempt/task and cannot be consumed by another dispatch | `docs/verifier-pre-dispatch-challenge.md`, `verifier-trust-readiness.js`, `run-verifier-challenge-fixtures.js` |
| gVisor security model and platform guide: https://gvisor.dev/docs/architecture_guide/security/ and https://gvisor.dev/docs/architecture_guide/platforms/ | Sandboxed system-call boundary | gVisor moves application system-call handling into a userspace kernel and exposes platform-specific isolation tradeoffs; it is a boundary with an explicit threat model, not a generic security label | Record sandbox kind plus exact profile digest and retain native host enforcement as a deployment responsibility | `docs/verifier-execution-integrity.md`, `schema-files/verifier-runtime-policy.schema.json` |
| Confidential Containers attestation policies: https://confidentialcontainers.org/docs/attestation/policies/ | TEE measurement appraisal | Confidential workloads require attestation evidence to be evaluated against an explicit policy before secrets or trust are released | Require TEE type, measurement, appraisal-policy digest and affirming result claims, while leaving vendor evidence appraisal to a native adapter | `docs/verifier-execution-integrity.md`, `verifier-execution-evidence.js` |
| SPIFFE X.509-SVID specification: https://spiffe.io/docs/latest/spiffe-specs/x509-svid/ | Workload identity certificate profile | An X.509-SVID leaf carries exactly one SPIFFE ID URI SAN, follows a non-root trust-domain path, and is validated to a configured bundle | Trust-policy v0.2 pins the root and exact SPIFFE ID; admission rejects missing, extra, malformed, wrong-domain, wrong-path, inactive, or untrusted leaf identities | `bounded-self-improvement-operations.md`, `schema-files/verifier-trust-policy.schema.json`, `verifier-identity-evidence.js` |
| SPIFFE Workload API specification: https://spiffe.io/docs/latest/spiffe-specs/spiffe_workload_api/ | Short-lived workload credentials and trust bundles | Workloads obtain rotating X.509-SVIDs and trust bundles from a local workload endpoint instead of storing long-lived identity credentials | Defines the production credential-delivery boundary; the current provider-neutral evidence verifier consumes supplied PEM and does not implement the Workload API client | `runtime-automation-roadmap.md`, `bounded-self-improvement-operations.md` |
| Sigstore security model: https://docs.sigstore.dev/about/security/ | Identity-bound signing and transparency | Short-lived identity certificates are verified against trusted roots and signing events are recorded in an append-only Merkle log whose operation must be monitored | Require a pinned identity root, exact workload identity, signed checkpoint, inclusion proof, and explicit limits on what transparency establishes | `runtime-automation-roadmap.md`, `bounded-self-improvement-operations.md`, `verifier-identity-evidence.js` |
| Sigstore bundle protobuf: https://github.com/sigstore/protobuf-specs/blob/main/protos/sigstore_bundle.proto and Cosign blob verification: https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-blob.md | Portable verification material | A bundle carries signature, certificate/key material, timestamps and transparency entries; verifiers must still bind the supplied artifact and exact expected signer identity | Trust-policy v0.3 admits only exact configured v0.2/v0.3 bundle media types and verifies the canonical Controls binding statement through the pinned official library | `sigstore-verifier-workload-admission.md`, `schema-files/sigstore-verifier-identity-evidence.schema.json`, `sigstore-verifier-identity-evidence.js` |
| Sigstore TrustedRoot protobuf: https://github.com/sigstore/protobuf-specs/blob/main/protos/sigstore_trustroot.proto and root-signing repository: https://github.com/sigstore/root-signing | Trust material distribution and rotation | A complete root contains historical and current CAs, Rekor logs, CT logs and timestamp authorities; artifact verification should use a policy-selected subset derived from independently obtained trust metadata | `SigstoreTrustedRoot` normalizes official protobuf JSON, records source and retrieval time, hashes exact content and is referenced by manifest ID/path/SHA-256 with a policy freshness bound | `sigstore-verifier-workload-admission.md`, `schema-files/sigstore-trusted-root.schema.json`, `sigstore-trusted-root.js` |
| sigstore-js client and verifier: https://github.com/sigstore/sigstore-js/tree/main/packages/client and https://github.com/sigstore/sigstore-js/tree/main/packages/verify | Official JavaScript bundle verification | The verifier checks signing timestamps, Fulcio chain and SCTs, Rekor inclusion, Rekor body-to-signature/digest binding, artifact signature and certificate policy | Controls pins exact package versions and invokes the low-level verifier with a manifest-pinned root, nonzero CT/Rekor/timestamp thresholds and an anchored exact SAN expression | `package.json`, `package-lock.json`, `sigstore-verifier-identity-evidence.js`, `run-sigstore-verifier-identity-fixtures.js` |
| Sigstore conformance suite: https://github.com/sigstore/sigstore-conformance and verification assets: https://github.com/sigstore/sigstore-conformance/tree/main/test/assets/bundle-verify | End-to-end positive and adversarial client behavior | Client verification must reject invalid inclusion, wrong artifacts, mismatched signatures, wrong instances, malformed bundles and invalid timestamp/certificate relationships | Offline fixtures retain one valid bundle plus wrong-artifact and wrong-Rekor-entry regressions under a pinned upstream commit | `sigstore-fixtures/README.md`, `run-sigstore-verifier-identity-fixtures.js` |
| Cosign advisory GHSA-whqx-f9j3-ch6m: https://github.com/sigstore/cosign/security/advisories/GHSA-whqx-f9j3-ch6m | Rekor entry binding failure | Inclusion of a valid Rekor entry is insufficient unless its artifact digest, signature and public key are compared with the bundle and supplied artifact | Package-locked official verification and explicit conformance regressions block this failure class; root and inclusion alone never satisfy admission | `sigstore-verifier-identity-evidence.js`, `sigstore-fixtures/README.md`, `run-sigstore-verifier-identity-fixtures.js` |
| Rekor transparency overview: https://docs.sigstore.dev/logging/overview/ | Append-only transparency log | Inclusion and append-only monitoring make signing events discoverable and tamper-evident, but clients and monitors retain verification responsibilities | Admission verifies one inclusion path and pinned-key checkpoint; consistency monitoring, witnesses, gossip, and Rekor service operation remain external | `bounded-self-improvement-operations.md`, `verifier-identity-evidence.js` |
| Rekor monitor: https://github.com/sigstore/rekor-monitor | Durable consistency monitoring | A monitor retains its last verified checkpoint and verifies append-only consistency on later runs; periodic execution and durable state are operational requirements | Require every state transition to cite the prior checkpoint exactly and verify its consistency proof before dispatch | `transparency-operations.md`, `transparency-operations.js`, `schema-files/transparency-observation.schema.json` |
| Transparency checkpoint formats: https://github.com/transparency-dev/formats/tree/main/log | Interoperable signed checkpoints | A checkpoint fixes origin, tree size and root hash; signed-note composition permits additional witness signatures without changing the checkpoint body | Canonicalize one checkpoint core and bind log, witness and monitor signatures to the exact transition | `transparency-operations.md`, `transparency-operations.js` |
| Transparency witness: https://github.com/transparency-dev/witness | Independent consistency witness | A witness stores one checkpoint per log, verifies consistency to the next checkpoint, and countersigns only a valid transition | Keep witnesses separate from monitors and require distinct observer operators before a state becomes ready | `transparency-operations.md`, `schema-files/transparency-policy.schema.json` |
| Rekor v2 tiled log: https://github.com/sigstore/rekor-tiles | Time-sharded transparency service | Active log shards change over time and active/inactive shard trust information is distributed through Sigstore trust metadata | Treat shard/log changes as explicit policy/root transitions, never as an automatically trusted URL change | `transparency-operations.md`, `schema-files/trust-root-rotation.schema.json` |
| The Update Framework specification: https://theupdateframework.github.io/specification/draft/ | Root rotation, rollback and freeze resistance | Root N+1 must be signed by the threshold from root N and by its own new threshold, versions advance sequentially, and trusted root state persists | Verify old-root authorization, new-root self-authorization, exact N to N+1 progression, expiry and explicit USER activation | `transparency-operations.md`, `transparency-operations.js`, `schema-files/trust-root-rotation.schema.json` |
| Sigstore threat model: https://docs.sigstore.dev/about/threat-model/ | Root compromise and revocation operations | Threshold root control, rotation, compromise time, revocation and freshness are separate trust operations | Preserve USER authority for rotation/revocation, require compromise revocation records, and fail closed on stale or revoked active trust | `transparency-operations.md`, `schema-files/transparency-incident.schema.json` |
| RFC 5280: https://www.rfc-editor.org/rfc/rfc5280.html | Internet X.509 path validation | Certificate-chain validation includes signatures, validity, basic constraints, key use, names, policy, and revocation-related processing | The prototype implements a documented bounded subset and must not be represented as a general RFC 5280 path builder | `bounded-self-improvement-operations.md`, `verifier-identity-evidence.js` |
| RFC 9162: https://datatracker.ietf.org/doc/html/rfc9162 and obsoleted RFC 6962: https://www.rfc-editor.org/rfc/rfc6962.html | Certificate Transparency Merkle trees and proofs | Domain-separated leaf/node hashes and inclusion/consistency proofs support append-only log verification; RFC 9162 supersedes RFC 6962 | The local proof uses RFC 6962-style SHA-256 leaf/node prefixes for inclusion verification and explicitly does not implement a CT log or consistency monitor | `verifier-identity-evidence.js`, `run-verifier-identity-evidence-fixtures.js` |
| RFC 6962 consistency and gossip: https://www.rfc-editor.org/rfc/rfc6962.html | Append-only proof and split-view detection | Consistency proofs connect tree states, while exchanging signed tree heads is needed to expose conflicting views | Verify every local state transition and document that withheld split views still require external gossip and independent observers | `transparency-operations.md`, `run-transparency-operations-fixtures.js` |
| etcd v3.6 API: https://etcd.io/docs/v3.6/learning/api/ | Lease, keepalive, revision, transaction | Expiring ownership requires renewal; protected updates need atomic comparison and a monotonic ordering token | The shared-filesystem backend uses expiring leases, monotonic fencing tokens, and immutable revision compare-and-swap; stronger deployments must use a linearizable coordinator | `repository-artifact-isolation-policy.md`, `repository-lease.js`, `repository-artifact-store.js` |

## 16. Implementation Sources and Artifacts

| Source / artifact | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| OPORD/WARNO/FRAGO doctrine | Standard order format | Orders must be structured to be verifiable | Converted into a machine-readable prompt DSL | `prompt-dsl.md` |
| Authorities and ROE concepts | Authority and action restrictions | Distinguish permitted/approval-required/prohibited actions before execution | Implemented as a tool gateway and approval UI | `tool-use-roe.md`, `implementation-guide.md` |
| Staff organization doctrine | Staff organization | Functional role division and integration authority are required | Implemented as an agent registry and org chart | `llm-agent-org-chart.md`, `implementation-guide.md` |
| Operation assessment doctrine | MOP/MOE | Performance and effect are assessed separately | Implemented as an evaluator and readiness rating | `evaluation-metrics.md`, `implementation-guide.md` |
| Korean organizational culture adaptation | Reporting/approval/dissent culture | Backbrief, Red Team, and risk reporting must be made explicit | Korean-adapted prompts and approval UX adjustments | `korean-org-culture.md` |
| Runtime architecture artifact | Command and control system implementation | An orchestrator, policy engine, tool gateway, and evidence store are required | Actual system reference structure | `reference-architecture.md`, `sample-runtime-state.md` |
| Prompt DSL validation artifact | Order verification | Catches missing intent, authority, CCIR, and assessment before execution | Connected to a validator and approval UI | `prompt-dsl-validator.md`, `approval-ui-patterns.md` |
| Runtime schema artifacts | State contract | Standardizes mission, OPORD, task, tool, approval, and AAR objects | Implemented via JSON Schema and a validator prototype | `schema-files/README.md`, `validator-prototype.md` |
| Runtime operations artifact | Operational procedure | A startup, intake, tasking, execution, incident, AAR loop is required | Actual agent runtime playbook | `agent-runtime-playbook.md` |
| Risk and readiness artifacts | Risk management and training management | A risk register and readiness ledger adjust authority | Update agent authority on an evidence basis | `military-ai-risk-register.md`, `agent-readiness-ledger.md` |
| Fixture and test artifacts | Verification training materials | Valid/invalid payloads and expected results shape validator quality | Regression tests and policy engine verification | `sample-payloads/README.md`, `evaluation-fixtures.md` |
| Policy engine artifact | ROE adjudication | Adjudicates tool authority by Black > Red > Amber > Green priority | Core decision logic of the tool gateway | `policy-engine-rules.md` |
| Command post artifact | Command post display | What a commander needs is not the entire log but decision requirements, CCIR, risk, and an approval queue | Mission dashboard and approval queue design | `command-post-dashboard.md` |
| Automation roadmap artifact | Phased implementation | Progresses in the order documents, validator, compiler, tool gateway, dashboard, learning runtime | Actual productization plan | `runtime-automation-roadmap.md` |
| Validator CLI artifact | Executable verification | Actually runs the schema subset and semantic rules | Fixture-based regression gate draft | `validator-cli-prototype/README.md` |
| Wireframe artifact | Command post UX | Designs the dashboard around mission, approvals, CCIR, risk, and evidence | Baseline for the UI prototype | `dashboard-wireframes.md` |
| Data model artifact | State storage | Separates mission/evidence/audit/readiness into DB tables | Runtime persistence design | `data-model.sql.md` |
| Demo scenario artifact | End-to-end operation | Verifies the intake, OPORD, tasking, tool request, SITREP, FRAGO, AAR flow | Product demo and test cases | `runtime-demo-scenario.md` |
| Source reliability artifact | Source evaluation | Evaluates authority, directness, currency, scope, and interpretive risk | Evidence store and Red Team source check | `source-reliability-rubric.md` |
| Fixture runner artifact | Automated verification | Runs validator fixture expectations to catch regressions | CLI-based test gate | `validator-cli-prototype/run-fixtures.js` |
| Policy prototype artifact | ROE execution | Adjudicates tool requests as actual Green/Amber/Red/Black | Tool gateway prototype | `policy-engine-prototype/README.md` |
| Demo payload artifact | State example | Connects mission, task, tool, approval, SITREP, evidence, and AAR payloads | End-to-end runtime demo | `runtime-demo-payloads/README.md` |
| Dashboard UI artifact | Command post prototype | Displays approval, CCIR, risk, evidence, and readiness in static HTML | Command post UI verification | `dashboard-ui-prototype/README.md` |
| Event sourcing artifact | Audit and replay | Separates command/event and defines projections | Long-term audit/log architecture | `event-sourcing-model.md` |
| Policy fixture runner | Policy regression verification | Automatically confirms Green allow and Red block expectations | Policy regression gate | `policy-engine-prototype/run-policy-fixtures.js` |
| Runtime demo runner | End-to-end verification | Runs payload validation and policy check together | Demo mission regression gate | `runtime-demo-runner.js` |
| Dashboard state artifact | UI state separation | Drives the dashboard HTML from JSON state | Extensible to a projection-based UI | `dashboard-ui-prototype/dashboard-state.json` |
| Event fixtures and replay | Event replay | Computes mission projections from the event log | Audit replay prototype | `event-fixtures/README.md`, `event-replay-prototype/README.md` |
| Dashboard state renderer | Projection conversion | Converts event replay results into command post display state | Connects the dashboard to the event log source of truth | `dashboard-ui-prototype/render-state.js` |
| Event replay fixture runner | Projection regression verification | Confirms OPORD, task, Red block, approval, and readiness are preserved after replay | Audit/event sourcing regression gate | `event-replay-prototype/run-event-fixtures.js` |
| Runtime demo OPORD payload | Order document verification | Strictly connects the demo mission to the OPORD and task order | mission -> OPORD -> task chain validation | `runtime-demo-payloads/opord.json` |
| Orders production pipeline artifact | Order production | Fixes the request -> analysis -> OPORD -> task -> backbrief -> rehearsal -> execution flow | Operates long-running LLM work as a document-command loop | `orders-production-pipeline.md` |
| OPORD annex model artifact | Annex separation | The body covers intent/authority; annexes cover specialized detailed plans | Separates source/tool/risk/verification/context plans by role | `opord-annex-model.md` |
| Backbrief and rehearsal artifact | Confirmation/rehearsal | Subordinates must restate their understanding and execution sequence to catch distortion | Verified before execution via the `BACKBRIEF`/`REHEARSAL` schema and runner | `backbrief-and-rehearsal-sop.md`, `schema-files/backbrief.schema.json`, `schema-files/rehearsal.schema.json`, `orders-dissemination-runner.js` |
| OPORD annex and FRAGO scope-change schemas | Separation of order body/annex/fragmentary order | Updating specialized detail plans and changing mission scope/authority are not the same document | An annex changes only detail; intent/authority changes are handled via FRAGO scope-change and backbrief/rehearsal | `schema-files/annex.schema.json`, `schema-files/frago-scope-change.schema.json`, `docs/opord-annex-model.md` |
| Rehearsal to CCIR router | Rehearsal and decision points | Friction discovered during rehearsal must be escalated to the reporting/decision channel before execution | Converts rehearsal friction points and decision points into CCIR alerts and decision packets | `rehearsal-to-ccir-router.js`, `rehearsal-to-ccir-fixtures/README.md`, `backbrief-and-rehearsal-sop.md` |
| Information to operations cycle artifact | Information processing and operational change | Raw information does not directly change an order; it passes through assessment, CCIR, running estimate, and decision support | Converts information reports/assessments into CCIR alerts, decision packets, SITREPs, and FRAGO scope-change drafts | `information-to-operations-cycle.md`, `schema-files/information-report.schema.json`, `schema-files/intelligence-assessment.schema.json`, `information-to-operations-router.js`, `information-to-operations-fixtures/README.md` |
| Personnel continuity artifact | Personnel loss/replacement/rotation | Even if a person disappears, the position, line of succession, authority limits, vital records, and training pipeline must remain | Converts role loss/rotation into successor activation, handoff, paused functions, and commander-retained decisions | `personnel-continuity-model.md`, `schema-files/continuity-plan.schema.json`, `continuity-drill-runner.js`, `continuity-drill-fixtures/README.md` |
| AI special operations task force model | special operations task organization | High-risk/high-uncertainty missions need a small team, vetted personnel, enablers, clear authority, and a fast decision loop | Operates the AI agent TF as a selected/trained/enabled/mission-commanded team | `ai-special-operations-tf.md`, `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js`, `sof-tf-fixtures/README.md` |
| Interdepartment collaboration artifact | combined arms and joint function integration | Different functional departments must be integrated via supported/supporting relationships, liaison, output contracts, and conflict routes | Projects interdepartmental collaboration as relationship edges, missing liaison, commander queue, and preflight blocks | `interdepartment-collaboration-policy.md`, `schema-files/department-collaboration-charter.schema.json`, `department-collaboration-runner.js`, `department-collaboration-fixtures/README.md` |
| Force structure change artifact | force management and documentation | An organization is created or reduced only when capability gap, DOTMLPF-P, authority, readiness, transition, and documentation update all align | Controls the creation, disestablishment, expansion, and reduction of AI branches/positions/units/TFs via a validator and runner gate | `force-structure-change-policy.md`, `schema-files/force-structure-change-order.schema.json`, `force-structure-change-runner.js`, `force-structure-change-fixtures/README.md` |
| Model force assignment artifact | mission task organization, METL, PACE, and independent assurance | Model size, role, authority, and readiness are separate dimensions; scarce capacity is assigned by mission evidence rather than prestige | Validates line/specialist/command/SOF/assurance/reserve profiles, router readiness, context eligibility, task evidence, PACE, and human retained authority | `model-force-assignment-policy.md`, `schema-files/model-force-assignment-plan.schema.json`, `model-force-assignment-runner.js`, `model-force-assignment-fixtures/README.md` |
| Model force v0.2 operational artifact | force generation, task organization, precombat checks, dispatch accountability, and operational assessment | An authored plan alone is not sufficient evidence of model eligibility or agent authority; source registry, mission demand, routing proof, binding, and usage evidence must remain distinct | Compiles eligible profiles deterministically, combines routing and assignment readiness, emits dispatch only after one-to-one binding, and records immutable model usage without granting authority | `model-force-v0.2-operations.md`, `schema-files/model-registry.schema.json`, `schema-files/model-assignment-request.schema.json`, `model-assignment-compiler.js`, `schema-files/integrated-mission-preflight.schema.json`, `integrated-mission-preflight-runner.js`, `schema-files/model-usage-event.schema.json`, `run-model-force-v0.2-fixtures.js` |
| Repository artifact isolation artifact | unit boundaries, records accountability, mission files, and handoff discipline | Outputs from separate supported repositories must retain distinct custody, identity, evidence, and lifecycle even when mission and artifact IDs overlap | Derives a stable Git repository key, stores JSON/files under repository/mission/wave/kind namespaces, journals each mutation, retains hash-linked manifest history and a digest sidecar, and blocks cross-repository paths, traversal, implicit overwrite, unresolved crashes, and detected tampering | `repository-artifact-isolation-policy.md`, `repository-artifact-store.js`, `repository-artifact-verify.js`, `schema-files/repository-artifact-manifest.schema.json`, `run-repository-artifact-isolation-fixtures.js`, `run-repository-artifact-recovery-fixtures.js` |
| Proof-carrying self-improvement artifact | mission command, confirmation briefs, assessment, records accountability, and retained approval authority | Adaptive work should advance only from independently inspectable execution evidence, an accepted predecessor, and exact authority evidence rather than model-authored confidence | Executes bounded argument arrays without a shell, records repository-state and output hashes in a persisted receipt, reloads parent/approval artifacts through the verified manifest, and keeps release authority with the human user | `bounded-self-improvement-operations.md`, `verification-runner.js`, `schema-files/verification-plan.schema.json`, `schema-files/verification-receipt.schema.json`, `autonomous-improvement-controller.js`, `run-self-improvement-fixtures.js` |
| Deterministic campaign supervisor artifact | mission command, finite tasking, battle rhythm, records accountability, and commander's decision points | A controller decision is not itself a durable campaign scheduler; the next attempt must be reconstructed from the complete accepted chain and finite budgets | Verifies repository custody, pairs every checkpoint with exactly one decision, validates cycle/baseline/parent lineage, and emits one idempotent executable order or a fail-closed hold without granting release | `campaign-supervisor.js`, `schema-files/self-improvement-cycle-order.schema.json`, `run-campaign-supervisor-fixtures.js`, `bounded-self-improvement-operations.md` |
| Verifier readiness admission artifact | precombat checks, personnel/equipment readiness, task organization, and finite orders validity | An operation should not be dispatched merely because its later proof requirement is well specified; the assigned assurance force must be eligible and sufficient before execution begins | Reloads the exact trust-policy artifact, computes purpose-specific eligible verifier/key/group populations and effective thresholds, binds a conservative expiry into cycle-order v0.2, and fails closed before candidate work when a required quorum is impossible | `verifier-trust-readiness.js`, `campaign-supervisor.js`, `schema-files/self-improvement-cycle-order.schema.json`, `run-verifier-trust-readiness-fixtures.js`, `run-cycle-order-admission-fixtures.js` |
| Pre-dispatch verifier challenge artifact | precombat communications check, current readiness confirmation, finite tasking and accountability | A registered assurance unit must demonstrate current response capability for the exact operation before it is counted as ready | The supervisor persists unique nonce challenges bound to exact dispatch lineage; only fresh dual-signed workload responses enter purpose quorum, and stale, late, ambiguous or replayed responses fail closed | `docs/verifier-pre-dispatch-challenge.md`, `verifier-challenge-set.js`, `schema-files/verifier-challenge-set.schema.json`, `run-verifier-challenge-fixtures.js` |
| Deep research queue artifact | Research operations management | Manages missing military operating domains via a backlog and source plan | Framework expansion prioritization and source management | `military-operating-deep-research-queue.md` |
| Commander handbook artifact | Commander's operating guidance | Organizes intent, authority, CCIR, approval, and AAR into a human command procedure | AI commander prompt and approval judgment guide | `commander-handbook.md` |
| B2C2WG operating artifact | Staff integration and battle rhythm | Separates boards/WGs/cells/centers into a decision packet flow | Multi-agent scheduling and decision packet workflow | `b2c2wg-operating-model.md` |
| CCIR alerting artifact | Commander's information requirements | Converts PIR/FFIR/EEFI/decision points into alert routing | Dashboard and approval/SITREP/FRAGO branching | `ccir-alerting-model.md` |
| OPSEC classification artifact | Operational security and information release control | Restricts information flow via EEFI, classification, and releasability | Context sharing and tool-output redaction | `opsec-classification-model.md` |
| Role document access artifact | need-to-know document distribution | Allowing only documents that match role, duty, and authority reduces information overload and authority overreach | Projects a per-agent reading list via a document access manifest and runner | `role-document-access-policy.md`, `schema-files/document-access-manifest.schema.json`, `document-access-runner.js`, `document-access-fixtures/README.md` |
| Multinational doctrine consistency artifact | doctrine comparison and policy reconciliation | US materials are only a baseline; source family coverage, aliases, and jurisdiction gates must be verified before applying to another military | Controls US-only assumptions, staff terminology, ROE/legal variance, force structure vocabulary, and SOF TF scope via a review object and runner | `multinational-doctrine-consistency-review.md`, `schema-files/doctrine-consistency-review.schema.json`, `doctrine-consistency-runner.js`, `doctrine-consistency-fixtures/README.md` |
| Controls doctrine operator skill | corpus navigation and bounded self-improvement | A large document system is used efficiently only if it has task routing, source discipline, executable validation, and a finite evidence-driven update loop | The Codex skill and the Claude Code project skill brief the user in final-decision-authority mode for direct use, route documents by role/department/authority/need-to-know for AI-delegated use, and require campaign/checkpoint/decision evidence for adaptive work. The router verifies zero unrouted artifacts via `--coverage`; bounded campaigns preserve baseline lineage, finite budgets, rollback, independent control-plane evaluation, and human release authority | `codex-skills/controls-doctrine-operator/SKILL.md`, `.claude/skills/controls-doctrine-operator/SKILL.md`, `self-improvement-campaign-init.js`, `autonomous-improvement-controller.js`, `docs/bounded-self-improvement-operations.md`, `codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js` |
| Agent routing receipt preflight artifact | staff routing and execution discipline | A subordinate agent merely claiming to have read a document does not grant execution authority; a standard receipt and preflight gate are required | The CoS leaves routing evidence via `--receipt --scope=wave` at the start of every wave, and each AI agent leaves routing evidence via `--receipt --scope=agent --role=S3 --department=operations --authority=scoped-execution` before working. `agent-routing-preflight-runner.js` cross-checks the expected agent list against the receipt bundle to block omissions, stale waves, and wrong role/department/authority | `schema-files/routing-receipt.schema.json`, `sample-payloads/valid-routing-receipt-agent-s3.json`, `agent-routing-preflight-runner.js`, `agent-routing-preflight-fixtures/README.md`, `run-agent-routing-preflight-fixtures.js` |
| Knowledge management artifact | Knowledge management | Connects decisions, evidence, events, handoffs, and AARs to a source of truth | Reduces reliance on conversational memory and enables handoff | `knowledge-management-sop.md` |
| Agent METL artifact | Training and readiness | Connects per-role essential tasks and proficiency to authority delegation | readiness-to-authority policy | `agent-metl.md` |
| Authority matrix schema artifact | Approval authority matrix | Adjudicates authority by role/task/tool/target/risk/readiness/expiry | Validator semantic gate and future policy engine input | `schema-files/authority-matrix.schema.json`, `sample-payloads/valid-authority-matrix.json` |
| Decision packet schema artifact | Decision preparation | Fixes option, risk, authority, evidence, and fallback into a packet | Commander board input validation | `schema-files/decision-packet.schema.json`, `sample-payloads/valid-decision-packet.json` |
| Working group schema artifact | B2C2WG charter | Specifies the problem, chair, participants, deliverables, and disband condition | Prevents unbounded agent discussion | `schema-files/working-group.schema.json`, `sample-payloads/valid-working-group.json` |
| CCIR alert schema artifact | Information requirement routing | Turns PIR/FFIR/EEFI/decision point alerts into a standard object | Dashboard and alert router contract | `schema-files/ccir-alert.schema.json`, `sample-payloads/valid-ccir-alert.json` |
| Handoff packet schema artifact | Command/operations handoff | Bundles current order, intent, blocked items, pending decisions, and source-of-truth | Context transition safety | `schema-files/handoff-packet.schema.json`, `sample-payloads/valid-handoff-packet.json` |
| Alert router prototype | Automated CCIR classification | Computes Red decision, PIR, and FFIR alerts from the event log | Commander-facing alert projection | `alert-router-prototype/README.md` |
| Readiness gate prototype | Combining authority and training | Combines the authority matrix and readiness rating to adjudicate allow/approval/prohibit | Runtime tool gateway precursor | `readiness-gate-prototype/README.md` |
| Context releasability policy | OPSEC/need-to-know | Defines per-role raw/summary/redacted/reference/denied delivery | Multi-agent context filtering | `context-releasability-policy.md` |
| Context item schema | OPSEC metadata | Standardizes classification, EEFI, allowed roles, and release_to_final | Context filter input contract | `schema-files/context-item.schema.json`, `sample-payloads/valid-context-item.json` |
| Document access manifest schema | Document distribution control | Document access is restricted by role, duty, authority, classification, and delivery mode | Computes per-agent allowed/denied reading lists and audit requirements | `schema-files/document-access-manifest.schema.json`, `sample-payloads/valid-document-access-manifest.json`, `document-access-runner.js` |
| Release review schema | Release/external-transmission review | Records the final output/external tool release decision | Sensitive/restricted release gate | `schema-files/release-review.schema.json`, `sample-payloads/valid-release-review.json` |
| Release gate decision schema | release gate audit | The final judgment synthesizing execution authority and release authority must also be recorded in the event log | Preserves the release gate allow/block fact and its snapshot/evidence | `schema-files/release-gate-decision-event.schema.json`, `sample-payloads/valid-release-gate-decision-event.json` |
| Context filter prototype | need-to-know execution | Converts a context item into a per-role raw/summary/redacted/reference/denied packet | Multi-agent context distribution control | `context-filter-prototype/README.md` |
| Document access runner | need-to-know document access | Ahead of the context filter, the documents a role can even open must themselves be restricted | Cross-checks the manifest against role/duty/authority to generate an allowed/denied document projection | `document-access-runner.js`, `document-access-fixtures/README.md` |
| Handoff generator artifact | Handoff automation | Generates a handoff packet from event replay and alert projection | Context transition safety automation | `handoff-generator.js` |
| Decision packet linter | Decision packet quality | Automatically checks for missing option/risk/evidence/deadline | Commander board packet quality gate | `decision-packet-linter.js` |
| Working group event fixtures | B2C2WG lifecycle | Represents WG opened/prepared/decided/closed as an event log | Staff integration replay fixture | `event-fixtures/working-group-event-fixtures.json` |
| Maintenance readiness model | Sustainment/maintenance | Evaluates tool/resource/context/fallback readiness as operational continuity | S4/S6 runtime sustainment | `maintenance-readiness-model.md` |
| Maintenance readiness runner | Maintenance check automation | Converts critical runner results into a readiness report | S4/S6 maintenance readiness automation | `maintenance-readiness-runner.js`, `schema-files/maintenance-readiness.schema.json` |
| Maintenance readiness dashboard projection | sustainment dashboard | The readiness report must be shown as a ready/degraded/down dashboard queue | Displays tool/resource/context failures and commander decision flags as a projection | `maintenance-dashboard-runner.js`, `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`, `maintenance-dashboard-fixtures/README.md` |
| Release review runner | Release review automation | Compares context filter output with the release review | Final output release gate | `release-review-runner.js` |
| Source-map linter | Knowledge management check | Confirms official source domains are registered in the source map | Source coverage regression gate | `source-map-linter.js` |
| Working group dashboard projection | Command post projection | Stores the WG lifecycle projection as dashboard state | B2C2WG status panel input | `dashboard-ui-prototype/working-group-projection-dashboard-state.json` |
| Approval scope policy | Approval scope | Approval authority is restricted by action/tool/target/time/condition/evidence | Approval object and tool gateway scope check | `approval-scope-policy.md` |
| Risk acceptance authority | Risk acceptance authority | Risk acceptance is a commander-retained authority separate from execution approval | Connects risk packet, approval, AAR, and readiness | `risk-acceptance-authority.md` |
| Approval scope schema artifact | single-use approval | Approvals must carry expiry, max execution, rollback, evidence, and consumption metadata | Prevents approval reuse and scope mismatch | `schema-files/approval-scope.schema.json`, `sample-payloads/valid-approval-scope.json` |
| Approval consumption event artifact | approval audit | Separates approval granted from actual execution to prevent reuse | Leaves a consumed approval event and cross-checks it against the approval scope | `schema-files/approval-consumption-event.schema.json`, `approval-consumption-runner.js`, `approval-consumption-fixtures/README.md` |
| Approval revocation event artifact | approval cancellation audit | Only the granting authority can revoke an active approval before execution | Leaves a revoked approval event and blocks post-hoc revocation of a consumed approval | `schema-files/approval-revocation-event.schema.json`, `approval-revocation-runner.js`, `approval-revocation-fixtures/README.md` |
| Approval renewal event artifact | approval extension audit | Only the validity period of an active approval can be extended; expanding the scope of authority is a new approval | Verifies expiry renewal and blocks scope expansion via a renewal event | `schema-files/approval-renewal-event.schema.json`, `approval-renewal-runner.js`, `approval-renewal-fixtures/README.md` |
| Approval delegation event artifact | approval authority delegation | Delegation of approval authority is possible only within existing authority rules, and commander-retained authority must remain | Cross-checks the delegation event against the authority matrix to block abuse of delegated approval | `schema-files/approval-delegation-event.schema.json`, `approval-delegation-runner.js`, `approval-delegation-fixtures/README.md` |
| Approval delegation termination artifact | delegated authority lifecycle | Delegated authority must be closed by an event not only at creation but also at revocation/expiry | Cross-checks the termination event against the original delegation snapshot to prevent reuse of expired/revoked authority | `schema-files/approval-delegation-revocation-event.schema.json`, `approval-delegation-revocation-runner.js`, `approval-delegation-revocation-fixtures/README.md` |
| Authority delegation projection artifact | delegated authority dashboard | Active/revoked/expired delegated authority must be shown as a projection to prevent reuse of expired authority | Converts delegation lifecycle events into dashboard state | `authority-delegation-projection-runner.js`, `dashboard-ui-prototype/authority-delegation-projection-state.json`, `authority-delegation-projection-fixtures/README.md` |
| Risk acceptance schema artifact | residual risk acceptance | High/critical/irreversible residual risk is a commander-retained authority | Risk acceptance gate with supervision and AAR trigger | `schema-files/risk-acceptance.schema.json`, `sample-payloads/valid-risk-acceptance.json` |
| Policy authority integration artifact | authority gate synthesis | A Red action is unlocked only if policy, authority matrix, scoped approval, and risk acceptance all align | Tool gateway precursor for scoped execution | `policy-engine-authority-integration.js`, `run-authority-integration-fixtures.js` |
| Policy release integration artifact | release authority synthesis | Execution approval and information release approval are separate | Even if the authority gate allows it, missing or failed release review blocks final/external output | `policy-engine-release-integration.js`, `release-integration-fixtures/README.md` |
| Release gate decision artifact | release gate event | Records the final allow/block of release integration as an event | Cross-checks the final decision, authority snapshot, release snapshot, reasons, and evidence | `release-gate-decision-runner.js`, `release-gate-decision-fixtures/README.md` |
| Release gate dashboard projection | release gate dashboard | The release gate decision must be shown as a release/authority/review queue | Separates allowed release, missing release review, and authority block into dashboard state | `release-gate-dashboard-runner.js`, `dashboard-ui-prototype/release-gate-dashboard-state.json`, `release-gate-dashboard-fixtures/README.md` |
| Source-map URL coverage report | Knowledge management check | Linter results must not vanish as execution logs; they must remain as a coverage snapshot | Tracks missing source-map coverage by reviewing connected documents per official source host | `source-map-url-coverage-report.json`, `source-map-linter.js` |
| AAR readiness update artifact | Post-action learning and readiness update | AAR learning must not end as a document note; it must convert into a training/maintenance/authority update queue | Converts AAR findings into readiness recommendations, maintenance actions, SOP updates, and CCIR triggers | `aar-to-readiness-update.js`, `schema-files/aar-readiness-update.schema.json`, `aar-readiness-update-fixtures/README.md` |

## 17. Currently Weak Evidence

The items below need additional research.

| Item | Reason | Next action |
| --- | --- | --- |
| Korean military document dissemination system | Public materials have low accessibility | Additional review of domestic papers and public training materials |
| Latest ROE source text | Confirming the public version of some documents is difficult | Recheck the official release page |
| LLM multi-agent military-style organization experiments | Lack of direct comparative research | Design an experiment or write a case study |

## 18. Related Documents

- `research-compendium.md`
- `military-llm-framework-v0.1.md`
- `military-operating-system.md`
- `agent-roles-and-authority.md`
- `decision-risk-assessment.md`
- `prompt-templates.md`
- `sop-library.md`
- `agent-battle-rhythm.md`
- `functional-domains.md`
- `interdepartment-collaboration-policy.md`
- `force-structure-change-policy.md`
- `model-force-assignment-policy.md`
- `model-force-v0.2-operations.md`
- `repository-artifact-isolation-policy.md`
- `case-studies.md`
- `glossary.md`
- `evaluation-metrics.md`
- `experiments.md`
- `korean-military-sources.md`
- `implementation-guide.md`
- `prompt-dsl.md`
- `tool-use-roe.md`
- `llm-agent-org-chart.md`
- `korean-org-culture.md`
- `reference-architecture.md`
- `sample-runtime-state.md`
- `prompt-dsl-validator.md`
- `approval-ui-patterns.md`
- `schema-files/README.md`
- `validator-prototype.md`
- `agent-runtime-playbook.md`
- `military-ai-risk-register.md`
- `agent-readiness-ledger.md`
- `sample-payloads/README.md`
- `policy-engine-rules.md`
- `command-post-dashboard.md`
- `runtime-automation-roadmap.md`
- `evaluation-fixtures.md`
- `validator-cli-prototype/README.md`
- `dashboard-wireframes.md`
- `data-model.sql.md`
- `runtime-demo-scenario.md`
- `source-reliability-rubric.md`
- `validator-cli-prototype/run-fixtures.js`
- `policy-engine-prototype/README.md`
- `runtime-demo-payloads/README.md`
- `dashboard-ui-prototype/README.md`
- `event-sourcing-model.md`
- `policy-engine-prototype/run-policy-fixtures.js`
- `runtime-demo-runner.js`
- `dashboard-ui-prototype/dashboard-state.json`
- `event-fixtures/README.md`
- `event-replay-prototype/README.md`
- `dashboard-ui-prototype/render-state.js`
- `event-replay-prototype/run-event-fixtures.js`
- `runtime-demo-payloads/opord.json`
- `military-operating-deep-research-queue.md`
- `commander-handbook.md`
- `b2c2wg-operating-model.md`
- `ccir-alerting-model.md`
- `opsec-classification-model.md`
- `role-document-access-policy.md`
- `knowledge-management-sop.md`
- `agent-metl.md`
- `schema-files/authority-matrix.schema.json`
- `sample-payloads/valid-authority-matrix.json`
- `sample-payloads/invalid-authority-matrix-red-without-approver.json`
- `schema-files/decision-packet.schema.json`
- `schema-files/working-group.schema.json`
- `schema-files/ccir-alert.schema.json`
- `schema-files/handoff-packet.schema.json`
- `sample-payloads/valid-decision-packet.json`
- `sample-payloads/valid-working-group.json`
- `sample-payloads/valid-ccir-alert.json`
- `sample-payloads/valid-handoff-packet.json`
- `alert-router-prototype/README.md`
- `readiness-gate-prototype/README.md`
- `context-releasability-policy.md`
- `schema-files/context-item.schema.json`
- `schema-files/document-access-manifest.schema.json`
- `schema-files/release-review.schema.json`
- `sample-payloads/valid-context-item.json`
- `sample-payloads/valid-document-access-manifest.json`
- `sample-payloads/valid-release-review.json`
- `context-filter-prototype/README.md`
- `document-access-runner.js`
- `document-access-fixtures/README.md`
- `handoff-generator.js`
- `decision-packet-linter.js`
- `event-fixtures/working-group-event-fixtures.json`
- `maintenance-readiness-model.md`
- `schema-files/maintenance-readiness.schema.json`
- `maintenance-readiness-runner.js`
- `release-review-runner.js`
- `dashboard-ui-prototype/working-group-projection-dashboard-state.json`
- `approval-scope-policy.md`
- `risk-acceptance-authority.md`
- `source-map-linter.js`
- `information-to-operations-cycle.md`
- `schema-files/information-report.schema.json`
- `schema-files/intelligence-assessment.schema.json`
- `information-to-operations-router.js`
- `information-to-operations-fixtures/README.md`
- `personnel-continuity-model.md`
- `schema-files/continuity-plan.schema.json`
- `continuity-drill-runner.js`
- `continuity-drill-fixtures/README.md`
- `schema-files/model-force-assignment-plan.schema.json`
- `sample-payloads/valid-model-force-assignment-plan.json`
- `sample-payloads/invalid-model-force-assignment-plan-monoculture.json`
- `model-force-assignment-runner.js`
- `run-model-force-assignment-fixtures.js`
- `model-force-assignment-fixtures/README.md`
- `schema-files/model-registry.schema.json`
- `schema-files/model-assignment-request.schema.json`
- `model-assignment-compiler.js`
- `schema-files/integrated-mission-preflight.schema.json`
- `integrated-mission-preflight-runner.js`
- `schema-files/model-usage-event.schema.json`
- `run-model-force-v0.2-fixtures.js`
- `model-force-v0.2-fixtures/README.md`
- `repository-artifact-store.js`
- `repository-lease.js`
- `schema-files/repository-artifact-manifest.schema.json`
- `sample-payloads/valid-repository-artifact-manifest.json`
- `sample-payloads/invalid-repository-artifact-manifest-cross-repo.json`
- `run-repository-artifact-isolation-fixtures.js`
- `run-repository-artifact-concurrency-fixtures.js`
- `repository-artifact-verify.js`
- `run-repository-artifact-recovery-fixtures.js`
- `verification-attestation.js`
- `verification-attestation-runner.js`
- `run-verification-attestation-fixtures.js`
- `run-signed-self-improvement-fixtures.js`
- `bounded-self-improvement-operations.md`
- `schema-files/self-improvement-campaign.schema.json`
- `schema-files/self-improvement-checkpoint.schema.json`
- `schema-files/self-improvement-decision.schema.json`
- `autonomous-improvement-controller.js`
- `self-improvement-campaign-init.js`
- `run-self-improvement-fixtures.js`
- `self-improvement-fixtures/README.md`
- `verification-runner.js`
- `run-verification-runner-fixtures.js`
- `validation-suite-runner.js`
- `schema-files/verification-plan.schema.json`
- `schema-files/verification-receipt.schema.json`
- `schema-files/verifier-trust-policy.schema.json`
- `schema-files/verification-attestation.schema.json`
- `sample-payloads/valid-verification-plan.json`
- `sample-payloads/invalid-verification-plan-shell.json`
- `sample-payloads/valid-verification-receipt.json`
- `sample-payloads/invalid-verification-receipt-self-reported.json`
- `sample-payloads/valid-verifier-trust-policy.json`
- `sample-payloads/invalid-verifier-trust-policy-key-id.json`
- `sample-payloads/valid-verification-attestation.json`
- `sample-payloads/invalid-verification-attestation-statement.json`
