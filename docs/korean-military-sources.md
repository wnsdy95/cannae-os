# Korean Military Sources

## 0. Purpose

This document is a research note connecting publicly available materials on the Republic of Korea (ROK) military to the military-style LLM operations framework.

Unlike U.S. military doctrine publications, the ROK military's detailed operational doctrine, command-and-control procedures, and actual order formats have limited public accessibility. Therefore, within the range of what is publicly available, this document focuses on the following materials.

- Ministry of National Defense (MND) policy materials and the Defense White Paper.
- Statutes, enforcement decrees, and directives from the Korea Law Information Center.
- Publicly available research materials from the Korea Institute for Defense Analyses (KIDA).
- Public military terminology dictionaries and defense-related data/AI policy materials.

Core principle:

```text
Publicly available ROK military materials are more useful for understanding
legal authority, organizational culture, defense policy, informatization, and AI transformation direction
than for detailed operational art.
```

## 1. Limitations on Use of Public Materials

The following limitations are documented when using ROK military materials.

| Limitation | Meaning | LLM Application |
| --- | --- | --- |
| Non-disclosure of doctrine | Detailed operational doctrine and actual order procedures are restricted | Supplement structure with publicly available U.S. military doctrine |
| Statute-centeredness | Public materials mostly consist of service, authority, and administrative regulations | Use as a basis for authority, reporting, and compliance |
| Policy-material-centeredness | Defense innovation, AI, and informatization direction are public | Connect to the strategic direction of the AI LLM framework |
| Translation risk | Korean military terminology and U.S. military terminology do not map 1:1 completely | Manage separately in the glossary |
| Currency risk | Directives and policies can be revised | Maintain source verification dates and URLs |

## 2. List of Core Sources

### 2.1 Defense White Paper

Source:

- MND Defense White Paper archive: https://www.mnd.go.kr/

Key content:

- Summarizes ROK defense policy, force structure, the security environment, and the direction of defense reform.
- Useful for grasping the flow of command structure, force build-up, defense innovation, and the transition to a technology-driven military.

LLM application:

- Used as background material for the Korean-style LLM military framework.
- Establishes the broad context of organization, command structure, and defense AI direction.
- Used as a basis for strategic/organizational context rather than for detailed operational procedures.

### 2.2 Defense Innovation 4.0 / AI-Powered Science-and-Technology Military

Source:

- MND public materials on Defense Innovation 4.0: https://www.mnd.go.kr/

Key content:

- Emphasizes the transformation of force structure based on AI, unmanned systems, and advanced science and technology.
- Connected to the digital transformation of command and control, intelligence, weapons systems, education and training, and logistics.

LLM application:

- Positions the LLM framework not as a simple productivity tool but as the AI-ification of command and control and knowledge management.
- Operating AI agents requires not just technology adoption but also authority, verification, data, and education/training systems.

### 2.3 Framework Act on the Status and Service of Military Personnel

Source:

- Korea Law Information Center: https://www.law.go.kr/

Key content:

- Provides the legal foundation for a service member's duties, principles of service, commander responsibility, and the chain of command.
- Useful for understanding principles such as command, obedience, responsibility, dignity, and security within a military organization.

LLM application:

- Agents must not execute commands that are outside their authority.
- Reporting must be honest, and uncertainty must not be concealed.
- "Obedience" must be translated not as unconditional execution but as execution within legitimate authority and rules.

### 2.4 Directive on Unit Management

Source:

- Korea Law Information Center, MND Directive: https://www.law.go.kr/

Key content:

- A publicly available directive covering unit operation, command management, education and training, accident prevention, and reporting and management procedures.
- Useful for understanding peacetime unit management and command-responsibility structure rather than actual operational doctrine.

LLM application:

- Agent organizations also need an "operations management" document.
- Every task unit should have a responsible party, a reporting line, incident/error handling, education and training, and recordkeeping procedures.
- The framework's SOP, battle rhythm, and AAR correspond to the peacetime management system.

### 2.5 Statutes/Directives Related to Defense Informatization

Source:

- Korea Law Information Center: https://www.law.go.kr/
- MND public materials: https://www.mnd.go.kr/

Key content:

- Defense informatization, data, security, and system operation have separate regulations and procedures.
- In a military organization, information systems are not separated from command and control.

LLM application:

- The LLM operating system also needs data, authority, logging, security, and audit systems, not just the model.
- The source map, decision log, AAR archive, and tool-use log are the core of the LLM informatization system.

### 2.6 Korea Institute for Defense Analyses (KIDA) Public Research Materials

Source:

- Korea Institute for Defense Analyses: https://www.kida.re.kr/

Key content:

- Provides research materials on defense policy, force structure, defense AI, command and control, logistics, informatization, personnel, and education and training.
- Not doctrine in the original sense, but important for understanding Korean institutional and policy context.

LLM application:

