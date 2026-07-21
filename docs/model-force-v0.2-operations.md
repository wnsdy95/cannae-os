# Model Force v0.2 Operations

## 0. Purpose

This document turns the model force assignment policy into an executable deployment procedure for heterogeneous multi-agent missions.

The central rule is:

```text
No registry evidence -> no eligible model.
No compiled billet -> no agent binding.
No routing receipt -> no dispatch.
No integrated preflight -> no model call.
Model capability never grants authority.
```

The human user remains final decision authority. The compiler selects qualified capacity; it does not approve release, accept risk, or change the agent's delegated role.

## 1. Source Of Truth

Four objects control the lifecycle.

| Object | Owner | Function |
| --- | --- | --- |
| `ModelRegistry` | S4, CoS, or Commander | Versioned inventory of model identities, deployment boundaries, task readiness, evidence, cost, latency, and availability |
| `ModelAssignmentRequest` | Mission staff under human authority | Exact registry ID/version, billets, task requirements, context/tool boundaries, force composition, assurance, budget, and scoring policy |
| `IntegratedMissionPreflight` | CoS/S3 runtime control | Binds accepted routing receipts and compiled billets to named agents |
| `ModelUsageEvent` | Runtime and evidence store | Records the model identity, authority snapshot, outcome, cost, latency, evidence, and transition |

The registry stores endpoint references, never credentials. A model identity is not only a provider model name. It is the immutable combination of model version, harness version, system prompt version, tool schema version, task, and operating environment.

## 2. Operational Flow

```text
Mission / OPORD / organization
  -> define required billets and retained human authority
  -> create ModelAssignmentRequest
  -> load approved ModelRegistry
  -> apply hard eligibility filters
  -> score only eligible profiles
  -> compile ModelForceAssignmentPlan
  -> run v0.1 plan projection and safety checks
  -> collect CoS wave receipt and S3 agent receipts
  -> bind agents, receipts, and compiled billets
  -> run IntegratedMissionPreflight
  -> emit dispatch manifest and usage event templates
  -> dispatch through the runtime/tool gateway
  -> record ModelUsageEvent
  -> feed incidents and outcomes into AAR/readiness review
```

The v0.1 plan remains the stable projection contract. v0.2 adds the controlled source registry, deterministic compiler, binding gate, and operational telemetry around that plan.

## 3. Hard Filters Before Scoring

The compiler rejects a candidate before scoring when any of these conditions fail:

- profile is explicitly excluded or unavailable;
- model, harness, system prompt, or tool schema version is floating;
- endpoint reference appears to contain secret material;
- required force class is absent;
- deployment boundary is not approved for the mission;
- context class is not permitted;
- exact mission task has no readiness record;
- readiness is below the billet threshold;
- requested tool impact was not evaluated;
- readiness evidence is missing or expired;
- primary load limit is reached;
- required family separation would be violated.

Registry governance also fails closed when human final decision authority is missing, floating versions are not prohibited, ownership is outside S4/CoS/Commander, profile IDs collide, or task-readiness records are duplicated.

Cost or latency cannot compensate for a failed hard filter.

## 4. Deterministic Selection

Only eligible profiles enter weighted scoring:

```text
score = quality * quality_weight
      + policy_compliance * policy_weight
      + cost_score * cost_weight
      + latency_score * latency_weight
```

Weights must total 100. Equal scores are resolved deterministically by cost, then the least excessive capability band, then profile ID. This makes the same registry and request produce the same assignment.

Command, SOF, and assurance primaries use distinct model families when required. Fallbacks are selected at P readiness or above and must satisfy the same deployment, context, task, tool, evidence, and expiry gates. Critical billets require alternate and contingency depth.

## 5. Agent Binding And Dispatch

The integrated preflight treats three identities as separate:

```text
agent identity != billet authority != model identity
```

Every dispatched agent must have:

1. an accepted receipt for the current mission and wave;
2. one compiled, dispatch-required billet;
3. one immutable primary model profile;
4. an authority and tool scope inherited from the billet, not the model;
5. approved fallback profile IDs;
6. the documents recommended by its routing receipt.

The preflight blocks path traversal, missing or duplicate bindings, stale or wrong-agent receipts, mission/wave/classification mismatch, unbound expected agents, unbound required billets, registry identity mismatch, and any blocked routing or model-assignment projection.

Only a `ready` projection contains a dispatch manifest. A blocked projection emits no dispatch rows.

## 6. Runtime Use

Validate the source objects:

```bash
node validator-cli-prototype/validate.js sample-payloads/valid-model-registry.json model-registry
node validator-cli-prototype/validate.js sample-payloads/valid-model-assignment-request.json model-assignment-request
```

Compile the plan:

```bash
node model-assignment-compiler.js \
  sample-payloads/valid-model-registry.json \
  sample-payloads/valid-model-assignment-request.json
```

Run the integrated gate:

```bash
node integrated-mission-preflight-runner.js \
  sample-payloads/valid-integrated-mission-preflight.json
```

The runtime must consume only `dispatch_manifest` rows emitted by a `ready` integrated preflight. It must resolve `endpoint_ref` through an external secret manager and must not copy credentials into the registry, plan, manifest, or usage event.

## 7. Telemetry And Reassessment

Create one `ModelUsageEvent` for each dispatched agent execution. Record:

- mission, wave, agent, billet, and immutable model identity;
- authority and tool-scope snapshot;
- release target and outcome;
- latency, token use, and estimated cost;
- deterministic or external evidence;
- escalation, fallback, failure code, and resulting state transition.

Usage events do not change readiness automatically. AAR review compares outcomes against the task evaluation and then issues a controlled readiness update. Model, prompt, harness, tool schema, deployment, or material policy changes require reevaluation before returning the profile to T/P readiness.

## 8. Stop Conditions

Stop dispatch and preserve state when:

- a registry evaluation expires or the selected profile becomes unavailable;
- authority, context, release target, tool impact, or mission scope changes;
- deterministic validation fails;
- the current model exceeds its retry ceiling;
- assurance independence collapses;
- no qualified fallback remains;
- a receipt, binding, or identity cannot be reconciled.

Resume only through a new request/compilation/preflight cycle or explicit human decision within the applicable authority policy.

## 9. Regression Gate

```bash
node run-model-force-v0.2-fixtures.js
node run-model-force-assignment-fixtures.js
node validator-cli-prototype/run-fixtures.js
```

The v0.2 fixture set verifies a valid mixed force, unsafe registry blocking, prohibited Black/authority-inheriting requests, exact registry-snapshot binding, secret-bearing endpoint rejection, integrated dispatch generation, unbound-agent blocking, and rejection of self-authorized telemetry.
