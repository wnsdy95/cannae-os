# Training Session Consent

## Candidate Scope

This local implementation connects a separately retained training-session
proposal to the existing authenticated owner console and worker queue. It is
not task qualification, evaluator competence, model attestation or a new tool
grant. Full current-source verification and controlled installed rollout remain
separate. All eight program outcomes remain open.

The owner reviews the complete proposal, enrolled capability/performer, standard,
conditions/cases, lease/context/policy and repository/source commitments. Commit
requires a fresh password, the same session/epoch, one-use nonce, exact independently
computed display digest and a session-only acknowledgment. Definition enrollment
consent, plan adoption and model transfer approval cannot substitute for this purpose.

## Procedure

1. Enroll the exact definitions and standard, then separately authorize policy
   and issue the intended current lease. Session registration issues no lease.
2. Prepare a request containing `mission_id`, `wave_id`, `capability_id`,
   `performer_id`, `expected_registry_head_ref`, `lease_ref`, `stage`, `case_ids`
   and `expires_at`. Its expiry cannot exceed the lease or standard. Submit only
   those exact requested training cases; do not label a previous call as training.
3. Run `node training-session-cli.js propose <request.json> --repository <repo>
   --artifact-root <artifacts>`. Both skills supply the proposal-only wrapper
   `scripts/prepare_controls_training_session.js`; there is no signing/approve CLI.
4. In Evidence, inspect the owner-only `task-training-session-proposals` item
   and request Training Session Review. Review the entire displayed content,
   then enter the owner password, rationale and separate acknowledgment.
5. Retain the resulting authorization and binding references. The original
   signed review must precede the binding, with no intervening publication, and
   both must precede the counted admission. Complete the separately authorized
   execution, retain actual output and appraise it through task-training intake.

## Failure And Compatibility

The executor uses the actual dispatch control lock. It rechecks the current
registry/configuration, active lease, untouched repository, readiness, stop,
manifest, owner/session and running source before publication. A prior admission,
duplicate mapping or orphan authorization holds registration. Restart invalidates
pending challenges and preserves reserved or uncertain actions. Logout, revocation,
expiry and subject drift cannot be repaired by replaying a nonce or changing a
digest label. An attempted partial write remains a durable reconciliation hold;
automatic recovery/discharge is not implemented here.
The HTTP logout endpoint destroys the session as well as recording its audit
event. An audit helper alone does not revoke authentication. Logout prevents
further consent writes; it does not itself revoke a separately authorized tool
lease. Mission stop, result settlement and explicit lease revocation remain distinct.

`TaskTrainingSessionBinding` v0.2 refers to its exact original signed
`TaskTrainingSessionAuthorization`. The intake independently verifies that chain
against immutable prefixes, not an incoming key. Its current v0.2 appraisal exposes
`owner_session_ceremony_verified`. Historical v0.1 mappings remain readable as
reference evidence but cannot acquire that assurance retrospectively. Neither
value proves an LLM performed the task well. All quality, qualification, restoration,
execution and release flags remain false except the separate observed-call success
fact, which is not an authority field.

## Remaining Work

Implement the distinct exact-consent native task-product collection purpose,
complete failure inventory, authenticated step evaluation, USER qualification,
P-stage supervision and mandatory stable assignments through actual grant and
gateway consumers. Settle/revoke old scopes before restoration. Complete uncertain
session reconciliation, organization lifecycle, CoS/COP and operational rollout.

Tests use only isolated synthetic owners and actual local file reads. No real
owner credentials, installed service, real model or production gateway is operated.
