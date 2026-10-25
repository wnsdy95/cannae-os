# Native Producer Regression Fixtures

The pinned archive is exact candidate source `cab6d09`, not runtime executable
configuration. Only the fixture restores verified bytes and original Git
identity to generate actual synthetic old-producer records. Production replays
evidence with the current engine without running this archive.

`write-samples.js` regenerates the inspection schema and valid/invalid samples,
never the historical catalog/archive. Do not silently regenerate prior bytes.
Run both producer fixture runners; see
[producer history](../docs/native-training-producer-history.md) for invariants.
