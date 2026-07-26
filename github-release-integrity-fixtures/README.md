# GitHub Release Integrity Fixtures

Run:

```bash
node run-github-release-integrity-fixtures.js
```

The fixture suite uses temporary Git repositories and an in-memory GitHub
adapter. It performs no network mutation. It covers:

- a digest-bound read-only USER monitoring policy;
- fixed verifier-profile widening rejection;
- full live-policy and release-attestation readiness;
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

These fixtures validate the monitor and evidence contracts. They do not
authorize repository-policy mutation or a release.
