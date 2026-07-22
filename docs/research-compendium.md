# Research Compendium

## 0. Purpose

This document brings together, in one place, the military command-and-control, order-issuance, authority-delegation, reporting, verification, and after-action materials researched so far, along with their interpretation.

The goal is not a simple bibliography. It records how each military concept can be converted into LLM usage patterns, single-agent operation, multi-agent orchestration, and hallucination-prevention prompting systems.

Scope:

- Focuses on public/unclassified documents.
- Includes US military, NATO, and some Korean military-related public research.
- Includes doctrine documents, research papers, handbooks, focus papers, and LLM hallucination/multi-agent research.
- Does not directly reproduce full source text; leaves summaries and applied opinions instead.

## 1. Overall Conclusion

The military's strength is not "chain of command obedience" itself. The real strength is the structure below.

```text
Preserve higher intent
-> Standard document format
-> Role-based staff analysis
-> Explicit authority and reporting standards
-> Rewriting by subordinate units
-> Confirmation brief / backbrief / rehearsal
-> FRAGO during execution
-> Post-action AAR
```

The core of an LLM framework is the same.

```text
Preserve user intent
-> OPORD-style prompt
-> Differentiation of agent roles
-> Definition of approval authority / reporting authority / autonomy
-> Rewriting of the execution plan by subordinate agents
-> Confirmation of understanding and verification before execution
-> Change orders during execution
-> Post-action retrospective and prompt improvement
```

Core design statement:

```text
When issuing instructions to an LLM, you must distinguish which information must never be altered
and which information subordinate agents are free to rewrite.
```

## 2. Lessons from the Military Document System

### 2.1 Order Issuance Is Intent-Preserving Rewriting, Not Copying

A higher unit's order is not copied verbatim by the subordinate unit. The subordinate unit creates a new OPORD suited to its own terrain, personnel, time, resources, and risk. However, the mission, commander's intent, and concept of operations of the one to two echelons above are preserved.

LLM Application:

- The higher-level user's intent must not be altered.
- Subordinate agents may rewrite the execution method.
- Even if the execution method changes, success conditions and prohibition lines are maintained.
- Each subordinate agent first reports its own understanding via a backbrief.

### 2.2 The OPORD Structure Converts Directly into a Prompt Structure

The five paragraphs of an OPORD:

1. Situation: background, environment, adversary, constraints, information gaps.
2. Mission: who, what, when, where, why.
3. Execution: commander's intent, concept of operations, phases, tasks, coordinating instructions.
4. Sustainment: resources, tools, cost, support.
5. Command and Signal: reporting lines, approval authority, communications, method of change.

LLM Application:

- Write the prompt as an "operation order," not a "request statement."
- Specify together what the model should do, should not do, must report, and must halt on.
- Separate detailed material out like an annex.

### 2.3 Annexes, Appendices, Tabs, and Exhibits Are Context-Separation Devices

Military documents do not put all information in the body. The body maintains the core intent and concept of operations, and detailed areas are separated into annexes.

LLM Application:

- The main prompt holds only the purpose, intent, success conditions, and approval criteria.
- Data, policy, style guides, glossaries, and test criteria are kept as separate annexes.
- In a RAG or multi-agent system, each annex is managed as a separate context pack.

### 2.4 WARNO, OPORD, and FRAGO Form a Time-Based Order-Update System

- WARNO: issued in advance so preparation can begin even before the full order is complete.
- OPORD: the main execution order.
- FRAGO: a partial change to an existing order in response to a change in the situation.

LLM Application:

- Before a long task, send a "preparatory prompt" first.
- Execute the main task as an OPORD.
- Record interim changes clearly as a FRAGO rather than rewriting the entire prompt.

## 3. Lessons from the Authority System

The military does not decide approval authority by rank alone. Duty position, command relationships, mission, delegated scope, ROE, SOP, and CCIR together determine authority.

LLM Application Principle:

```text
Authority is determined not by rank but by mission, risk, reversibility, information certainty, and alignment with higher intent.
```

### 3.1 Conditions for Autonomous Execution

Conditions under which an agent may execute without approval:

1. It aligns with higher intent.
2. It is within the scope of the order.
3. It is reversible.
4. Cost, security, and legal risk are low.
5. It does not trigger a CCIR reporting condition.
6. The evidentiary basis is sufficient.
7. Even if it fails, it does not significantly undermine the overall purpose.

### 3.2 Approval Levels

| Level | Name | Description |
|---|---|---|
| L0 | Observation | Reading, summarizing, research, drafting |
| L1 | Reversible work | Local temporary changes, testing |
| L2 | Restricted execution | In-scope file modification, document creation |
| L3 | External impact | Network, cost, external system changes |
| L4 | Irreversible work | Deletion, deployment, payment, public publication |
| L5 | High-risk judgment | Major legal, medical, financial, security, or personnel decisions |

### 3.3 Reporting Does Not Mean Escalating All Information

The military's CCIR is the core information a commander needs for a decision. Not all information is subject to reporting.

LLM Application:

- The model does not report every intermediate thought.
- Only information requiring the user's judgment is reported immediately.
- Everything else is compiled into a SITREP, Completion Report, or AAR.

## 4. Lessons from the Reporting and Verification System

### 4.1 Confirmation Brief

Immediately after receiving an order, the subordinate restates it: "This is the mission as I understand it."

LLM Application:

```text
The goal as I understand it:
Conditions that must not be altered:
What I may decide autonomously:
What requires approval:
Conditions for immediate reporting:
```

### 4.2 Backbrief

After completing their own plan, the subordinate explains it to the superior.

LLM Application:

- Report the plan before execution.
- Present phased deliverables, failure conditions, and verification methods.
- Let the user catch important directional errors early.

### 4.3 Rehearsal

Finds errors that arise in the process of converting a document into actual execution.

LLM Application:

- Dry run before execution.
- Red team review.
- Confirm inputs, outputs, failure conditions, and approval conditions.
- Halt high-risk work before actual execution.

### 4.4 AAR

The after-action retrospective is a learning system, not "blame."

LLM Application:

1. What was the original intent?
2. What was the actual result?
3. Why did the discrepancy occur?
4. Which procedures should be kept?
5. Which procedures should be improved?
6. What should be reflected in the next prompt/SOP?

## 5. Interpreting the Multi-Agent Structure

| Military Staff | LLM Agent | Role |
|---|---|---|
| Commander | User / Final Approver | Purpose, intent, prohibition lines, final approval |
| Chief of Staff | Orchestrator | Task decomposition, role assignment, conflict coordination |
| S2 | Research / Intelligence | Data collection, source verification, information gaps |
| S3 | Operations | Execution plan, phases, priorities |
| S4 | Sustainment | Resources, tools, cost, feasibility |
| S6 | Signal | Reporting, logs, document links, status sharing |
| Red Team | Critic / Validator | Review of errors, hallucinations, counterexamples, risk |
| Executor | Worker | Code, document, analysis execution |
| Recorder | Knowledge Manager | Decision log, change history, AAR |

Core Views:

- The purpose of multi-agent systems is not "running a lot of AI."
- It is to separate roles in order to reduce hallucination, overconfidence, authority overreach, and unclear responsibility.
- In particular, S2 and Red Team must be kept separate. If the person who did the research also verifies their own conclusion, errors are easily missed.

## 6. Interpreting Hallucination Prevention

The military system's hallucination-prevention devices are analogous to the following.

| Military Device | LLM Hallucination-Prevention Function |
|---|---|
| Standard terminology | Reduces ambiguous wording |
| OPORD | Clarifies purpose, constraints, reporting standards |
| CCIR | Immediately reports uncertain key information |
| IPB/JIPOE | Systematic analysis of environment and adversary |
| Red Team | Attacks assumptions and conclusions |
| Rehearsal | Finds errors before execution |
| AAR | Fixes recurring errors |
| FRAGO | Explicitly reflects changes |

Hallucination-Prevention Prompting Principles:

1. Have the model separate facts, inferences, and assumptions.
2. Any claim requiring a source must have one attached.
3. If evidence is insufficient, mark it "unknown" or "verification needed."
4. Core claims undergo independent verification.
5. When having the model re-verify its own answer, first have it generate independent questions.
6. Use search or RAG for up-to-date information that requires external material.

## 7. Core Views So Far

### 7.1 The Central Axis of Military-Style LLM Operation

The most important thing in LLM operation is not prompt writing skill. What matters is the command system.

A good LLM system must answer the following questions.

- Who sets the final intent?
- Which information must not be altered?
- Which information may subordinate agents reinterpret?
- Which actions may be executed autonomously?
- Which actions require approval?
- Which situations must be reported immediately?
- How will learning occur after execution?

### 7.2 The Military Increases Accuracy by Reducing the Volume of Information

Military documents do not put vast amounts of information all in the body. The body is centered on the order and intent, and details are separated into annexes.

Rather than stuffing everything into a long context in an LLM as well, it is more stable to separate it into:

- base order
- evidence annex
- policy annex
- data annex
- reporting annex
- verification annex

### 7.3 Higher Intent and Subordinate Autonomy Are Both Needed Simultaneously

If the higher level controls every detail, it is slow and fragile. Conversely, if the subordinate level is completely free, intent breaks down.

What is needed, therefore, is:

```text
Purpose is centralized
Method is decentralized
Reporting standards are explicit
Risk criteria are predefined
```

### 7.4 The AI Agent Is Staff, Not the Commander

An LLM agent can gather information, generate alternatives, build plans, and review risk. However, final purpose, value judgment, risk acceptance, and public execution must be approved by the Commander.

## 8. List of Key Sources

### 8.1 Mission Command / Command and Control

1. ADP 6-0, Mission Command: Command and Control of Army Forces  
   https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf

   Key Content:
   - Commander's intent.
   - Mission-type orders.
   - Mutual trust.
   - Shared understanding.
   - Disciplined initiative.
   - Subordinates exercise judgment within intent under uncertain conditions.

   LLM Application:
   - Define the user's intent as the commander's intent.
   - Leave the method to the agent, but clearly specify boundaries and success conditions.

2. FM 6-0, Commander and Staff Organization and Operations  
   https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf

   Key Content:
   - Command post organization.
   - Staff roles.
   - Knowledge management and information management.
   - Meeting bodies and battle rhythm.
   - C2 system operations.

   LLM Application:
   - Basis for orchestrator and role-based agent design.
   - Meeting bodies can be converted into synchronization loops between agents.

3. NATO AJP-3, Allied Joint Doctrine for the Conduct of Operations  
   https://assets.publishing.service.gov.uk/media/6964e72799fbdc498faecce2/AJP_3_Ed_D_V1-O.pdf

   Key Content:
   - NATO mission command philosophy.
   - The principle of leaving decisions to whoever is best positioned to judge.
   - Emphasis on initiative and opportunity exploitation.

   LLM Application:
   - Let the relevant specialist agent judge specific subordinate problems.
   - The center controls only purpose and risk.

4. MCDP 6, Command and Control  
   https://www.marines.mil/Portals/1/Publications/MCDP%206.pdf

   Key Content:
   - OODA loop.
   - Decision-making speed.
   - Philosophy of command and control.

   LLM Application:
   - Design the agent loop as observe, orient, decide, act.

### 8.2 Operations Process / The Operations Process

1. ADP 5-0, The Operations Process  
   https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf

   Key Content:
   - planning, preparing, executing, assessing.
   - The commander performs understanding, visualizing, describing, directing, leading, and assessing.
   - Situational understanding and assessment repeat continuously.

   LLM Application:
   - Work in a plan, prepare, execute, assess loop rather than a single-shot answer.
   - Insert reporting and verification at each stage of long tasks.

2. FM 5-0, Planning and Orders Production  
   https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf

   Key Content:
   - Comprehensive manual for planning and order production.
   - Problem solving, MDMP, TLP, assessment planning, plans and orders format.
   - The 2024 edition consolidates planning and orders production.

   LLM Application:
   - Basis for the standard format of prompts and work documents.
   - Agent work is also divided into planning documents and execution documents.

### 8.3 Planning Process / MDMP, JPP, MCPP, TLP

1. Military Decision-Making Process Handbook  
   https://api.army.mil/e2/c/downloads/2023/11/17/f7177a3c/23-07-594-military-decision-making-process-nov-23-public.pdf

   Key Content:
   - Receipt of mission.
   - Mission analysis.
   - COA development.
   - COA analysis/wargaming.
   - COA comparison.
   - Approval.
   - Order production.

   LLM Application:
   - For complex questions, do not answer directly; generate alternatives using the COA approach.
   - Compare each alternative against the Red Team.

2. JP 5-0, Joint Planning  
   https://www.esd.whs.mil/Portals/54/Documents/FOID/Reading%20Room/Joint_Staff/18-F-1152_JP_5-0_Joint_Planning_2020.pdf

   Key Content:
   - Joint planning.
   - Objectives, ways, means, risks.
   - Commander's intent and operational approach.

   LLM Application:
   - Decompose the user's goal into ways, means, and risks.

3. MCWP 5-10, Marine Corps Planning Process  
   https://www.usmcu.edu/Portals/218/CDET/content/other/MCWP%205-10.pdf

   Key Content:
   - Marine Corps Planning Process.
   - Problem framing, COA development, wargaming, transition.
   - Distinction between BAMCIS and MCPP.

   LLM Application:
   - Handle small tasks quickly, like TLP/BAMCIS.
   - Handle large tasks systematically, like MCPP/MDMP.

4. Troop Leading Procedures card  
   https://safety.army.mil/Portals/0/Documents/MEDIA/SMALLUNITLEADERCARDS/Standard/Troop-Leading-Procedures.pdf

   Key Content:
   - The procedure by which a small-unit leader receives a mission and quickly plans, prepares, and executes.

   LLM Application:
   - Use as the basic procedure when a single agent performs a small task.

### 8.4 Orders / Document Format

1. STANAG 2014, Formats for Orders  
   https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf

   Key Content:
   - Warning Order format.
   - Operations Order format.
   - Standardization of timings, locations, boundaries.
   - Annex format.

   LLM Application:
   - Design the prompt format like an internationally standardized order format.
   - Clarify changes, locations, timing, and boundary conditions.

2. Marine Corps Five Paragraph Order training material  
   https://www.trngcmd.marines.mil/Portals/207/Docs/FMTBE/Student%20Materials/FMST/209.pdf

   Key Content:
   - Mission includes who, what, when, where, why.
   - Execution covers how.

   LLM Application:
   - Force the 5W into the prompt's mission section.
   - Separate the "how" into the execution section.

3. Air Force Five-Paragraph Order Training Tool Guide  
   https://www.doctrine.af.mil/Portals/61/documents/NonDoctrine/Five-Paragraph%20Order%20Training%20Tool%20Guide.pdf

   Key Content:
   - A basic five-paragraph order training tool.
   - Does not replace the formal planning process; assists in drafting the final product.

   LLM Application:
   - The OPORD-style prompt is a tool that standardizes the resulting instruction document, not a replacement for the thinking process.

### 8.5 Commander's Intent / Higher Intent

1. Commanders Intent and Concept of Operations  
   https://www.armyupress.army.mil/Portals/7/military-review/Archives/English/MilitaryReview_20131231_art011.pdf

   Key Content:
   - The difference between commander's intent and concept of operations.
   - Producing effective mission orders.

   LLM Application:
   - Intent and the execution plan must be separated.
   - If purpose and method are mixed together, subordinate agents will misinterpret them.

2. Evolution of Commander's Intent in the United States Military  
   https://www.files.ethz.ch/isn/30757/Intent_USMilitary_v4.pdf

   Key Content:
   - Combat orders include the intent of the two echelons above.
   - Intent is a knowledge layer in combat orders that is relatively resistant to distortion.

   LLM Application:
   - Include both the higher-level goal and the immediate goal in each subordinate agent's prompt.
   - State explicitly "how this task contributes to the overall goal."

3. Mission Command Focus Paper  
   https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/missioncommand_fp_2nd_ed.pdf

   Key Content:
   - Mission command enables rapid problem-solving through commander's intent, mission-type orders, and decentralized execution.

   LLM Application:
   - The central orchestrator does not control every detail.
   - Instead, it clarifies intent, boundaries, and reporting conditions.

### 8.6 Command Relationships / Command Relationships and Approval Authority

1. JCS Authorities Focus Paper  
   https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf

   Key Content:
   - Authority relationships such as COCOM, OPCON, TACON, support.
   - TACON is more restrictive than OPCON.
   - OPCON is the authority to organize, employ, and task-organize forces needed to accomplish the mission.

   LLM Application:
   - Agent authority should also be divided into "full control," "tactical execution," and "support."

2. JTF and Command and Control Focus Paper  
   https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf

   Key Content:
   - JTF task organization.
   - Command relationships.
   - Need to clarify support relationships and authority.

   LLM Application:
   - When forming a multi-agent team, clarify who commands whom and who supports whom.

3. Command Relationships article  
   https://ndupress.ndu.edu/Portals/68/Documents/jfq/jfq-63/jfq-63_153-155_Katsos.pdf

   Key Content:
   - Command, unity of command, unity of effort.
   - Understanding authority relationships is essential in joint operations.

   LLM Application:
   - There must be a single final approver for a given task.
   - Even with multiple agents, unity of effort must be maintained.

### 8.7 CCIR / Reporting Standards

1. JCS CCIR Focus Paper  
   https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf

   Key Content:
   - CCIR is information critical to the commander's timely decision making.
   - CCIR also changes as mission, priorities, and the operating environment change.
   - Too much tactical detail flowing up can blur the commander's focus.

   LLM Application:
   - Do not report every detail to the user.
   - Report immediately only information that requires a decision.
   - Define CCIR before starting the task.

2. NDU CCIR article  
   https://ndupress.ndu.edu/Media/News/News-Article-View/Article/3843920/commanders-critical-information-requirements-crucial-for-decisionmaking-and-joi/

   Key Content:
   - CCIR must be linked to a decision point.
   - "What decision does this information support" matters more than a simple list.

   LLM Application:
   - Link "information to be reported" to "the decision the user must make."

3. Staff Facilitation of Commander Decision-Making in LSCO  
   https://api.army.mil/e2/c/downloads/2023/04/19/c0bb3dd8/23-758-staff-facilitation-of-commander-decision-making-in-lsco-apr-23-public.pdf

   Key Content:
   - There can be a gap between CCIR development and actual execution.
   - Staff must better support commander decision-making.

   LLM Application:
   - Reporting standards must not exist only on paper; they must operate within the actual agent loop.

### 8.8 Intelligence / Intelligence Analysis

1. ATP 2-01.3, Intelligence Preparation of the Battlefield  
   https://home.army.mil/wood/application/files/8915/5751/8365/ATP_2-01.3_Intelligence_Preparation_of_the_Battlefield.pdf

   Key Content:
   - Defining the operational environment.
   - Analyzing environmental effects.
   - Evaluating the adversary.
   - Determining adversary COAs.
   - IPB is central to MDMP and decision support.

   LLM Application:
   - Define the problem environment before answering.
   - State information gaps and assumptions explicitly.
   - Build possible adversary/situation scenarios.

2. JP 2-01.3, Joint Intelligence Preparation of the Operational Environment  
   https://www.bits.de/NRANEU/others/jp-doctrine/jp2_01_3%2809%29.pdf

   Key Content:
   - Analyze the operational environment with a holistic view.
   - Evaluate adversary COAs and centers of gravity.
   - Support wargaming and decision making.

   LLM Application:
   - Rather than simply summarizing search results, analysis of environment, actors, constraints, intent, and alternatives is needed.

### 8.9 Rehearsal / Rehearsal

1. Commander and Staff Guide to Rehearsals  
   https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf

   Key Content:
   - Confirmation brief.
   - Backbrief.
   - Confirming understanding and feasibility of execution through rehearsal.

   LLM Application:
   - Make a backbrief mandatory before long tasks.
   - Confirm errors and omissions through a dry run before execution.

### 8.10 AAR / After-Action Learning

1. FM 7-0 Appendix K, After Action Reviews  
   https://www.first.army.mil/Portals/102/FM%207-0%20Appendix%20K.pdf

   Key Content:
   - The AAR is a guided analysis that examines performance to improve future performance.
   - Conducted at every echelon.

   LLM Application:
   - Write an AAR after every significant agent task.

