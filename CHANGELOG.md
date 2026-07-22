# Changelog

All notable changes to Cannae OS will be documented in this file.

This project follows a pragmatic versioning model while it is pre-1.0. Breaking changes may happen in doctrine, schemas, runners, and skills until the runtime contracts stabilize.

## Unreleased

- Added Phase 13 transparency operations: trust-policy/cycle-order v0.7, durable append-only checkpoint state, RFC 6962 consistency proofs, distinct witness/monitor operator quorums, sequential dual-threshold TUF root rotation and expiry, immutable incident supersession and revocation history, manifest-backed supervisor admission, adversarial fixtures, and official research traceability.
- Added Phase 12C verifier failure-domain independence: trust-policy v0.6, runtime-policy and execution-evidence v0.2, nine required component identities, transitive correlation domains, declared-label bypass prevention, supervisor/cycle projection, execution-bound receipt/report quorum, adversarial fixtures, and official research traceability.
- Added Phase 12B pre-dispatch verifier challenge: trust-policy v0.5, supervisor-issued manifest-backed challenge sets, per-verifier 32-byte nonces, exact task/lineage/policy/runtime binding, dual-signed identity-evidence responses, deadline and single-use enforcement, cycle-order v0.5 admission, adversarial fixtures, and research traceability.
- Added Phase 12A verifier execution integrity: trust-policy v0.4 runtime-policy admission, exact verifier code/OCI/dependency/harness/tool/network/sandbox bindings, dual-signed in-toto execution evidence, provider profile contracts, manifest-backed receipt/report integration, semantic validation, adversarial fixtures, and research traceability.
- Added trust-policy v0.2 and `VerifierIdentityEvidence` with SPIFFE X.509-SVID identity, dual workload/static-key signatures, pinned log checkpoints, RFC 6962-style Merkle inclusion, repository binding, purpose binding, and bounded freshness.
- Added cycle-order v0.3 authenticated workload admission, manifest-backed identity references, real OpenSSL adversarial fixtures, end-to-end supervisor blocking, official SPIFFE/Sigstore/RFC research traceability, and Codex/Claude routing.
- Added cycle-order schema v0.2 and fail-closed campaign admission that computes receipt and comparative verifier readiness from the exact manifest-bound trust policy before dispatch.
- Added purpose, repository, key identity, status, validity, distinct-key, and independence-group readiness fixtures; cycle orders now bind a conservative admission expiry and reject self-declared quorum satisfaction.
- Added self-improvement schema v0.4 with Ed25519 DSSE attestations over exact persisted comparative reports, purpose-specific in-toto predicates, and distinct verifier/key/independence-group quorum.
- Bound signed comparative evidence to report and artifact digests, plan, evaluation set, campaign, mission, cycle, baseline, candidate, repository, evaluator invocation, origin, and validity window; added controller manifest reload and supervisor proof requirements.
- Added comparative report signing CLI, valid/invalid contracts, adversarial replay/rebinding/tamper fixtures, research traceability, and Codex/Claude skill routing.
- Added baseline-versus-candidate comparative control-plane promotion with sealed evaluation sets, identical harness execution, absolute thresholds, non-regression limits, and promotion/rollback/inconclusive outcomes.
- Added bounded self-improvement v0.3 with Ed25519 DSSE verification attestations, in-toto statement bindings, exact human-controlled trust-policy references, fresh multi-verifier quorum, key/group diversity, and remote attestation transport.
- Upgraded repository artifact manifests to v0.4 with expiring shared-filesystem leases, monotonic fencing tokens, immutable revision reservation, stale-writer rejection, and exact crash recovery after history creation.
- Added signed-attestation, signed self-improvement, multi-writer lease, stale-writer, replay, receipt-rebinding, and history-reservation regression fixtures.
- Aligned corpus validation with artifact isolation by excluding the Git-ignored `.cannae` runtime proof store from source JSON parsing.
- Added proof-carrying self-improvement v0.2 with shell-free verification plans, runtime-issued receipts, receipt-bound quality evidence, exact accepted-parent lineage, and consumed approval-ledger bindings.
- Upgraded repository artifact manifests to v0.3 with write-ahead journals, immutable hash-linked history, digest sidecars, crash recovery, integrity verification, and tamper fixtures.
- Added bounded self-improvement campaign, checkpoint, and decision contracts for evidence-driven evolution of in-progress work.
- Added a repository-bound campaign bootstrap, deterministic improvement controller, mandatory completion gate, baseline lineage, rollback/escalation logic, and adversarial fixtures.
- Added cross-process repository artifact locking, fail-closed stale-lock recovery, monotonic manifest revisions, and 24-writer concurrency stress coverage.
- Updated Codex and Claude Code skills to require finite adaptive campaigns while preserving human policy, authority, merge, push, and release decisions.
- Added explanatory README SVG diagrams for the operating loop, repository map, delegated routing preflight, authority gates, and validation stack.
- Added open-source governance, contribution, support, security, issue, PR, and CI scaffolding.

## 0.1.0 - Initial Public Prototype

- Published Cannae OS as a documentation-first operating framework for human-led LLM agent control.
- Added dual license: Apache-2.0 OR MIT.
- Added doctrine, schemas, samples, fixtures, runners, Codex skill, and Claude Code skill.
- Added README sections for direction, maturity, limitations, validation, and roadmap.
