# Training Session Ceremony Fixtures

Use `node run-training-session-contract-fixtures.js` and
`node run-training-session-fixtures.js`. The actual HTTP path uses isolated
synthetic owners, the real worker/executor, separately issued dispatch leases
and an actual local file read. It does not manually sign its positive session
mapping or read an installed owner key. No real model or real owner is operated.

Cases cover purpose/display/nonce/password/session/viewer boundaries, pre-call
registration and actual result appraisal, prior-call rejection, expiry,
interruption, partial writes, logout and restart holds. This is not positive
qualification, operational grant restoration or protected-host attestation.
