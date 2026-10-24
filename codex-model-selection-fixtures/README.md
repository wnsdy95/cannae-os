# Codex Model Selection Fixtures

`run-codex-model-selection-fixtures.js` uses a measured metadata-only fake CLI and
separate temporary accounts, repositories and files. It checks fixed RPC scope,
literal/default precedence, ambiguity, config drift, pagination, inactive/active
remote status, version/protocol failure, cancellation and observed process exit.
Actual owner APIs then bind omission and analysis calls to the frozen model;
analysis results enter the real compiler. Zero real model calls are made.

`fake-codex.js` is copied into each temporary fixture root with generated settings.
It never reads real login files. `support.js` is shared with the actual browser
test's `--default-model` mode, including mobile review and account-switch races.
The production origin guard is unchanged; inject fixtures use their configured
origin and real browser fixtures listen on a fresh dynamic port.

`write-samples.js` generates the strict schema and two structural examples, not
execution evidence or owner consent. Historical private invocations, consents
and journals must never be regenerated to acquire a new selection commitment.
See [default binding](../docs/codex-default-model-binding.md).
