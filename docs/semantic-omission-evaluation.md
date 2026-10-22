# Semantic Omission Evaluation

## Current Boundary

This is a local collector with an opt-in
[authenticated transfer ceremony](model-transfer-consent.md), not an enabled
semantic admission gate or an automatic planner. It compares retained request bytes with the actual compiled
order and every receiver task. Unused analysis statements cannot hide missing
downstream restrictions. All eight program outcomes remain open.

The USER selected the existing Codex CLI login. No new API key, copied account
token, public-CI login or credential-file inspection is needed. Official
[non-interactive CLI documentation](https://developers.openai.com/codex/noninteractive)
describes saved authentication, JSONL, ephemeral sessions and output schemas.
The pinned local profile additionally uses options checked against CLI 0.162.1.
Those settings are project policy, not proof of a protected execution environment.

## Prepare Without Transmission

```bash
node semantic-omission-evaluator.js prepare \
  --repository <target-repository> --draft-id <retained-order-draft-id> \
  --artifact-root <artifact-root>
```

Installed skills provide the same prepare-only command through
`codex-skills/controls-doctrine-operator/scripts/evaluate_controls_request.js`
and `.claude/skills/controls-doctrine-operator/scripts/evaluate_controls_request.js`.
The target repository is mandatory; neither wrapper grants a run operation.

Preparation reads a verified artifact store and replays the exact compiler draft.
It produces the original request and actual order/task projections, exact source
references, analysis digest, repository and doctrine state, manifest, method and
response schema. The preview expires within five minutes and never after its
request. It does not contact a model. Preview output contains request content;
keep it in the trusted operator workspace, not agent chat or a public issue.

The initial transfer surface permits public/internal request-only drafts, never
restricted evidence quotes. Existing OPSEC and conservative default EEFI checks
must both pass. False positives, including security-related prose, are deliberate
denials rather than owner-flag exceptions. These checks cannot prove arbitrary
natural-language privacy or replace the full releasability contracts.

## Trusted Host Interface

`prepareInvocation(preview, { executable, model, timeoutMs, maxOutputBytes })`
measures an absolute resolved executable, requires the pinned CLI version and
binds the requested model, exact limits and complete preview. Model choice is
explicit; a mutable model alias is not a snapshot attestation.

`collectEvaluation(invocation, consent, configuration)` is a library interface
only. There is no public `run` CLI or agent-facing execution endpoint.
The trusted operator host must configure its pinned public key and private
owner-only journal directory outside repositories and artifacts. Neither key nor
directory is accepted from the untrusted invocation/consent payload.

The separate signed `SemanticEvaluationTransferConsent` must carry:

- Version `0.1`, one unique UUID and purpose `one_semantic_evaluation_transfer`.
- The exact invocation digest, authenticated principal UUID and a current window
  of at most 120 seconds, bounded by the preview expiry.
- Ed25519 signature from the host-pinned key and both authority flags false.

An existing order-adoption consent, caller `USER`, `approved: true`, valid CLI
login or synthetic-test signature cannot establish actual owner authorization.
The library verifies cryptography and scope; it does not authenticate a browser
principal. The separate console service now supplies exact owner preview,
password, stored-session and one-use checks. Use that ceremony for real packets;
never mint operational consent with a development key or invoke the library as
an unowned general-agent tool.

One consent reserves a durable private directory before launch. Interrupted,
failed or unknown invocations keep that reservation; exact replay is rejected.
The collector does not reconcile provider billing or clear operational holds.
Its journal is local mutable host state, not a protected or distributed fence.

## Collection And Interpretation

The collector runs one ephemeral `codex exec` using the existing login, a new
empty workspace, read-only sandbox, explicit medium effort, disabled known tool
surfaces, no user config/MCP servers/project documents and a minimal environment.
The prompt goes through stdin, not argv. Native Codex accesses its own saved
authentication; the collector does not read or export token contents.

Time is bounded to 240 seconds and captured stdout/stderr to 1 MiB. Timeout,
abort, malformed/unknown events, unexpected tools/diagnostics, multiple turns,
changed source/binary/workspace, invalid schema/quotes or mismatched final
message yield `not_evaluated`. The collector terminates its POSIX process group,
observes child close and checks group absence. A denied group signal is a
retained failure, not an uncaught stream-callback exception or proof of cleanup;
the exact child fallback still requires observed close and independent group
absence. It never retries a model call.
The deliberately disabled code-mode-host diagnostic is the only exact diagnostic
exception. Raw reasoning is not retained; stream digests and event counts are.
The profile does not enable experimental host-skill-discovery suppression:
CLI 0.162.1 emits an under-development warning for that feature. The live probe
retains the resulting startup denial; no warning suppression or broader error
allowlist is used. Full native/host-skill context remains unattested.
An unexpected item diagnostic is quarantined in a separate private file; the
returned result exposes only its digest. Inspect locally, preserve the failure
and correct the profile or collector before a separately authorized new attempt.
Never add an arbitrary diagnostic exception merely to obtain a passing run.

The strict Zod response contract requires exact UTF-8 source spans and one
coverage entry for the order and every receiver. Preserved/contradicted coverage
needs an actual string pointer and exact quote; absent coverage needs empty
pointer/quote. Unresolved conflicts/uncertainty cannot become `complete`.
The derived verdict is advisory: a model can still omit a requirement or judge
applicability incorrectly. `semantic_completeness_proven` and
`calibrated_for_admission` remain false even after an evaluated `complete`.

The private result binds invocation/consent IDs, process outcome, stream/response
digests and the advisory assessment. It is not a registered work artifact,
adoption decision, receiver acceptance, control receipt or authority grant.
Never cite this private result as a mission deliverable.

## Verification And Remaining Work

Run `node run-semantic-evaluation-fixtures.js`. Its measured fake process proves
transport/negative behavior with zero actual model calls. It cannot establish
real model quality or native tool inventory. Retain any separate live native
probe with exact source, input/output, model/profile and explicit synthetic scope.

Remaining: independently annotated atomic requirements and held-out calibration; mandatory
versioned adoption/receiver/dispatch consumers; bounded planning/replanning with
fresh USER revision review; unknown-provider-result reconciliation; trusted time,
hard cost/provider cancellation, model-hold discharge and protected-host/native-context attestation.
Do not relax existing adoption, stop, lease, gateway or release controls.