2. Leader's Guide to After-Action Reviews  
   https://pinnacle-leaders.com/wp-content/uploads/2018/02/Leaders_Guide_to_AAR.pdf

   Key Content:
   - The AAR is a professional discussion, not a critique.
   - It lets participants discover what happened and why for themselves.

   LLM Application:
   - Do not treat failure as a simple error; connect it to SOP improvement.

3. Center for Army Lessons Learned  
   https://www.army.mil/CALL

   Key Content:
   - CALL collects, analyzes, disseminates, integrates, and archives lessons learned at the tactical-to-strategic level.

   LLM Application:
   - AAR results accumulate as organizational knowledge, not just individual task logs.

### 8.11 Red Team / Critical Thinking

1. U.S. Army Red Team Handbook  
   https://home.army.mil/wood/6115/8222/0759/RedTeamHB.pdf

   Key Content:
   - Critical thinking.
   - Alternative analysis.
   - Mitigating decision-making bias.

   LLM Application:
   - Place the Red Team agent in an independent role.
   - Separate the plan author from the validator.

2. UK Guide to Red Teaming  
   https://cmapspublic3.ihmc.us/rid%3D1M8NDWNQ5-9HYH9B-1D7R/A%20Guide%20to%20Red%20Teaming%20-%20DCDC%20Guidance%20Note.pdf

   Key Content:
   - Identify vulnerabilities, threats, alternatives, and branches/sequels in campaign planning and mission rehearsal.

   LLM Application:
   - Bring in the red team from the planning stage, not just right before the final answer.

### 8.12 C2 Agility / Network-Based Command and Control

1. Understanding Command and Control  
   https://www.dodccrp.org/files/Alberts_UC2.pdf

   Key Content:
   - Conceptual foundations of C2.
   - Resource allocation, shared awareness, decision-making.

   LLM Application:
   - Evaluate the quality of an agent system not just on answer quality, but on the quality of resource allocation and coordination.

2. Power to the Edge  
   https://www.dodccrp.org/files/Alberts_Power.pdf

   Key Content:
   - Information age command and control.
   - Edge organization, empowerment, shared awareness.

   LLM Application:
   - Subordinate agents must be given sufficient context and authority to operate quickly.

3. NATO SAS-085 Final Report on C2 Agility  
   https://dodccrp.org/sas-085/sas-085_report_final.pdf

   Key Content:
   - C2 agility is the ability to successfully respond to and exploit change.
   - Responsiveness, versatility, flexibility, resilience, adaptability, innovativeness.

   LLM Application:
   - A structure that supports FRAGO and authority adjustment as the situation changes is needed, rather than a fixed prompt.

### 8.13 OODA / Maneuver Warfare

1. John Boyd, Patterns of Conflict  
   https://www.projectwhitehorse.com/pdfs/boyd/patterns%20of%20conflict.pdf

   Key Content:
   - Observe, Orient, Decide, Act.
   - The concept of running the decision loop faster and less predictably than the adversary.

   LLM Application:
   - Rapidly repeat the observe-orient-decide-act loop rather than giving a single answer.

2. MCDP 1, Warfighting  
   https://www.marines.mil/portals/1/publications/mcdp%201%20warfighting.pdf

   Key Content:
   - The uncertainty, friction, and fluidity of war.
   - Commander's intent, main effort, critical vulnerability.

   LLM Application:
   - Translate "friction" into tool failure, information shortage, ambiguous requests, and hallucination.
   - Use main effort as the task priority.

### 8.14 Critiques of and Cautions About Mission Command

1. The Trouble with Mission Command  
   https://ndupress.ndu.edu/Portals/68/Documents/jfq/jfq-86/jfq-86_94-100_Hill-Niemi.pdf

   Key Content:
   - Mission command presupposes decentralization, but tools for judging when and where control should reside can be lacking.

   LLM Application:
   - Giving autonomy to every agent is risky.
   - Adjust central control versus decentralization according to risk, reversibility, and information certainty.

2. Beyond Auftragstaktik  
   https://ndupress.ndu.edu/Portals/68/Documents/jfq/jfq-96/JFQ-96_29-36_Lythgoe.pdf

   Key Content:
   - The dangers of excessive decentralization.

   LLM Application:
   - Maintain human approval for high-risk tasks.
   - An autonomy boundary is essential.

3. History, Mission Command, and the Auftragstaktik Infatuation  
   https://www.armyupress.army.mil/Journals/Military-Review/English-Edition-Archives/July-August-2022/Herrera/

   Key Content:
   - Critiques the narrative that worships Auftragstaktik as a simplistic archetype.
   - History and cultural context matter.

   LLM Application:
   - Military concepts should not be imported as simple metaphors.
   - Their actual operating principles and limitations must be brought over together.

### 8.15 Staff Organization / Staff System

1. The General Staff System: Basic Structure  
   https://arsof-history.org/articles/v7n2_general_staff_system_page_1.html

   Key Content:
   - S1/G1 Personnel.
   - S2/G2 Intelligence.
   - S3/G3 Operations.
   - S4/G4 Logistics.
   - S5/G5 Civil-military/plans.
   - S6/G6 Signal.

   LLM Application:
   - The basic framework for differentiating agent roles.

2. FM 101-5, Staff Organization and Operations  
   https://www.aiai.ed.ac.uk/~arpi/SUO/DOC/fm101-5.pdf

   Key Content:
   - Staff roles, relationships, responsibilities.

   LLM Application:
   - Designing the relationship between the orchestrator and specialist agents.

3. JP 3-33, Joint Task Force Headquarters  
   https://www.dodig.mil/Portals/48/JP%203-33%20Joint%20Task%20Force%20Headquarters.pdf

   Key Content:
   - Forming and operating a JTF HQ.
   - Planning, preparing, executing, assessing.

   LLM Application:
   - Organize a large multi-agent team like a temporary task force.

### 8.16 PACE / Communications Contingency Planning

1. CISA, Leveraging PACE Plan into Emergency Communications Ecosystems  
   https://www.cisa.gov/sites/default/files/2024-10/2024_NCSWICPTE_Leveraging_PACE_Plan_Emergency_Comms_Ecosystems.pdf

   Key Content:
   - Primary, Alternate, Contingency, Emergency.
   - Preparing for communications failure.

   LLM Application:
   - A backup model when the primary model fails.
   - Alternate material when search fails.
   - A manual procedure when automated execution fails.
   - Human approval when uncertainty is high.

### 8.17 Korean Military-Related Sources

1. A Study on Developing a Scale to Measure Mission Command
   https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART002861979

   Key Content:
   - The Republic of Korea (ROK) Army adopted mission command as its command philosophy in 2018.
   - Measurement constructs: shared tactical understanding, delegation of authority, mutual trust, communication, capability building.

   LLM Application:
   - The maturity of an agent system can also be assessed using these five factors.
   - Shared doctrine, delegation, trust, communication, capability building.

2. Case Study on Applying Mission Command: The Russia-Ukraine War and KCTC Training
   https://m.riss.kr/search/detail/DetailView.do?control_no=1b5922e48fc3e9997f7a54760bb41745&p_mat_type=1a0202e37d52c72d

   Key Content:
   - Compares the Russian military's control-oriented command with the Ukrainian military's mission command.
   - Includes KCTC (Korea Combat Training Center) training case studies.

   LLM Application:
   - A comparative study of centrally controlled AI operation versus mission-command-style AI operation is possible.

3. Background Analysis of Improvements to US Air Force Command and Control Principles
   https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART003133605

   Key Content:
   - Relates JADO, ACE, Lead Wing, MCA, AFFORGEN, and others to mission command.

   LLM Application:
   - Can be connected to distributed execution and multi-function agent concepts.

### 8.18 LLM Hallucination and Multi-Agent Research

1. Chain-of-Verification Reduces Hallucination in Large Language Models  
   https://arxiv.org/abs/2309.11495

   Key Content:
   - Generate a draft.
   - Generate verification questions.
   - Answer the questions independently.
   - Revise the final answer.

   LLM Application:
   - Directly connects to backbrief/rehearsal/red-team.

2. SelfCheckGPT  
   https://arxiv.org/abs/2303.08896

   Key Content:
   - Generate multiple samples for the same prompt to check consistency.
   - Possibility of black-box hallucination detection without an external database.

   LLM Application:
   - Verify core facts with multiple samples or an independent agent.

3. Hallucination Mitigation for Retrieval-Augmented Large Language Models  
   https://www.mdpi.com/2227-7390/13/5/856

   Key Content:
   - Hallucination can still occur in RAG at the retrieval and generation stages.
   - Detection, correction, and mitigation are needed.

   LLM Application:
   - RAG is a device that reduces hallucination, not one that eliminates it.
   - Manage source conflicts and retrieval quality separately.

4. Multi-Agent Collaboration Mechanisms: A Survey of LLMs  
   https://arxiv.org/abs/2501.06322

   Key Content:
   - Actor, collaboration type, structure, strategy, coordination protocol.

   LLM Application:
   - Connects military staff systems with multi-agent coordination research.

5. LLM-based Agents Suffer from Hallucinations: A Survey  
   https://arxiv.org/html/2509.18970v1

   Key Content:
   - Types and causes of hallucination at each stage of the agent workflow.
   - Mitigation and detection taxonomy.

   LLM Application:
   - Agent hallucination occurs not only in answer generation but also in planning, tool use, memory, and collaboration.

### 8.19 SOP / Standardization of Repeated Execution

1. ATP 3-90.90, Army Tactical Standard Operating Procedures  
   https://www.scribd.com/document/78673750/ATP-3-90-90

   Key Content:
   - Material to facilitate the development of tactical SOPs.
   - SOPs standardize repeated procedures to raise efficiency and adaptability.
   - SOP cases are shared and improved through a collaborative portal.

   LLM Application:
   - Repeated tasks are handled with SOP templates rather than being redesigned each time.
   - Research, summarization, code changes, verification, reporting, and AAR each need an SOP.
   - An SOP is not a device that blocks agent autonomy, but one that stabilizes baseline execution and lets attention focus on exception judgment.

2. Building a Unit Planning Standard Operating Procedure  
   https://www.army.mil/article/277041/building_a_unit_planning_standard_operating_procedure_psop

   Key Content:
   - An effective PSOP supports staff planning clearly and concisely.
   - It reduces unproductive time between warfighting functions and creates an efficient planning procedure.

   LLM Application:
   - Quality suffers if multi-agent systems plan differently each time.
   - A Planning SOP should be created to fix the input/output/reporting cycle for each agent.

### 8.20 Battle Rhythm / Meetings and the Decision Cycle

1. Executing Knowledge Management in Support of Mission Command  
   https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf

   Key Content:
   - Battle rhythm is the activity that synchronizes current and future operations.
   - Inefficiency arises if the battle rhythm is not linked to the critical path for commander decisions.

   LLM Application:
   - Agent status reports must be inputs for the next decision, not simple progress reports.
   - Align cycles so that each agent's output becomes the next agent's input.

2. Improving the Battle Rhythm to Operate at the Speed of Relevance  
   https://ndupress.ndu.edu/Media/News/News-Article-View/Article/2679728/improving-the-battle-rhythm-to-operate-at-the-speed-of-relevance/

   Key Content:
   - Battle rhythm is the deliberate cycle of command, staff, and unit activities.
   - Meetings, working groups, boards, briefings, and so on are synchronized by time and purpose.
   - Each headquarters' battle rhythm must be nested with the others.

   LLM Application:
   - In long-running tasks, set a rhythm of regular SITREPs, Red Team reviews, and Commander approval gates.
   - If reporting cycles are misaligned, information arrives late and produces bad decisions.

3. Staff Processes in Large-scale Combat Operations, Rhythm of the Battle  
   https://api.army.mil/e2/c/downloads/2024/06/07/b62f30eb/24-852-staff-processes-in-large-scale-combat-operations-part-1-rhythm-of-the-battle.pdf

   Key Content:
   - A rigid battle rhythm is useful in a static environment, but in LSCO it must be adjusted as the situation changes.
   - The battle rhythm changes as the operation progresses.

   LLM Application:
   - A framework must not rely on a fixed workflow alone.
   - Different rhythms should be set for urgent/simple/complex/high-risk tasks.

### 8.21 Knowledge Management / Information Flow Management

1. FM 6-01.1, Knowledge Management Operations  
   https://www.bits.de/NRANEU/others/amd-us-archive/fm6-01-1%2812%29.pdf

   Key Content:
   - Knowledge management is the activity that ensures information reaches the people who need it, at the time and in the format they need.
   - Working groups and boards are part of the battle rhythm.
   - It breaks down information silos and supports staff integration.

   LLM Application:
   - Putting all information into a single context is a bad approach.
   - Information flow should be separated into a Source Map, Evidence Map, Decision Log, Change Log, and AAR Library.

2. USFKI 5780.01 Knowledge Management Program  
   https://www.usfk.mil/Portals/105/Documents/Publications/Instructions/USFKI_5780-01_Knowledge-Management-Program.pdf

   Key Content:
   - Battle rhythm is the overall activity by which people, processes, and tools are synchronized to support the leader's decision cycle.
   - It supports shared understanding and timely commander decision making.

   LLM Application:
   - To build shared understanding between agents, documents, logs, and reporting formats must use the same structure.

### 8.22 Liaison / Horizontal Connection

1. FM 6-0 Appendix E, Liaison  
   https://www.globalsecurity.org/military/library/policy/army/fm/6-0/appe.htm

   Key Content:
   - Liaison facilitates communication between organizations and maintains freedom of action and flexibility.
   - It provides senior commanders with relevant information and answers to operational questions.

   LLM Application:
   - In a multi-agent system, liaison is the "interface between agents."
   - Track whether S2's evidence made it into S3's plan, and whether Red Team findings led to Executor fixes.

### 8.23 Risk Management / Risk Management

1. ATP 5-19, Risk Management  
   https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf

   Key Content:
   - Doctrinal guidance on risk management during operations.
   - Risk must be identified, assessed, controlled, decided upon, executed, and supervised/evaluated.

   LLM Application:
   - Agent authority must vary with risk level.
   - Low-risk/reversible tasks get autonomy; high-risk/irreversible tasks require approval.
   - A risk register must be maintained.

2. Risk Management Quick Reference Booklet  
   https://asktop.net/wp/download/GTA/GTAx21-08-001xv2014.pdf

   Key Content:
   - A quick reference based on ATP 5-19.
   - Used to quickly check the risk management procedure.

   LLM Application:
   - Rather than applying the entire lengthy risk doctrine every time, insert a simple risk gate into the prompt.

### 8.24 Operation Assessment / Performance Evaluation

1. Operation Assessment MTTP  
   https://www.alssa.mil/mttps/assessment/

   Key Content:
   - A commander and staff guide for integrating assessment into planning and the operations process.
   - How-to techniques and procedures that supplement joint/service doctrine.

   LLM Application:
   - Evaluate separately whether a deliverable was produced and whether the purpose was achieved.
   - Document MOP, MOE, and indicators.

2. ATP 5-0.3 / Operation Assessment PDF  
   https://www.bits.de/NRANEU/others/amd-us-archive/ATP5-0x3%2815%29.pdf

   Key Content:
   - Integrates assessment into the planning and operations process.
   - Uses indicators and assessment products.

   LLM Application:
   - Passing a test is closer to an MOP; actually achieving the user's goal is closer to an MOE.
   - For a documentation project, "the next worker can execute it as-is" is the MOE, not just "the document exists."

3. JP 5-0, Joint Planning  
   https://www.esd.whs.mil/Portals/54/Documents/FOID/Reading%20Room/Joint_Staff/18-F-1152_JP_5-0_Joint_Planning_2020.pdf

   Key Content:
   - Operation assessment measures observable key indicators to increase the effectiveness of planning and execution.

   LLM Application:
   - A framework can only be improved if it also has measurable indicators.

### 8.25 Training / Readiness / METL

1. ADP 7-0, Training  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716

   Key Content:
   - Training is a core commander responsibility for building readiness.
   - Units select and evaluate training tasks matched to the missions they must actually perform.
   - Training is not a one-time event but a repetition of plan, prepare, execute, assess.

   LLM Application:
   - Agents, too, should be evaluated not on "being good" but on which mission-essential tasks they can perform.
   - Manage prompt writing, source verification, code changes, Red Team review, and AAR incorporation as an AI METL.
   - Place more checklists and approval gates on agents with lower readiness.

2. FM 7-0, Training  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335

   Key Content:
   - Training management connects unit missions with training resources.
   - The commander sets training priorities and evaluation methods.
   - Collective tasks and individual tasks must be linked.

   LLM Application:
   - Evaluate single-agent capability and multi-agent collective capability separately.
   - Example: if S2 is good at source verification but S3 integration is weak, overall operational readiness is low.
   - Keeping a record of success/failure per task, like a training record, allows agent authority to be expanded gradually.

3. Crawl-Walk-Run Approach

   Key Content:
   - A complex mission is not performed with full autonomy right away; proficiency is built up in stages.
   - It progresses from simple procedures at first, to complex procedures under supervision, and finally to mission-type performance.

   LLM Application:
   - Crawl: the agent follows the SOP checklist exactly.
   - Walk: the agent makes some judgment calls but receives a backbrief and approval.
   - Run: the agent receives only the commander's intent and CCIR and executes autonomously.

### 8.26 Sustainment / Logistics

1. ADP 4-0, Sustainment  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796

   Key Content:
   - Operations cannot be sustained without sustainment support.
   - Sustainment covers the ability to continue combat operations, including supply, maintenance, transportation, personnel, and medical support.
   - The commander must consider the operation plan and the sustainment plan together.

   LLM Application:
   - The sustainment of LLM work consists of tokens, context, tools, APIs, file access, time, and the test environment.
   - Long-running research or multi-agent work needs an S4 role.
   - Look not only at "can it be done" but at "can it be sustained through completion."

2. JP 4-0, Joint Logistics  
   https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/

   Key Content:
   - Joint logistics integrates multiple organizations and functions to support operations.
   - Priority, allocation, and coordination are the core.

   LLM Application:
   - When multiple agents work simultaneously, they compete for the same context, the same sources, and the same tools.
   - A Chief of Staff or S4 agent must manage resource allocation and bottlenecks.
   - Long tasks must guard against context loss through checkpoints and documentation.

3. Sustainment principles

   Key Content:
   - Principles such as anticipation, responsiveness, simplicity, economy, survivability, continuity, and improvisation are repeatedly emphasized.

   LLM Application:
   - Anticipation: anticipate the sources and tools needed before starting work.
   - Responsiveness: issue a FRAGO quickly in response to user change requests or failures.
   - Simplicity: keep document structure and prompt chains simple.
   - Economy: use expensive models and tools only where needed.
   - Survivability: leave documents and summaries in place to guard against context loss.
   - Continuity: keep saving intermediate deliverables.
   - Improvisation: have a fallback procedure ready for tool failure.

### 8.27 Targeting / Effects

1. JP 3-60, Joint Targeting  
   https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/

   Key Content:
   - Targeting is not simply about designating a target; it is a process that links the desired effect, means, and assessment.
   - The joint targeting cycle is a system that links decision, execution, and assessment.

   LLM Application:
   - LLM work, too, must first decide "what effect to produce" rather than "what to do."
   - Example: "writing a document" is an activity; "enabling the next agent to trace the evidence" is the effect.
   - Attach a target, desired effect, and assessment method to every change.

2. FM 3-60, Army Targeting  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1030750

   Key Content:
   - Army targeting is described by the decide, detect, deliver, assess (D3A) flow.
   - After confirming where a decided target actually is and what state it is in, means are applied and effects are assessed.

   LLM Application:
   - Decide: decide which documents, code, claims, or risks to change.
   - Detect: check the current state of files and sources.
   - Deliver: perform the edit, creation, or tool call.
   - Assess: check tests, reviews, the source map, and whether the user's goal was achieved.

3. Effects-based thinking

   Key Content:
   - In operations, the effect an action produces matters more than the action itself.

   LLM Application:
   - The effect is not "fixed the code" but "reproduced the user's problem and prevented it with a test."
   - The effect is not "attached a source" but "the core claim and the official source are traceable."

### 8.28 Rules of Engagement / Legal and Ethical Control

1. CJCSI 3121.01B, Standing Rules of Engagement / Standing Rules for the Use of Force  
   A public reference exists, but the latest official release must be confirmed before use as an actual operating standard.

   Key Content:
   - ROE predefine which actions are permitted and which are restricted in a given situation.
   - The commander weighs mission accomplishment and legal/policy restrictions simultaneously.

   LLM Application:
   - ROE for agents are divided into allowed, approval required, and prohibited.
   - Reading and summarizing files is allowed; external distribution and incurring cost is approval required; exposing secret keys and fabricating sources is prohibited.
   - ROE must be an actual tool-use authority table, not just model safety boilerplate.

