# Implementation Candidate Registry

## Purpose

The canonical [registry](implementation-candidate-registry.json) connects each
doctrine implementation proposal to actual source files, acceptance criteria,
executable checks, and remaining work. It is an engineering inventory, not a
military source, execution approval, or proof that the whole product is finished.
The [completion backlog](completion-backlog.md) also retains roadmap and
operational requirements that do not occur in candidate sections.

## Source And Identity

The scanner reads Git-tracked and non-ignored new Markdown files under `docs/`.
It recognizes a numbered or unnumbered `Implementation Candidates` heading and
its bullet or numbered list, ending at the next same-level or higher heading.
Fenced code is excluded. A leading backticked filename or directory identifies
an artifact; other list items identify capabilities. Inline filenames are
supporting references, not extra candidates. This is the corpus's constrained
Markdown convention, not a general Markdown parser.

Each ID is `IC-` plus the first 16 hexadecimal characters of
SHA-256(document path + NUL + candidate key). Identical filenames in different
documents remain separate requirements. Each source section has a SHA-256 over
its normalized-LF text. Changing requirements, removing a section, or adding a
candidate makes the existing audit fail until an operator reviews the mapping.

Do not delete an unresolved requirement to make the audit pass. A renamed or
equivalent implementation belongs in `implementation_paths`; keep its original
proposal as `candidate_key`. For example, the CoS proposal
`battle-rhythm-scheduler-schema.json` maps to
`schema-files/battle-rhythm-scheduler.schema.json`, not a duplicate schema.

## Status Rules

| Status | Required meaning |
| --- | --- |
| planned | Required behavior is not yet demonstrated; name the remaining work. Related files may be mapped without claiming they satisfy it. |
| partial | Existing mapped implementation supports part of the requirement; explicitly identify what is still missing. |
| implemented | Every criterion has a dedicated check, actual implementation files are mapped, and no work remains for this particular requirement. |

`implemented` is a reviewed declaration. `audit` validates its structure and
source bindings but does not execute checks. `verify` runs the mapped checks
and reports `verified_implemented_ids` only after all selected checks pass
without repository drift. A passing generic validator suite does not prove a
runtime, UI, integration, or the rest of its doctrine is complete. Map that
suite to schema-only requirements; use focused integration checks elsewhere.

Planned filenames are not mandatory architecture. Reuse existing implementations
when they meet the requirement. File existence, a related prototype, or a
successful unrelated test does not establish equivalence. Reviewers must assess
test adequacy: this registry cannot mechanically prove that prose is satisfied.

## Operator Workflow

1. Start with `node implementation-candidate-registry.js audit`. Read only the
   selected workstream's source documents and mapped files.
2. Before changing a candidate section, run `scan` and inspect the affected
   identity and section digest. Edit the registry in the same change; there is
   deliberately no automatic status promotion or blanket acceptance command.
3. Implement a coherent behavior with its schemas, valid/invalid examples,
   negative fixtures, integration, and both skills. Replace remaining work only
   with a concrete result or a narrower explicit residual requirement.
4. Map checks that actually cover every criterion. Run `verify --workstream
   <id>` or `verify --candidate <id>` against a stable worktree, then run the
   normal complete regression gate before integration.
5. Retain the result through `repository-artifact-store.js` in the target
   repository's mission/wave namespace when using mission evidence. Bind that
   evidence by manifest path and hash. Never substitute an editable status row
   or stdout claim for controller-admitted verification receipts.
6. Update the README, source map, compendium, doctrine index, and completion
   backlog when their corresponding scope changes. A registry subset passing
   does not close the overall backlog or authorize publication.

Commands from the Controls repository root:

```bash
node implementation-candidate-registry.js scan
node implementation-candidate-registry.js audit
node implementation-candidate-registry.js verify --workstream staff-coordination
node run-implementation-candidate-registry-fixtures.js
```

## Execution Boundary

Only dedicated, argument-free Node fixture scripts at the root or supported
prototype directories may be mapped. Aggregate and registry-self suites are
excluded to prevent recursive verification. Paths must be regular files in the
source inventory and resolve inside the repository; shell syntax and symlink
escapes fail. Checks run with `shell: false`, a five-minute per-command timeout,
bounded output, and an environment that does not forward provider tokens or
Node preload options. The result retains output digests and byte counts, not
raw output. Commands are deduplicated and execution stops on failure or drift.

These checks execute trusted repository code, not sandboxed hostile code. A
malicious script can access the host account and transient effects are not
proven absent by a final source digest. Use the protected gateway/sandbox for
that threat model. Success never grants release, execution, policy, or authority
permission. A subset's completion is reported separately from the entire
registry; neither means the entire completion backlog is done.

## Validation

The contract is
[`implementation-candidate-registry.schema.json`](../schema-files/implementation-candidate-registry.schema.json).
The generic validator checks unique identities, reference integrity, ID binding,
and completion semantics. The registry auditor checks the live corpus, source
digests, mapped files, and check commands. Its adversarial fixtures cover parser
boundaries, missing candidates, source drift, false completion, unsafe paths,
failed checks, source mutation, and timeouts. CI and the unified proof gate run
the live audit so stale mappings cannot silently remain green.

Related policy: [Knowledge Management SOP](knowledge-management-sop.md),
[Runtime Roadmap](runtime-automation-roadmap.md), and
[Research Queue](military-operating-deep-research-queue.md).
