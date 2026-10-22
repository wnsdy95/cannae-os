# Dispatch Issuance Fixtures

`contracts.js` produces synthetic structural examples, never real authorization.
`run-dispatch-issuance-contract-fixtures.js` checks exact body/scope commitments,
non-authorizing records, strict versioning and finite frozen validity.

`run-dispatch-issuance-fixtures.js` uses actual temporary repositories, retained
adoption and real dispatch/task consumers. It interrupts request, supersession,
lease, baseline and resolution publication, then requires exact recovery without
duplicate reads or renewed ID/nonce/expiry. Cancellation, drift, expiry,
revocation and schema-valid legacy downgrade remain separate cases.
Real store-journal fault stages, final-publication stop races, schema-valid
substitution attacks and two actual concurrent CLI issuers have separate cases.

`run-dispatch-issuance-store-fixtures.js` distinguishes an uninitialized first
wave from valid, journaled and corrupt stores. The inspection guard never
initializes synthetic history, silently recovers a journal or hides corruption.
`source-runtime.js` and its worker modify only a disposable copied Git runtime.
They distinguish pending recovery from final-resolution journal recovery,
require the actual next-call and final-publication source checks, preserve
already-admitted results and explicit revocation, and prove an unchanged
recovered grant executes only its remaining task with the original nonce and
expiry. That is source-entry drift coverage, not protected execution attestation.

The optional `--case=<name>` selects one diagnostic case; the aggregate runs all
cases with no filter. Temporary fixture state is not actual USER consent or
protected production evidence. Read [the procedure](../docs/dispatch-issuance-recovery.md)
before operating a real repository.
