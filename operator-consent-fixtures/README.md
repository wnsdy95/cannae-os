# Authenticated Owner Order Fixtures

`support.js` shares synthetic owner/session/proposal setup between the consent
and outcome suites; it never provisions an actual owner's account.
`run-operator-consent-outcome-fixtures.js` replays historical effects without
writes or hold discharge, including missing/partial publications, old expiry,
untrusted projections and concurrent manifest/key/repository drift. Browser
checks include owner-only Inspect Outcome on desktop and mobile. These checks
do not provide terminal reconciliation, cancellation or renewed authority.

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

The coverage review cases compare actual source fragments, every real receiver,
exact locations and the full plan. Filtering, tabs (including keyboard navigation)
and pagination must not change the prepared nonce or original subject sent to the
real controller. Extra context/unknown fragments, long literal markup and more
than 25 rows are explicitly synthetic display-only variants; they are restored
before approval and are not retained as approved operational records. A delayed
authenticated owner preview cannot restore hidden review data in a later viewer
session. An intercepted incomplete response must leave no actionable preview.
`node run-operator-coverage-ui-fixtures.js` separately covers the pure presentation
projection. Neither suite establishes semantic equivalence or model calibration.
