# Operational COP Fixtures

Run `node run-operational-cop-fixtures.js` for actual temporary-controller,
snapshot, lease, issuance, historical termination and authenticated HTTP cases.
Run `node operational-cop-fixtures/browser-check.js --output <absolute-directory>`
for real HTTP/Playwright desktop and 390px mobile flows, evidence inspection,
unsuppressed alerts, refresh failure, snapshot expiry and late logout responses.
Provide Playwright through the selected development runtime's `NODE_PATH` if
it is not locally installed; it is not a production application dependency.
Use synthetic temporary accounts only; no real USER decision is produced.

The read product does not prove native worker liveness, configurable reporting
thresholds, CoS decisions or protected production operation. It is not overall
completion evidence. The complete aggregate and exact-source CI remain separate.
