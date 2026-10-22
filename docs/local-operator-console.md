# Local Operator Console

## Implemented Boundary

This is a real loopback HTTP application over the configured repository's
verified artifact manifest, not the static dashboard prototype. It supplies
owner initialization, password login/logout, one-use viewer invitations,
mission-bounded evidence queries, account deactivation and local authentication
audit history. Owners can now preview and decide exact order proposals through
the [authenticated adoption protocol](operator-consent-and-adoption.md) and
existing adoption controller. All artifacts are handled as restricted, regardless of an
agent-authored public label. Owner access is the configured repository only.

Evidence and viewer access remain read-only. `approval_authorized`,
`tool_execution_authorized` and `release_authorized` remain false: these flags
do not grant blanket tool or release authority. Exact order decisions instead
report `decision_recorded` and the controller's `adoption_status`.
Login, opening a proposal or assigning viewer access never creates a decision.
The [Operations read product](operational-cop.md) now replays real wave/control
history with scoped views, exact evidence and explicit freshness. Complete COP,
CoS integration, general tool approvals and automatic replanning remain open.
A legacy CLI document containing `USER` is not authenticated consent.

## Start And Initialize

Use Node.js 22.22.2 or newer on a POSIX host with `node:sqlite`. SQLite is
experimental in the pinned Node 22 runtime. Install the exact lockfile first:

```bash
npm ci --ignore-scripts
node codex-skills/controls-doctrine-operator/scripts/serve_controls_operator.js \
  --repository /absolute/path/to/target-repository --port 4317
```

Use the equivalent `.claude/skills/controls-doctrine-operator/scripts/`
entrypoint for Claude Code. `--artifact-root` is optional and defaults to the
target's `.cannae/artifacts`; `--state-dir` defaults to
`~/.local/state/cannae-operator/<repository-key>`. No HTTP input selects a
repository, artifact root, filesystem path, role or alternate bind address.
If the port is occupied, choose another port. `--port 0` chooses an unused port.

The server binds only `127.0.0.1` and prints its actual URL. Before any owner
exists it also writes a private `setup-link.txt` outside the repository. The
human opens that link and creates the owner password; an agent must not create
the actual owner's account, read the token into chat, or sign in on the user's
behalf. The fragment is cleared immediately and is not sent in HTTP requests.
The one-use setup token expires after 30 minutes. Starting again before setup
rotates it. Setup removes the private link file. Do not publish or retain this
file with evidence.

Test accounts belong only in temporary synthetic repositories. Do not seed a
real repository with invented missions, approvals or fake operational outputs.

## Accounts And Sessions

There is exactly one owner and no API for promoting a viewer or deleting the
owner. Viewer invitations require the owner's current password and an explicit
non-wildcard list of mission IDs. Accepting the invite grants restricted local
read access to all artifacts in those missions, including subsequently retained
ones. This is a sensitive access grant, not declassification or release. No
viewer can enumerate accounts, read authentication activity or issue invites.

Invitations are hashed, one-use and valid for 30 minutes. Passwords use native
scrypt with `N=2^17`, `r=8`, `p=1`, independent random salts and bounded hash
concurrency. Minimum length is 15 characters, maximum 128. Session identifiers
rotate on login, expire absolutely after eight hours and are stored by digest.
Each request checks current account state and epoch; deactivation invalidates
existing sessions. Long evidence reads recheck the account before response.
Logout destroys the session. Rate limits, strict JSON bodies, exact Host/Origin,
session-bound CSRF, SameSite/HttpOnly cookies and restrictive CSP are mandatory.

Authentication state uses a private owner-UID directory and single-link private
SQLite files. Symlink traversal and repository-contained state are denied.
The store is bound to the exact repository identity and configured artifact
root; copying it to serve another repository does not migrate authority.
Backups must protect the database, WAL and session secret together. Password
reset, MFA, recovery ceremonies, remote identity providers, account scope edits
and credential rotation are not implemented in this increment.

## Evidence API

