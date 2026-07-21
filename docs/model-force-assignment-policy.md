# Model Force Assignment Policy

## 0. Purpose

This document defines how to allocate LLMs and smaller or specialized model variants to line units, specialist branches, command staff, AI special operations task forces, independent assurance, and reserve capacity.

The policy answers four separate questions:

1. Which model profile is competent for the assigned mission-essential task?
2. Which role or billet should use that profile?
3. What authority may that role exercise?
4. When should the runtime escalate, fall back, replace, or stand down the model?

These questions must not be collapsed into a single assumption that a more capable model deserves more authority.

```text
Model capability is not role.
Role is not authority.
Authority is not readiness.
Readiness is not permanent.
```

The human user remains the final decision authority. A model assignment may improve performance, but it cannot approve its own release, accept its own high risk, or expand its own authority.

## 1. Source Anchors

### 1.1 Military and organizational anchors

- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716
- AR 71-32, Force Development and Documentation: https://history.army.mil/Portals/143/Images/Covid/PDF/r71_32.pdf
- USSOCOM SOF Truths: https://www.socom.mil/about/sof-truths

Military-derived interpretation:

- Assign capability against mission-essential tasks, not prestige or a general impression of quality.
- Preserve command relationships and authority boundaries when changing personnel or equipment.
- Treat scarce high-capability models as managed force capacity, not the default for every task.
- Special operations require selected operators, readiness, enablers, and support; they are not a mass of expensive executors.

### 1.2 LLM routing and evaluation anchors

- RouteLLM: https://arxiv.org/abs/2406.18665
- FrugalGPT: https://arxiv.org/abs/2305.05176
- Language Model Cascades: https://proceedings.iclr.cc/paper_files/paper/2024/file/11f5520daf9132775e8604e89f53925a-Paper-Conference.pdf
- RouterBench: https://arxiv.org/abs/2403.12031
- HELM: https://crfm.stanford.edu/2022/11/17/helm.html
- Berkeley Function-Calling Leaderboard: https://gorilla.cs.berkeley.edu/leaderboard
- tau-bench: https://arxiv.org/abs/2406.12045
- NIST AI RMF Generative AI Profile: https://doi.org/10.6028/NIST.AI.600-1
- NIST AI RMF Core: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
- Judging LLM-as-a-Judge: https://arxiv.org/abs/2306.05685
- Confident or Seek Stronger: https://arxiv.org/abs/2502.04428

Research-derived interpretation:

- Model routing can reduce cost while preserving quality, but the router itself must be evaluated.
- No single model is best across all tasks, domains, latency targets, and cost points.
- Cascade performance depends on a reliable scoring or judge function. Weak judges can erase routing gains.
- Verbal confidence is not sufficient evidence for escalation or acceptance; confidence must be calibrated against held-out tasks and combined with deterministic evidence.
- Tool use and long-horizon policy compliance require their own evaluations rather than general chat benchmarks.
- Independent review and repeatable TEVV reduce correlated blind spots and internal evaluation bias.

## 2. The Assignment Unit

Do not assign a product name alone. Assign a versioned model profile.

```yaml
model_profile:
  id: MP-LINE-01
  model_family: provider-or-open-family
  model_version: immutable-version
  harness_version: agent-runtime-version
  capability_band: C1
  force_classes: [line]
  deployment_boundary: approved-cloud-or-local
  evaluated_tasks:
    - structured-document-drafting
    - repository-navigation
  readiness_rating: T
  evidence:
    - eval-run-2026-07
  limitations:
    - no-production-mutation
```

The minimum identity is:

```text
model family + immutable model version + system prompt + tool schema + runtime harness + task + environment
```

Changing any material component creates a new evaluation subject. A floating alias such as `latest` is not sufficient for a stable mission assignment.

## 3. Capability Bands

Capability bands describe resource and reasoning capacity. They do not grant authority.

| Band | Description | Typical use | Default constraint |
| --- | --- | --- | --- |
| C0 | Deterministic or non-generative automation | Parsing, schema validation, exact transforms, policy gates | No open-ended judgment |
| C1 | Efficient small or standard model | Classification, extraction, routine drafting, bounded repository work | Escalate ambiguity and failed verification |
| C2 | Advanced general or domain-specialized model | Multi-step implementation, domain analysis, tool planning | Requires task-specific readiness evidence |
| C3 | Highest validated reasoning capacity available | Mission analysis, cross-domain synthesis, novel high-complexity planning | Scarce capacity; no authority inheritance |

