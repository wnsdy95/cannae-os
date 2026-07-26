# GitHub Release Immutability Fixtures

`run-github-release-immutability-fixtures.js` exercises the Phase 19A
repository-policy boundary without contacting GitHub.

The injected adapter covers:

- one exact USER-granted disabled-to-enabled policy authorization;
- repository ADMIN, origin, main-CI, expiry, and repository-contained artifact
  requirements;
- one PUT followed by terminal GET verification;
- an exact retry that verifies the already-enabled state without another PUT;
- HTTP success without an enabled observed state;
- latest-release drift and the prospective-only behavior for `v0.2.0`;
- static valid and adversarial authorization and receipt payloads; and
- equivalent Codex and Claude wrapper resolution.

The policy artifacts never carry release authority. Future releases still
require a separate exact `GitHubReleaseAuthorization`.