| Method and path | Contract |
| --- | --- |
| `GET /api/operations` | Authenticated read-only verified wave/control snapshot; optional mission/staff display filters never hide alerts elsewhere in the permitted scope. |
| `GET /api/session` | Setup state, current principal, CSRF token; repository identity only after authentication. |
| `POST /api/setup`, `/api/login`, `/api/register`, `/api/logout` | Strict JSON and exact Origin plus session CSRF. Setup/register tokens are never evidence. |
| `GET /api/evidence` | Verified, repository-isolated manifest; at most 50 permitted entries per page. Optional exact mission/kind filters. Missing namespace is empty, not demo data. |
| `GET /api/evidence/:id?manifest=<sha256>` | Exact manifest-bound opaque entry ID, digest-verified UTF-8 content of at most 1 MiB; JSON transport, never executable HTML. |
| `GET /api/evidence/:id?manifest=<sha256>&review=true` | Owner-only order-adoption inspection, with freshness/history replay and a second manifest snapshot check. It does not adopt the order. |
| `GET /api/users`, `/api/activity` | Owner-only bounded account/audit views; activity includes no passwords or raw setup/invite tokens. |
| `POST /api/invites`, `/api/users/deactivate` | Owner password reauthentication, exact scope and immutable owner role; no execution or approval rights. |
| `POST /api/order-decisions/preview`, `/api/order-decisions/commit` | Owner-only exact plan/evidence preview and short-lived one-use, session-bound password-reauthenticated decision. Calls the real adoption controller; no execution or release grant. |
| `GET /api/order-decisions`, `/api/order-decisions/:id`, `/api/operator-key` | Owner-only bounded action history, exact interrupted outcome and public consent-verification key. No private key, password or raw nonce. |
| `POST /api/order-decisions/:id/inspect` | Owner-only, CSRF-protected, empty-body read-only outcome replay against actual retained consent/decision/adoption history. Preserves action state and holds; never retries or discharges an approval. |
| `POST /api/order-decisions/:id/reconciliation/preview`, `POST /api/reconciliations/commit` | Fresh owner/session-bound password-reauthenticated terminal review; guarded cancellation/receipt/private projection. Never replays original adoption. See [terminal reconciliation](operator-terminal-reconciliation.md). |
| `GET /api/order-decisions/:id/reconciliations` | Owner-only terminal-attempt history with preserved original failure codes; no raw nonce, password, session or private key. |

An entry ID binds mission, wave, kind, artifact ID, relative path and digest.
It is not a caller-provided path. Unknown or unauthorized entries return no
content. Verification failure, digest change, symlink, hardlink, stale manifest
or stale cursor denies the read. A stale cursor requires a fresh list request;
do not silently continue from a different revision. Worker-thread queries have
a finite queue and deadline, keeping authentication responsive. The retained
record's timestamp is displayed as recorded, not proof of current mission health.

## Local Trust Limits And Remaining Work

Loopback HTTP is not a production identity or transport boundary. Other
processes running as the same OS user can read state, replace code or interfere
with cookies; cookies are host-scoped, not port-scoped. Do not run this alongside
untrusted loopback services, proxy it, tunnel it, bind it externally or present
the local authentication audit as independently retained tamper-proof evidence.
Local restricted access is not an approved external output packet.

The user's deployment target is deferred as of 2026-10-22. Continue local work
without choosing an external provider or claiming goal 8 complete. A production
deployment still needs protected identity/key custody, TLS, OS/process
isolation, exclusive gateway paths, external coordination/fencing, independent
monitoring and recovery evidence. Exact authenticated one-use order decisions
now reach the controller. The worker queue confirms actual exit before response,
next-job admission or private-service shutdown; timeout alone cannot release it.
This exit fence is separate from the [local order terminal ceremony](operator-terminal-reconciliation.md),
which now requires fresh owner consent and signed cancellation/acknowledgment evidence.
Goal 7 still needs broader tool approvals, integrated COP and complete workflows.

## Validation And Sources

Run `node run-operator-console-fixtures.js`, both skill wrappers, routing/static
checks and browser flows on desktop/mobile. Authentication fixtures use actual
temporary repositories and no real owner's identity. The dependency change also
requires current/historical verifier, monitor, checkpoint, publisher and workload
identity regressions; see [producer compatibility](github-release-independent-verification.md).

Implementation uses official [Fastify sessions](https://github.com/fastify/session),
[CSRF protection](https://github.com/fastify/csrf-protection),
[Helmet](https://github.com/fastify/fastify-helmet),
[rate limiting](https://github.com/fastify/fastify-rate-limit),
[Node SQLite](https://github.com/nodejs/node/blob/v22.22.3/doc/api/sqlite.md) and
[OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Lucide static icons carry ISC and Feather-derived MIT notices in their
[license](https://github.com/lucide-icons/lucide/blob/main/LICENSE), served
unchanged at `/licenses/lucide.txt`.
These sources explain primitives, not a certification of this application.
