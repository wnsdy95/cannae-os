# Tool Effect Review

## Purpose And Boundary

Prepare a reviewable, exact evidence packet for an unknown tool outcome. This
is the first stage of effect reconciliation, not a settlement operation. It
does not clear `UNRESOLVED_TOOL_EFFECTS`, renew a lease, resume a campaign,
approve a new wave, authenticate a USER, accept risk, or authorize release.

`evidence_bound` means that retained records and verification claims match.
It does **not** mean that the effects are known, harmless, complete, independently
verified, or approved. The receipt's self-digest is a consistency check, not a
signature. An authorized writer can manufacture consistent local claims. The
future settlement gate must separately appraise authenticated verification,
applicable trust-policy assurance, complete effect scope, and exact USER consent.
Do not downgrade an existing workload-identity, execution-environment,
challenge, independence, or transparency requirement to a static signature.

## Prepare The Packet

1. Read dispatch status. Select one exact unresolved checkpoint and its lease
   and admitted tool invocation. Keep the original failure and every subsequent
   checkpoint intact; zero pending callbacks does not establish settlement.
2. Collect observations under the same repository, mission, and wave in the
   `tool-effect-observations` artifact kind. These are untrusted source records,
   not a privileged evidence type. Preserve exact bytes and record collection
   time after the failure. Apply existing disclosure controls before retention.
3. Draft a `ToolEffectScope` from
   [the sample](../sample-payloads/valid-tool-effect-scope.json). List each resource,
   proposed disposition, observation references, and verification check IDs.
   Explain coverage, including external resources the tool could affect. Scope
   expiry must be positive and at most one hour. `unresolved` is a valid draft
   disposition but blocks an evidence-bound review.
4. Persist the scope in `tool-effect-scopes`. Compute its canonical digest with
   the existing dispatch `hash-input` command. This digest is deliberately
   different from the artifact's byte digest. Keep both identities exact.
5. Prepare an existing `VerificationPlan` with `candidate_id` equal to the scope
   ID, `candidate_revision` equal to the canonical scope digest, and the exact
   current repository identity/state. Every check must be mapped to a resource;
   every resource must have a check. Pass the exact retained scope path and
   canonical digest as separate arguments:

   ```text
   --effect-scope <manifest-relative-scope-path> --effect-scope-sha256 <canonical-digest>
   ```

   The checker must resolve the correct artifact root, read that scope and its
   referenced observations, and test the resource claims. Argument binding makes
   the input available; it cannot prove that arbitrary checker code uses it.
   USER review must assess checker adequacy and scope completeness separately.
6. Obtain an actual `VerificationReceipt` through the existing verification
   workflow and independently authorized inspection environment. An unknown
   effect hold is not permission to run an agent's tools or a compensating action.
   This reviewer executes no checker and grants no inspection authority. Persist
   the exact plan and receipt in `verification-plans` and `verification-receipts`
   under the scope's mission/wave (not a different campaign-cycle namespace).
7. Run the reviewer with a JSON references file containing **only**
   `scope_ref`, `verification_plan_ref`, and `verification_receipt_ref`. Each
   reference has `artifact_id`, `relative_path`, and `sha256` from the manifest:

   ```bash
   node tool-effect-review.js --repository <repo> --artifact-root <artifact-root> \
     --references <exact-references.json> --write-artifact
   ```

The reviewer validates the manifest and reference kinds, mission/wave/agent,
provider/session, exact lease/admission/checkpoint chain, unknown-effect
projection, repository identity and unchanged live state, candidate and plan
digests, receipt digest, complete check set, exact argv/result bindings, and
numeric-time ordering. It rejects substituted kinds, stale or future proof,
missing checks, unresolved resources, malformed contracts, and wrong references.
Observations must be retained between the failure and scope creation. The plan
and receipt must follow the scope and finish before review and scope expiry.

Optional persistence rechecks the packet inside the artifact publication guard.
A changed repository, expired scope, or changed binding cannot publish the
previously positive result. No raw tool input or observation content is copied
into the review projection.

## Read The Result

| Result | Meaning | Next action |
| --- | --- | --- |
| Exit 0, `evidence_bound` | Consistent, fresh, retained evidence claims | Review authenticity, checker adequacy, external scope, and USER decision requirements; keep the hold |
| Exit 1, `blocked` | Structurally valid inputs with failed bindings or checks | Address the exact reason codes; retain the rejected history |
| Exit 2 | Invalid contracts, references, or store | Repair the input or investigate store integrity; do not hand-insert a positive review |

Every review fixes `effects_settled`, `scope_completeness_verified`,
`verifier_identity_verified`, `user_decision_verified`,
`tool_execution_authorized`, and `release_authorized` to false. An observation,
receipt, review, chat approval, or clean Git status alone cannot clear the hold.

## Remaining Settlement Work

The separate terminal contract must bind one exact USER decision to the scope,
review and proof digests, independently verify all applicable verifier assurance,
consume consent once, and append an immutable settlement record. Historical
replay needs original-time appraisal without rewriting failed checkpoints.
Gateway transaction/cleanup evidence, conflicting decisions, competing
publications, and subsequent lease issuance require end-to-end fixtures. Scope
judgement must not be described as mechanically proven absence of arbitrary
external effects. Campaign stops, budgets, expiry, and release gates remain
independent after any future settlement.

These are engineering conclusions from the local unknown-effect reproduction
and existing authority contracts, not a new external military-source claim.
See [dispatch lifecycle](enforced-dispatch-and-resume.md),
[approval scope](approval-scope-policy.md),
[completion backlog](completion-backlog.md), and
[fixtures](../run-tool-effect-review-fixtures.js).