Smaller does not mean lower quality for every task. A C1 model that is trained or evaluated for one narrow task can be preferable to a C3 general model on that task.

## 4. Force Classes

### 4.1 Utility and deterministic support

Use C0 components before an LLM where the result can be computed exactly.

Examples:

- JSON Schema validation
- link checking
- timestamp ordering
- policy matching
- diff and inventory generation

This is the equivalent of standard equipment and procedure, not a reasoning billet.

### 4.2 Line units

Line units perform high-volume, repeatable, reversible work under established SOPs.

Default allocation:

- C1 primary model
- task readiness T or P
- narrow context manifest
- Green execution only by default
- C2 escalation target
- deterministic validator before completion

Suitable missions:

- document formatting and structured drafting
- extraction and classification
- routine code edits with tests
- known repository workflows
- first-pass source intake

Line units should not receive a C3 model merely because capacity is available. Promote the task when complexity or risk requires it; do not permanently over-equip routine throughput.

### 4.3 Specialist branches

Specialist branches are selected by METL evidence, not model size.

Examples:

- source reliability and research
- code generation and repository operations
- legal or compliance support
- quantitative analysis
- tool calling
- release and OPSEC review
- multilingual analysis

Default allocation:

- C1, C2, or C3 according to task-specific evaluation
- domain corpus or retrieval access only when authorized
- specialist tool set
- explicit limitations and out-of-domain escalation
- line-unit enablers for repetitive support work

A specialist model must not be treated as a commander. Domain competence does not include scope change, risk acceptance, or final release authority.

### 4.4 Command staff

Command models support intent preservation, mission analysis, task decomposition, cross-functional integration, and decision packet preparation.

Default allocation:

- C3 primary model for novel or cross-domain missions
- C2 alternate for routine staff integration
- broad but policy-filtered context
- no direct production or irreversible tool authority by virtue of assignment
- human Commander retains final decisions

Command models should spend tokens on:

- identifying the actual decision
- decomposing work into billets
- detecting conflicts between reports
- comparing options, risk, evidence, and resource demand
- deciding when the plan needs a FRAGO or escalation request

They should not perform every line-unit task themselves. Command capacity is reserved for integration and judgment support.

### 4.5 AI special operations task force

An AI SOF TF receives a mixed, selected roster rather than a stack of identical frontier models.

Minimum composition:

- C3 command/integration profile
- one or more C2/C3 specialist profiles with T/P task readiness
- C1/C2 line enablers for bounded support
- C2/C3 independent assurance profile from a different model family where feasible
- C0 deterministic policy, schema, and release gates
- primary, alternate, contingency, and emergency fallback

Activate this force only under `docs/ai-special-operations-tf.md`. High risk raises verification and approval requirements; it never creates broader autonomy.

### 4.6 Independent assurance and Red Team

Assurance is a separate force class, not simply a second call to the executor.

Default allocation:

- different model family from the primary executor when feasible
- no access to the executor's hidden reasoning or self-evaluation
- access to mission intent, output, evidence, tests, and policy boundaries
- reference-guided or rubric-guided evaluation
- deterministic checks before or alongside LLM judgment
- no authority to approve its own finding or execute the remediation

Same-family review may still be used as a warning signal, but it must be labeled as correlated review rather than independent assurance.

### 4.7 Reserve and fallback

Every mission-critical model profile requires a PACE-style plan.

| Level | Purpose |
| --- | --- |
| Primary | Normal assigned model profile |
| Alternate | Equivalent task coverage through another approved profile |
| Contingency | Reduced-capability workflow with additional supervision |
| Emergency | Stop, preserve state, and hand off to the human Commander |

Fallback must preserve authority, context classification, and release boundaries. A provider outage does not authorize sending restricted context to an unapproved model.

An alternate or contingency profile is not valid merely because its endpoint exists. It must be evaluated for the billet's task and force class, hold at least P readiness, accept the same context class, and remain inside an approved mission deployment boundary. Command, SOF, and assurance billets require both alternate and contingency depth.

## 5. Mission Classification Before Model Selection

Classify the mission before selecting a model.