2. JP 3-84, Legal Support  
   https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/

   Key Content:
   - Legal support and restriction review are combined in operational command.
   - Legal judgment is included in planning and execution, not treated as a separate after-the-fact stage from the operation plan.

   LLM Application:
   - High-risk domains such as law, medicine, finance, and security are not areas where an agent should form its own independent conclusion.
   - The agent must identify the risk and escalate it via an approval/expert review path.

3. Combining Risk Decision Authority with ROE

   Key Content:
   - The authority to accept risk differs by echelon.

   LLM Application:
   - The agent is a risk reporter, not a risk acceptor.
   - High-risk judgments must be classified as "approval required," not "I handled it."

### 8.29 Warfighting Functions / Integration by Function

1. FM 3-0, Operations  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282

   Key Content:
   - Combat power arises from the integration of multiple warfighting functions.
   - Command and control, intelligence, movement, fires, sustainment, and protection must operate together rather than separately.

   LLM Application:
   - An LLM framework, too, cannot rely on prompts alone.
   - Command and control, intelligence, execution, sustainment, protection, information, and assessment must all be present.
   - This perspective becomes the basic structure of `functional-domains.md`.

2. ADP 3-0, Operations  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715

   Key Content:
   - Modern operations are conducted in an environment where multiple domains and functions affect each other simultaneously.

   LLM Application:
   - Multi-agent work also involves research, code, documentation, testing, and user communication interacting simultaneously.
   - Success in one function does not guarantee overall success.

3. Translation of LLM Functional Domains

   Key Mapping:
   - Command and Control -> user intent, approval, reporting, authority.
   - Intelligence -> sources, facts, uncertainty, hallucination prevention.
   - Movement and Maneuver -> task sequencing, file navigation, execution path.
   - Fires -> changes and effects on a specific target.
   - Sustainment -> tokens, time, tools, context, dependencies.
   - Protection -> security, sensitive information, rollback, approval gates.
   - Information -> documentation, knowledge management, SITREP, AAR.

### 8.30 Korean Public Military Sources / Public ROK Military Sources

1. Ministry of National Defense (MND) Public Materials and Defense White Paper
   https://www.mnd.go.kr/

   Key Content:
   - Provides insight into Korean defense policy, force structure, defense innovation, and the direction of the shift to a technology-based force.
   - More useful for understanding strategic, organizational, and policy context than detailed operational doctrine.

   LLM Application:
   - Used as background material for a Korean-style LLM military framework.
   - Connects AI not merely as a productivity tool but to command and control, informatization, education and training, and logistics transformation.
   - States the limitations of the public material explicitly and fills structural gaps using published US military doctrine.

2. Korean Law Information Center (National Law Information Center)
   https://www.law.go.kr/

   Key Content:
   - Provides access to the Act on the Status and Service of Military Personnel, MND directives, and unit management regulations.
   - Provides the legal/institutional basis for command, service, command responsibility, security, and management systems.

   LLM Application:
   - Used as an analogical basis for agent authority and ROE.
   - Distinguishes "the user gave an order" from "it can be executed within legitimate authority."
   - Translates honest reporting, risk reporting, and protection of sensitive information into hallucination prevention and tool-use control.

3. Korea Institute for Defense Analyses (KIDA)
   https://www.kida.re.kr/

   Key Content:
   - Provides public research materials on defense policy, defense AI, command and control, logistics, informatization, and organizational operations.
   - Useful for understanding the institutional context of the Korean military and Korean defense policy.

   LLM Application:
   - Used to calibrate mission command for Korean organizational culture.
   - Connects defense AI and informatization research as a basis for the implementation guide.
   - KIDA material is treated as research-grade, distinct from official law/doctrine.

4. Public Korean Military Terminology Sources

   Key Content:
   - Unifying military terminology is a key device for reducing distortion in command and reporting.
   - Korean military terms and English doctrinal terms may not correspond exactly one-to-one.

   LLM Application:
   - Manage Korean/English terms together in `glossary.md`.
   - Stabilize the field names of the prompt DSL.
   - Prevent the model from translating or coining military terms arbitrarily.

5. Limits of Using Korean Sources

   Key Content:
   - Detailed operational doctrine, order formats, and actual command-and-control procedures have low public accessibility.
   - Public materials are centered on law, policy, research, and terminology sources.

   LLM Application:
   - Use Korean military sources to establish Korean context, and supplement procedural structure with published US military doctrine.
   - Where public material is absent, leave it marked as "assumption" or "further research needed."

### 8.31 Implementation / Runtime Translation

1. Converting a Military-Style System into a Runtime Structure

   Key Content:
   - Military-style operation does not function on concepts alone.
   - An actual system needs mission state, an authority gate, a tool log, an evidence store, and an AAR store.

   LLM Application:
   - Store the user request as a mission object.
   - The OPORD is compiled into a task order.
   - Tool calls are ruled on by ROE at the tool gateway.
   - Source-based claims are linked to the evidence store.
   - After completion, the AAR is reflected in the SOP and readiness rating.

2. Prompt DSL

   Key Content:
   - Express OPORD, WARNO, FRAGO, SITREP, and AAR as a schema that is human-readable and machine-verifiable.
   - Keep mission, intent, authority, CCIR, and assessment as required fields.

   LLM Application:
   - Structure the prompt instead of leaving it as a blob of natural language.
   - Detect missing intent, authority, or MOP/MOE with validation rules.
   - A prompt compiler can convert the DSL into system/developer/user prompts.

3. Tool-Use ROE

   Key Content:
   - Translate military ROE into an LLM tool-use authority system.
   - Divide actions into Green, Amber, Red, and Black, each with its own execute/approve/deny rules.

   LLM Application:
   - Reading files and generating documents can be Green.
   - API writes, package changes, and external form submission are Amber or higher.
   - Data deletion, production DB changes, and deployment are Red.
   - Printing secret keys, fabricating sources, and bypassing access to restricted material are Black.

4. Agent Org Chart

   Key Content:
   - For multi-agent systems, the command relationship matters more than the number of roles.
   - Separate the responsibilities and reporting lines of Commander, Chief of Staff, S2, S3, S4, S6, Red Team, and Evaluator.

   LLM Application:
   - If every agent becomes a commander, deliverables become scattered.
   - Red Team is an independent reviewer, not the final author.
   - S2 produces sources and uncertainty, S3 produces the execution plan, and the CoS integrates them.

### 8.32 Reference Architecture / Productization

1. Calibrating for Korean Organizational Culture

   Key Content:
   - In Korean organizations, hierarchical obedience, approval chains, over-optimistic reporting, and suppression of dissent affect how the framework operates.
   - When introducing a military-style system, the emphasis should be on strengthening backbriefs, risk reporting, Red Team independence, and authority delegation, rather than automating superior-issued orders.

   LLM Application:
   - Even a "just handle it" request does not bypass the ROE.
   - Ambiguous orders are calibrated using a backbrief and an assumption list.
   - Red Team findings are treated as material for command judgment, not as criticism.

2. Reference Architecture

   Key Content:
   - An actual system divides into an Orchestrator, OPORD compiler, Agent registry, Policy/ROE engine, Tool gateway, Evidence store, State store, and Audit store.
   - The Tool gateway must be the single gateway for all external actions.

   LLM Application:
   - Agents do not execute tools directly; they pass through the policy engine.
   - Separate mission state from the evidence store to trace intent and evidence.
   - Record approvals, denials, and execution results through the audit store.

3. Sample Runtime State

   Key Content:
   - Defined sample states for mission, OPORD, task order, agent registry, tool request, approval request, SITREP, FRAGO, evidence, and AAR.

   LLM Application:
   - Reduce context loss on long tasks through state storage.
   - Record the AAR in a learning store and link it to readiness and SOP updates.

4. Prompt DSL Validator

   Key Content:
   - For the validator, detecting risk before execution matters more than grammar checking.
   - Catches missing mission, intent, authority, CCIR, or assessment as an error or critical.

   LLM Application:
   - Set rules such as MISSING_AUTHORITY, HIGH_RISK_NO_APPROVAL, MOP_ONLY.
   - Have ambiguous mission and authority fixed before execution.

5. Approval UI Patterns

   Key Content:
   - Approval should not be a "continue?" prompt; it must show action, tool, target, risk, rollback, and alternatives.
   - For Red actions, the default should be dry-run, not approve.

   LLM Application:
   - The approval request must become a decision memo.
   - Action-level, time-bound approval is safer than blanket approval.

### 8.33 Runtime Contracts / Schema and Operations

1. JSON Schema contracts

   Key Content:
   - Separated schemas for mission, agent, OPORD, task order, tool request, approval request, SITREP, FRAGO, evidence, AAR, and readiness ledger.
   - The schema serves as the runtime's "order format."

   LLM Application:
   - The agent produces verifiable state objects rather than free text that merely looks like a document.
   - The OPORD and tool request are linked by the same mission id, making them auditable.

2. Validator prototype

   Key Content:
   - Separated JSON Schema validation from semantic military-control validation.
   - Blocks missing intent, authority, CCIR, MOP/MOE, or high-risk tool actions before execution.

   LLM Application:
   - Blocks a "prompt that is formally correct but has no command and control."
   - Halts tasking and tool execution when a critical issue exists.

3. Agent runtime playbook

   Key Content:
   - Defined the procedures for startup, mission intake, OPORD approval, tasking, execution, SITREP, FRAGO, approval, evidence, verification, incident, AAR, and shutdown.

   LLM Application:
   - The runtime operator manages active missions, pending decisions, failed tool requests, and unresolved AARs, not just model output.

4. Military AI risk register

   Key Content:
   - Built a register of recurring risks such as intent distortion, hallucination, unauthorized action, secret exposure, gateway bypass, and MOP-only evaluation.

   LLM Application:
   - Links each risk to a CCIR and a control, for use as reporting and approval criteria.

5. Agent readiness ledger

   Key Content:
   - Records per-agent task readiness as T/P/U/X.
   - Readiness is an evidence-based evaluation of a specific mission-essential task, not a general evaluation of the model.

   LLM Application:
   - High-readiness tasks are performed autonomously; low-readiness tasks require a backbrief and supervision.

### 8.34 Runtime Fixtures / Policy / Dashboard

1. Sample payloads

   Key Content:
   - Created valid/invalid JSON examples for mission, tool request, approval, SITREP, evidence, and AAR.
   - The invalid examples represent failures the validator must catch, such as missing intent and Red without approval.

   LLM Application:
   - The framework becomes a testable runtime contract rather than staying on paper.

2. Policy engine rules

   Key Content:
   - ROE rulings follow the priority Black > Red > Amber > Green.
   - Considers actor, tool, action, target, data sensitivity, mission constraint, and approval scope together.

   LLM Application:
   - An agent's tool request must pass through the policy engine, and even with approval, mission/tool/action/target/time must match.

3. Command post dashboard

   Key Content:
   - The dashboard must prioritize decision required, CCIR, approval queue, risk, and evidence over completion percentage.

   LLM Application:
   - Rather than showing the user every log, surface only the information needed for command judgment.

4. Runtime automation roadmap

   Key Content:
   - A document-based framework is productized in the order: validator CLI, prompt compiler, tool gateway, approval UI, evidence store, command post dashboard, learning runtime.

   LLM Application:
   - Implement gate by gate rather than building full automation all at once.

5. Evaluation fixtures

   Key Content:
   - Defined schema, semantic, policy, evidence, and runtime fixtures.
   - Downgrading a critical rule, allowing Red without approval, or allowing a Black action are regression failures.

   LLM Application:
   - The validator and policy engine must be managed with fixture-based regression tests, not just documentation descriptions.

### 8.35 Executable Prototype / Data Model / Demo

1. Validator CLI prototype

   Key Content:
   - Built a draft CLI running a JSON Schema subset and semantic rules in Node.js with no external dependencies.
   - Passed smoke tests for a valid mission, invalid missing intent, valid Green tool request, and invalid Red without approval.

   LLM Application:
   - The first executable deliverable in converting a military-style document system into an actual runtime gate.

2. Dashboard wireframes

   Key Content:
   - Divided the command post dashboard into mission board, approval queue, CCIR alerts, evidence viewer, risk board, and readiness board.

   LLM Application:
   - The user sees the information requiring a decision, risks, approval requests, and evidence first, not the full log.

3. SQL data model

   Key Content:
   - Designed tables for missions, orders, task_orders, tool_requests, approvals, audit_events, evidence, sitreps, fragos, aars, risks, and readiness_ledger.

   LLM Application:
   - Tracks command, evidence, audit, and learning centered on the mission id.

4. Runtime demo scenario

   Key Content:
   - Wrote an example of a user's implementation request flowing through intake, OPORD, task order, tool request, SITREP, FRAGO, verification, and AAR.

   LLM Application:
   - Shows that the framework has a flow of time and events like an actual operation.

5. Source reliability rubric

   Key Content:
   - Rates sources A/B/C/D/X, looking at authority, directness, currency, scope, and interpretive risk.

   LLM Application:
   - Separates the source claim from the LLM's interpretation so that "what the source said" and "the interpretation we applied" are not confused.

### 8.36 Runtime Prototype / Event Model

1. Validator fixture runner

   Key Content:
   - `run-fixtures.js` runs valid/invalid payloads and checks the expected issue code.
   - Missing intent and Red without approval must fail as critical.

   LLM Application:
   - The validator rule becomes a regression test, not just a documented promise.

2. Policy engine prototype

   Key Content:
   - Rules on Black, Red, Amber, or Green based on the tool request text and the declared ROE class.
   - Black cannot be bypassed even with approval.

   LLM Application:
   - Produces the first implementation unit of the tool gateway.

3. Runtime demo payloads

   Key Content:
   - Wrote payloads for mission, task order, Green tool request, Red tool request, approval request, SITREP, evidence, and AAR.

   LLM Application:
   - Makes it possible to verify how a single mission flows through the runtime state objects.

4. Dashboard UI prototype

   Key Content:
   - Built a command post dashboard as static HTML.
   - Placed mission intent, CCIR, approval queue, risks, active tasks, evidence, readiness, and SITREP on a single screen.

   LLM Application:
   - Validates a UI direction that shows the user "what must be decided" first.

5. Event sourcing model

   Key Content:
   - Defined events such as MissionCreated, OPORDCreated, ToolRequestCreated, PolicyDecisionMade, ApprovalRequested, ToolBlocked, SITREPIssued, AARIssued, and ReadinessUpdated.

   LLM Application:
   - In long-running operations, the history of command judgment matters as much as the current state.

### 8.37 Automation Runners / Dashboard State / Event Replay

1. Policy fixture runner

   Key Content:
   - Automatically tests the expected decision for a Green local action, Red without approval, demo Green, and demo Red deploy.

   LLM Application:
   - Immediately catches a regression where the policy engine allows a Red action.

2. Runtime demo runner

   Key Content:
   - Validates the entire demo mission payload with the validator, and checks Green/Red tool requests with the policy engine.

   LLM Application:
   - Confirms that a single mission flow passes both the schema and policy gates.

3. Dashboard state

   Key Content:
   - Separated the dashboard prototype's data into `dashboard-state.json`.
   - The HTML renders the state if the JSON fetch succeeds, and uses a fallback state if it fails.

   LLM Application:
   - Event replay projections can later be converted into dashboard state.

4. Event fixtures and replay prototype

   Key Content:
   - Built a demo event log; the replay script computes mission, tasks, tool requests, approvals, SITREP, evidence, AAR, and readiness projections.

   LLM Application:
   - Separates the history of command judgment from the current state, supporting both audit and dashboard projection at once.

### 8.38 Projection Automation / OPORD Payload / Commander Handbook

1. Dashboard state renderer

   Key Content:
   - Added `dashboard-ui-prototype/render-state.js`.
   - Converts the event replay projection into the JSON state format read by the dashboard prototype.
   - Folds blocked Red requests, pending approval, evidence count, latest SITREP, and readiness into a commander-facing screen state.

   LLM Application:
   - The command post screen is built from the event log projection, not from conversational memory.
   - Creates a link between "current state" and "auditable history."

2. Event replay fixture runner

   Key Content:
   - Added `event-replay-prototype/run-event-fixtures.js`.
   - Automatically verifies mission complete, OPORD retention, task projection, Green executed, Red blocked, pending approval, SITREP, evidence/AAR count, readiness, and the dashboard approval queue.

   LLM Application:
   - Fails immediately if the event replay logic loses a Red action block or the approval queue.
   - Makes the audit architecture a regression gate, not just a documented idea.

3. Runtime demo OPORD

   Key Content:
   - Added `runtime-demo-payloads/opord.json`.
   - Put the mission -> OPORD -> task order chain under actual schema validation.
   - Authority, CCIR, sustainment, and assessment are included inside the OPORD payload.

   LLM Application:
   - A user request is not executed directly; it is structured into an order document and then passed through the validator.
   - Approval authority and prohibition lines are made into a payload contract, not just prompt text.

4. Military operating deep research queue

   Key Content:
   - Added `military-operating-deep-research-queue.md`.
   - Organized missing areas such as B2C2WG, staff integration, OPSEC/classification, knowledge management, training/METL, sustainment, and liaison into a research backlog.

   LLM Application:
   - Framework expansion is managed as a backlog by military operating domain, not as arbitrary topics.
   - Manages source rating, research question, and output artifact together.

5. Commander handbook

   Key Content:
   - Added `commander-handbook.md`.
   - Organized, as practical procedure, how a human operates intent, priority, risk, authority, CCIR, approval, and AAR as an AI commander.

   LLM Application:
   - In both single-agent and multi-agent settings, the commander can clearly state "what to execute autonomously and where to stop."
   - Approval requests, backbriefs, SITREPs, and hallucination control prompts became immediately usable.

### 8.39 B2C2WG / CCIR Alerting / OPSEC / KM / METL / Authority Matrix

1. B2C2WG operating model

   Key Content:
   - Added `b2c2wg-operating-model.md`.
   - Converted boards, bureaus, centers, cells, and working groups into an LLM runtime's board, bureau, center, cell, and working group.
   - The working group produces a decision packet, and the board decides approval, priority, risk acceptance, and FRAGO.

   LLM Application:
   - Controls the structure where multiple agents each report verbosely, via CoS integration and decision packet flow.
   - Connected to event sourcing, defining candidate events such as `WorkingGroupOpened`, `DecisionPacketPrepared`, and `BoardDecisionMade`.

2. CCIR alerting model

   Key Content:
   - Added `ccir-alerting-model.md`.
   - Converted PIR, FFIR, EEFI, and Decision Point into an alert severity and routing matrix.
   - Branches a Red action to an approval request, a scope change to a FRAGO, and source uncertainty to an evidence review.

   LLM Application:
   - The dashboard shows only information that affects commander decisions, not the entire log.
   - Separates "what to report" from "what to merely record."

3. OPSEC classification model

   Key Content:
   - Added `opsec-classification-model.md`.
   - Defined public/internal/sensitive/restricted classification along with an EEFI and context releasability matrix.
   - Organized tool-use OPSEC, evidence store OPSEC, downgrade review, and the dashboard OPSEC panel.

   LLM Application:
   - Context sharing and final output carry need-to-know and releasability criteria.
   - Restricted information such as secrets/tokens/private keys is treated as something to be blocked across output, query, log, and tool target alike.

4. Knowledge management SOP

   Key Content:
   - Added `knowledge-management-sop.md`.
   - Organized README, source-map, compendium, evidence, decision log, event log, runtime payload, and AAR/readiness ledger into a source-of-truth hierarchy.
   - Defined the handoff packet and decision log format.

   LLM Application:
   - Long-running work is carried forward through stored documents and event projections, not chat history.
   - The S6 Knowledge role becomes an operator of the knowledge flow, not just a document writer.

5. Agent METL

   Key Content:
   - Added `agent-metl.md`.
   - Defined mission-essential tasks and evaluation criteria for Commander, CoS, S2, S3, S4, S6, Red Team, and Evaluator.
   - Linked the T/P/U/X readiness rating to Green/Amber/Red/Black authority.

   LLM Application:
   - Agent autonomy is determined by the combination of role/task/tool/target/risk/readiness, not model performance.
   - AAR results can lead to a readiness increase/decrease and to training tasks.

