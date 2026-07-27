# Independent GitHub Release Verification Fixtures

These fixtures prove that Cannae can verify a retained GitHub release
attestation without trusting the `gh release verify` conclusion by itself.

## Sources

- `cli-v2.93.0-release-verification.json` is the JSON output retained from
  `gh release verify v2.93.0 --repo cli/cli --format json`.
- `github-trusted-root.json` was generated from the pinned root in
  `.github/tuf/github-release-root.json` and the official GitHub TUF mirror at
  `https://tuf-repo.github.com`.

The public release fixture is used only as signed test material. It grants no
authority over this repository and cannot authorize a release.

## Coverage

The fixture runner verifies:

- every GitHub TUF root rotation from the pinned v1 root to the retained root;
- timestamp, snapshot, targets, and trusted-root target bindings;
- explicit evaluation time, wrapper age, signed metadata expiry, and required
  operation-window validity;
- the Sigstore certificate chain and RFC 3161 timestamp;
- the exact signed repository, tag, commit, package URI, and assets;
- equality between the GitHub CLI statement and the signed DSSE statement;
- rejection of missing roots, forged TUF metadata, modified DSSE payloads,
  CLI-only substitutions, commit substitution, omitted clocks, and
  release-authority drift.

Run:

```bash
node run-github-release-independent-verification-fixtures.js
```

Every generated artifact remains monitoring-only:

```text
human_final_decision_authority = USER
release_authorized = false
```
