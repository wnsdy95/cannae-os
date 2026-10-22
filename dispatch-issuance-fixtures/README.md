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
It also modifies a covered source entry in a disposable runtime copy and proves
exact recovery stays denied while one actual task read and terminal history
remain preserved. That is source-entry drift coverage, not protected execution
attestation.

The optional `--case=<name>` selects one diagnostic case; the aggregate runs all
cases with no filter. Temporary fixture state is not actual USER consent or
protected production evidence. Read [the procedure](../docs/dispatch-issuance-recovery.md)
before operating a real repository.
