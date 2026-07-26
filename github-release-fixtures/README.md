# GitHub Release Publisher Fixtures

`run-github-release-publisher-fixtures.js` exercises the exact terminal release
boundary without contacting GitHub.

The fixture adapter covers:

- one USER-granted, repository/tag/commit/notes/CI-bound authorization whose
  terminal `release_authorized` value is true;
- dirty repository, foreign repository, wrong-commit CI, expired authority,
  and post-authorization release-note drift;
- one exact publish followed by an idempotent retry;
- an existing release whose tag resolves to the wrong commit;
- a partial state where a tag exists without a GitHub release; and
- static valid and adversarial authorization and receipt payloads.

The runner never broadens the lower execution, verifier, gateway, sandbox, or
self-improvement contracts. Their `release_authorized` fields remain false.