6. Authority matrix schema and fixtures

   Key Content:
   - Added `schema-files/authority-matrix.schema.json`.
   - Added `sample-payloads/valid-authority-matrix.json` and `sample-payloads/invalid-authority-matrix-red-without-approver.json`.
   - Connected the `authority-matrix` type and semantic rule to the validator.

   LLM Application:
   - A Red rule must always have `approval_required` and `approval_authority`.
   - A Black rule must always be `prohibit` and cannot be bypassed by approval.
   - A default allow fails as a broad authority risk.

### 8.40 Decision Packet / Working Group / CCIR Alert / Handoff / Alert Router / Readiness Gate

1. Decision packet schema

   Key Content:
   - Added `schema-files/decision-packet.schema.json`.
   - Fixed as schema the option, recommended option, risk, authority, evidence, deadline, and fallback that go up to the commander board.
   - Connected valid/invalid fixtures and semantic rules.

   LLM Application:
   - The agent produces a decidable packet instead of just saying "please approve" to the user.
   - A decision packet with no options or no evidence fails in the validator.

2. Working group schema

   Key Content:
   - Added `schema-files/working-group.schema.json`.
   - Specifies chair, participants, inputs, deliverables, decision board, trigger, and disband condition.

   LLM Application:
   - Prevents multi-agent discussion from continuing endlessly, and enforces a deliverable and a disbandment condition.

3. CCIR alert and alert router

   Key Content:
   - Added `schema-files/ccir-alert.schema.json`.
   - Added `alert-router-prototype/` to generate Red decision point, Amber FFIR, and Amber PIR alerts from the event log.

   LLM Application:
   - The event log is converted into commander dashboard alerts.
   - A Red/Black alert must carry a required decision and an execution block.

4. Handoff packet schema

   Key Content:
   - Added `schema-files/handoff-packet.schema.json`.
   - Made mandatory the current order, commander intent, completed/in-progress/blocked status, pending decisions, active risks, source-of-truth files, verification status, next actions, and do-not-do.

   LLM Application:
   - Produces a minimum packet that lets the work be picked up during a context transition even without chat history.
   - Fails in the validator if there is a blocked item but no pending decision.

5. Readiness gate prototype

   Key Content:
   - Added `readiness-gate-prototype/`.
   - Combines the authority matrix with role/task readiness to determine allow, report_required, approval_required, or prohibit.

   LLM Application:
   - For the same S3, local validation is allowed at readiness P, while a production deploy requires commander approval.
   - If readiness is insufficient, even an action that is normally Green is escalated to approval_required.

6. Context releasability policy

   Key Content:
   - Added `context-releasability-policy.md`.
   - Defined the raw/summary/redacted/reference_only/denied delivery mode per role.

   LLM Application:
   - Restricts multi-agent context sharing by need-to-know and EEFI criteria.
   - Final output must include only information for which release_to_final is permitted.
   - Later, `role-document-access-policy.md` and `document-access-runner.js` restrict access to the document files themselves, a stage earlier than the context item.

### 8.41 Context Filter / Release Review / Handoff Generator / Maintenance Readiness

1. Context item and release review schema

   Key Content:
   - Added `schema-files/context-item.schema.json` and `schema-files/release-review.schema.json`.
   - A context item has classification, EEFI, allowed roles, release_to_final, and retention.
   - The release review records the delivery mode and redaction per item at final output/external release.

   LLM Application:
   - The validator fails if restricted/EEFI context goes directly into final output.
   - The final answer, too, is subject to a release review from an operational standpoint.

2. Context filter prototype

   Key Content:
   - Added `context-filter-prototype/`.
   - Computes the raw, summary, redacted, reference_only, or denied delivery mode based on role or `FINAL_OUTPUT`.

   LLM Application:
   - S3 may receive internal blocked-deployment context as raw, but EEFI credential context is denied.
   - Red Team receives sensitive architecture only as a summary.

3. Handoff generator

   Key Content:
   - Added `handoff-generator.js`.
   - Combines the event replay projection and alert projection to produce a schema-valid handoff packet.

   LLM Application:
   - At a context transition, current order, commander intent, blocked items, pending decisions, active risks, and source-of-truth files are assembled automatically.

4. Decision packet linter

   Key Content:
   - Added `decision-packet-linter.js` and `run-decision-packet-linter-fixtures.js`.
   - In addition to the validator's schema/semantic check, checks the number of options, the benefit/risk/tradeoff per option, and the default action.

   LLM Application:
   - Confirms, via a separate gate, that a packet going up to the commander has the minimum quality needed to be decidable.

5. Working group event fixtures

   Key Content:
   - Added `event-fixtures/working-group-event-fixtures.json` and `event-replay-prototype/run-working-group-fixtures.js`.
   - Verifies the lifecycle: WG opened -> decision packet prepared -> board decision made -> WG closed.

   LLM Application:
   - B2C2WG moves beyond a documented concept into an event-sourced workflow.

6. Maintenance readiness model

   Key Content:
   - Added `maintenance-readiness-model.md`.
   - Converted sustainment/maintenance into tool readiness, resource readiness, context freshness, verification, and fallback.

   LLM Application:
   - Even if an agent is capable, its execution authority is limited if tool/resource/context/fallback is insufficient.
   - S4/S6 is responsible for runtime sustainment and the maintenance report.

### 8.42 Maintenance Runner / Release Runner / Approval Scope / Risk Acceptance / Source Coverage

1. Maintenance readiness schema and runner

   Key Content:
   - Added `schema-files/maintenance-readiness.schema.json`.
   - `maintenance-readiness-runner.js` runs the validator, policy, runtime, event replay, alert router, and context filter runners to produce a readiness report.

   LLM Application:
   - Tool/resource/context/fallback readiness has been raised as a pre-execution gate.
   - A critical runner failure is an S4/S6 maintenance issue and a candidate FFIR/CCIR.

2. Release review runner

   Key Content:
   - Added `release-review-runner.js` and `run-release-review-fixtures.js`.
   - Compares the context filter output with the release review document and fails if the review is more permissive than the filter.

   LLM Application:
   - Final output, too, must pass the release gate.
   - EEFI/restricted context is blocked at both the filter and the review.

3. Working group dashboard projection

   Key Content:
   - Added `dashboard-ui-prototype/working-group-projection-dashboard-state.json`.
   - Verified that the working group event fixture projection matches the dashboard state.

   LLM Application:
   - The B2C2WG lifecycle can be converted into command post UI state.

4. Approval scope and risk acceptance documents

   Key Content:
   - Added `approval-scope-policy.md` and `risk-acceptance-authority.md`.
   - Organized approval once, expiry, rollback, evidence, release review separation, residual risk, and commander-retained authority.

   LLM Application:
   - Separated "approval" from "risk acceptance."
   - Red action approval is a scoped release, not blanket permission.

5. Approval scope and risk acceptance schemas

   Key Content:
   - Added `schema-files/approval-scope.schema.json`.
   - Added `schema-files/risk-acceptance.schema.json`.
   - Added valid/invalid fixtures and used validator semantic rules to verify expiry, rollback, evidence, and commander-retained authority.

   LLM Application:
   - A Red action is not unlocked by a mere "approval request."
   - The scoped approval must be active, single-use, and matched on target/action/tool/time.
   - High/critical/irreversible residual risk must be accepted by the Commander.

6. Policy authority integration prototype

   Key Content:
   - Added `policy-engine-authority-integration.js`.
   - Composes the policy engine, authority matrix/readiness, scoped approval, and risk acceptance.
   - `run-authority-integration-fixtures.js` verifies an approved Red deployment, reuse of a consumed approval, and missing risk acceptance.

   LLM Application:
   - A Red action is blocked under policy, but changes to `allow_scoped_execution` only when both the exact approval scope and risk acceptance are valid.
   - A consumed approval cannot be reused.
   - A high-risk action with approval but no risk acceptance remains blocked.

7. Approval consumption event

   Key Content:
   - Added `schema-files/approval-consumption-event.schema.json`.
   - Added `approval-consumption-runner.js` and `run-approval-consumption-fixtures.js`.
   - Separated approval granted from actual execution, and defined an audit event that converts the approval to consumed at the moment of execution.

   LLM Application:
   - It's not enough to check that the approval scope is active; the actual execution event must be verified against mission/action/tool/target/time/evidence.
   - A target mismatch is not recognized as approval consumption.
   - An already-consumed approval cannot be consumed by a second execution event.
   - Preventing approval reuse is part of the event-sourcing audit trail, not a single policy check.

8. Approval revocation event

   Key Content:
   - Added `schema-files/approval-revocation-event.schema.json`.
   - Added `approval-revocation-runner.js` and `run-approval-revocation-fixtures.js`.
   - Only an active approval can be revoked; a consumed approval cannot be handled as a post-hoc revocation.

   LLM Application:
   - Revoking approval, too, must match on action/tool/target/time/authority/evidence.
   - The revoking authority must match the authority that granted the approval.
   - A revocation requiring notification leaves a notified role to reduce distortion in the chain of transmission.
   - An already-executed action must be handled through rollback, FRAGO, and AAR, not revocation.

9. Approval renewal event

   Key Content:
   - Added `schema-files/approval-renewal-event.schema.json`.
   - Added `approval-renewal-runner.js` and `run-approval-renewal-fixtures.js`.
   - Only extends the validity period of an active approval; expanding target/action/tool/max execution requires a new approval.

   LLM Application:
   - Even a "just a little more time" request is recorded as an append-only event rather than directly modifying the existing approval object.
   - Renewal is only possible before the existing expiry.
   - An `approve_once` that has already expired or already been used requires a new approval or a FRAGO, not a renewal.
   - Renewal is not a means of broadening the scope of authority.

10. Approval delegation event

   Key Content:
   - Added `schema-files/approval-delegation-event.schema.json`.
   - Added `approval-delegation-runner.js` and `run-approval-delegation-fixtures.js`.
   - Made delegation of approval authority valid only within the existing approval-required rules of the authority matrix.

   LLM Application:
   - Rather than asking the user or Commander for every approval, Amber-level recurring sustainment approval can be delegated in a limited way to, e.g., the CoS.
   - Delegation cannot include Red/Black, high/critical residual risk, restricted release, or subdelegation.
   - Self-approval, where a delegatee approves their own role, is also prohibited.
   - Delegation, too, must leave reason, evidence, notification, backbrief, and post-action evidence.

11. Approval delegation revocation/expiry event

   Key Content:
   - Added `schema-files/approval-delegation-revocation-event.schema.json`.
   - Added `approval-delegation-revocation-runner.js` and `run-approval-delegation-revocation-fixtures.js`.
   - Delegated approval authority must be closed with a `revoked` or `expired` event, and the original delegation snapshot must be preserved.

   LLM Application:
   - A creation event alone is not enough for authority delegation. Without a termination event, a subordinate agent may mistake a past delegation for still-valid authority.
   - Commander revocation must be performed by the Commander within the active window.
   - The expiry projection can be recorded after expiry by the `RECORDER` or a termination authority.
   - The termination event checks task/action/tool/target/risk/time limit/retained authority/context guardrail against the original delegation.
   - Prevents a staff role from arbitrarily revoking delegated authority or marking it expired before its actual expiry.

12. Policy release integration

   Key Content:
   - Added `policy-engine-release-integration.js`.
   - Added `run-release-integration-fixtures.js` and `release-integration-fixtures/`.
   - Blocks final/external output if the release review is missing or fails, even when the authority gate allows execution.

   LLM Application:
   - "Approval to execute a tool" is not "approval to disclose information."
   - Red execution requires scoped approval and risk acceptance, and release-required output requires a separate release review.
   - A valid release review cannot bypass missing risk acceptance.
   - An invalid release review halts final output as `blocked_pending_release_review` even if approval already exists.

13. Authority delegation dashboard projection

   Key Content:
   - Added `authority-delegation-projection-runner.js`.
   - Added `run-authority-delegation-projection-fixtures.js` and `authority-delegation-projection-fixtures/`.
   - Stored the active/revoked/expired delegation projection in `dashboard-ui-prototype/authority-delegation-projection-state.json`.

   LLM Application:
   - Authority delegation must be surfaced as a dashboard projection, since an operator may miss it if it exists only in the event log.
   - Separates active, revoked, and expired states to prevent reuse of expired/revoked authority.
   - Leaves the termination actor and reason in the dashboard row to enable after-the-fact tracing and AAR.

14. Release gate decision event

   Key Content:
   - Added `schema-files/release-gate-decision-event.schema.json`.
   - Added `release-gate-decision-runner.js` and `run-release-gate-decision-fixtures.js`.
   - Verifies that the release integration result matches the final decision/snapshot/evidence recorded in the event log.

   LLM Application:
   - The gate computation result must not exist only in conversational memory; it must be recorded as an append-only event.
   - Blocks a case where the release review is missing or failed but the event claims `allow_scoped_execution_and_release`.
   - Even a valid release review cannot bypass missing risk acceptance.
   - Records the final decision, authority snapshot, release review snapshot, reasons, and evidence together.

15. Release gate dashboard projection

   Key Content:
   - Added `release-gate-dashboard-runner.js`.
   - Added `run-release-gate-dashboard-fixtures.js` and `release-gate-dashboard-fixtures/`.
   - Stored the released, release-review-blocked, and authority-blocked projections in `dashboard-ui-prototype/release-gate-dashboard-state.json`.

   LLM Application:
   - The final/external output gate must be surfaced on the operator dashboard, not just the event log.
   - Separates the state where authority allowed but there is no release review from the state where the release review passed but authority blocked it.
   - Shows "why it was blocked" together with reasons/evidence so the next decision-maker can act immediately.

16. Maintenance readiness dashboard projection

   Key Content:
   - Added `maintenance-dashboard-runner.js`.
   - Added `run-maintenance-dashboard-fixtures.js` and `maintenance-dashboard-fixtures/`.
   - Stored the ready/degraded/down sustainment projection in `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`.

   LLM Application:
   - Tool/resource/context readiness must be surfaced in a dashboard queue, since it may be missed by an executor if it exists only in a document or report.
   - Separates degraded assets from unavailable assets, handling restricted operation and blocked status differently.
   - Preserves the commander decision flag in the projection so that states such as resource Red, no fallback, or blocked execution connect immediately to a decision point.

17. Source-map linter

   Key Content:
   - Added `source-map-linter.js`.
   - Checks whether official source domains in the docs have coverage in the source-map.
   - Stored a per-host coverage snapshot in `source-map-url-coverage-report.json`.

   LLM Application:
   - Automatically monitors for the problem of a new official source entering the compendium while being missing from the source-map.
   - Source coverage is left as an artifact rather than existing only in an execution log, so the next worker can audit it.

18. AAR readiness update

   Key Content:
   - Added `aar-to-readiness-update.js`.
   - Added `schema-files/aar-readiness-update.schema.json`.
   - Added `run-aar-readiness-update-fixtures.js` and `aar-readiness-update-fixtures/`.
   - Converts an AAR's delta, cause, improve, and SOP update into a readiness recommendation, maintenance action, and CCIR trigger.

   LLM Application:
   - The AAR is an event input that changes future authority/training/maintenance status, not a retrospective document.
   - A critical source failure or hallucination signal is connected to a Red Team downgrade/hold and a commander review.
   - A sustain-only AAR becomes a candidate for increased autonomy, while an AAR with remaining improvements is left on hold/train.

19. OPORD annex and FRAGO scope-change schemas

   Key Content:
   - Added `schema-files/annex.schema.json`.
   - Added `schema-files/frago-scope-change.schema.json`.
   - Blocks, via semantic validation, an annex quietly changing OPORD intent or an authority boundary.
   - Expresses mission scope or authority boundary changes as a FRAGO scope-change including affected roles, backbrief, rehearsal, and the annex boundary reason.

   LLM Application:
   - Separating the details of a specialized plan from a change to commander intent is necessary to prevent distortion in the chain of transmission.
   - Prevents the phrase "I updated the annex" from changing mission purpose, task priority, or approval boundary.
   - A scope-changing FRAGO must be redelivered to the affected role and go through a backbrief and rehearsal before it is executable.

20. Rehearsal to CCIR router

   Key Content:
   - Added `rehearsal-to-ccir-router.js`.
   - Added `run-rehearsal-to-ccir-fixtures.js` and `rehearsal-to-ccir-fixtures/`.
   - Converts rehearsal friction points and decision points into CCIR alerts and decision packets.

   LLM Application:
   - Friction found in rehearsal must be surfaced to the commander-facing queue before execution.
   - Medium friction is tracked as an FFIR/Amber alert; high/critical friction is escalated into a blocked decision alert and a decision packet.
   - Credential/restricted-related friction is handled as an EEFI/Black alert, blocking execution and release.

21. AI special operations task force

   Key Content:
   - Added `ai-special-operations-tf.md`.
   - Added `schema-files/sof-tf-charter.schema.json`.
   - Added `sof-tf-activation-runner.js`, `run-sof-tf-fixtures.js`, and `sof-tf-fixtures/`.
   - Referenced JP 3-05, FM 3-05, USSOCOM SOF Truths, USSOCOM core activities, and the official USASOC page.
   - Converted the SOF Truths into AI operating principles: people/intent/approval matter more than the model, a small number of vetted agents is better than many agents, and a highly skilled workflow cannot be created ad hoc after an emergency begins.
   - Defined the AI SOF TF structure as Commander, TF Lead/CoS, S2 Recon, S3 Execution, S4/S6 Enabler, OPSEC/Release, Red Team, and Recorder/KM.
   - The charter validator verifies trigger, commander-retained authority, independent Red Team/release review, source-map, release review, fallback, backbrief, rehearsal, dry run, and abort/handoff criteria.

   LLM Application:
   - A high-risk/high-uncertainty mission needs a smaller team, stronger control, better enablers, and a faster decision loop, not more autonomy.
   - Converts not actual military operational tactics but agent selection, readiness, need-to-know context, OPORD/annex, rehearsal, CCIR, and AAR/readiness update.
   - SOF core activity names are used only as safe metaphors for AI operation, with deception/unauthorized access/harmful instruction kept as a Black prohibition line.
   - The activation runner projects the SOF TF charter into `go/no_go`, approval gates, context distribution, required support, preflight blocks, and a commander queue.

22. Information to operations cycle

   Key Content:
   - Added `information-to-operations-cycle.md`.
   - Connected JP 2-0, ADP 2-0, ATP 2-01.3, ADP 5-0, FM 5-0, and the JCS CCIR Focus Paper as the basis for information processing/operational change.
   - Separated raw information, information report, intelligence assessment, running estimate, CCIR, decision packet, SITREP, and FRAGO scope-change.
   - Added `schema-files/information-report.schema.json` and `schema-files/intelligence-assessment.schema.json`.
   - Added `information-to-operations-router.js` and `run-information-to-operations-fixtures.js`.

   LLM Application:
   - New information does not immediately change the prompt/order. It is first evaluated for source reliability, confidence, CCIR relevance, EEFI risk, and operational impact.
   - Order-changing information cannot become a FRAGO without a CCIR alert and a commander decision packet.
   - Low-confidence information is left as a PIR/running estimate or a source review, not a FRAGO scope-change.
   - EEFI or credential-like raw values are not repeated in output even after release-block routing.

23. Personnel continuity and succession

   Key Content:
   - Added `personnel-continuity-model.md`.
   - Connected FM 6-0, ADP 6-0, the Federal Continuity Directive planning framework, the KM primer, and ADP 7-0.
   - Organized the reasons the military withstands personnel loss and rotation into duty-position priority, 2-deep succession, bounded authority, vital records, battle handover, readiness gate, and degraded mode.
   - Added `schema-files/continuity-plan.schema.json`.
   - Added `continuity-drill-runner.js`, `run-continuity-drill-fixtures.js`, and `continuity-drill-fixtures/`.

   LLM Application:
   - An agent instance is expendable. The source of truth resides in role, order, authority, event log, handoff, and readiness ledger.
   - Even if a Commander or S6 disappears, the successor chain activates, but Red approval, risk acceptance, release target expansion, and FRAGO scope change do not automatically pass to the successor.
   - Role rotation requires overlap, a handoff packet, an incoming backbrief, and a focused rehearsal.
   - A continuity drill flags a single-point-of-failure successor, an essential function with no handoff, missing vital records, and the absence of a degraded mode as failures.

