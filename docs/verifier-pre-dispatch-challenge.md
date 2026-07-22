# Verifier Pre-Dispatch Challenge

## 1. Purpose

Phase 12A proves that approved verifier code and runtime controls produced evidence. It does not prove that a registered verifier is currently online and able to answer for the exact work about to be dispatched.

Phase 12B adds a supervisor-issued challenge before dispatch. Trust-policy v0.5 requires every verifier counted in a purpose quorum to return fresh, dual-signed workload identity evidence containing its assigned nonce. Missing, late, stale, mismatched, ambiguous, or replayed responses are excluded before a cycle order can become `ready`.

```text
Identity valid
+ Exact verifier code valid
+ Execution environment valid
+ Fresh challenge valid
+ Independence valid
= Verifier may enter quorum
```

Phase 12B implements the fresh-challenge term. Phase 12C still must evaluate actual independence and failure domains.

## 2. Standards Basis

The design follows four primary-source rules:

- RFC 9334 describes freshness through an unpredictable nonce sent by the appraising entity, signed into evidence, compared on return, and retained as verifier state.
- RFC 9449 requires an exact server-nonce match, limits proof lifetime, and describes server-side identifiers or state for rejecting reuse.
- WebAuthn requires challenges with enough entropy to make guessing infeasible and verifies the returned challenge exactly.
- NIST SP 800-63B defines replay resistance as preventing a recorded authentication message from succeeding again and uses random nonces in replay-resistant transactions.

Controls uses 32 random bytes per verifier, which is a conservative local floor above WebAuthn's 16-byte recommendation. This is a Cannae policy choice, not a claim that every source mandates 32 bytes.

## 3. Contracts

### 3.1 `VerifierTrustPolicy` v0.5

Version 0.5 retains identity and execution assurance and adds:

```json
{
  "challenge_assurance": {
    "required": true,
    "nonce_bytes": 32,
    "response_timeout_seconds": 120,
    "single_use": true,
    "issuer_key_id": "<sha256-of-supervisor-ed25519-spki>",
    "issuer_public_key_pem": "-----BEGIN PUBLIC KEY-----..."
  }
}
```

The timeout is bounded to 5 through 900 seconds. The human-approved policy pins a dedicated Ed25519 challenge-issuer key distinct from every verifier key. Challenge success never changes release authority.

### 3.2 `VerifierChallengeSet`

The supervisor persists one challenge set for one projected dispatch state. It binds:

- campaign, mission, repository key, and repository identity fingerprint;
- exact trust-policy and runtime-policy artifact references;
- observed manifest revision and digest at issuance;
- cycle, attempt, transition, baseline, accepted parent, source checkpoint, and source decision;
- checkpoint trigger, task-order digest, and proof-requirements digest;
- one unique cryptographically random nonce and purpose set per eligible verifier;
- supervisor identity, issue time, expiry, single-use status, and `release_authorized: false`;
- a policy-pinned Ed25519 issuer signature over the complete canonical challenge set.

More than one matching challenge set is ambiguous and blocks dispatch. A challenge for another task, attempt, baseline, lineage, repository, policy, or runtime policy cannot be substituted.

### 3.3 Challenge response

The response is the existing Phase 11 `VerifierIdentityEvidence` or `SigstoreVerifierIdentityEvidence`, not a second unsigned wrapper. The selected workload credential and the separately registered verifier key already sign the same binding statement. Under v0.5, that statement must contain the exact nonce assigned to the verifier and must be issued inside the challenge window.

The cycle order records each accepted response as:

- verifier ID and authorized purposes;
- exact manifest ID, path, and SHA-256 of the identity evidence;
- response issue time.

This avoids a redundant signature format while retaining an exact manifest-backed response record.

### 3.4 `SelfImprovementCycleOrder` v0.5

The order adds `trust_policy_admission.challenge_assurance`. A ready order requires:

- one exact active challenge-set reference;
- distinct response evidence for every verifier counted in receipt and comparative quorums;
- response issue times inside the challenge window;
- no challenge blocking code;
- an admission `valid_until` no later than challenge expiry.

The supervisor remains the only component that derives this admission. Agent prose, an old order, or a nonce copied from another dispatch cannot satisfy it.

## 4. State Machine

```text
eligible v0.5 projection
  -> supervisor persists challenge set
  -> supervisor emits blocked order
  -> verifiers return dual-signed identity evidence with exact nonces
  -> supervisor reloads manifest and verifies every response
  -> required purpose quorums satisfied
  -> supervisor emits time-bounded ready order
```

Failures behave as follows:

| Condition | Result |
| --- | --- |
| No challenge set | Issue one only when all other policy/runtime checks permit bootstrap; otherwise block |
| No response or wrong nonce | Exclude verifier and block if quorum is unavailable |
| Response before issue or at/after expiry | Exclude verifier |
| Expired challenge | Block; issue a new challenge only for a new valid supervision attempt |
| Multiple matching challenge sets | Block as ambiguous |
| Challenge consumed by a different dispatch | Block as replay |
| Same state and same persisted order | Return the existing order idempotently |

## 5. Operation

Persist trust-policy v0.5 and its exact runtime policy, then run the supervisor with artifact writing enabled:

```bash
node campaign-supervisor.js \
  --repository /path/to/repository \
  --campaign SIC-Example \
  --challenge-private-key /secure/supervisor-challenge.pem \
  --write-artifact
```

The private key must be a regular non-symlink file with mode `0600` or stricter and must match the issuer key pinned by trust-policy v0.5. The first v0.5 call intentionally exits nonzero because execution remains blocked. It persists both the signed challenge set and a hold order. Each verifier reads only its own entry and supplies that nonce to its selected workload-identity adapter.

For a Sigstore verifier:

```bash
node sigstore-verifier-identity-runner.js \
  --policy trust-policy.json \
  --trusted-root trusted-root.json \
  --verifier VERIFIER-A \
  --private-key /secure/verifier-a.pem \
  --bundle verifier-a-bundle.json \
  --evidence-id VIE-C1-A \
  --purpose verification_receipt \
  --purpose comparative_evaluation_report \
  --nonce <assigned-challenge-nonce> \
  --issued-at <inside-challenge-window> \
  --expires-at <after-supervisor-reevaluation> \
  --repository /path/to/repository \
  --mission MIS-Example \
  --wave C1 \
  --write-artifact
```

SPIFFE deployments call `createVerifierIdentityEvidence` through their workload adapter with the same exact nonce. After every required response is persisted, rerun `campaign-supervisor.js`. Execute only the resulting v0.5 order when `status` is `ready`, `execution_authorized` is true, trust, identity, and challenge admission are satisfied, and `valid_until` has not been reached.

Run the adversarial suite:

```bash
node run-verifier-challenge-fixtures.js
```

## 6. Security Boundaries

The challenge proves recent control of the accepted workload credential and verifier key for one exact dispatch projection. It does not prove that the verifier stays online after response, that its infrastructure is independent, or that a compromised workload is honest. Phase 12A execution evidence is still required for every later receipt or report attestation under v0.5.

The issuer signature authenticates the challenge authority; repository manifest history supplies issuance and consumption state. The built-in shared-filesystem coordinator is not partition tolerant. Multi-host deployments require a linearizable coordinator and storage-side fencing so two supervisors cannot independently issue or consume challenges during a partition.

Challenge success never authorizes merge, push, deployment, policy change, trust-root change, or release.
