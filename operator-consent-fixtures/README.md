# Authenticated Owner Order Fixtures

`node run-operator-consent-fixtures.js` creates temporary repositories and real
synthetic owner/viewer accounts, not actual user consent. It verifies signed
scope, exact controller and lifecycle consumption, nonce/session/account/race
boundaries, publication drift, partial failure, metadata aliases and restart
holds. The public sample key is not a production trust root. The sample writer
generates an ephemeral private key in memory only; no private key is committed.

For actual browser flows with an externally installed Playwright module:

```bash
node operator-consent-fixtures/browser-check.js --output /absolute/path/to/qa
```

Make Playwright resolvable using `NODE_PATH`; it is not a runtime dependency.
The browser check starts/closes its own loopback service, proves real desktop
and mobile owner decisions and retains screenshots with no credential/nonce
values or setup fragments. It never touches a real owner's account or work.