24. Interdepartment collaboration and branch integration

   Key Content:
   - Added `interdepartment-collaboration-policy.md`.
   - Connected ADP 3-0, FM 3-0, JP 3-0, FM 6-0, the JTF HQ organization focus paper, and the JTF command and control focus paper as the basis for branch/function integration.
   - Converted the military's combined arms, warfighting functions, joint functions, supported/supporting relationship, liaison, battle rhythm, and deconfliction into AI department collaboration policy.
   - Added `schema-files/department-collaboration-charter.schema.json`.
   - Added `department-collaboration-runner.js`, `run-department-collaboration-fixtures.js`, and `department-collaboration-fixtures/`.

   LLM Application:
   - Department collaboration is not parallel work. Each relationship must have a supported department, supporting department, required output, quality gate, handoff interface, and escalation trigger.
   - Every blocking dependency must have a liaison rule, and the liaison is not a decision-maker but is responsible for meaning translation and conflict routing.
   - When a cross-department conflict touches source validity, release target, authority boundary, high risk, or scope, a decision packet and a Commander/CoS route are needed.
   - The collaboration runner projects the charter into relationship edges, missing liaisons, unknown dependencies, a commander queue, and a preflight block.

25. Force structure change and force management

   Key Content:
   - Added `force-structure-change-policy.md`.
   - Connected AR 71-32, DA PAM 71-32, the Army Force Management School digital library, the How the Army Runs reference material, and Force Management Functional Area materials as the basis for creating, disestablishing, expanding, or reducing branches/units.
   - Organized the military's force management into capability requirement, DOTMLPF-P alternatives, force development, force documentation, affordability/supportability, readiness, and lifecycle review.
   - Added `schema-files/force-structure-change-order.schema.json`.
   - Added `force-structure-change-runner.js`, `run-force-structure-change-fixtures.js`, and `force-structure-change-fixtures/`.

   LLM Application:
   - A new agent, department, unit, TF, runner, or dashboard panel is not created out of naming convenience. Evidence is required that the capability gap cannot be resolved by adjusting an existing SOP/schema/training/tool.
   - Creating or expanding an organization requires Commander approval, retained release/risk/scope authority, a maintainer, validation fixtures, readiness evidence, a source-of-truth, and a sunset condition.
   - Disestablishing or reducing an organization is not complete without function transfer, handoff, data migration, authority withdrawal, documentation update, and an AAR/readiness update.
   - The force structure runner projects an order into a preflight block, commander queue, transition task, documentation queue, readiness requirement, and sunset watch.

26. Role document access and reading discipline

   Key Content:
   - Added `role-document-access-policy.md`.
   - Defined a need-to-know matrix that restricts which documents each agent may read by role, duty, and authority level.
   - Added `schema-files/document-access-manifest.schema.json`.
   - Added `document-access-runner.js`, `run-document-access-fixtures.js`, and `document-access-fixtures/`.
   - The valid fixture verifies that S2, Executor, and S6 each receive only the documents needed for their own duty.
   - The invalid fixture blocks bulk read, wildcard path, missing allowed role/duty, restricted raw, required-but-denied, and self escalation.

   LLM Application:
   - Instead of giving every agent the entire repository context, a per-mission `DocumentAccessManifest` is generated first.
   - S2 reads source/evidence documents, Executor reads only implementation/tool/schema documents, and Commander-only risk documents remain as summary or denied.
   - The document access runner checks role/duty/authority against the manifest to project allowed documents, denied documents, required documents, and audit requirements.
   - This gate sits ahead of `context-filter-prototype`. An agent that cannot open a file also cannot create a context item from that file.

### 8.47 Orders Production / Backbrief / Rehearsal Gate

1. Orders production pipeline

   Key Content:
   - Rather than turning a user request directly into an execution prompt, it is converted in the order mission analysis, OPORD, task order, backbrief, rehearsal, execution, SITREP, FRAGO, AAR.
   - Distortion in the chain of transmission is not reduced merely by "writing the order in more detail." It is reduced when the subordinate executor restates the intent, task, stop condition, and approval boundary.
   - Execution sequence and friction points must be caught during rehearsal.

   LLM Application:
   - Long-running tasks follow the state machine in `orders-production-pipeline.md`.
   - The `ordered -> acknowledged -> rehearsed -> executing` transition is made into a runtime gate.
   - `orders-dissemination-runner.js` verifies the connectivity of the OPORD, task order, backbrief, and rehearsal.

2. OPORD annex model

   Key Content:
   - The OPORD body is the command contract, and the annex is the specialized detailed plan.
   - Putting all detailed plans such as source/tool/risk/verification/context/sustainment into the body blurs the intent.
   - An annex must have a parent order and an owner, and an intent change is handled via a FRAGO, not an annex.

   LLM Application:
   - Defined the Source Plan, Tool/ROE Plan, Sustainment Plan, OPSEC/Releasability, Risk/Red Team, Assessment, and Handoff/Audit annexes.
   - Connected to the context releasability policy so that not every agent receives every annex as raw.

3. Backbrief schema

   Key Content:
   - The task owner restates commander intent, assigned task, purpose, end state, constraints, planned actions, risk controls, stop conditions, and approval/prohibited actions.
   - A backbrief without a stop condition must not be allowed to proceed to execution.

   LLM Application:
   - Added `schema-files/backbrief.schema.json`.
   - Added `sample-payloads/valid-backbrief.json` and `sample-payloads/invalid-backbrief-no-stop-conditions.json`.
   - The validator semantic rule catches `BACKBRIEF_WITHOUT_ACTIONS`, `BACKBRIEF_WITHOUT_STOP_CONDITIONS`, and `LOW_CONFIDENCE_WITHOUT_CLARIFICATION`.

4. Rehearsal schema

   Key Content:
   - The rehearsal records the execution sequence, expected result, evidence, friction point, decision point, required changes, and disposition.
   - If a required change remains but an execute disposition is issued, distortion in the chain of transmission turns into an execution error.

   LLM Application:
   - Added `schema-files/rehearsal.schema.json`.
   - Added `sample-payloads/valid-rehearsal.json` and `sample-payloads/invalid-rehearsal-execute-with-unresolved-change.json`.
   - The validator semantic rule catches `REHEARSAL_WITHOUT_SEQUENCE`, `EXECUTE_WITH_UNRESOLVED_CHANGES`, and `HIGH_FRICTION_WITHOUT_DECISION_POINT`.

5. Runtime demo integration

   Key Content:
   - Task `T-DEMO-001` of the demo OPORD connects to `runtime-demo-payloads/backbrief.json` and `runtime-demo-payloads/rehearsal.json`.
   - The runtime demo now has the flow mission -> OPORD -> task order -> backbrief -> rehearsal -> tool/policy -> SITREP/evidence/AAR.

   LLM Application:
   - `runtime-demo-runner.js` includes backbrief and rehearsal validation.
   - `orders-dissemination-runner.js` verifies the intent/task/actor/approval boundary connections.

### 8.48 Mission-Based Model Force Assignment

1. Routing, cascades, and economy of force

   Sources:
   - RouteLLM: https://arxiv.org/abs/2406.18665
   - FrugalGPT: https://arxiv.org/abs/2305.05176
   - Language Model Cascades: https://proceedings.iclr.cc/paper_files/paper/2024/file/11f5520daf9132775e8604e89f53925a-Paper-Conference.pdf
   - RouterBench: https://arxiv.org/abs/2403.12031

   Key Content:
   - Strong/weak model routing and cascades can reduce inference cost while preserving task quality, but gains depend on task distribution, routing data, and evaluator accuracy.
   - Models occupy different quality, cost, latency, and task-specialization positions; a single model is not uniformly optimal.
   - RouterBench reports that cascade performance degrades quickly when the judge or router error becomes material. The router therefore cannot be treated as an invisible utility.

   LLM Application:
   - Use C1 line profiles for eligible routine, reversible, validated work; escalate to C2 specialists or C3 command integration only on explicit mission or verification triggers.
   - Do not apply start-low routing to Red, sensitive, novel, irreversible, or final-release work. Those missions receive the required mixed force at assignment time.
   - Give the router an immutable profile, T/P readiness, held-out evaluation evidence, retry ceiling, and acceptance evidence independent of verbal confidence.

2. Task-specific readiness and operational evaluation

   Sources:
   - HELM: https://crfm.stanford.edu/2022/11/17/helm.html
   - Berkeley Function-Calling Leaderboard: https://gorilla.cs.berkeley.edu/leaderboard
   - tau-bench: https://arxiv.org/abs/2406.12045
   - NIST AI RMF Core: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
   - NIST AI RMF Generative AI Profile: https://doi.org/10.6028/NIST.AI.600-1

   Key Content:
   - Broad language benchmarks do not establish readiness for a local mission, tool schema, policy environment, or context boundary.
   - HELM emphasizes broad scenario and metric coverage; BFCL isolates function-calling behavior; tau-bench evaluates tool-agent-policy interaction and repeated-run consistency.
   - NIST AI RMF calls for documented knowledge limits, predeployment and ongoing TEVV, representative conditions, risk-proportionate review, and independent assessment.

   LLM Application:
   - Record readiness as `model profile x task x tool set x context class x harness x environment`.
   - A model version, system prompt, tool schema, harness, or material environment change creates a new evaluation subject.
   - Specialist branches are selected by local METL evidence, not model size. A narrow C1 profile may outrank a C3 general profile for its evaluated task.
   - Evaluate task success, policy compliance, tool-call correctness, source fidelity, calibration, robustness, consistency, latency, throughput, cost, and data-boundary eligibility.

3. Assurance independence and uncertainty

   Sources:
   - Judging LLM-as-a-Judge: https://arxiv.org/abs/2306.05685
   - Confident or Seek Stronger: https://arxiv.org/abs/2502.04428

   Key Content:
   - LLM judges can exhibit position, verbosity, and self-enhancement biases; reference-guided evaluation can reduce but not remove these risks.
   - Verbal confidence does not reliably equal correctness. Confidence-based routing requires task-level calibration and still needs external evidence.

   LLM Application:
   - Independent assurance is a distinct force class. Use a different model family from the primary executor where feasible and label same-family review as correlated.
   - Assurance receives intent, output, evidence, tests, and policy constraints, but it cannot execute remediation or approve its own finding.
   - Deterministic schema, policy, test, source, and release checks remain primary evidence. A model's statement that it is confident is neither acceptance evidence nor an authority grant.

4. Military organizational synthesis and implemented contract

   Military anchors:
   - ADP 6-0 and FM 6-0 for mission command, staff integration, and retained authority.
   - ADP 7-0 for METL-based training and readiness.
   - AR 71-32 for capability-based force management and documentation.
   - USSOCOM SOF Truths for selected personnel, readiness, enablers, and sustainable special operations capacity.

   Implemented conclusion:
   - Separate model capability bands C0-C3 from force classes: utility, line, specialist, command, SOF, assurance, and reserve.
   - Capability never creates authority. Role authority remains in the mission and authority contracts, and the human user retains final decisions.
   - High-impact missions require command/SOF integration, independent assurance, and distinct primary/alternate/contingency profiles. Emergency action stops execution and hands preserved state to the human Commander.
   - Added `model-force-assignment-policy.md`, `schema-files/model-force-assignment-plan.schema.json`, `model-force-assignment-runner.js`, `run-model-force-assignment-fixtures.js`, and valid/invalid sample plans.
   - The invalid fixture blocks floating model aliases, missing evidence, unready routing, out-of-METL tasks, context-ineligible profiles, confidence-only acceptance, correlated assurance, model monoculture, collapsed PACE, and authority inherited from model capability.

### 8.49 Model Force v0.2 Operationalization

1. Registry and demand separation

   Implemented conclusion:
   - A static assignment plan is insufficient as the source of truth because it can embed model claims without proving where readiness, identity, and availability came from.
   - `ModelRegistry` now owns immutable model/harness/prompt/tool identity, deployment and context eligibility, per-task readiness evidence, expiry, cost, latency, and availability.
   - `ModelAssignmentRequest` owns the mission's billet demand, force class, task, tool impact, authority scope, fallback depth, assurance, and optimization weights.
   - Registry governance retains human final decision authority and prohibits floating versions and secret-bearing endpoint references.

2. Hard filtering before optimization

   Implemented conclusion:
   - Deployment, context, task, tool-impact, readiness, evidence, expiry, availability, load, and family-separation requirements are eligibility gates rather than score components.
   - Cost and latency are optimized only among eligible profiles. They cannot compensate for a policy, evidence, or readiness failure.
   - Deterministic tie-breaking makes identical registry/request inputs reproducible.
   - The compiler materializes the existing v0.1 `ModelForceAssignmentPlan`, preserving its stable projection and safety checks.

3. Integrated routing and dispatch gate

   Implemented conclusion:
   - Model selection alone does not authorize an agent to work. Every dispatched agent must be bound to one current-wave accepted routing receipt and one compiled dispatch-required billet.
   - `integrated-mission-preflight-runner.js` combines routing receipt validation, model compilation, v0.1 plan projection, identity verification, and one-to-one binding checks.
   - A blocked projection emits no dispatch rows. A ready projection contains endpoint references, immutable identity, role, authority/tool/context scope, fallbacks, and routed documents.
   - Model capability remains separate from agent identity, role authority, release approval, and human risk acceptance.

4. Operational evidence and reassessment

   Implemented conclusion:
   - `ModelUsageEvent` records the immutable model identity, authority snapshot, release target, outcome, cost, latency, evidence, fallback/escalation, failure code, and transition.
   - Telemetry does not self-promote readiness. AAR and controlled readiness updates remain the path for changing T/P/U/X status.
   - Material model, prompt, harness, tool schema, environment, or policy changes require reevaluation.
   - Added `model-force-v0.2-operations.md`, four v0.2 schemas, `model-assignment-compiler.js`, `integrated-mission-preflight-runner.js`, `run-model-force-v0.2-fixtures.js`, and valid/invalid samples.

### 8.50 Repository-Scoped Artifact Isolation

1. Repository identity as the custody boundary

   Implemented conclusion:
   - A mission ID or agent ID is not sufficient to separate outputs when one campaign operates on several repositories.
   - Durable artifacts require a target Git repository identity before they are written.
   - The implementation derives an opaque fingerprint from normalized origin metadata plus the real Git root. Separate clones/worktrees of the same origin remain separate; remote URLs, credentials, and absolute roots are not stored in manifests.

2. Repository, mission, wave, and kind hierarchy

   Implemented conclusion:
   - The storage hierarchy is `repository -> mission -> wave -> kind -> artifact`, so repeated mission/wave/artifact IDs in different repositories cannot collide.
   - A per-repository manifest records relative path, content type, byte size, hash, Git head, and timestamps.
   - Subdirectories remain in the parent Git repository namespace; nested Git roots receive independent identities.

3. Fail-closed persistence

   Implemented conclusion:
   - Path traversal, absolute artifact paths, symlink source files, cross-repository manifest paths, and identity mismatch are blocked.
   - Identical repeated writes are idempotent. Different content at an existing path fails unless overwrite is explicit.
   - Per-repository cross-process locking serializes artifact and manifest mutation. Lock acquisition is finite; only a dead same-host stale lock is recovered, while active and foreign-host locks fail closed.
   - Every committed manifest mutation advances a monotonic revision, preventing concurrent last-writer loss from remaining invisible.
   - Integrated mission preflight clears dispatch outputs and changes to blocked when requested artifact persistence fails.
   - Routing receipts redact local repository and artifact-root paths from recorded command evidence.

4. Implemented surface

   Implemented conclusion:
   - Added `repository-artifact-isolation-policy.md`, `repository-artifact-store.js`, `schema-files/repository-artifact-manifest.schema.json`, valid/invalid manifest samples, semantic validator rules, `run-repository-artifact-isolation-fixtures.js`, and `run-repository-artifact-concurrency-fixtures.js`.
   - The store handles structured JSON projections and general file deliverables such as Markdown, PDF, and images.
   - The isolation fixture creates two Git repositories and proves same mission/wave/artifact IDs produce separate namespaces and manifests.
   - The concurrency fixture launches 24 writers and verifies full retention, monotonic revisions, stale local recovery, and active/foreign lock refusal.

### 8.51 Bounded Self-Improvement Control Plane

1. Self-improvement as a finite campaign

   Implemented conclusion:
   - An agent must not interpret "improve yourself" as permission to choose new goals, expand authority, approve its own evidence, or continue indefinitely.
   - Adaptation is represented as a finite campaign bound to one mission, repository identity, objective, acceptance set, authority envelope, quality model, budget, and stop conditions.
   - The human user remains final decision authority. Every controller decision explicitly keeps release authorization false.

2. Improvement of work already in progress

   Implemented conclusion:
   - Active drafts and implementations can be improved without restarting the mission when each candidate is compared with an accepted baseline.
   - A candidate advances only when deterministic or independent evidence passes hard gates, the weighted normalized score meets the quality floor, and the score improves by the declared minimum.
   - Cycle 1 is pinned to the campaign baseline revision, and every follow-on checkpoint names the accepted parent decision so a rejected candidate cannot become a hidden baseline.
   - Insufficient gain routes to revision. Failed validation or hard gates route to rollback of the campaign's own uncommitted candidate. Repeated no-progress and exhausted budgets route to human review.

3. Control-plane self-modification

   Implemented conclusion:
   - Procedures, runtime controls, and skills may be changed as isolated candidates, but require independent evaluation before becoming a working state.
   - Policy and authority effects require USER approval scoped to the exact candidate.
   - Destructive and cross-repository self-modification terminate autonomous execution rather than creating an approval path.

4. Mandatory completion checkpoint

   Implemented conclusion:
   - A normal wave-end cannot declare the campaign complete.
   - Completion requires a distinct `before_completion` checkpoint with no open acceptance criteria, all hard gates passing, the weighted quality floor met, and repository-scoped evidence.
   - Completion freezes a working state for the human merge/release decision; it does not merge, push, or release.

5. Implemented surface

   Implemented conclusion:
   - Added `bounded-self-improvement-operations.md`, three schemas, valid/invalid samples, semantic validator rules, `self-improvement-campaign-init.js`, `autonomous-improvement-controller.js`, and `run-self-improvement-fixtures.js`.
   - The fixture suite covers accepted work improvement, insufficient gain, validation rollback, policy escalation, destructive termination, completion, repository drift, no-progress budgets, independent review, permission drift, and repository-scoped checkpoint/decision persistence.
   - This v0.1 conclusion was superseded by the proof-carrying v0.2 controls in section 8.52.

### 8.52 Proof-Carrying Self-Improvement v0.2

1. Execute evidence instead of trusting evidence claims

   Implemented conclusion:
   - A checkpoint must not decide that its own test claim is true. A separate runner executes an exact executable/argument array with `shell: false`, finite timeout, bounded output, and repository-relative working directory.
   - The verification plan is bound to campaign, mission, cycle, candidate, repository identity, Git head, and worktree fingerprint. A stale plan is rejected before execution.
   - The receipt records resolved executable hash, exact argv, exit code, signal, duration, stdout/stderr size and SHA-256, bounded excerpts, runtime environment hash, and repository state before/after.
   - Repository mutation during verification fails the receipt. Metrics and independent evaluations must cite verified receipt IDs rather than prose evidence.

2. Prove accepted lineage

   Implemented conclusion:
   - A follow-on checkpoint supplies a manifest-backed parent decision reference, not only an ID string.
   - The controller reloads and validates the parent, requires the immediately prior cycle and `accept_working_state`, and matches the parent's `accepted_revision` to the next baseline.
   - Missing, forged, rejected, or baseline-mismatched parents block continuation.

3. Consume retained approval exactly

   Implemented conclusion:
   - Policy, authority, scope, and release-affecting candidates cannot rely on `USER approved` text.
   - The checkpoint references a repository-stored `ApprovalScope` and `ApprovalConsumptionEvent`. The controller validates both schemas and checks mission, actor, action, tool, candidate target, validity window, execution count, executed result, consumed status, and checkpoint-specific execution ID.
   - A consumption event cannot be reused for another checkpoint. Working-state acceptance still does not authorize merge, push, or release.

4. Recover and verify artifact custody

   Implemented conclusion:
   - Repository manifests advanced to v0.3. Each mutation writes a journal before artifact bytes, then commits an immutable manifest-history entry, current manifest, and SHA-256 sidecar.
   - Recovery under the namespace lock reconciles `artifact_written` and `manifest_committed` interruptions idempotently. Unexpected bytes or divergent manifest heads fail closed.
   - The verifier checks pending journals, repository identity, canonical manifest digest, sidecar, contiguous retained history, previous-digest links, artifact path/type/size/hash, and orphan files.
   - SHA-256 history is tamper-evident local custody, not an external signature or trusted execution environment.

