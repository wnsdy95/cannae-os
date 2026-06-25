#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const { projectDocumentAccess } = require("./document-access-runner");

const ROOT = __dirname;

function readJson(relativePath) {
  return require(path.join(ROOT, relativePath));
}

function validate(file, expectedCode, requiredCodes = []) {
  const result = spawnSync("node", ["validator-cli-prototype/validate.js", file, "document-access-manifest"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.strictEqual(result.status, expectedCode, result.stdout || result.stderr);
  const parsed = JSON.parse(result.stdout);
  const codes = new Set((parsed.issues || []).map(issue => issue.code));
  for (const code of requiredCodes) {
    assert(codes.has(code), `expected validator issue ${code}`);
  }
}

const fixtures = [
  {
    name: "S2 source verification gets only source documents",
    file: "sample-payloads/valid-document-access-manifest.json",
    validate() {
      validate(this.file, 0);
      const projection = projectDocumentAccess(readJson(this.file), "S2", "source_verification", "L0");
      assert.strictEqual(projection.status, "ready");
      assert(projection.allowed_documents.some(item => item.path === "docs/source-map.md"));
      assert(projection.allowed_documents.some(item => item.path === "docs/research-compendium.md" && item.delivery_mode === "summary"));
      assert(projection.denied_documents.some(item => item.path === "docs/risk-acceptance-authority.md"));
    }
  },
  {
    name: "Executor assigned execution cannot read commander-only documents",
    file: "sample-payloads/valid-document-access-manifest.json",
    validate() {
      const projection = projectDocumentAccess(readJson(this.file), "EXECUTOR", "assigned_execution", "L1");
      assert.strictEqual(projection.status, "ready");
      assert(projection.allowed_documents.some(item => item.path === "docs/implementation-guide.md"));
      assert(projection.denied_documents.some(item => item.path === "docs/commander-handbook.md"));
      assert(projection.denied_documents.some(item => item.path === "docs/risk-acceptance-authority.md"));
    }
  },
  {
    name: "overbroad document access manifest is blocked",
    file: "sample-payloads/invalid-document-access-manifest-overbroad.json",
    validate() {
      validate(this.file, 1, [
        "DOCUMENT_ACCESS_WITHOUT_NEED_TO_KNOW",
        "DOCUMENT_ACCESS_ALLOWS_BULK_READ",
        "DOCUMENT_ACCESS_WITHOUT_AUDIT",
        "DOCUMENT_ACCESS_EXCEPTION_WITHOUT_APPROVAL",
        "DOCUMENT_ACCESS_WILDCARD_PATH",
        "DOCUMENT_ACCESS_WITHOUT_ALLOWED_ROLES",
        "DOCUMENT_ACCESS_WITHOUT_DUTIES",
        "DOCUMENT_ACCESS_SENSITIVE_RAW_TOO_BROAD",
        "DOCUMENT_ACCESS_RESTRICTED_RAW",
        "DOCUMENT_ACCESS_REQUIRED_DOC_NOT_DECLARED",
        "DOCUMENT_ACCESS_REQUIRED_DOC_NOT_READABLE",
        "DOCUMENT_ACCESS_DENIED_DOC_REQUIRED",
        "DOCUMENT_ACCESS_ESCALATION_SELF"
      ]);
      const projection = projectDocumentAccess(readJson(this.file), "EXECUTOR", "assigned_execution", "L0");
      assert.strictEqual(projection.status, "blocked");
      assert(projection.preflight_blocks.some(block => /need-to-know/.test(block)));
      assert(projection.preflight_blocks.some(block => /Required document/.test(block)));
    }
  }
];

let passed = 0;
for (const fixture of fixtures) {
  try {
    fixture.validate();
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

console.log(`Document access fixtures: ${passed}/${fixtures.length} passed`);
