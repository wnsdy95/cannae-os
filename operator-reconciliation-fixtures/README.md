# Local Order Terminal Reconciliation Fixtures

Use `node run-operator-reconciliation-fixtures.js` against synthetic repositories
and owner/viewer accounts, never an actual user's account or work. The fixture
fault adapter is test-only and is not a production execution/recovery adapter.

`write-samples.js` generates an ephemeral Ed25519 private key in memory and
writes only a public fixture key, signed non-authorizing authorization/receipt,
their invalid variants and the exact cancellation payload. Do not regenerate
the older operator-consent or verifier samples as part of this change.
Fixture signatures do not establish production issuer trust.

For actual local UI flows, make the externally installed Playwright module
resolvable with `NODE_PATH`, then run:

```bash
node operator-reconciliation-fixtures/browser-check.js --output <absolute-qa-directory>
```

The browser cases use a fresh browser session after an interrupted original
decision, exercise cancellation/recorded-result/prior-cancellation ceremonies,
and inspect terminal history without new original adoption or tool/release
authority. Screenshots must not retain raw nonces, credentials or setup tokens.