| Dimension | Low | Medium | High |
| --- | --- | --- | --- |
| Reasoning complexity | Template or single-step | Multi-step with known pattern | Novel, cross-domain, conflicting constraints |
| Domain specialization | General language | Known specialist vocabulary | Expert interpretation or regulated domain |
| Uncertainty | Ground truth and validator available | Partial evidence | Conflicting or missing evidence |
| Tool complexity | No tool or read-only | Multiple reversible tools | Production, credentials, external mutation |
| Context sensitivity | Public | Internal or role-limited | Restricted, EEFI, regulated data |
| Release impact | Internal draft | Shared internal decision | Final, external, legal, or public |
| Volume and latency | Low volume | Mixed | High-volume or time-critical |

Precedence order:

1. Prohibited actions and deployment boundaries
2. Context classification and releasability
3. Required task readiness
4. Risk floor and human approval requirement
5. Domain specialization
6. Reasoning complexity
7. Latency, throughput, and cost optimization

Cost never overrides a safety, authority, context, or readiness block.

## 6. Default Assignment Matrix

| Mission type | Primary force | Model band | Required support | Escalation |
| --- | --- | --- | --- | --- |
| Exact validation or transform | Utility | C0 | Recorder | Fail closed |
| Routine Green task | Line | C1 | C0 validator | C2 specialist |
| Ambiguous but reversible task | Line under supervision | C1/C2 | Backbrief, evaluator | C2/C3 command staff |
| Domain-specific analysis | Specialist branch | Best task-evaluated band | Source/evidence or tool fixture | Command staff on cross-domain conflict |
| Multi-step tool workflow | Specialist execution | C2 | BFCL-like and local tool eval, C0 gate | C3 planner plus approval gate |
| Mission analysis and tasking | Command staff | C3 | CoS, authority matrix | Human Commander |
| High-risk short mission | AI SOF TF | Mixed C1-C3 | Independent assurance, PACE, release/risk gates | Human Commander |
| Final or external release | Release specialist + assurance | C2/C3 | Context filter, release review | Human Commander |
| Black action | None | None | Policy block | No escalation to execution |

## 7. Routing and Cascade Rules

### 7.1 Start-low applies only to eligible missions

For low-risk, reversible, well-instrumented work:

```text
C0 check -> C1 line model -> deterministic verification
                         -> C2 specialist if verification or routing gate fails
                         -> C3 command staff if the task becomes novel or cross-domain
```

Do not start a high-risk mission on a weak model merely to save cost. Red, sensitive, novel, or final-release work receives its required force composition at assignment time.

### 7.2 Escalation evidence

Escalate when one or more of the following occurs:

- The task is outside the model profile's evaluated METL.
- A schema, test, source, policy, or tool check fails.
- Sources conflict or the evidence threshold is not met.
- The model selects an unavailable or unauthorized tool.
- The task crosses an authority, context, release, or risk boundary.
- The output disagrees materially with an independent profile.
- Calibrated routing confidence falls below its task threshold.
- Retry, context, latency, or cost limits are reached.
- The mission changes from routine to novel or cross-domain.

The model's verbal statement that it is confident is not sufficient escalation or acceptance evidence.

### 7.3 De-escalation and return to line units

Return work to a lower-cost force only when:

- the command or specialist question has been resolved;
- scope and acceptance criteria are now explicit;
- the remaining work is reversible and within the lower model's METL;
- the context packet can be narrowed safely;
- deterministic verification remains available.

## 8. Model Readiness and Evaluation

Readiness is recorded per immutable model profile and task.

```text
readiness = model profile x task x tool set x context class x runtime version
```

Minimum scorecard:

| Metric | Why it matters |
| --- | --- |
| Task success | Measures the assigned METL, not generic intelligence |
| Policy compliance | Prevents task completion through prohibited actions |
| Tool-call correctness | Measures function choice, arguments, and multi-step state |
| Source fidelity | Measures claim-to-evidence linkage and abstention |
| Calibration | Measures whether routing confidence predicts correctness |
| Robustness | Measures prompt variation, adversarial input, and distribution shift |
| Consistency | Uses repeated trials or pass^k rather than one successful run |
| Latency and throughput | Determines operational suitability |
| Token and financial cost | Determines sustainment |
| Context and data boundary | Determines whether the profile may receive the packet |