5. Implemented surface

   Implemented conclusion:
   - Added `verification-runner.js`, two proof schemas, valid/invalid samples, semantic rules, manifest-backed proof loading, consumed approval binding, exact parent verification, and decision proof summaries.
   - Added `repository-artifact-verify.js` and `run-repository-artifact-recovery-fixtures.js`; expanded self-improvement fixtures to execute real commands and reload proof artifacts.
   - Updated both AI CLI skills to make proof issuance, artifact verification, approval consumption, and parent lineage mandatory operating steps.

### 8.53 Signed Quorum and Fenced Persistence v0.3

Research question:

> How can an adaptive AI runtime distinguish independently executed proof from locally rewritten evidence, and how can several writers coordinate without allowing an expired writer to overwrite a newer state?

Primary references:

- RFC 8032 defines Ed25519 signing and verification.
- DSSE defines a pre-authentication encoding that signs both payload type and exact payload bytes.
- The in-toto Attestation Framework separates subject digest, statement, predicate, and authentication envelope.
- etcd's lease and transaction model demonstrates that ownership expiry and compare-and-swap revision control are separate requirements.

Engineering conclusions:

1. A receipt hash proves content consistency but not who vouched for it. v0.3 therefore keeps the executable receipt and adds an Ed25519 DSSE attestation from a verifier listed in a hash-bound trust policy.
2. One signature is not independence. Promotion requires distinct verifier IDs, distinct public-key IDs, and a minimum number of declared independence groups. Repeating one attestation or assigning one key to several names does not count.
3. The signed subject is the persisted receipt SHA-256, not an informal test label. The predicate repeats the campaign, mission, cycle, candidate revision, repository identity, verifier invocation, origin, nonce, and validity window so replay or cross-repository reuse fails.
4. `remote` is a signed origin claim, not proof of a trusted execution environment. Stronger assurance needs externally authenticated workload identity, protected keys, trusted time, and optionally transparency logging or hardware-backed execution.
5. Lock expiry alone creates a stale-writer hazard. Every lease acquisition therefore receives a monotonically increasing fencing token, and every manifest revision records that token. Several revisions may share a token only while one lease remains owner; a new lease ID must have a higher token. Immutable history creation and head compare-and-swap reject an older or concurrent revision.
6. The built-in shared-filesystem lease assumes atomic directory creation, atomic hard-link publication, coherent reads, and tolerable clock skew. It is suitable for cooperating writers on one strongly consistent filesystem, not for surviving network partitions. Distributed deployments need a linearizable external lease/transaction service.
7. Root-of-trust policy remains human-controlled. A campaign binds the exact policy artifact path and hash; key rotation, revocation, policy replacement, merge, push, and release do not become autonomous authority.

Implemented artifacts:

- `verification-attestation.js`
- `verification-attestation-runner.js`
- `schema-files/verifier-trust-policy.schema.json`
- `schema-files/verification-attestation.schema.json`
- `run-verification-attestation-fixtures.js`
- `run-signed-self-improvement-fixtures.js`
- `repository-lease.js`
- `repository-artifact-store.js` manifest v0.4

### 8.54 Deterministic Campaign Supervision v0.4

Research question:

> How does a bounded adaptive campaign resume without relying on conversational memory, skipping an approval boundary, or turning one controller decision into open-ended recursion?

Engineering conclusions:

1. A checkpoint controller answers whether one candidate can be accepted; it does not prove that a caller selected the correct next cycle, baseline, parent, or retry count. Campaign scheduling must therefore be a separate deterministic function over durable records.
2. The repository manifest is the campaign's custody boundary. The supervisor reloads one exact campaign and every matching checkpoint and decision only after manifest, history, sidecar, path, size, and artifact hashes pass verification.
3. Every checkpoint must pair with exactly one decision. Orphan checkpoints, orphan decisions, duplicate IDs, skipped cycle numbers, records after acceptance, and records after a terminal decision make the history non-executable.
4. A cycle advances only from `accept_working_state`. The next baseline is that decision's `accepted_revision`, and every follow-on checkpoint cites the decision's exact manifest path and SHA-256. Revision, rollback, and continue decisions increment an attempt in the same cycle rather than creating a parent they did not earn.
5. Finite budgets are dispatch gates, not advisory counters. The supervisor refuses to open a cycle beyond `max_cycles`, a retry beyond `max_retries_per_cycle`, or follow-on work after failure, no-progress, or elapsed limits are reached.
6. Completion, termination, escalation, invalid lineage, and incomplete persistence all become `hold` orders with `execution_authorized: false`. The cycle order also fixes `release_authorized: false`; it cannot widen the controller's authority.
7. Durable orders are idempotent. Re-running supervision against the same campaign state returns the existing order instead of appending another manifest revision. A conflicting order with the same deterministic identity is an integrity error.
8. The supervisor issues tasking but does not perform the task, generate evidence, decide a candidate, resolve human escalation, or release work. An active agent harness remains responsible for executing one ready order and returning a new proof-backed checkpoint.

Implemented artifacts:

- `campaign-supervisor.js`
- `schema-files/self-improvement-cycle-order.schema.json`
- `sample-payloads/valid-self-improvement-cycle-order.json`
- `sample-payloads/invalid-self-improvement-cycle-order-blocked-execution.json`
- `run-campaign-supervisor-fixtures.js`

### 8.55 Comparative Control-Plane Promotion v0.5

Research question:

> How can a self-improving campaign show that a skill or runtime-control candidate is better than its accepted baseline without trusting a model-authored before/after score?

Primary references:

- NIST AI RMF Generative AI Profile: https://doi.org/10.6028/NIST.AI.600-1
- Google SRE Workbook, Canarying Releases: https://sre.google/workbook/canarying-releases/
- OpenAI Working with evals: https://developers.openai.com/api/docs/guides/evals
- OpenAI Model guidance: https://developers.openai.com/api/docs/guides/latest-model

Engineering conclusions:

1. A single candidate receipt proves that a command ran against one state, but it does not establish comparative improvement. Baseline and candidate therefore need separate immutable repository-state bindings under one predeclared comparison plan.
2. A time-separated before/after claim is vulnerable to changed inputs, harnesses, and environments. The local gate fixes one ordered evaluation set, one artifact hash, one exact argv, and one harness hash for both worktrees. Any mismatch is `inconclusive`, not a soft warning.
3. Relative improvement alone can reward two bad states. Every quality dimension therefore combines a campaign-owned absolute target with a direction-aware maximum regression from the accepted baseline.
4. Test selection after seeing candidate output enables hindsight bias. The evaluation set and plan must be persisted before the paired execution. The set records whether fixtures are held out or open and requires expected outputs to be excluded from candidate context.
5. The harness emits structured observations rather than prose. The runner verifies subject, evaluator invocation, evaluation-set identity, exact fixture order, sample count, normalized metric dimensions, process result, and repository/fixture immutability.
6. A valid measured failure is `rollback`; invalid or uncomparable evidence is `inconclusive`; only a full pass is `promotable`. The comparison report never authorizes execution, merge, push, or release.
7. The controller reloads the report, plan, and set from the integrity-checked manifest and recomputes every threshold. Checkpoint before/after values must equal the report values, preventing a second model-authored metric layer from replacing runtime evidence.
8. The campaign supervisor binds any comparative report named by a decision back to its checkpoint and publishes the required target types in every cycle order.
9. Local hashes and process controls do not prove a trusted evaluator, isolated host, prior non-exposure, or statistical confidence. Signed report attestations, authenticated workload identity, host sandboxing, repeated stochastic trials, and post-deployment monitoring remain future controls.

Implemented artifacts:

- `comparative-evaluation-runner.js`
- `schema-files/comparative-evaluation-set.schema.json`
- `schema-files/comparative-evaluation-plan.schema.json`
- `schema-files/comparative-evaluation-report.schema.json`
- `sample-payloads/valid-comparative-evaluation-set.json`
- `sample-payloads/valid-comparative-evaluation-plan.json`
- `sample-payloads/valid-comparative-evaluation-report.json`
- `run-comparative-evaluation-fixtures.js`
- controller, supervisor, validator, roadmap, and skill integrations

### 8.56 Authenticated Comparative Evidence v0.6

Research question:

> How can the controller authenticate the party vouching for a comparative result without confusing a valid signature with proof that the evaluation itself was honest or isolated?

Primary references:

- DSSE protocol: https://github.com/secure-systems-lab/dsse/blob/master/protocol.md
- in-toto Statement v1: https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md
- SLSA Verification Summary Attestation v1: https://slsa.dev/spec/v1.2/verification_summary
- SLSA artifact verification: https://slsa.dev/spec/v1.2/verifying-artifacts
- Sigstore keyless signing overview: https://docs.sigstore.dev/cosign/signing/overview/

Engineering conclusions:

1. A report hash in a local manifest proves local byte consistency, not who vouched for the report. Schema v0.4 therefore adds an Ed25519 DSSE attestation whose in-toto subject is the exact persisted report artifact SHA-256.
2. Authentication must be purpose-bound. Receipt and comparative-report statements use different predicate types, preventing a valid signature from one evidence class from being interpreted as the other. Comparative signing additionally requires an explicit `comparative_evaluation_report` grant in the verifier's `allowed_attestation_types`; a receipt-only key is rejected before signing and during verification.
3. Subject digest alone is insufficient for policy. The signed comparative predicate repeats the report self-digest, plan and evaluation-set IDs, outcome, campaign, mission, cycle, target type, baseline and candidate identities/revisions, repository identity, evaluator ID/invocation, verifier identity, execution origin, nonce, and validity window.
4. Verification follows the SLSA pattern: validate the trusted key and envelope, match the subject digest, require the expected predicate, bind signer to verifier identity, then compare every relevant claim with preconfigured expectations. The controller derives those expectations from manifest-reloaded campaign, checkpoint, plan, set, and report artifacts.
5. One signer is not independent assurance. The same human-controlled trust policy sets minimum valid attestations, distinct keys, distinct verifier IDs, independence groups, allowed repositories/origins and attestation purposes, key windows, policy window, and maximum evidence age for both receipt and report quorums.
6. Outer fields are conveniences, not authority. They must equal the signed predicate and the controller's expectations. Changing an outer candidate revision and recomputing the local attestation digest still fails because the DSSE payload does not change.
7. A report attestation authenticates a trusted-key statement; it does not establish host isolation, honest harness execution, workload identity, provider independence, or trusted time. Sigstore-style OIDC identity, short-lived credentials, transparency inclusion, protected keys, and a sandboxed evaluator are future infrastructure controls.
8. `promotable` plus a valid report quorum remains only working-state evidence. The report, attestation, controller decision, and supervisor order all leave merge, push, policy, trust-root, authority, and release decisions outside autonomous scope.
9. Backward compatibility is explicit: v0.2 remains receipt-only, v0.3 retains signed-receipt semantics, and newly bootstrapped trusted campaigns use v0.4 with a separate signed comparative quorum for skill and runtime-control targets.

Implemented artifacts:

- `comparative-evaluation-attestation.js`
- `comparative-evaluation-attestation-runner.js`
- `schema-files/comparative-evaluation-attestation.schema.json`
- `sample-payloads/valid-comparative-evaluation-attestation.json`
- `sample-payloads/invalid-comparative-evaluation-attestation-statement.json`
- `run-comparative-evaluation-attestation-fixtures.js`
- v0.4 controller, supervisor, validator, roadmap, and skill integrations

### 8.57 Pre-Dispatch Verifier Readiness Admission v0.7

Research question:

> How can a campaign avoid starting work whose mandatory independent proof quorum is already impossible to obtain?

Primary references:

- SLSA artifact verification: https://slsa.dev/spec/v1.2/verifying-artifacts
- SLSA Verification Summary Attestation v1: https://slsa.dev/spec/v1.2/verification_summary
- RFC 8032: https://www.rfc-editor.org/rfc/rfc8032.html
- DSSE protocol: https://github.com/secure-systems-lab/dsse/blob/master/protocol.md

Engineering conclusions:

1. Requiring a signed quorum only after candidate execution wastes work and invites pressure to weaken the gate. The supervisor must verify that the bound trust policy can form every required evidence quorum before issuing execution authority.
2. Readiness cannot be an agent-authored status field. It is a deterministic projection from the exact policy artifact already identified by campaign ID, path, SHA-256, mission namespace, and repository identity in the verified manifest.
3. Receipt and comparative statements are separate purposes. A legacy v0.3 key with no purpose field may support receipts, but comparative readiness requires an explicit `comparative_evaluation_report` grant. Receipt capacity cannot silently become report capacity.
4. Eligible population is time- and repository-dependent. Only active entries with valid Ed25519 key identities, an allowed repository, and a validity interval containing the issuance instant count. Suspended, revoked, future, expired, wrong-repository, or malformed-key entries are excluded.
5. Headcount is not quorum. Readiness independently records distinct verifier IDs, public-key IDs, and independence groups. Repeating one key under several names or placing all verifiers in one group cannot satisfy the campaign threshold.
6. Campaign and trust policy may both state minimums. Admission uses the stricter value for each threshold and cannot turn off distinct-key enforcement required by either contract.
7. Readiness changes over time even when campaign history does not. Cycle-order v0.2 therefore records evaluation time and a conservative `valid_until`; admission state is included in deterministic order identity while the evaluation timestamp is excluded from idempotency comparison.
8. A validator recomputes satisfaction from the order's recorded lists and thresholds. A payload cannot claim `satisfied: true` with insufficient keys or groups, drift admission time from issuance, or attach v0.2 admission claims to a v0.1 order.
9. This is capacity admission, not availability proof. Public policy entries do not establish that private keys are online, uncompromised, independently operated, or able to answer. External workload identity, protected execution, online health, trusted time, and transparency remain separate controls.

Implemented artifacts:

- `verifier-trust-readiness.js`
- `campaign-supervisor.js` trust-policy loading and fail-closed admission
- `schema-files/self-improvement-cycle-order.schema.json` v0.2
- `sample-payloads/valid-self-improvement-cycle-order.json`
- `run-verifier-trust-readiness-fixtures.js`
- `run-cycle-order-admission-fixtures.js`
- expanded `run-campaign-supervisor-fixtures.js`

### 8.58 Authenticated Verifier Workload and Transparency Admission v0.8

Research question:

> How can pre-dispatch admission prove that a currently active workload, rather than only a public-key entry in policy, controls the verifier identity and has made that proof transparent?

Primary references:

- SPIFFE X.509-SVID specification: https://spiffe.io/docs/latest/spiffe-specs/x509-svid/
- SPIFFE Workload API specification: https://spiffe.io/docs/latest/spiffe-specs/spiffe_workload_api/
- Sigstore security model: https://docs.sigstore.dev/about/security/
- Sigstore bundle format: https://docs.sigstore.dev/about/bundle/
- Sigstore verification guide: https://docs.sigstore.dev/cosign/verifying/verify/
- Rekor transparency overview: https://docs.sigstore.dev/logging/overview/
- RFC 5280, Internet X.509 PKI certificate and CRL profile: https://www.rfc-editor.org/rfc/rfc5280.html
- RFC 9162, Certificate Transparency v2: https://datatracker.ietf.org/doc/html/rfc9162
- RFC 6962, Certificate Transparency v1: https://www.rfc-editor.org/rfc/rfc6962.html

Engineering conclusions:

1. Static policy eligibility and live workload authentication answer different questions. A registered Ed25519 key can establish who is allowed to sign, but it does not show that a current verifier process is online or bound to an externally issued workload identity. Trust-policy v0.2 therefore requires both layers before a verifier enters admission.
2. SPIFFE provides a provider-neutral workload identifier. The leaf certificate must expose exactly one URI SAN containing the expected SPIFFE ID, use a non-root path under the configured trust domain, be a non-CA certificate, and chain to the pinned root. Multiple URI SANs are rejected instead of selecting one favorable value.
3. The workload's SVID key must not replace the verifier's policy key. Both keys sign one canonical statement containing evidence ID, verifier and key, SPIFFE ID, root and log IDs, repository identity, allowed evidence purposes, nonce, issue time, and expiry. This demonstrates simultaneous participation and prevents either credential from silently widening the other.
4. Workload proof must be purpose-bound. Evidence can cover receipts, comparative reports, or both, but admission counts a verifier for a purpose only when policy and current identity evidence independently grant it.
5. Short-lived credentials reduce exposure but create a verification-time problem. Transparency material records the proof while the SVID is active. The verifier derives a canonical transparency entry from the statement, certificate and both signatures, applies domain-separated SHA-256 leaf/node hashes, and verifies an inclusion path to a checkpoint signed by the policy-pinned log key.
6. A signed checkpoint is not an append-only service by itself. Local inclusion verification proves membership in the stated tree root, not consistency with older roots or visibility to other observers. Production deployments still need log monitoring, consistency proofs, witness cosigning or gossip, and an incident path for equivocation.
7. Manifest custody remains mandatory. The supervisor considers only schema-valid identity evidence loaded from the campaign mission namespace of the verified repository artifact store, and cycle-order v0.3 records its exact manifest ID, path, and SHA-256. An otherwise valid object passed only in memory cannot authorize dispatch.
8. Admission validity must be conservative. The order expires at the earliest relevant policy, verifier, SVID, or evidence boundary. Stale evidence fails independently through `max_evidence_age_seconds`, even when its nominal expiry is later.
9. Provider-neutral does not mean standards-complete. The local verifier performs a bounded direct-chain check for signatures, CA roles, time, pinned root, exact SPIFFE SAN and Ed25519 keys. It does not implement general RFC 5280 path building, name/policy constraints, revocation, AIA retrieval, every critical extension, or the SPIFFE Workload API.
10. The local transparency envelope is not a Sigstore bundle and its checkpoint is not a Rekor wire object. Sigstore bundles, Fulcio OIDC claims, signed entry timestamps, trusted-root metadata and Rekor versions evolve as one ecosystem. Phase 11B should use official libraries and adapters instead of hand-rolling protocol compatibility.
11. Authentication still does not prove honest execution. A valid workload can run a defective or malicious verifier, and an independence-group label can misstate operational separation. Protected execution, service health, operator controls, reproducible verification and cross-provider evidence remain distinct assurances.
12. Human authority does not move. Agents cannot add roots, log keys, SPIFFE IDs, verifier keys, widen purposes, reduce quorum, extend validity, merge, push or release from identity evidence or a ready cycle order.

Implemented artifacts:

- `verifier-identity-evidence.js`
- `schema-files/verifier-identity-evidence.schema.json`
- `schema-files/verifier-trust-policy.schema.json` v0.2
- `schema-files/self-improvement-cycle-order.schema.json` v0.3
- `sample-payloads/valid-verifier-identity-evidence.json`
- `sample-payloads/invalid-verifier-identity-evidence.json`
- `run-verifier-identity-evidence-fixtures.js`
- `run-workload-identity-admission-fixtures.js`
- `verifier-trust-readiness.js` and `campaign-supervisor.js` identity admission integration

### 8.59 Native Sigstore Bundle and TrustedRoot Admission v0.9

Research question:

> How can Controls consume the evolving Fulcio, Rekor, CT-log and bundle ecosystem without reimplementing Sigstore, while still binding keyless identity to the framework's static verifier authority and current-workload requirement?

Primary references:

- Sigstore bundle protobuf: https://github.com/sigstore/protobuf-specs/blob/main/protos/sigstore_bundle.proto
- Sigstore TrustedRoot protobuf: https://github.com/sigstore/protobuf-specs/blob/main/protos/sigstore_trustroot.proto
- Sigstore root-signing repository: https://github.com/sigstore/root-signing
- sigstore-js client: https://github.com/sigstore/sigstore-js/tree/main/packages/client
- sigstore-js verifier: https://github.com/sigstore/sigstore-js/tree/main/packages/verify
- Sigstore conformance suite: https://github.com/sigstore/sigstore-conformance
- Cosign `verify-blob` contract: https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-blob.md
- Cosign Rekor-entry binding advisory GHSA-whqx-f9j3-ch6m: https://github.com/sigstore/cosign/security/advisories/GHSA-whqx-f9j3-ch6m
- Rekor transparency overview: https://docs.sigstore.dev/logging/overview/

Engineering conclusions:

