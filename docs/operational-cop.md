# Operational COP

## Scope

The authenticated console's Operations view derives a restricted, read-only
snapshot from the configured repository's verified artifact history. It is not
the supplied-JSON dashboard prototype, a heartbeat monitor, a native-session
attestation, an approval or a tool grant. All authority flags remain false.

`GET /api/operations` accepts only optional exact `mission` and staff `role`
display filters. Account role and mission access come from the authenticated
session, are reapplied on every read and are checked again after worker exit.
A viewer sees only assigned missions. Display filters narrow rows, not access:
critical and warning alerts remain over the entire authorized mission scope.
An empty filtered list must never be reported as an all-clear.

## Evidence And Freshness

Wave plans, routing/preflight receipts, exact intent-bearing context history
and terminal derivations are replayed. A filename, AAR, schema-valid terminal
record or recent arbitrary deliverable cannot prove completion or current
control activity. Unverified histories are explicit critical alerts. Pending
issuances, pending results, unresolved effects/gateway obligations, expired
leases and current owner-side order/method gates retain their holds. Viewing
does not recover, cancel, resume, settle, revoke or otherwise write history.

Snapshots bind one verified manifest revision/digest and a server clock, expire
after at most 60 seconds, and record the next known wave/lease boundary.
Control inactivity beyond 300 seconds is stale, not a claim that a worker is
offline. Future activity is not fresh. Evidence links bind the same manifest;
later writes require refresh before inspection. Capacity errors fail the whole
read rather than returning a quietly truncated healthy board. Excerpts and
bounded alert source lists explicitly identify truncation.

The validator's new contract dependency is included in local issuance/channel
source measurements. Upgrade only after settling old active work; a changed
source binding is not permission to renew a lease or discard admitted results.

## Remaining Work

This increment is only part of goals 4 and 7. Configurable CCIR/reporting
thresholds, authenticated CoS decision consumption, readiness/resource
projections, priorities and cross-mission permission changes remain open.
Actual semantic evaluation/replanning and operated exclusive infrastructure
are separate requirements, not inferred from this read product.

Run `node run-operational-cop-fixtures.js` and the console authentication and
desktop/mobile browser checks. Use temporary synthetic repositories for test
accounts; never initialize the real owner's account or fabricate live missions.
