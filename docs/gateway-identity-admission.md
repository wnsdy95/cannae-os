# Gateway Identity Admission

## 0. Status

Phase 17B1 is implemented as an authenticated-reference identity adapter for
the Phase 17A protected tool gateway.

It proves, within one repository-manifest transaction:

```text
active USER-controlled identity policy
+ one gateway-signed transaction challenge
+ TLS 1.3 mutual certificate authentication
+ exact SPIFFE X.509 principal
+ TLS exporter channel binding
+ gateway-signed short-lived observation
+ one-use manifest references
= authenticated_reference principal admission
```

It does not prove that the gateway is independently managed, that its signing
key cannot be reached by the agent, that the gateway is the only path to a
tool, or that an executor is production-isolated. Therefore:

```text
assurance_level: authenticated_reference
exclusive_path_verified: false
production_execution_authorized: false
production_deployment_verified: false
release_authorized: false
```

`managed_exclusive` remains denied.

## 1. Standards Basis

- [SPIFFE X.509-SVID](https://spiffe.io/docs/latest/spiffe-specs/x509-svid/)
  requires one SPIFFE ID URI SAN in the workload leaf and validation against
  the selected trust domain.
- [SPIFFE Workload API](https://github.com/spiffe/spiffe/blob/main/standards/SPIFFE_Workload_API.md)
  defines delivery and rotation of short-lived X.509-SVIDs and trust bundles.
  The reference adapter consumes supplied TLS credentials; it does not operate
  a Workload API client.
- [TLS 1.3, RFC 8446](https://www.rfc-editor.org/rfc/rfc8446.html) defines the
  certificate and possession proofs established by the authenticated
  handshake.
- [Channel Bindings for TLS 1.3, RFC 9266](https://www.rfc-editor.org/rfc/rfc9266.html)
  defines the `EXPORTER-Channel-Binding` label, empty context, and 32-byte
  channel-binding value used here.
- [OAuth mTLS, RFC 8705](https://www.rfc-editor.org/rfc/rfc8705.html) provides
  the sender-constrained design principle: the resource boundary obtains and
  appraises the client certificate from its TLS stack.
- [OAuth Security BCP, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
  requires resource servers to enforce audience and proof-of-possession
  restrictions rather than treating a credential as a bearer assertion.
- [Node.js TLS](https://nodejs.org/api/tls.html#tlssocketexportkeyingmateriallength-label-context)
  exposes the TLS exporter through `tlsSocket.exportKeyingMaterial`.

The implementation is deliberately narrower than general PKIX path building.
It accepts a direct ordered chain to one pinned self-signed root and rejects
ambiguous, duplicate, inactive, wrong-role, wrong-SPIFFE, or revoked
certificates. It does not implement AIA retrieval, OCSP, CRL distribution,
name constraints, or every RFC 5280 extension.

## 2. Contracts

| Contract | Role | Binding |
| --- | --- | --- |
| `GatewayIdentityPolicy` | USER-controlled trust envelope | exact gateway and repository, adapter identifiers/key, TLS profile, roots, principals, revocations, TTLs |
| `GatewayIdentityChallenge` | one transaction liveness challenge | policy, mission, wave, agent, provider, session, gateway digest, repository, random nonce, issue/expiry, adapter signature |
| `GatewayPrincipalEvidence` | TLS observation | policy/challenge, transaction/session, principal and gateway digests, SPIFFE leaf/chain/root, server certificate, exporter, policy-pinned adapter identifiers, signature, expiry |
| `ToolGatewayRequest` v0.2 | execution request | exact references to all three identity artifacts |

`ToolGatewayDecision`, `ToolGatewayTransactionEvent`, and
`ToolExecutionReceipt` v0.2 repeat the same three references. The controller
rejects a transaction history that changes any reference.

For `contract_reference`, all three references are the exact all-`none`
sentinel. For `authenticated_reference`, all three must be concrete
repository-manifest references. Mixed references are invalid.

## 3. Trust Boundaries

### 3.1 USER policy

The identity policy retains `USER` as final decision authority and fixes
production and release authority to false. The reference artifact store proves
custody and exact bytes on one coherent shared filesystem. It does not by
itself prove that the person or process writing a policy was independently
authenticated.

Production operation must place policy approval, the adapter signing key, and
gateway configuration behind an administrative boundary unavailable to the
acting agent.

### 3.2 Adapter signing key

The policy pins the Ed25519 public key by SHA-256 SPKI key ID. The private key:

- is supplied to the adapter from outside the request and artifact payload;
- signs the unsigned challenge and evidence bytes;
- is never persisted by `gateway-identity-adapter.js`;
- must be held by a KMS, HSM, managed secret service, or separately protected
  process for any assurance above this reference level.

The signed-artifact digest includes the signature. Replacing an observation and
repairing only its digest still fails signature verification.

### 3.3 TLS observation

`observeMutualTlsSocket` reads identity from the gateway-side `TLSSocket`.
Caller-declared certificate or channel values are not accepted as proof.

The observation requires:

- `socket.authorized === true`;
- TLS 1.3;
- one valid SPIFFE URI SAN in a non-CA client leaf;
- an ordered chain to one exact policy root;
- an unrevoked principal ID and leaf digest;
- the exact policy-pinned server certificate digest;
- `EXPORTER-Channel-Binding`, empty context, 32-byte exporter output;
- exact policy-pinned adapter code, runtime, and configuration identifiers.

The exporter digest becomes `authenticated_principal.proof_sha256`. The client
leaf digest becomes `credential_sha256`.

### 3.4 Gateway deployment binding

Phase 17B1 derives the principal digest from manifest evidence. The separate
`gatewayBindingSha256` input is still expected from an independently trusted
deployment/configuration appraiser. The acting agent cannot calculate that
digest and treat it as independent evidence.

## 4. Operation

### 4.1 Persist policy

First complete routing, mission preflight, dispatch-policy authorization, and
lease issuance. Then persist the identity policy:

```bash
node gateway-identity-adapter.js persist-policy \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --mission <mission-id> \
  --wave <wave-id> \
  --policy <gateway-identity-policy.json>
```

Retain the returned `policy_ref`. Do not copy a policy into a request by path
without manifest custody.

### 4.2 Issue one challenge

```bash
node gateway-identity-adapter.js issue-challenge \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --policy-ref <policy-ref.json> \
  --private-key <adapter-private-key.pem> \
  --transaction <transaction-id> \
  --mission <mission-id> \
  --wave <wave-id> \
  --agent <agent-id> \
  --provider <codex-or-claude_code> \
  --session <provider-session-id> \
  --provider-agent <provider-agent-id>
```

The adapter always generates a 32-byte random nonce internally. One transaction can
have one retained challenge. One challenge can produce one retained principal
evidence artifact. Challenge issuance and evidence consumption are checked and
written under an expiring repository identity lease, so concurrent writers on
one coherent filesystem serialize and the loser fails before a second usable
artifact is admitted. This is not a distributed linearizable lock.

### 4.3 Observe mTLS and create evidence

The gateway process performs the TLS handshake and passes the live server-side
`TLSSocket` itself to the adapter API. The adapter derives the observation
internally; it does not accept a caller-built observation object:

```js
const {
  createGatewayPrincipalEvidence
} = require("./gateway-identity-adapter");

const identity = createGatewayPrincipalEvidence(
  {
    repository,
    artifactRoot,
    adapterPrivateKeyPem,
    now: observedAt
  },
  {
    identityPolicyRef,
    identityChallengeRef,
    transactionId,
    missionId,
    waveId,
    agentId,
    provider,
    sessionId,
    providerAgentId,
    tlsSocket: serverTlsSocket
  }
);
```

Build `ToolGatewayRequest` v0.2 with the returned:

- `gateway`;
- `authenticated_principal`;
- `identity_policy_ref`;
- `identity_challenge_ref`;
- `evidence_ref` as `principal_evidence_ref`.

Do not extend request validity beyond the evidence expiry.

### 4.4 Admit and continue

For `authenticated_reference`, omit the caller-supplied principal digest. The
controller derives it from the three manifest artifacts:

```bash
node protected-tool-gateway.js admit \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --request <tool-gateway-request.json> \
  --tool-input <tool-input.json> \
  --gateway-binding-sha256 <trusted-gateway-digest>
```

`begin`, `commit`, and `recover` re-run identity verification at their supplied
evaluation time. Challenge, evidence, certificate, root, policy, request, and
decision validity must cover the transition. Expired evidence does not renew
itself from conversation or session history.

The current request identity chain is immutable. A future recovery design that
needs re-authentication must define a separate USER-controlled recovery
credential and event contract; it must not rewrite the original request.

### 4.5 Inspect identity evidence

```bash
node gateway-identity-adapter.js verify \
  --repository <repo> \
  --artifact-root <artifact-root> \
  --request <tool-gateway-request.json> \
  --at <timestamp>
```

This verifies exact manifest references, signatures, digests, certificate
chain, SPIFFE identity, policy/revocation/freshness, request projection, one-use
challenge state, and cross-transaction replay.

## 5. Failure Rules

| Condition | Result |
| --- | --- |
| Policy, challenge, or evidence reference missing or changed | deny |
| Adapter signing key or artifact signature mismatch | deny |
| Challenge or evidence digest repaired after payload change | deny |
| Challenge/evidence/policy/root/certificate not active | deny |
| Challenge already consumed | do not create evidence |
| Challenge or evidence used by another transaction | deny replay |
| TLS earlier than 1.3 or peer not authorized | do not observe |
| Missing, multiple, malformed, or wrong-domain SPIFFE URI SAN | deny |
| Chain does not terminate at one exact root | deny |
| Principal ID or leaf digest revoked | deny |
| Server certificate differs from policy | deny |
| TLS exporter differs from principal proof projection | deny |
| Agent, provider, session, repository, audience, or gateway differs | deny |
| `managed_exclusive` claimed | deny |

## 6. Residual Limits And Next Phase

Phase 17B1 is not a production execution gateway. Remaining Phase 17B work:

1. Provider-specific shell, filesystem, MCP, network, and delegation executors.
2. OS/container sandbox and egress policy with adapter measurement and
   independently appraised deployment evidence.
3. Proof that direct side paths fail when the gateway is unavailable.
4. A linearizable coordinator and storage-side fencing across hosts.
5. Managed key rotation, Workload API integration, revocation distribution,
   incident, break-glass, reconciliation, and multi-user administration.
6. Independent gateway code/configuration/deployment attestation.

Only those controls can justify a later `managed_exclusive` assurance level.

## 7. Validation

```bash
node validator-cli-prototype/run-fixtures.js
node run-gateway-identity-adapter-fixtures.js
node run-protected-tool-gateway-fixtures.js
node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .
```

The TLS fixture uses real ephemeral Ed25519 CA, server, and client certificates,
a real TLS 1.3 mutual-authentication handshake, equal client/server exporter
bytes, adapter signatures, repository-manifest custody, dispatch admission, and
gateway commit. It also rejects expiry, cross-transaction replay, challenge
reuse, revocation, digest-repaired signature tampering, and SPIFFE/certificate
substitution.