Evaluation sources such as HELM, BFCL, and tau-bench are reference inputs, not substitutes for local mission fixtures. The decisive evidence is performance under conditions similar to the actual deployment.

Readiness rules:

- A new model or material version starts at X for every untested task.
- Passing a broad benchmark does not grant T readiness on a local specialist task.
- A router has its own readiness rating and held-out evaluation set.
- A model judge cannot be the only evidence for its own family.
- Model replacement, prompt changes, tool-schema changes, and harness changes trigger reassessment.

## 9. Authority Separation

The model assignment plan must carry an authority scope copied from the role and mission contract. It must never infer authority from capability band.

Examples:

| Assignment | Capability | Authority |
| --- | --- | --- |
| C3 Commander-support model | High | Draft intent and decision packets; no human risk acceptance |
| C2 deployment specialist | High on deployment METL | Prepare and rehearse; production mutation still Red |
| C1 line documentation model | Narrow and efficient | Green local edits within scope |
| C3 Red Team model | High | Findings and no-go recommendation; no remediation execution |

Any rule equivalent to `if model is stronger, allow more tools` is prohibited.

## 10. Assignment Procedure

```text
1. Define the mission and METL
2. Classify risk, context, release, tool, complexity, latency, and volume
3. Filter the registry by deployment and context eligibility
4. Filter by task readiness and local evaluation evidence
5. Set the minimum force composition required by risk
6. Optimize eligible profiles for quality, latency, throughput, and cost
7. Assign role authority independently from the model profile
8. Attach independent assurance and PACE where required
9. Backbrief and run model-assignment preflight
10. Execute, monitor escalation triggers, and record model usage
11. Update readiness and routing thresholds through the AAR
```

## 11. Runtime Contract

The operational procedure is `model-force-v0.2-operations.md`.

The v0.1 projection contract is `schema-files/model-force-assignment-plan.schema.json`. It validates a materialized plan and remains the stable interface for active billet, assurance, PACE, and authority checks.

It records:

- mission profile and risk floor;
- immutable model profiles and task readiness;
- line, specialist, command, SOF, assurance, and reserve billets;
- role authority kept separate from model capability;
- routing and escalation rules;
- independent assurance controls;
- PACE fallback;
- budget and review lifecycle.

`model-force-assignment-runner.js` projects the plan into:

- `assignment_status`;
- active model billets;
- escalation routes;
- assurance and PACE status;
- resource summary;
- preflight blocks and commander queue.

The v0.2 source and dispatch contracts are:

- `schema-files/model-registry.schema.json`: immutable model identities and per-task readiness evidence;
- `schema-files/model-assignment-request.schema.json`: mission-defined billet demand and selection constraints;
- `model-assignment-compiler.js`: hard-filter-then-score deterministic plan compiler;
- `schema-files/integrated-mission-preflight.schema.json`: agent, receipt, and billet binding manifest;
- `integrated-mission-preflight-runner.js`: combined routing and model assignment dispatch gate;
- `schema-files/model-usage-event.schema.json`: post-dispatch operational telemetry;
- `run-model-force-v0.2-fixtures.js`: valid and unsafe end-to-end regression cases.

The v0.2 compiler materializes the v0.1 plan. The integrated preflight then requires both the routing projection and model-assignment projection to be ready before it emits dispatch rows.

## 12. Anti-Patterns

- Assigning the most expensive model to every agent.
- Treating a small model as a general soldier without task-specific evaluation.
- Treating a specialist model as a commander.
- Giving a command model direct execution authority because it reasons well.
- Using the same model instance as executor, evaluator, and final approver.
- Escalating solely because the model says it lacks confidence.
- Accepting output solely because the model says it is confident.
- Routing sensitive context to an unapproved fallback during an outage.
- Using a floating model alias without reevaluation.
- Optimizing only token cost while ignoring failure, latency, review, and incident cost.
- Keeping a C3 or SOF roster active after the mission no longer requires it.

## 13. Conclusion

The goal is not to give every agent the best available model. The goal is to give every billet the least costly model profile that is demonstrably ready for its mission, while assigning stronger planning, specialist, assurance, and fallback capacity where complexity and risk require it.

```text
Line work scales through standardization.
Specialist work scales through task fitness.
Command work scales through integration.
Special operations scale through selection and support.
Assurance scales through independence and evidence.
Authority always remains a separate control.
```