- Used as material for calibrating the framework to Korean organizational culture and defense policy context.
- Defense AI, data, and command-and-control research is connected as a basis for the implementation guide.
- Public research materials are used at source reliability grade B, kept distinct from statutes/official policy.

### 2.7 Military Terminology Dictionary

Candidate sources:

- Public materials from the Ministry of National Defense (MND), Joint Chiefs of Staff (JCS), Defense Acquisition Program Administration (DAPA), and National Library of Korea.

Key content:

- Standardizes military terminology to reduce misunderstanding.
- Useful for interpreting terminology related to joint operations, command and control, logistics, intelligence, and education and training.

LLM application:

- Used as a basis for standardizing Korean-language terminology in `glossary.md`.
- Prevents the model from translating military terminology arbitrarily.
- Stabilizes field names in the Korean-language prompt DSL.

## 3. LLM Design Principles Derived from ROK Military Materials

### 3.1 Command Obedience Is Not Unconditional Execution

In a military organization, command and obedience are important, but that command operates within legitimate authority and law.

LLM application:

- Agents must not execute every tool merely because "the user told me to."
- A tool-use ROE, approval gate, and prohibited-action list are required.
- Explicit approval is required in particular for deletion, deployment, cost-incurring actions, and handling of sensitive information.

### 3.2 Honest Reporting Is the Core of Preventing Hallucination

In a military organization, false reporting or concealment ruins command judgment. In an LLM, hallucination is likewise a false report that ruins command judgment.

LLM application:

- Report what is unknown as unknown.
- Mark claims without a source as hypotheses.
- Do not hide test failures and tool errors.
- Separate confidence level from the underlying evidence.

### 3.3 Commander Responsibility Differs from Agent Responsibility

In the military, a commander bears responsibility for the actions of the unit. In the LLM framework, final responsibility rests with the human user or system operator.

LLM application:

- The agent is not the risk-acceptance authority.
- The agent identifies and reports risk, and executes within the approved scope.
- High-risk judgments are handled as an "approval request," not a "conclusion."

### 3.4 Backbrief Is Especially Important in Korean Organizational Culture

In a top-down obedience culture, it is easy for a subordinate to answer "understood" even without understanding. An LLM can similarly execute an ambiguous instruction as-is.

LLM application:

- Require a backbrief before execution.
- Maintain a confirmation procedure that begins with "The mission I understood is...".
- Leave a question or assumption list for ambiguous instructions.

### 3.5 Informatization and AI Adoption Are Operating-System Problems

Defense AI and informatization materials show that the military does not change through technology adoption alone.

LLM application:

- Data, authority, logging, security, education/training, and SOPs can matter more than model performance.
- The framework must be an operating system, not a prompt set.

## 4. Calibration of the Korean-Style LLM Military Framework

Bringing over U.S.-style mission command as-is can cause the following problems in a Korean organization.

| Risk | Description | Calibration |
| --- | --- | --- |
| Excessive top-down obedience | Agent executes the user's word unconditionally | ROE and authority gate |
| Avoidance of questions | Proceeds without questions even on ambiguous instructions | Backbrief and assumption report |
| Outcome-centered reporting | Failures and risks are hidden | Mandate risk/blocked fields in SITREP |
| Rank-centered decision-making | Specialist agent opinions get buried | Preserve independent S2/S3/Red Team opinions |
| Document formalism | Formats exist but are not connected to decisions | Connect each document to a decision point |

## 5. SOP for Researching Public Korean Materials

When researching ROK military materials, follow this order.

1. Check statutes/directives first.
2. Check MND policy materials and the Defense White Paper.
3. Check KIDA's publicly available research materials.
4. Align terminology using the military terminology dictionary.
5. Do not speculate on detailed operational procedures beyond what is public.
6. State the differences explicitly when comparing with publicly available U.S. military doctrine.
7. Keep the LLM-application interpretation separate from the "source's direct claim."

## 6. Source Reliability

| Grade | Type of Korean Material | Mode of Use |
| --- | --- | --- |
| A | Statutes, enforcement decrees, official MND policy materials | Basis for authority, obligation, official direction |
| B | KIDA research materials, national research institute reports | Policy interpretation, institutional analysis |
| C | Public education materials, articles, presentation materials | Cases and supplementary context |
| D | Blogs, community posts, secondary summaries | Reference only |

## 7. Next Research Questions

1. How is mission-type command actually being interpreted in the ROK military?
2. How far can the publicly disclosable formats of the ROK military's order-issuance system be confirmed?
3. In defense AI policy, how are the authority and verification of command-and-control AI addressed?
4. In Korean organizational culture, how can backbrief and Red Team independence be institutionalized?
5. How should the mismatch between Korean and English military terminology be reflected in the prompt DSL?

## 8. Related Documents

- `glossary.md`
- `source-map.md`
- `tool-use-roe.md`
- `implementation-guide.md`
- `research-compendium.md`
