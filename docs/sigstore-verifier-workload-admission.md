# Sigstore Verifier Workload Admission

## 1. Purpose

This adapter authenticates a currently active verifier workload with a native Sigstore bundle while retaining the policy-registered Ed25519 verifier key used for receipt and comparative-report attestations.

It is an additional provider adapter, not a replacement for the provider-neutral SPIFFE path. A policy may use `spiffe_x509`, `sigstore_bundle`, or both. Neither provider changes human final authority, approval scope, release authority, or quorum independence requirements.

## 2. Trust Contract

Trust-policy v0.3 binds three independent objects:

1. `SigstoreTrustedRoot`: official protobuf JSON normalized by the pinned library, source-attributed, freshness-bounded, and stored by manifest ID/path/SHA-256.
2. `VerifierTrustPolicy.verifiers[].workload_identity`: exact SAN type/value, exact Fulcio OIDC issuer, exact root ID, exact bundle media type, and nonzero CT-log, Rekor-log, and timestamp thresholds.
3. `SigstoreVerifierIdentityEvidence`: one canonical statement signed by both the Sigstore keyless certificate key and the separately registered verifier key.

The statement binds evidence ID, verifier and static key, certificate identity and issuer, root ID and root digest, repository identity, evidence purposes, nonce, issue time, and expiry. The Sigstore message bundle must sign those exact canonical bytes. Replacing the repository, purpose, root, identity, issuer, validity window, or statement invalidates admission.

## 3. Verification Order

`sigstore-verifier-identity-evidence.js` performs these checks:

1. Recompute the evidence, root, and bundle digests after official protobuf normalization.
2. Match repository, policy, verifier, purpose, root ID/digest, bundle media type, exact SAN, and exact issuer.
3. Verify the static Ed25519 verifier signature over the canonical binding statement.
4. Use `@sigstore/verify` with the manifest-pinned `TrustedRoot` and policy thresholds.
5. Verify Fulcio certificate chain and SCT, trusted signing time, Rekor inclusion/checkpoint, Rekor body-to-artifact digest/signature binding, and artifact signature.
6. Require the Fulcio certificate to still be active at admission and prohibit evidence expiry after certificate expiry.
7. Apply evidence and trusted-root freshness limits and derive the earliest validity boundary.

The current-certificate check is stricter than ordinary historical Sigstore verification. Historical verification can remain valid after a short-lived Fulcio certificate expires; workload admission cannot use that fact to claim the signer is currently active.

## 4. Create the Root Artifact

Install exact dependencies first:

```bash
npm ci --ignore-scripts
```

Fetch the public-good root through the official TUF client and persist it in the target repository namespace:

```bash
node sigstore-trusted-root-runner.js \
  --id STR-Production-PGI \
  --repository /path/to/repository \
  --mission MIS-Verification \
  --wave C0 \
  --write-artifact
```

For a custom deployment, provide `--tuf-mirror` and an out-of-band `--tuf-root`. For an already secured root file, use `--input` and record its real source with `--source-uri`. Root selection, replacement, freshness limits and policy references are human-controlled trust changes.

## 5. Configure Policy

Use `VerifierTrustPolicy` v0.3. The policy must cite the root artifact exactly and configure every Sigstore verifier:

```json
{
  "type": "sigstore_bundle",
  "certificate_identity_type": "uri",
  "certificate_identity": "https://github.com/owner/repository/.github/workflows/verify.yml@refs/heads/main",
  "certificate_issuer": "https://token.actions.githubusercontent.com",
  "trust_root_id": "STR-Production-PGI",
  "bundle_media_type": "application/vnd.dev.sigstore.bundle.v0.3+json",
  "ctlog_threshold": 1,
  "tlog_threshold": 1,
  "timestamp_threshold": 1
}
```

Identity values are literal. Runtime converts the SAN to an escaped, anchored regular expression only because the official API accepts a pattern; policy does not accept an operator-supplied regex.

## 6. Generate Evidence

The verifier private key remains outside the repository and must have mode `0600`. In a supported CI/OIDC environment, the runner can obtain the identity token, request a Fulcio certificate, upload to Rekor, assemble the bundle, verify it, and persist evidence:

```bash
node sigstore-verifier-identity-runner.js \
  --policy /secure/policy.json \
  --trusted-root /secure/trusted-root-artifact.json \
  --verifier VERIFIER-Remote-A \
  --private-key /secure/verifier-a.pem \
  --evidence-id SVE-Remote-A-001 \
  --repository /path/to/repository \
  --purpose verification_receipt \
  --purpose comparative_evaluation_report \
  --mission MIS-Verification \
  --wave C1 \
  --write-artifact
```

For external Cosign signing, fix `--issued-at`, `--expires-at`, and `--nonce`, emit the exact bytes, sign that file, then assemble with the same arguments plus `--bundle` and `--private-key`:

```bash
node sigstore-verifier-identity-runner.js \
  --policy /secure/policy.json \
  --trusted-root /secure/trusted-root-artifact.json \
  --verifier VERIFIER-Remote-A \
  --evidence-id SVE-Remote-A-001 \
  --repository /path/to/repository \
  --purpose verification_receipt \
  --issued-at 2026-07-22T06:00:00Z \
  --expires-at 2026-07-22T06:04:00Z \
  --nonce 4e40a8db-99d3-45ae-b70d-3944e67a35b9 \
  --statement-only > /secure/binding.json

cosign sign-blob --yes --bundle /secure/binding.sigstore.json /secure/binding.json
```

Do not reformat `binding.json`: the bundle signs its exact canonical bytes.

## 7. Dispatch Gate

Persist the root, policy and evidence in the same campaign mission namespace, then run:

```bash
node repository-artifact-verify.js --repository /path/to/repository
node campaign-supervisor.js \
  --repository /path/to/repository \
  --campaign SIC-Verification \
  --write-artifact
```

Dispatch requires a cycle-order v0.4 with `status: ready`, `execution_authorized: true`, satisfied purpose quorums, satisfied `identity_assurance`, and an unexpired `valid_until`. Missing, stale, mismatched or malformed evidence removes that verifier from every affected quorum. Release remains separately unauthorized.

## 8. Limits

- The adapter does not operate Fulcio, Rekor, CT logs, TUF repositories, monitors, witnesses, gossip, protected execution, HSMs or TEEs.
- A valid identity proves who signed the binding statement, not that the verifier program or host behaved honestly.
- A root snapshot can become stale or miss revocation/rotation information. Refresh it under human-controlled policy and compare the new manifest digest before use.
- One Rekor proof establishes inclusion under a verified checkpoint, not global log consistency or non-equivocation.
- Identity-provider and independence-group labels do not prove different infrastructure operators.
- `npm audit` and conformance fixtures reduce dependency risk but do not replace dependency review, update policy, or incident response.
