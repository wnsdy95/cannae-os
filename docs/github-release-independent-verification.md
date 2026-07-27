# Independent GitHub Release Verification

## 1. Purpose

Phase 19C independently verifies retained GitHub release attestations instead
of treating a successful `gh release verify` result as the final trust
decision.

The GitHub CLI result remains useful acquisition evidence. Cannae separately
verifies the signed bundle with pinned Sigstore code, reconstructs the GitHub
trust material from a pinned TUF root, and compares the signed in-toto
statement with both the exact release expectation and the CLI projection.

This is verification evidence, not release authority:

```text
human_final_decision_authority = USER
monitoring_only = true
release_authorized = false
```

## 2. Trust Equation

```text
Pinned GitHub TUF root v1 digest and threshold
+ Every sequential root rotation authorized by old and new root thresholds
+ Current root, timestamp, snapshot, and targets signatures and expiry
+ Exact trusted_root.json target length and digest
+ Exact Sigstore bundle v0.3 profile
+ Fulcio certificate chain under the retained GitHub root
+ Exact GitHub release-service certificate identity
+ Valid RFC 3161 timestamp
+ Valid DSSE signature
+ Signed repository, tag, commit, package URI, and asset set
+ CLI statement equals the signed DSSE statement
= independent release verification evidence
```

Any missing term denies the evidence. A valid evidence artifact still cannot
create, approve, repair, or release anything.

## 3. Trusted-Root Contract

`GitHubReleaseTrustedRoot` v0.1 retains:

- the official GitHub TUF mirror and `trusted_root.json` target name;
- the committed root v1 path and exact SHA-256 digest;
- the original bytes for every root from v1 through the current version;
- the original timestamp, snapshot, targets, and target bytes;
- version, expiry, and SHA-256 projections for current metadata;
- normalized Sigstore `TrustedRoot` material and its digest;
- the exact release verification profile; and
- USER final authority with release false.

Offline validation performs the TUF update chain again:

1. Root v1 verifies its own threshold and matches the committed digest.
2. Root `N+1` is verified by root `N` and by its own new threshold.
3. Root versions increase by exactly one with no omitted rotation.
4. The current root verifies timestamp, snapshot, and targets metadata.
5. Metadata version links, optional length/hash links, and expiry are checked
   against an explicit caller-supplied evaluation time.
6. Signed targets metadata binds the exact retained trusted-root target bytes.
7. The normalized target equals the retained `trusted_root` value.

A wrapper digest alone is insufficient. An attacker who changes TUF bytes and
recomputes the wrapper digest still fails the retained TUF signatures.
Validation never substitutes the artifact's `fetched_at` for the caller's
clock. Publication preflight additionally requires every current TUF role to
remain valid through the authorization expiry.

## 4. Bundle Contract

`GitHubReleaseIndependentVerification` v0.1 records:

- pinned `@sigstore/verify` package version, verifier-module digest,
  dependency-lock digest, and Node minimum;
- trusted-root artifact, normalized-root, and target digests;
- bundle, DSSE payload, certificate, signature, log-entry, and timestamp
  projections;
- exact repository, tag, package URI, commit, and asset subjects;
- the digest of the complete raw GitHub CLI result;
- explicit CLI-statement and signer-identity equality;
- successful cryptographic verification; and
- monitoring-only USER authority with release false.

The GitHub release profile currently requires:

```text
bundle media type = application/vnd.dev.sigstore.bundle.v0.3+json
certificate SAN = https://dotcom.releases.github.com
CT log threshold = 0
transparency log threshold = 0
RFC 3161 timestamp threshold = 1
```

Those thresholds describe GitHub's current release bundle and TUF target.
They must not be generalized to other Sigstore profiles, where CT or Rekor
verification may be required.

## 5. Runtime Integration

New release authorizations and receipts use schema v0.4:

- authorization fixes the independent verifier, GitHub TUF source, bootstrap
  path, and 24-hour maximum trusted-root age;
- active publication accepts only authorization v0.4; older versions remain
  readable historical contracts and cannot enter the publisher;
- publication validates the repository-contained trusted-root artifact,
  current clock, and complete authorization window before creating a release;
