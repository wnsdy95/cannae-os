# Sigstore Verifier Identity Fixtures

These fixtures exercise the native Sigstore adapter without network access during validation.

- `pgi-trusted-root.json` is a `SigstoreTrustedRoot` wrapper created from the Sigstore public-good TUF target on 2026-07-22.
- `valid-identity-evidence.json` contains a real Fulcio certificate and Rekor proof issued for the Sigstore conformance test identity. The same canonical Controls statement is also signed by a generated Ed25519 verifier key; that private key is not stored.
- `valid-trust-policy.json` pins the exact email SAN, Google OIDC issuer, root artifact, bundle media type, and nonzero CT, transparency-log, and timestamp thresholds.
- `conformance-happy-bundle.json`, `wrong-artifact-bundle.json`, `wrong-rekor-entry-bundle.json`, and `conformance-a.txt` are copied from `sigstore/sigstore-conformance` commit `5fa7a5ed04d3cb7258c65856117d60ffb0db952f` under Apache-2.0.

The two negative conformance bundles are intentional regressions for the artifact/signature/public-key-to-Rekor-entry binding class described in Cosign advisory `GHSA-whqx-f9j3-ch6m`. The adapter uses pinned `@sigstore/verify` behavior and never treats an inclusion proof alone as artifact binding.

The evidence is deliberately short-lived. Fixtures evaluate it at a fixed instant inside its Fulcio certificate and evidence windows; production admission always evaluates at the actual current time and requires fresh evidence.
