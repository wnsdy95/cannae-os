# Codex Default Model Binding

## Scope

The trusted local host can resolve `@cli-default` before opening the operator
console. This is a preparation selector, never a model alias sent to inference.
An explicitly configured model wins. Without one, exactly one visible catalog
recommendation must exist. Missing, conflicting or unsupported results deny;
there is no guessed model name, upgrade or fallback.

This supports the existing request-analysis and omission-evaluation collectors.
It does not supply semantic calibration, a model strategy, task authority, USER
adoption, automatic replanning or any complete program outcome. Installed source
acceptance and rollout remain separate.

## Trusted Host Preparation

```bash
node codex-skills/controls-doctrine-operator/scripts/serve_controls_operator.js \
  --repository <target-repository> --state-dir <private-outside-git-directory> \
  --semantic-executable <absolute-codex-path> --semantic-model '@cli-default' \
  --analysis-executable <absolute-codex-path> --analysis-model '@cli-default' \
  --port 4317
```

The Claude skill's equivalent wrapper calls the same runtime. An explicit literal
model remains supported without discovery. Browser requests cannot choose either
selector, executable, provider, configuration or model metadata. Do not modify an
already running real host, bootstrap its owner or approve transfer on the user's
behalf merely because this source candidate exists.

Host discovery uses the reviewed CLI version 0.162.1 and its standard home, not
an exported credential. It runs before authentication state or a listener opens.
Only initialization, effective configuration reads and bounded model-list pages
are requested. A second configuration read detects a model/provider change during
lookup. Non-OpenAI providers and configured OpenAI endpoint/provider overrides
are unsupported; they are not forwarded to the fixed OpenAI collector.

The host disables optional tools/plugins/hooks, Code Mode hosting and daemon
auto-start for this child. It does not connect to or restart a running daemon.
A schema-shaped remote-control status notification is harmless only when disabled
with no environment identity. Connecting/connected control, unknown activity,
server requests, malformed JSON/UTF-8, duplicated or cyclic pages, unsupported
fixed `medium` effort and ambiguous defaults deny. The metadata child has finite
duration/output limits and must actually exit with its process group absent.
Cancellation preserves failure and never substitutes another model.

Discovery may contact the provider's model catalog through the CLI's existing
login. It sends no mission request, draft, evidence, approval password or task
prompt, and never starts a thread/turn. No new API key, login mutation, credential
file export or provider inference is part of this operation. The configuration
response and account details are not retained by this bridge; only the model/provider projection,
catalog commitment and executable/version binding enter the selection record.

## Frozen Transfer Boundary

The host freezes its resolved profile before accepting requests. Each owner
packet displays the concrete model, resolution time and selection digest. A later
CLI default change does not silently change this host's pending or future calls.
Use a separately controlled fresh host preparation when the selected profile
must change; never reuse a pending nonce for a different model.

`CodexModelSelection` is strict, digest-bound control metadata. Both validator
APIs return `can_execute: false`. Its copies and nested wrappers are not work.
The invocation binds this exact record and the concrete requested model; the
collector explicitly passes that literal with user configuration ignored. A
changed selection, executable or invocation cannot reuse the original consent.
Old explicit-model histories remain readable without synthetic selection data.

Both analysis and omission commit requests require `displayed_invocation_sha256`.
The browser hashes the complete displayed transfer record, validates its original
commitment and checks the visible prompt/profile for changes before submission.
The server compares that digest with the actual private invocation before
reserving or signing consent. A changed/rekeyed response, edited display or missing
commitment cannot authorize the hidden original packet. This is protocol/display
integrity, not proof that a human read the contents or that the browser/host is
independently protected. Historical signed records are not rewritten.

The real owner still reviews and approves one exact packet using the separate
[transfer ceremony](model-transfer-consent.md) or
[analysis purpose](native-order-analysis.md). Merely choosing CLI default in a
conversation is not a signed transfer decision. Metadata availability does not
attest account entitlement, an immutable model snapshot, provider billing limits,
native prompt isolation or protected execution. The selected alias may still be
provider-managed; all existing failed/unknown transfer holds remain in force.

## Evidence And Sources

Run `node run-codex-model-selection-fixtures.js`, both collector/owner suites,
`run-model-invocation-integrity-fixtures.js` and the actual control-evidence
consumer. `operator-semantic-fixtures/browser-check.js --output <directory>
--default-model` adds the frozen selection to the actual desktop/mobile owner
flow, using a measured fake process and synthetic account only.

An installed-CLI probe uses a separate empty HOME and macOS network denial. It
checks actual protocol compatibility and child exit, not the real user's default,
account access or inference. The initial inactive-status rejection remains a
failed observation, not a successful native qualification. Future CLI upgrades
need a new protocol review rather than a version-range exception.

The official [App Server documentation](https://learn.chatgpt.com/docs/app-server#list-models-modellist)
describes per-client/account catalog recommendations. Its
[configuration RPC](https://learn.chatgpt.com/docs/app-server#config-rpc-examples-for-app-settings)
supports effective-setting inspection. The generated protocol schemas and local
CLI help define the pinned wire shape. Selection precedence, denial, freezing,
privacy, owner review and evidence-class boundaries above are local engineering
policy, not upstream claims of isolation or account access.
