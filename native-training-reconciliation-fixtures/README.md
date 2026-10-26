# Native Failure Recovery Fixtures

The contract runner checks three strict non-authorizing wrappers, exact displayed
scope, historical response commitments, publication prefixes, signatures,
cross-purpose rejection and measured runtime bindings.

The runtime runner generates actual synthetic failures before/after each
canonical publication boundary. It replays original journals/native events,
preserves holds and never calls publication to repair missing output.
The default executes all five cases; `--case <name>` is only a focused selection.

`write-samples.js` generates schemas and synthetic signed samples with an
ephemeral test key. Only its public key is retained; these samples are not live
owner consent. No authentication database, raw model payload or private key
belongs in a source snapshot.

See [native failure recovery](../docs/native-training-failure-reconciliation.md).
The owner ceremony/UI/receipt consumer and actual hold discharge remain absent.
