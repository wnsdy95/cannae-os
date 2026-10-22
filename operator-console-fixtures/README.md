# Local Operator Console Fixtures

`node run-operator-console-fixtures.js` exercises real temporary Git repositories,
private SQLite accounts, HTTP injection, session/CSRF/RBAC, manifest/digest/path
checks, actual order-adoption inspection and explicit non-authorizing output.
The aggregate runner discovers this suite without a skip flag. No real owner
account or operational USER decision is created.

For browser QA, install Playwright outside this project's runtime dependencies,
make it resolvable with `NODE_PATH`, then run:

```bash
node operator-console-fixtures/browser-check.js --output /absolute/path/to/qa
```

The browser check starts and closes its own loopback server and synthetic
repository. It uses real UI login, invitation and viewer-revocation paths,
retains desktop/mobile screenshots and emits machine-readable results. Its
accounts and bootstrap token are temporary fixture data only; no tokens appear
in the screenshot URL or summary. Browser availability is not inferred from a
passing API-only suite.
