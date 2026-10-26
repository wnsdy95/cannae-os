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
The candidate registry uses the four argument-free root suites named there,
not the router's argument-bearing group command. Every group remains required;
the full root aggregate also exercises those entry points without skipping its
original full matrix. The source fixture tests their exact mapping and closed
argument boundary before its actual copied-source drift check.
The owner ceremony/UI/receipt consumer and actual hold discharge remain absent.
