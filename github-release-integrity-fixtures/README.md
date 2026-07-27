# GitHub Release Integrity Fixtures

Run:

```bash
node run-github-release-integrity-fixtures.js
```

The fixture suite uses temporary Git repositories and an in-memory GitHub
adapter. It performs no network mutation. It covers:

- a digest-bound read-only USER monitoring policy;
- fixed verifier-profile widening rejection;
- full live-policy, TUF trust, and independently verified release-attestation
  readiness using a real public `cli/cli v2.93.0` bundle;
- USER genesis and exact predecessor checkpoint advancement under the same
  retained root;
- missing predecessor artifact rejection without repository-bootstrap
  fallback;
- retained trusted-root acquisition failure and fail-closed readiness;
- exact committed-HEAD policy and activation-ancestry binding;
- stale default-branch and parent-symlink output rejection;
- read-only workflow permissions and shell-expression injection rejection;
- immutable-policy drift;
- missing Administration read credentials;
- mutable post-activation releases;
- attestation commit substitution and bounded retry;
- grandfathered tag drift and missing baseline releases;
- exact release-event attestation scope;
- authority-expansion rejection; and
- equivalent Codex and Claude runtime wrappers.

These fixtures validate the monitor and evidence contracts with retained
public cryptographic material. They do not authorize repository-policy
mutation, checkpoint reset, or a release.