- the receipt embeds the raw CLI evidence, trusted-root artifact, and
  independent verification evidence; and
- receipt semantics replay all three before accepting the terminal record.

Release-integrity policy and observations use schema v0.2:

- every run refreshes GitHub trust material through TUF;
- one root artifact is retained per observation;
- every non-grandfathered verified release has its own independent evidence;
- root acquisition or replay failure becomes an explicit blocked observation;
  and
- policy mutation and release remain false.

## 6. Operations

Refresh and verify a repository-contained GitHub trusted root:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release_verification.js \
  trusted-root refresh \
  --repository-root . \
  --output .cannae/releases/<tag>/github-trusted-root.json

node codex-skills/controls-doctrine-operator/scripts/operate_github_release_verification.js \
  trusted-root verify \
  --input .cannae/releases/<tag>/github-trusted-root.json \
  --evaluated-at <current-UTC-timestamp>
```

Independently verify retained GitHub CLI output:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_github_release_verification.js \
  bundle verify \
  --raw-verification <gh-release-verify.json> \
  --trusted-root .cannae/releases/<tag>/github-trusted-root.json \
  --repository <owner/repo> \
  --tag <tag> \
  --commit <full-commit-sha> \
  --verified-at <timestamp> \
  --output <independent-verification.json>
```

The release publisher consumes the same root through `--trusted-root`. The
integrity monitor refreshes and retains its own root through
`--trusted-root-output`; refresh failure still produces a blocked observation
when the remaining repository checks can run.

## 7. Adversarial Coverage

`run-github-release-independent-verification-fixtures.js` uses a real public
`cli/cli v2.93.0` release bundle and retained GitHub TUF chain. It rejects:

- omitted root versions;
- omitted evaluation clocks, stale wrappers, signed metadata expiry, and
  metadata that cannot remain valid through a preflighted operation window;
- signed root or targets-body mutation after wrapper digest recomputation;
- modified DSSE payloads;
- CLI statement substitution without signed-payload substitution;
- valid signatures evaluated against a substituted commit; and
- attempts to convert monitoring evidence into release authority.

Publisher and integrity-monitor fixtures consume the same real bundle, so
their successful paths cannot rely on a fake signature. Publisher fixtures
also reject legacy authorization downgrade and a missing root before any
immutable release creation call.

## 8. Limits

- GitHub remains the signer, certificate authority operator, timestamp
  authority operator, immutable-state reporter, and TUF repository operator.
- Independent code execution in the same repository or CI job is not an
  independent infrastructure failure domain.
- The retained point-in-time TUF chain verifies authenticity, rotation,
  linkage, and freshness. Long-term rollback detection also needs durable
  prior trusted state and external monitor continuity.
- Freshness depends on a trustworthy caller clock. The artifact's own
  retrieval time is evidence input, never the current-time authority.
- The current GitHub release profile has no retained Rekor or CT-log entry.
  RFC 3161 time and the GitHub-specific root profile are therefore critical.
- This phase does not operate an external witness, gossip network, long-term
  archive, protected USER signing device, or signed release tag.
- Public stable releases are the supported profile. Private repositories,
  prereleases, first releases, and provider-neutral adapters remain future
  work.

## 9. Source Basis

- [GitHub offline attestation verification](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline)
  documents downloading bundles and trusted roots for later verification.
- [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
  describes Sigstore-backed attestations and verification expectations.
- [`gh attestation trusted-root`](https://cli.github.com/manual/gh_attestation_trusted-root)
  exposes GitHub's trusted-root material.
- [`gh release verify`](https://cli.github.com/manual/gh_release_verify)
  defines the retained release-verification result.
- [Sigstore bundles](https://docs.sigstore.dev/about/bundle/)
  describe portable signing and verification material.
- [Sigstore JavaScript clients](https://docs.sigstore.dev/language_clients/javascript/)
  document the verifier implementation family used here.
- [The Update Framework specification](https://theupdateframework.github.io/specification/latest/)
  defines root rotation, metadata verification, rollback, and freeze controls.
- [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md)
  defines the signed subject and predicate envelope.
