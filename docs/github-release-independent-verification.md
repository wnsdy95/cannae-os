# Independent GitHub Release Verification

## 1. Purpose

Phase 19C independently verifies retained GitHub release attestations instead
of treating a successful `gh release verify` result as the final trust
decision.

The GitHub CLI result remains useful acquisition evidence. Cannae separately
verifies the signed bundle with pinned Sigstore code, reconstructs the GitHub
trust material from a pinned TUF root, and compares the signed in-toto
statement with both the exact release expectation and the CLI projection.
Phase 19D adds retained prior-state continuity around this point-in-time
verification; see `github-release-trust-checkpoint-continuity.md`.

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

Fresh `GitHubReleaseIndependentVerification` records use v0.2. Version v0.1
remains readable only through the exact historical-producer replay path below.
Both versions record:

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

### Producer Compatibility

Fresh execution is pinned to `@sigstore/verify` 4.1.2. Schema v0.2 records that
version; v0.1 records 4.1.0. A mismatched schema/package pair fails. The committed
policy's `minimum_version: 4.1.0` remains the historical profile floor, not
permission to run the old package for new verification. No policy baseline,
checkpoint identity, trust root, or release authorization changes in this
dependency migration.

Retained evidence previously required byte-equivalent replay including current
module and lockfile digests. Even a valid dependency update therefore broke
historical replay. The runtime recognizes exact v0.1/4.1.0 producer tuples from
source commits `786c38a`, `9635f8d`, and `d08420a`, plus the former v0.2/4.1.2
producer from `4bad6dd`. Evidence schema, package, package version, minimum
version, Node minimum, module SHA-256, and lockfile SHA-256 must all match.
Unknown tuples, extra metadata, and schema/version substitution remain errors.

Historical compatibility never loads the old library. The currently pinned
engine repeats TUF, certificate, timestamp, DSSE, signed-scope, and CLI cross-check
verification. Only after that succeeds may comparison preserve the recognized
original producer metadata and schema version. All other fields and the complete
self-digest must still match. Original evidence is never rewritten. The monitor
continues to require authenticated provider artifacts and checkpoint continuity.

A recognized source tuple is not proof that the historical code executed in an
isolated environment. That remains an execution-attestation concern. A standalone
schema pass is not cryptographic replay or provider provenance. Newly encountered
producer revisions require a reviewed compatibility change and adversarial tests;
never admit arbitrary versions, ignore producer digests, or reset lineage to
make a dependency update pass.

The `ip-address` 10.7.2 lockfile migration preserves that former v0.2 profile even
though the evidence schema and Sigstore package version are unchanged. Its module
digest is `2698e8a65e83987e4a80675b194ea203ac1fa5b7e1ab4504b2ed7155ede9bba8`
and lock digest is `25179325095a514dd6908af3bca74580bc4e9057d70616a2bfe9d974677975d0`.
The committed `valid-github-release-independent-verification-prior-v0.2.json`
is byte-identical to the former current sample in that source commit. Fixtures
pin its file hash and replay it unchanged, independently of the separately
regenerated current sample. Hybrid old-module/new-lock identities stay rejected.

Before future migrations, capture the exact baseline producer and an unchanged
evidence sample. After installation, test both prior replay and exact equality
between the current sample and a fresh result. Merely generating a new sample or
keeping the same schema/version does not prove backward compatibility.

The upstream [NAT64 classification advisory](https://github.com/beaugunderson/ip-address/security/advisories/GHSA-2vr4-cq9g-pvrc)
affects 10.4.0; 10.5.1 first fixes the local-use range. The selected
[10.7.2 release](https://github.com/beaugunderson/ip-address/releases/tag/v10.7.2)
includes that correction. Local dependency fixtures test private/non-global
classification at both range ends and a public-address control. This establishes
the patched library behavior, not complete SSRF protection or an exploitable
network path in this application. Monitor credentials and checkpoint continuity
are separate operational obligations and are not reset by this migration.

Upstream context: the [checkpoint parsing fix](https://github.com/sigstore/sigstore-js/commit/e66d99f0d79ddc28266ef71c8dfbcb9863c682e8)
and [log-entry counting fix](https://github.com/sigstore/sigstore-js/commit/adbe2535c5702364e9c958ae3d67fbdefe068edd)
motivate running the hardened current engine, not maintaining an old execution
fallback. GitHub's timestamp-only release profile is unchanged.

## 5. Runtime Integration

New release authorizations and receipts use schema v0.5:

- authorization fixes the independent verifier, GitHub TUF source, bootstrap
  path, and 24-hour maximum trusted-root age;
- active publication accepts only authorization v0.5; older versions remain
  readable historical contracts and cannot enter the publisher;
- authorization and publication require the exact fresh Phase 19D checkpoint
  and trusted-root pair before external mutation;
- publication validates the repository-contained trusted-root artifact,
  current clock, and complete authorization window before creating a release;
- the receipt embeds the raw CLI evidence, trusted-root artifact, and
  independent verification evidence; and
- receipt semantics replay all three before accepting the terminal record.

Release-integrity policy and observations use schema v0.3:

- every run refreshes GitHub trust material through TUF;
- one root artifact is retained per observation;
- every non-grandfathered verified release has its own independent evidence;
- root acquisition or replay failure becomes an explicit blocked observation;
- every run compares the retained TUF projection with the exact prior
  checkpoint, blocks rollback, equivocation, and forks, and emits the next
  checkpoint; and
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

The release publisher receives the exact root and checkpoint input copies
through `--trusted-root` and `--trust-checkpoint`, then independently resolves
and replays the latest eligible `full-observation.json` artifact before either
input may enter release admission. The integrity monitor refreshes and retains
the observation, root, and checkpoint as one artifact triplet through its
observation output, `--trusted-root-output`, and
`--trust-checkpoint-output`; refresh or continuity failure still produces a
blocked observation when the remaining repository checks can run. A local
two-file pair is therefore never provider-lineage evidence.

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
also reject legacy authorization downgrade, missing or stale trust inputs,
path drift, and valid-checkpoint substitution before any immutable release
creation call.

## 8. Limits

- GitHub remains the signer, certificate authority operator, timestamp
  authority operator, immutable-state reporter, and TUF repository operator.
- Independent code execution in the same repository or CI job is not an
  independent infrastructure failure domain.
- The retained point-in-time TUF chain verifies authenticity, rotation,
  linkage, and freshness. Phase 19D adds provider-retained prior state, but
  long-term rollback resistance still needs independently durable state and
  external monitor continuity.
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
