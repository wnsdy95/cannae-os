# Validator CLI Prototype

This is a dependency-free Node.js prototype for validating the military-style LLM runtime payloads.

It performs two layers of checks:

1. A small JSON Schema subset used by this repository's `schema-files/*.schema.json`.
2. Semantic military-control rules such as missing intent, Red tool request without approval, Black action blocking, MOP-only assessment, and authority matrix safety.

The prototype is intentionally small. It is not a complete JSON Schema implementation.

## Usage

```bash
node validator-cli-prototype/validate.js sample-payloads/valid-mission.json mission
node validator-cli-prototype/validate.js sample-payloads/invalid-mission-missing-intent.json mission
node validator-cli-prototype/validate.js sample-payloads/invalid-tool-request-red-without-approval.json tool-request
node validator-cli-prototype/validate.js sample-payloads/valid-authority-matrix.json authority-matrix
node validator-cli-prototype/validate.js sample-payloads/valid-decision-packet.json decision-packet
node validator-cli-prototype/validate.js sample-payloads/valid-context-item.json context-item
node validator-cli-prototype/validate.js sample-payloads/valid-release-gate-decision-event.json release-gate-decision-event
node validator-cli-prototype/validate.js sample-payloads/valid-maintenance-readiness.json maintenance-readiness
node validator-cli-prototype/validate.js sample-payloads/valid-backbrief.json backbrief
node validator-cli-prototype/validate.js sample-payloads/valid-rehearsal.json rehearsal
node validator-cli-prototype/validate.js sample-payloads/valid-approval-scope.json approval-scope
node validator-cli-prototype/validate.js sample-payloads/valid-approval-consumption-event.json approval-consumption-event
node validator-cli-prototype/validate.js sample-payloads/valid-approval-revocation-event.json approval-revocation-event
node validator-cli-prototype/validate.js sample-payloads/valid-approval-renewal-event.json approval-renewal-event
node validator-cli-prototype/validate.js sample-payloads/valid-approval-delegation-event.json approval-delegation-event
node validator-cli-prototype/validate.js sample-payloads/valid-approval-delegation-revocation-event.json approval-delegation-revocation-event
node validator-cli-prototype/validate.js sample-payloads/valid-risk-acceptance.json risk-acceptance
node validator-cli-prototype/validate.js sample-payloads/valid-force-structure-change-order.json force-structure-change-order
node validator-cli-prototype/validate.js sample-payloads/valid-model-force-assignment-plan.json model-force-assignment-plan
node validator-cli-prototype/validate.js sample-payloads/valid-model-registry.json model-registry
node validator-cli-prototype/validate.js sample-payloads/valid-model-assignment-request.json model-assignment-request
node validator-cli-prototype/validate.js sample-payloads/valid-integrated-mission-preflight.json integrated-mission-preflight
node validator-cli-prototype/validate.js sample-payloads/valid-model-usage-event.json model-usage-event
node validator-cli-prototype/validate.js sample-payloads/valid-document-access-manifest.json document-access-manifest
node validator-cli-prototype/validate.js sample-payloads/valid-routing-receipt-agent-s3.json routing-receipt
```

## Exit Codes

- `0`: no `error` or `critical` issues.
- `1`: at least one `error` or `critical` issue.
- `2`: CLI usage or file loading failure.

## Supported Document Types

- `mission`
- `agent`
- `opord`
- `task-order`
- `tool-request`
- `approval-request`
- `sitrep`
- `frago`
- `evidence`
- `aar`
- `readiness-ledger`
- `authority-matrix`
- `decision-packet`
- `working-group`
- `sof-tf-charter`
- `department-collaboration-charter`
- `force-structure-change-order`
- `model-force-assignment-plan`
- `model-registry`
- `model-assignment-request`
- `integrated-mission-preflight`
- `model-usage-event`
- `document-access-manifest`
- `ccir-alert`
- `handoff-packet`
- `continuity-plan`
- `context-item`
- `release-review`
- `release-gate-decision-event`
- `maintenance-readiness`
- `backbrief`
- `rehearsal`
- `approval-scope`
- `approval-consumption-event`
- `approval-revocation-event`
- `approval-renewal-event`
- `approval-delegation-event`
- `approval-delegation-revocation-event`
- `risk-acceptance`
- `routing-receipt`

## Current Limits

- Supports only the JSON Schema subset currently used in `schema-files/`.
- Does not yet resolve recursive or remote refs.
- `format` is treated as a warning-level lightweight check.
- Semantic rules are intentionally conservative.
