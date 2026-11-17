# Native Producer Regression Fixtures

The pinned archives are exact candidate sources `cab6d09` and `bcb79dd`, not
runtime executable configuration. Snapshot v0.2 references the already retained
older source archive by exact path/size/hash instead of embedding a recursive
copy. Verify every buffer before extraction, hydrate the complete tree, and
require the original tree/commit/source and method digests. Missing or substituted
blobs never become a partial accepted producer.
Only the fixture restores verified bytes and original Git
identity to generate actual synthetic old-producer records. Production replays
evidence with the current engine without running this archive.

`write-samples.js` regenerates the inspection schema and valid/invalid samples,
never the historical catalog/archive. Do not silently regenerate prior bytes.
Run the producer contract, snapshot and actual prior-producer runners; see
[producer history](../docs/native-training-producer-history.md) for invariants.
