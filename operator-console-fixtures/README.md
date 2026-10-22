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
node operator-console-fixtures/session-browser-check.js --output /absolute/path/to/session-qa
```

The browser check starts and closes its own loopback server and synthetic
repository. It uses real UI login, invitation and viewer-revocation paths,
retains desktop/mobile screenshots and emits machine-readable results. Its
accounts and bootstrap token are temporary fixture data only; no tokens appear
in the screenshot URL or summary. Browser availability is not inferred from a
passing API-only suite.

The session check delays actual authenticated response bodies across owner/viewer
switches, closed/reselected details and inverted filter responses. It checks all
four list surfaces, old-session 401 handling and late invitation links. A real
server-side authorization check still bounds every new viewer request. These
browser guards cannot erase data copied before logout or replace server RBAC.
Repeated synthetic login obeys the unchanged authentication throttle: only an
observed `CONSOLE_RATE_LIMIT` 429 permits one bounded wait for its validated
`Retry-After`; no rate-limit bypass or automatic approval retry exists.
