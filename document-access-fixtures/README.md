# Document Access Fixtures

These fixtures verify role/duty/authority-scoped document reading.

- `sample-payloads/valid-document-access-manifest.json`: S2, Executor, and S6 can read only role-appropriate documents, with sensitive documents downgraded to summary where needed.
- `sample-payloads/invalid-document-access-manifest-overbroad.json`: blocks broad/bulk access, missing allowed roles/duties, raw restricted access, low authority, denied document conflicts, and missing declared documents.
- `sample-payloads/valid-document-access-manifest-bounded.json`: keeps raw, summary and optional reference-only delivery distinct without claiming approval or execution authority.
- `sample-payloads/invalid-document-access-manifest-ambiguous.json`: rejects duplicate document/profile policies, required reference-only reading and optional/denied conflicts.

`node run-document-access-fixtures.js` exercises the API and actual CLI, including
schema rejection inside the consumer, unknown authority, profile-only selection,
all-or-nothing blocked output, required/optional delivery, duplicate ordering,
path aliases/directories/symlinks and nonzero CLI exits. Malformed JSON diagnostics
must not echo input contents. Temporary cases are removed after testing.

These checks validate metadata projection, not actual file access enforcement,
caller authentication, source freshness, summary preparation, receiver acceptance
or cross-repository source delivery. They do not call a model.