1. Native Sigstore is a separate provider adapter, not a new interpretation of the Phase 11A local envelope. The trust policy selects `spiffe_x509` or `sigstore_bundle` per verifier so protocol and assurance boundaries remain visible.
2. A bundle is verification material, not policy. Policy independently fixes the exact certificate SAN, OIDC issuer, TrustedRoot artifact, bundle media type, CT/Rekor/timestamp thresholds, repository, verifier, purposes and validity limits.
3. Trusted material is an executable dependency. `SigstoreTrustedRoot` normalizes official protobuf JSON, records source and retrieval time, requires CA/Rekor/CT-log material, hashes the normalized root and enters the repository manifest by exact ID/path/SHA-256. Root replacement is a human-controlled trust change.
4. Keyless identity must not erase the long-lived Controls authority registry. The Fulcio certificate key and separately registered Ed25519 verifier key both sign one canonical binding statement containing identity, issuer, root digest, repository, purposes, nonce and validity. Neither proof can silently widen the other.
5. The official verifier performs coupled checks that are unsafe to reproduce piecemeal: trusted signing time, Fulcio path and SCT, Rekor inclusion/checkpoint, Rekor entry body binding, artifact signature and certificate identity policy. Controls invokes the low-level verifier with explicit trust material and nonzero thresholds.
6. Artifact binding is a first-class regression. The 2026 Cosign advisory demonstrates that an otherwise valid Rekor entry is not enough when it is unrelated to the supplied artifact/signature/key. Controls retains both wrong-artifact and unrelated-valid-entry tests and requires `TLOG_BODY_ERROR` on the latter class.
7. Policy accepts only the exact selected bundle media type. Current `sigstore` JavaScript message signing can emit bundle v0.2 even when v0.3 is available in the ecosystem, so the runtime supports explicit v0.2 or v0.3 selection instead of inferring or rewriting a version.
8. Artifact verification and current-workload admission use different time semantics. Sigstore can validate a historical signature after its short-lived Fulcio certificate expires when trusted signing time exists. Controls additionally requires the certificate to be active at dispatch and caps evidence expiry at certificate expiry.
9. Exact identity means literal policy data. The adapter escapes and anchors the SAN only because the library API accepts a regular-expression policy; operators cannot supply a broad regex. Issuer comparison is exact.
10. Conformance material is pinned, offline and adversarial. A live public-good Fulcio/Rekor sample proves end-to-end compatibility, while upstream conformance vectors test behavior without requiring network availability during every validation run.
11. One verified inclusion proof does not establish global log consistency, non-equivocation or universal visibility. Production deployments still need TUF/root-update operations, Rekor monitoring, consistency proofs, witnesses or gossip and incident response.
12. A valid bundle authenticates a signer and event, not honest verifier execution, protected key handling, operator independence or correct software. Those assurances require separate infrastructure and evidence. Merge, release, policy and trust-root authority remain with the human decision-maker.

Implemented artifacts:

- `sigstore-trusted-root.js` and `sigstore-trusted-root-runner.js`
- `sigstore-verifier-identity-evidence.js` and `sigstore-verifier-identity-runner.js`
- `schema-files/sigstore-trusted-root.schema.json`
- `schema-files/sigstore-verifier-identity-evidence.schema.json`
- `schema-files/verifier-trust-policy.schema.json` v0.3
- `schema-files/self-improvement-cycle-order.schema.json` v0.4
- `sigstore-fixtures/` pinned real and adversarial bundles
- `run-sigstore-verifier-identity-fixtures.js`
- supervisor, readiness, validator, roadmap and skill integrations

### 8.60 Verifier Execution Integrity v0.10

Research question:

> After workload identity and attestation signatures are valid, what evidence is required to decide that the exact approved verifier code ran under the expected isolation controls against the exact repository state and target?

Primary references:

- SLSA Build Provenance v1.2: https://slsa.dev/spec/v1.2/build-provenance
- SLSA artifact verification: https://slsa.dev/spec/v1.2/verifying-artifacts
- in-toto Statement v1: https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md
- OCI image descriptor: https://github.com/opencontainers/image-spec/blob/main/descriptor.md
- OCI image manifest: https://github.com/opencontainers/image-spec/blob/main/manifest.md
- OCI runtime configuration: https://github.com/opencontainers/runtime-spec/blob/main/config.md
- OCI Linux runtime configuration: https://github.com/opencontainers/runtime-spec/blob/main/config-linux.md
- GitHub Actions OIDC reference: https://docs.github.com/en/actions/reference/security/oidc
- GitHub artifact attestations: https://docs.github.com/en/actions/concepts/security/artifact-attestations
- GitLab ID token authentication: https://docs.gitlab.com/ci/secrets/id_token_authentication/
- GitLab runner configuration and provenance: https://docs.gitlab.com/ci/runners/configure_runners/
- IETF RFC 9334 RATS architecture: https://www.rfc-editor.org/rfc/rfc9334.html
- gVisor security model: https://gvisor.dev/docs/architecture_guide/security/
- gVisor platform guide: https://gvisor.dev/docs/architecture_guide/platforms/
- Confidential Containers attestation policies: https://confidentialcontainers.org/docs/attestation/policies/

Engineering conclusions:

1. Identity, output signature and execution integrity are separate proofs. Phase 11 authenticates the current workload; an attestation authenticates a statement; Phase 12A must additionally bind the statement to approved code and a policy-described execution environment.
2. Consumer expectations remain authoritative. Following SLSA verification, a valid signature is only the first check: verifier code, image, dependencies, harness, arguments, tools, network, sandbox, repository and subject must all equal values fixed outside the evidence being evaluated.
3. The exact persisted receipt or report belongs in the in-toto `subject`; the underlying verification target and execution details belong in a typed predicate. Cannae therefore uses its own execution predicate instead of mislabeling verifier execution as standard artifact build provenance.
4. Immutable OCI identity is the image-manifest digest, not a tag. Runtime policy records `name@sha256:<digest>`, expected media type and digest so registry tag movement cannot preserve equivalence.
5. Isolation is a profile, not a boolean. Read-only root, no-new-privileges, privilege mode, host network, host PID, host mounts, network endpoints, tool allowlist and sandbox-profile digest are independently compared.
6. One signer is insufficient. The registered verifier must bind itself to the record, while a distinct policy-pinned builder or provider attestor vouches for the environment and provider claims. Both sign identical DSSE payload bytes.
7. Repository state and verification target are first-class inputs. Evidence records whether the worktree is dirty and binds its exact Git head, full worktree fingerprint, target artifact ID/path/digest and Phase 11 identity-evidence reference. A content-bound uncommitted candidate is valid; an unrecorded or mismatched state is not.
8. Provider identity is adapter-specific. GitHub and GitLab expose different issuer, workflow/project, ref, commit, runner and configuration claims. A common schema can normalize them, but native JWT and provider-provenance verification must remain separate adapters.
9. RATS distinguishes evidence appraisal from the attestation result consumed by a relying party. TEE evidence therefore needs vendor-aware appraisal under an exact policy before its measurement and result can enter the common contract.
10. A builder assertion does not itself enforce isolation. The `generic_oci` adapter verifies a trusted builder's signed claim. Native GitHub Actions, GitLab CI, local sandbox and TEE adapters must independently verify provider tokens, host isolation or hardware evidence before projection.
11. Fresh execution evidence is not a liveness challenge. Phase 12B must issue a one-time supervisor nonce with a strict deadline and replay ledger, then remove stale, replayed, offline and late responders from current quorum.
12. Declared independence is not operational independence. Phase 12C must evaluate provider, operator, account, runner pool, cloud project, infrastructure and actual failure-domain identities before counting diversity.
13. A valid execution record does not grant release authority. Merge, push, deployment, trust-policy, runtime-policy, builder-root and provider-adapter changes remain human-controlled.

Implemented artifacts:

- `docs/verifier-execution-integrity.md`
- `schema-files/verifier-runtime-policy.schema.json`
- `schema-files/verifier-execution-evidence.schema.json`
- `schema-files/verifier-trust-policy.schema.json` v0.4
- `schema-files/verification-attestation.schema.json` v0.2
- `schema-files/comparative-evaluation-attestation.schema.json` v0.2
- `verifier-execution-evidence.js` and `verifier-execution-runner.js`
- `run-verifier-execution-evidence-fixtures.js`
- runtime-policy readiness, controller manifest reload, validator, sample, roadmap and skill integrations

### 8.61 Pre-Dispatch Verifier Challenge v0.11

Research question: How can a supervisor distinguish a registered verifier from a verifier that is currently online, controls its accepted workload identity and static key, and is responding to this exact dispatch rather than replaying prior evidence?

Primary sources:

- IETF RFC 9334 RATS freshness, especially nonce-based implicit timekeeping: https://www.rfc-editor.org/rfc/rfc9334.html#section-10.2
- IETF RFC 9449 DPoP nonce and proof-replay controls: https://www.rfc-editor.org/rfc/rfc9449.html#section-11.1
- W3C Web Authentication Level 3 cryptographic challenge requirements: https://www.w3.org/TR/webauthn-3/#sctn-cryptographic-challenges
- NIST SP 800-63B replay resistance: https://pages.nist.gov/800-63-4/sp800-63b.html#replay

Engineering conclusions:

1. Freshness needs an extra round trip. An appraising entity sends an unpredictable nonce and accepts only evidence that signs the exact returned value; a previously valid identity record is not proof of current response capability.
2. Nonce state belongs to the supervisor side. A challenge must be persisted with issue time, deadline and consumption identity so stale or repeated proofs can be rejected after process restart. A dedicated policy-pinned Ed25519 issuer key authenticates supervisor origin instead of trusting an `issued_by` string.
3. Entropy and equality are separate checks. WebAuthn recommends at least 16 bytes and exact comparison. Cannae uses a stricter local minimum of 32 cryptographically random bytes per verifier and checks exact hex equality.
4. A challenge must identify the operation, not only the verifier. Campaign, mission, repository, exact trust/runtime policy references, cycle, attempt, transition, baseline, parent lineage, task and proof-requirements digests are part of one dispatch binding.
5. One set contains unique per-verifier nonces. Reusing a nonce across verifier identities creates avoidable correlation and substitution risk, so duplicate nonce values fail validation.
6. Existing Phase 11 evidence is already the correct response envelope. Both the workload credential and registered verifier key sign the nonce-bearing statement; an additional unsigned response wrapper would add complexity without assurance.
7. Readiness is purpose-specific. Only challenged responders authorized for a receipt or comparative-report purpose may count in that purpose quorum. One responder cannot fill a missing verifier, key or independence-group position.
8. Deadline enforcement is half-open: response evidence is issued at or after challenge issuance and before challenge expiry; supervisor reevaluation also occurs before expiry. Admission cannot outlive the challenge.
9. Ambiguity fails closed. Two active challenge sets matching the same dispatch can result from an unsafe issuance race, so the supervisor does not choose one arbitrarily. Expired sets remain history but do not prevent a newly signed challenge from replacing their liveness window.
10. Single use is bound to the dispatch projection. Idempotent reevaluation of the same ready order is allowed, but consumption by a different projection is replay and cannot re-enter quorum.
11. Challenge success is bounded liveness, not continuous service health or honesty. A verifier may fail after responding, and compromised current credentials can answer. Phase 12A execution evidence and Phase 12C independence remain separate controls.
12. Challenge evidence never grants release. Merge, push, deployment, policy, trust-root, runtime-policy and authority decisions remain human controlled.

Implemented artifacts:

- `docs/verifier-pre-dispatch-challenge.md`
- `schema-files/verifier-challenge-set.schema.json`
- `schema-files/verifier-trust-policy.schema.json` v0.5
- `schema-files/self-improvement-cycle-order.schema.json` v0.5
- `verifier-challenge-set.js`
- challenge-aware `verifier-trust-readiness.js` and `campaign-supervisor.js`
- `run-verifier-challenge-fixtures.js`
- valid/invalid trust-policy, challenge-set and cycle-order samples
- validator, roadmap, bounded-operations, source-map and skill routing integrations

## 9. Research Questions to Dig Into Further

1. How should the military document hierarchy be implemented as an LLM context hierarchy?
2. Can OPORD, Annex, and FRAGO be made into an actual prompt DSL?
3. How should per-agent authority levels be enforced in the system prompt?
4. How should a rule-based/model-based method for automatically detecting CCIR be designed?
5. What is the method for automatically reflecting AAR results into the next prompt and SOP?
6. What independence should the Red Team agent have?
7. How should unity of command and unity of effort be maintained in a multi-agent structure?
8. How should the boundary conditions requiring human approval be standardized?
9. How does military-style "mission command" differ across creative work, coding work, and research work?
10. What is a mission-command-style AI operating system suited to Korean organizational culture?
11. When implementing a prompt DSL validator as actual code, which missing fields should be caught first?
12. How should the tool gateway present approval required to the user as UX?
13. How can the mismatch between Korean and English military terminology be detected automatically?
14. Into what DB schema should mission state and the evidence store be separated?
15. Can an agent's readiness rating be updated automatically?
16. In a Korean organization, what UI would make Red Team findings accepted as decision-making material?
17. How densely must JSON Schema valid/invalid fixtures be built for the validator to be a meaningful gate?
18. What priority should be applied when Green/Amber/Red/Black conflict in the policy engine?
19. What should the command post dashboard hide, and what should it show first?
20. In what language should the validator CLI prototype be built, and which fixtures should be automated first?
21. What representative mission should the runtime demo scenario be based on?
22. Can the validator fixture runner automatically verify semantic issue codes as well?
23. What information density is appropriate when building the command post dashboard as static HTML?
24. Is it necessary to convert the SQL model to an event-sourcing approach?
25. Can the policy engine fixture runner also verify approval scope and expiry?
26. Can the dashboard prototype be rendered based on actual JSON state?
27. Can a mission_current_state projection be built by replaying the event log?
28. Can an event replay projection be automatically converted into dashboard-state.json?
29. Can adding a demo OPORD payload more strictly verify the mission -> OPORD -> task order flow?
30. Should the still-missing military operating domains be managed as a separate deep research queue?
31. How should B2C2WG be implemented as multi-agent scheduling and a decision packet workflow?
32. Can the authority matrix be schematized as a combination of role, task, tool, target, risk, readiness, and expiry?
33. Under what conditions should CCIR alerting branch into a dashboard notification, SITREP, or approval request?
34. How should OPSEC/classification and EEFI be turned into an LLM context sharing policy?
35. In what order should the knowledge management SOP update the decision log, evidence store, and handoff packet?
36. How are agent METL and readiness rating linked to automatic expansion/reduction of execution authority?
37. How should the decision packet schema enforce option/risk/evidence/authority/deadline?
38. When should a working group charter be opened, and when should it be disbanded?
39. By what rule should the CCIR alert router compute Red/Amber/Watch from the event log?
40. What information should the context releasability filter remove or summarize, per role?
41. How should the readiness gate combine the authority matrix and the agent readiness ledger?
42. What current state should the handoff packet schema require as mandatory during a context transition?
43. How should the context item schema standardize classification, EEFI, allowed_roles, and release_to_final?
44. How should the context filter prototype determine raw/summary/redacted/reference_only/denied delivery?
45. How should a release review determine what information can go out in the final answer?
46. How should the handoff generator combine the event replay projection with the README queue?
47. How should working group opened/prepared/closed events be entered into the replay projection?
48. How should maintenance readiness evaluate tool availability, quota, context budget, and fallback?
49. How should the maintenance-readiness schema standardize tool/resource/context/fallback state?
50. How should the release-review runner compare the context filter output with the final output constraints?
51. How should the working group projection be displayed in dashboard state?
52. How should the approval scope policy enforce approval once, constraints, expiry, and rollback?
53. How should risk acceptance authority divide retained authority by role/risk/severity/readiness?
54. How should the source-map linter fail when a new URL is not in the source-map?
55. How should the approval scope schema prevent reuse of a consumed approval?
56. How should the risk acceptance schema enforce residual risk and a supervision plan?
57. How should the maintenance readiness dashboard show unavailable/degraded tools as a commander-facing panel?
58. In what order should the policy engine compose the authority matrix, readiness gate, and release review?
59. Can an AAR finding be automatically converted into a readiness update recommendation?
60. How should the FRAGO scope-change schema change an OPORD authority boundary?
61. When building the annex schema, how should the OPORD body be distinguished from the FRAGO boundary?
62. How far can backbrief quality be evaluated with deterministic rules, without an LLM judge?
63. Can a rehearsal friction point be automatically converted into a CCIR alert and a decision packet?
64. Under what conditions should collected information branch into a running estimate, SITREP, decision packet, or FRAGO scope-change?
65. When a commander/staff member/agent is lost or replaced, what succession line, handoff, and authority pause are needed?
66. When converting a high-risk/high-uncertainty task into an SOF TF, what cell separation, enablers, rehearsal, and release gate should determine the activation go/no-go?
67. When different branches/departments collaborate, how should the supported/supporting relationship, liaison, handoff interface, and conflict decision route be enforced as a runtime contract?
68. When creating, expanding, reducing, or disestablishing a branch/duty position/unit/TF, how should capability gap, DOTMLPF-P, readiness, transition, and documentation gates be enforced as a runtime contract?
69. How should a document access manifest be enforced as a runtime gate so that each agent reads only the documents fixed for its role, duty, and authority?
70. How should local calibration thresholds and cost-quality budgets be updated from mission AAR evidence without allowing a router to self-certify readiness?

## 10. Relationship to the Current Document Set

