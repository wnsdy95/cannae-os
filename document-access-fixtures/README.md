# Document Access Fixtures

These fixtures verify role/duty/authority-scoped document reading.

- `sample-payloads/valid-document-access-manifest.json`: S2, Executor, and S6 can read only role-appropriate documents, with sensitive documents downgraded to summary where needed.
- `sample-payloads/invalid-document-access-manifest-overbroad.json`: blocks broad/bulk access, missing allowed roles/duties, raw restricted access, low authority, denied document conflicts, and missing declared documents.