- `military-llm-framework-v0.1.md`: overall conceptual doctrine.
- `military-operating-system.md`: models the way the military operates as an LLM operating system.
- `agent-roles-and-authority.md`: per-position approval, reporting, autonomous judgment, and after-action management.
- `decision-risk-assessment.md`: CCIR, risk, decision support, operation assessment.
- `information-to-operations-cycle.md`: the procedure by which information collection/evaluation converts into a running estimate, CCIR, SITREP, decision packet, and FRAGO.
- `personnel-continuity-model.md`: a continuity model in which duty positions and authority continue even through personnel loss/replacement/rotation.
- `interdepartment-collaboration-policy.md`: converts branch/function integration principles into inter-department supported/supporting, liaison, handoff, and conflict route policy.
- `force-structure-change-policy.md`: a policy that controls the creation, disestablishment, expansion, and reduction of branches/duty positions/units/TFs via capability gap, DOTMLPF-P, readiness, and transition order.
- `model-force-assignment-policy.md`: a mission-based policy for allocating deterministic, line, specialist, command, SOF, assurance, and reserve model profiles without inheriting authority from capability.
- `model-force-v0.2-operations.md`: the executable registry, compiler, receipt-binding, dispatch, telemetry, and reassessment procedure for heterogeneous model forces.
- `repository-artifact-isolation-policy.md`: target-repository custody, namespace, persistence, and manifest rules for multi-repository AI campaigns.
- `bounded-self-improvement-operations.md`: finite evidence-driven adaptation for active work and control-plane candidates without AI self-release or authority expansion.
- `prompt-templates.md`: OPORD, WARNO, FRAGO, SITREP, and AAR prompt templates.
- `orders-production-pipeline.md`: the order production pipeline running from request to AAR.
- `opord-annex-model.md`: the model separating responsibility between the OPORD body and annexes.
- `backbrief-and-rehearsal-sop.md`: the SOP for confirming understanding and dry-running before execution.
- `sop-library.md`: standard procedures for repeated tasks.
- `agent-battle-rhythm.md`: the cycle of reporting, meetings, decisions, and AAR.
- `functional-domains.md`: LLM mapping of warfighting functions, training, sustainment, targeting, and ROE.
- `source-map.md`: a map connecting military concepts per source to their LLM application points.
- `case-studies.md`: actual application case studies.
- `glossary.md`: the shared term dictionary.
- `evaluation-metrics.md`: the AI METL, MOP/MOE, and readiness rating evaluation system.
- `experiments.md`: experiment design for verifying the framework's effect.
- `korean-military-sources.md`: public Korean military sources and LLM application notes.
- `implementation-guide.md`: a guide for actually implementing the LLM app/agent runtime.
- `prompt-dsl.md`: a machine-readable schema for OPORD, WARNO, FRAGO, SITREP, and AAR.
- `tool-use-roe.md`: tool-use authority and approval gates.
- `llm-agent-org-chart.md`: the agent org chart, command relationships, RACI, and reporting lines.
- `korean-org-culture.md`: how to calibrate backbrief, reporting, Red Team, and approval chains for Korean organizational culture.
- `reference-architecture.md`: the reference structure for the Orchestrator, policy engine, tool gateway, and evidence store.
- `sample-runtime-state.md`: example states for mission, OPORD, task order, tool request, SITREP, and AAR.
- `prompt-dsl-validator.md`: validation rules for OPORD/WARNO/FRAGO/SITREP/AAR.
- `approval-ui-patterns.md`: user approval UI patterns before Amber/Red tool execution.
- `schema-files/`: the bundle of JSON Schemas for the prompt DSL and runtime state.
- `validator-prototype.md`: DSL validator pseudocode and test cases.
- `agent-runtime-playbook.md`: runtime operating procedures, SITREP/FRAGO/AAR, and incident response.
- `military-ai-risk-register.md`: a list of military-style AI operating risks and their controls.
- `agent-readiness-ledger.md`: per-agent readiness rating and training plan.
- `sample-payloads/`: valid/invalid JSON examples for testing schema and the validator.
- `policy-engine-rules.md`: Green/Amber/Red/Black ROE ruling rules.
- `command-post-dashboard.md`: design of the mission board, approval queue, CCIR, and evidence viewer.
- `runtime-automation-roadmap.md`: the implementation roadmap from a document framework to a tool-gated runtime.
- `evaluation-fixtures.md`: definitions of validator/policy/evidence/runtime regression test fixtures.
- `validator-cli-prototype/`: a draft Node CLI running a JSON Schema subset and semantic rules.
- `dashboard-wireframes.md`: screen wireframes for the command post dashboard.
- `data-model.sql.md`: the SQL storage model for mission/evidence/audit/readiness.
- `runtime-demo-scenario.md`: an end-to-end demo running from intake to AAR.
- `source-reliability-rubric.md`: criteria for evaluating source reliability and interpretive risk.
- `validator-cli-prototype/run-fixtures.js`: an automatic runner for validator fixture expectations.
- `policy-engine-prototype/`: a draft that separates ROE ruling functions into actual code.
- `runtime-demo-payloads/`: the actual JSON payload set for the demo mission.
- `dashboard-ui-prototype/`: the static command post dashboard HTML prototype.
- `event-sourcing-model.md`: the design of the mission event log and projections.
- `policy-engine-prototype/run-policy-fixtures.js`: automatic testing of the policy engine's expected decisions.
- `runtime-demo-runner.js`: an end-to-end runner for demo payloads and policy checks.
- `dashboard-ui-prototype/dashboard-state.json`: the JSON state that drives the dashboard prototype.
- `event-fixtures/`: a demo event log for event-sourcing replay.
- `event-replay-prototype/`: a Node prototype that replays the event log into a mission projection.
- `dashboard-ui-prototype/render-state.js`: converts the event replay projection into dashboard JSON state.
- `event-replay-prototype/run-event-fixtures.js`: automatically verifies the replay projection and the dashboard conversion's expected values.
- `runtime-demo-payloads/opord.json`: the OPORD payload for the demo mission.
- `military-operating-deep-research-queue.md`: a queue of missing military operating domains and the next research deliverables.
- `commander-handbook.md`: practical guidance for a human operating intent, authority, approval, and reporting as an AI commander.
- `b2c2wg-operating-model.md`: a multi-agent operating model for boards, bureaus, centers, cells, and working groups.
- `ccir-alerting-model.md`: converts PIR/FFIR/EEFI/decision points into dashboard alerts and routing.
- `opsec-classification-model.md`: a control model for context sharing, EEFI, releasability, and sensitive output.
- `role-document-access-policy.md`: a document access policy that lets only the documents fixed by role, duty, and authority be read.
- `knowledge-management-sop.md`: operating procedures for the decision log, evidence store, event log, and handoff packet.
- `agent-metl.md`: per-role mission-essential task lists and the readiness-to-authority link.
- `schema-files/authority-matrix.schema.json`: an authority matrix schema based on role/task/tool/target/risk/readiness.
- `sample-payloads/valid-authority-matrix.json`: a valid authority matrix fixture.
- `sample-payloads/invalid-authority-matrix-red-without-approver.json`: a Red authority semantic validation fixture.
- `schema-files/decision-packet.schema.json`: the schema for the option/risk/evidence/authority packet raised to the commander board.
- `schema-files/working-group.schema.json`: the B2C2WG charter and disband condition schema.
- `schema-files/department-collaboration-charter.schema.json`: the contract for inter-department supported/supporting relationships, liaison, synchronization, and conflict route.
- `schema-files/force-structure-change-order.schema.json`: an order schema that approves organizational creation/disestablishment/expansion/reduction via capability gap, DOTMLPF-P, authority, readiness, transition, and documentation update.
- `schema-files/ccir-alert.schema.json`: the alert object and routing contract schema.
- `schema-files/handoff-packet.schema.json`: the schema for the packet that conveys current state before a context transition.
- `alert-router-prototype/`: a Node prototype that converts the event log into a CCIR alert projection.
- `readiness-gate-prototype/`: a prototype that combines the authority matrix and readiness rating to rule on execution authority.
- `context-releasability-policy.md`: per-role context packet filtering and the EEFI release policy.
- `schema-files/context-item.schema.json`: the schema for classification, EEFI, allowed roles, and final release metadata.
- `schema-files/document-access-manifest.schema.json`: the document access manifest schema based on role, duty, and authority.
- `schema-files/release-review.schema.json`: the final output/external release review schema.
- `context-filter-prototype/`: a generator of per-role raw/summary/redacted/reference/denied context packets.
- `document-access-runner.js`: checks role/duty/authority against the manifest to generate an allowed/denied document projection.
- `run-document-access-fixtures.js`: fixtures for S2/Executor/S6 document access and blocking overbroad access.
- `handoff-generator.js`: generates a handoff packet from the event replay and alert projections.
- `decision-packet-linter.js`: a validator for board packet option/risk/evidence/deadline.
- `event-fixtures/working-group-event-fixtures.json`: the WG opened/prepared/decided/closed event log.
- `maintenance-readiness-model.md`: a model for tool/resource availability and sustainment readiness.
- `schema-files/maintenance-readiness.schema.json`: the critical asset readiness report schema.
- `schema-files/backbrief.schema.json`: the schema for the task owner's restatement of intent/task/stop condition/approval boundary.
- `schema-files/rehearsal.schema.json`: the schema for execution sequence, friction, decision point, and disposition.
- `schema-files/approval-scope.schema.json`: single-use approval, expiry, rollback, evidence, and consumption metadata.
- `schema-files/approval-consumption-event.schema.json`: the audit event by which an approval scope is consumed by actual execution.
- `schema-files/approval-revocation-event.schema.json`: the audit event by which an approval scope is revoked before execution.
- `schema-files/approval-renewal-event.schema.json`: the audit event by which an approval scope's validity period alone is extended before execution.
- `schema-files/approval-delegation-event.schema.json`: the audit event for a limited delegation of approval authority.
- `schema-files/approval-delegation-revocation-event.schema.json`: the audit event for the revocation/expiry projection of a delegated approval authority.
- `schema-files/release-gate-decision-event.schema.json`: the composite decision audit event for execution approval and information release approval.
- `schema-files/risk-acceptance.schema.json`: residual risk, authority, duration, supervision, and AAR trigger.
- `maintenance-readiness-runner.js`: converts critical runner results into a readiness report.
- `orders-dissemination-runner.js`: a verifier for the connectivity of the OPORD, task order, backbrief, and rehearsal.
- `approval-consumption-runner.js`: checks the approval scope against the consumption event's mission/action/tool/target/time/evidence.
- `run-approval-consumption-fixtures.js`: fixtures for active consumption, target mismatch, and reused approval.
- `approval-revocation-runner.js`: checks the approval scope against the revocation event's active status/authority/time/notification/evidence.
- `run-approval-revocation-fixtures.js`: fixtures for active revocation, consumed revocation, and wrong authority.
- `approval-renewal-runner.js`: checks the approval scope against the renewal event's active status/authority/window/execution-count/evidence.
- `run-approval-renewal-fixtures.js`: fixtures for active renewal, expired renewal, and scope expansion.
- `approval-delegation-runner.js`: checks the authority matrix against the delegation event's base rule/ROE/risk/context/subdelegation restrictions.
- `run-approval-delegation-fixtures.js`: fixtures for bounded delegation, a staff-retained-authority attempt, and Red base rule delegation.
- `approval-delegation-revocation-runner.js`: checks the delegation event against the termination event's status/authority/time/snapshot/evidence.
- `run-approval-delegation-revocation-fixtures.js`: fixtures for Commander revocation, recorder expiry projection, and a staff revocation attempt.
- `policy-engine-authority-integration.js`: the composite gate for policy, authority matrix, approval scope, and risk acceptance.
- `run-authority-integration-fixtures.js`: fixtures blocking reuse of a consumed approval and missing risk acceptance.
- `policy-engine-release-integration.js`: the composite gate for the authority gate and release review.
- `run-release-integration-fixtures.js`: fixtures for valid release, missing review, invalid review, and authority-blocked release.
- `release-gate-decision-runner.js`: checks the release integration output against the release gate decision event's final decision/snapshot/evidence.
- `run-release-gate-decision-fixtures.js`: fixtures for release allow, a missing-review allow claim, and an authority-blocked release event.
- `release-gate-dashboard-runner.js`: projects the ReleaseGateDecided event into the release/authority/review dashboard queue.
- `run-release-gate-dashboard-fixtures.js`: fixtures for released, release-review-blocked, and authority-blocked projections.
- `dashboard-ui-prototype/release-gate-dashboard-state.json`: the release gate dashboard projection state.
- `maintenance-dashboard-runner.js`: converts the maintenance readiness report into a ready/degraded/down dashboard projection.
- `run-maintenance-dashboard-fixtures.js`: fixtures for ready, degraded, and unavailable sustainment projections.
- `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`: the sustainment readiness dashboard projection state.
- `authority-delegation-projection-runner.js`: converts the delegated approval authority lifecycle event into a dashboard projection.
- `run-authority-delegation-projection-fixtures.js`: fixtures for active, revoked, and expired delegation projections.
- `dashboard-ui-prototype/authority-delegation-projection-state.json`: the delegated authority dashboard projection state.
- `release-review-runner.js`: compares the context filter output with the release review.
- `dashboard-ui-prototype/working-group-projection-dashboard-state.json`: the B2C2WG dashboard projection state.
- `approval-scope-policy.md`: the approval once, constraints, expiry, and rollback policy.
- `risk-acceptance-authority.md`: risk acceptance authority and commander-retained authority.
- `source-map-linter.js`: verifies official source domain coverage.
- `source-map-url-coverage-report.json`: a per-host source-map coverage snapshot of official sources.
- `aar-to-readiness-update.js`: converts an AAR finding into a readiness recommendation and follow-up action.
- `schema-files/aar-readiness-update.schema.json`: the AAR readiness update contract.
- `run-aar-readiness-update-fixtures.js`: fixtures for normal improvement, critical source failure, and a sustain-only AAR.
- `schema-files/annex.schema.json`: the contract separating the OPORD body from role-specific annex detail.
- `schema-files/frago-scope-change.schema.json`: the FRAGO contract that separates mission scope/authority changes from an annex update.
- `rehearsal-to-ccir-router.js`: converts rehearsal friction points and decision points into CCIR alerts/decision packets.
- `run-rehearsal-to-ccir-fixtures.js`: fixtures for medium/high/sensitive rehearsal routing.
- `information-to-operations-cycle.md`: the flow of information collection, evaluation, CCIR, running estimate, SITREP, decision packet, and FRAGO change.
- `schema-files/information-report.schema.json`: the contract for raw information intake and source/CCIR/handling metadata.
- `schema-files/intelligence-assessment.schema.json`: the contract for an evaluated piece of information's confidence, operational impact, and recommended output.
- `information-to-operations-router.js`: converts an information report/assessment into a CCIR alert, decision packet, SITREP, or FRAGO scope-change draft.
- `run-information-to-operations-fixtures.js`: fixtures for order change, FFIR SITREP, and EEFI release-block routing.
- `personnel-continuity-model.md`: a model for role continuity, succession, vital records, degraded mode, and rotation gate.
- `schema-files/continuity-plan.schema.json`: the contract for essential function, successor chain, vital records, and degraded mode.
- `continuity-drill-runner.js`: converts a role loss/rotation event into successor activation and paused functions.
- `run-continuity-drill-fixtures.js`: fixtures for a Commander-unavailable and an S6-rotation continuity drill.
- `ai-special-operations-tf.md`: converts US military SOF principles into an AI high-risk task force operating model.
- `schema-files/sof-tf-charter.schema.json`: the contract for SOF TF activation, cell separation, context isolation, enablers, and rehearsal.
- `sof-tf-activation-runner.js`: projects the SOF TF charter into go/no-go, approval gate, context distribution, and preflight block.
- `run-sof-tf-fixtures.js`: fixtures for valid SOF TF activation and blocking an unbounded TF.
- `department-collaboration-runner.js`: projects the collaboration charter into relationship edges, missing liaisons, commander queue, and preflight block.
- `run-department-collaboration-fixtures.js`: fixtures for valid cross-functional collaboration and blocking siloed collaboration.
- `force-structure-change-runner.js`: projects an organizational change order into a preflight block, commander queue, transition task, documentation queue, and readiness requirement.
- `run-force-structure-change-fixtures.js`: fixtures for a justified organizational creation and blocking an unjustified expansion.
- `schema-files/model-force-assignment-plan.schema.json`: contract for mission profile, immutable model profiles, billets, routing, assurance, PACE, authority, budget, and reassessment.
- `model-force-assignment-runner.js`: projects model billets, escalation paths, assurance status, PACE, resource demand, blocks, and commander decisions.
- `run-model-force-assignment-fixtures.js`: fixtures for a validated mixed model force and blocking an unready model monoculture.
- `schema-files/model-registry.schema.json`: immutable model inventory and per-task readiness source contract.
- `schema-files/model-assignment-request.schema.json`: mission billet demand and selection constraint contract.
- `model-assignment-compiler.js`: hard-filter-then-score deterministic assignment compiler.
- `schema-files/integrated-mission-preflight.schema.json`: current-wave agent, receipt, and billet binding contract.
- `integrated-mission-preflight-runner.js`: combined routing and model assignment dispatch gate.
- `schema-files/model-usage-event.schema.json`: operational model-use evidence contract.
- `run-model-force-v0.2-fixtures.js`: integrated compiler, dispatch, and unsafe-case regression suite.
- `repository-artifact-store.js`: Git-identified journaled JSON/file artifact persistence utility.
- `repository-artifact-verify.js`: pending-transaction, manifest-history, sidecar, and artifact-integrity verifier/recovery CLI.
- `schema-files/repository-artifact-manifest.schema.json`: repository namespace and artifact evidence manifest contract.
- `run-repository-artifact-isolation-fixtures.js`: same-ID cross-repository isolation, overwrite, traversal, and CLI integration fixture.
- `run-repository-artifact-concurrency-fixtures.js`: 24-writer locking and stale-lock recovery fixture.
- `run-repository-artifact-recovery-fixtures.js`: interrupted-write recovery and tamper-detection fixture.
- `verification-runner.js`: shell-free exact-argv candidate verification and receipt issuer.
- `schema-files/verification-plan.schema.json`: repository-state-bound verification command plan.
- `schema-files/verification-receipt.schema.json`: executable/output/repository-state proof receipt.
- `autonomous-improvement-controller.js`: receipt, parent lineage, and approval-consumption decision gate.
- `run-verification-runner-fixtures.js`: shell, inline code, stale state, mutation, and receipt integrity fixture.
- `run-self-improvement-fixtures.js`: proof-carrying adaptive decision and persistence integration fixture.
- `validation-suite-runner.js`: unified shell-independent whole-repository proof gate.
- `role-document-access-policy.md`: the policy that lets each agent read only the documents fixed for its role, duty, and authority.
- `schema-files/document-access-manifest.schema.json`: the per-mission document access manifest contract.
- `document-access-runner.js`: a manifest-based runner producing an allowed/denied document projection.
- `run-document-access-fixtures.js`: fixtures for role-scoped document reading and blocking overbroad access.
- `research-compendium.md`: the collection of all research material and interpretation.

Documents to add next:

- The current deep research/documentation/runtime contract queue is left in completed status.
- The next expansion opens as a separate queue once the user designates a new priority.

## Multinational Doctrine Consistency Audit

Purpose: use US military material as the baseline, but cross-check against official NATO/UK/Canadian/Korean sources so that current policy does not harden US-military-only assumptions into universal rules.

Official source families checked:

- NATO/Allied: AJP-01 Allied Joint Doctrine official GOV.UK publication page and PDF.
- UK: JDP 0-01 UK Defence Doctrine, JDP 01 UK Joint Operations Doctrine, JDP 04 Understanding and Decision-making, UK NATOTerm supplement.
- Canada: Canadian Armed Forces public page, DND reports/publications, CAF Ethos: Trusted to Serve.
- Korea: Ministry of National Defense (MND), Korea Law Information Center, Korea Institute for Defense Analyses (KIDA).
- US: ADP 6-0, JCS authorities focus paper, existing force management and SOF anchors.

Key judgments:

- `S2/S3/S4/S6` may look like US military/US Army-style staff names, so they are used only as the framework's internal function IDs.
- `COMMANDER` is the final decision authority, not an actual general/commander rank.
- The OPORD five-paragraph format is kept as the runtime normalization contract, but NATO/UK/local annex naming differences are handled as aliases.
- ROE/legal support is used only as a tool-use control analogy. Law, personal data, public disclosure, and actual organizational impact require a local jurisdiction gate.
- DOTMLPF-P is a US-derived checklist. In multinational application, it is presented alongside a capability lifecycle review.
- USSOCOM SOF Truths are used only as an AI high-risk TF heuristic. They are not used to represent another country's special operations doctrine.

Deliverables:

- `docs/multinational-doctrine-consistency-review.md`
- `schema-files/doctrine-consistency-review.schema.json`
- `sample-payloads/valid-doctrine-consistency-review.json`
- `sample-payloads/invalid-doctrine-consistency-review-us-only.json`
- `doctrine-consistency-runner.js`
- `run-doctrine-consistency-fixtures.js`
- `doctrine-consistency-fixtures/README.md`

Verification criteria:

- At least 4 source families.
- At least 3 non-US source families.
- The `adopt_us_only` disposition is prohibited.
- Alias handling is mandatory for role/staff terminology findings.
- A jurisdiction gate is mandatory for ROE/legal findings.
- Documentation updates to the source-map, compendium, schema, sample, and runner are mandatory.

## Controls Doctrine Operator Skill

Purpose: as the number of documents grows, agents run into the problem of blindly reading the entire corpus. To reduce this, a Codex skill was built to proceduralize task routing, source discipline, validation command selection, and the self-improvement loop.

Deliverables:

- `codex-skills/controls-doctrine-operator/SKILL.md`
- `.claude/skills/controls-doctrine-operator/SKILL.md`
- `codex-skills/controls-doctrine-operator/references/document-routing.md`
- `codex-skills/controls-doctrine-operator/references/self-improvement-loop.md`
- `codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js`
- `install-ai-cli-skills.sh`

Operating principles:

- First, map the request to a document family using the router.
- When the user writes directly, the user is treated as the final decision authority, and the AI performs a briefing/recommendation/validation role.
- When the AI acts on the user's behalf, document access and execution scope are restricted by role, department, authority, task, and need-to-know.
- The Claude Code CLI project skill calls the same router and coverage gate, so it shares the same document system as the Codex skill.
- The install script checks/creates the skill folders for the Codex CLI and Claude Code CLI and installs each skill as a symlink.
- Read only the necessary primary docs, and confirm the evidence in the source-map.
- A runtime contract change updates the schema, valid sample, invalid sample, runner, and fixture together.
- The router scans the repo inventory and connects Markdown/HTML documents, JSON schemas, sample/runtime payloads, fixtures, runner/prototype scripts, and skill metadata to a route category.
- After a task, an AAR question identifies routing gaps, validation gaps, and source-map gaps.
- If a gap has repeat value, the skill reference/script itself is updated.

Verification:

- Ran `route_controls_docs.js` against 3 representative questions to confirm routing for authority/release, schema/fixture, and multinational source verification.
- Confirmed, per `node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .`, that of 329 routable artifacts, 329 were routed and 0 were unrouted.
- The skill validator was run against a temporary PyYAML target and passed.
