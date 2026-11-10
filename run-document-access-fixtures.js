#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { documentDecision, projectDocumentAccess } = require("./document-access-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");

const ROOT = __dirname;
const BASE = "sample-payloads/valid-document-access-manifest-bounded.json";

function project(manifest) {
  return projectDocumentAccess(manifest, "S2", "source_verification", "L0");
}

function blocked(result, reason) {
  assert.strictEqual(result.status, "blocked");
  assert.deepStrictEqual(result.allowed_documents, []);
  assert(result.required_documents.every(item => !item.satisfied));
  assert.strictEqual(result.authorization_verified, false);
  if (reason) assert(result.preflight_blocks.some(item => item.includes(reason)), result.preflight_blocks.join("\n"));
}

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

fixtures.push(
  {
    name: "raw summary and optional reference-only modes remain distinct and non-authorizing",
    validate() {
      validate(BASE, 0);
      const manifest = structuredClone(readJson(BASE));
      const result = project(manifest);
      assert.strictEqual(result.status, "ready");
      assert.deepStrictEqual(result.allowed_documents.map(item => item.delivery_mode), ["raw", "summary", "reference_only"]);
      assert(result.required_documents.every(item => item.satisfied));
      assert.strictEqual(result.authorization_verified, false);
      assert.strictEqual(validatePayload(manifest, "document-access-manifest").can_execute, false);
      assert(!JSON.stringify(result).includes("Synthetic classification"), "Projection must not copy source-policy content.");
    }
  },
  {
    name: "document-level role matches do not add unlisted profile documents",
    validate() {
      const manifest = structuredClone(readJson(BASE));
      manifest.role_profiles[0].optional_documents = [];
      const result = project(manifest);
      assert.strictEqual(result.status, "ready");
      assert.deepStrictEqual(result.allowed_documents.map(item => item.path), ["docs/source-map.md"]);
      assert(result.denied_documents.every(item => item.reason === "not_selected_by_profile"));
    }
  },
  {
    name: "an explicit optional-document denial overrides its role match",
    validate() {
      const manifest = structuredClone(readJson(BASE));
      manifest.role_profiles[0].denied_documents.push("docs/research-compendium.md");
      blocked(project(manifest), "DOCUMENT_ACCESS_DENIED_DOC_OPTIONAL");
    }
  },
  {
    name: "a required-document denial cannot leak an allowed row",
    validate() {
      const manifest = structuredClone(readJson(BASE));
      manifest.role_profiles[0].denied_documents.push("docs/source-map.md");
      blocked(project(manifest), "DOCUMENT_ACCESS_DENIED_DOC_REQUIRED");
    }
  },
  {
    name: "unknown caller authority and malformed policy authority never compare as equal",
    validate() {
      for (const level of ["L9", "", null, -1, "toString"]) {
        const manifest = structuredClone(readJson(BASE));
        blocked(projectDocumentAccess(manifest, "S2", "source_verification", level), "DOCUMENT_ACCESS_CONTEXT_INVALID");
        manifest.role_profiles[0].authority_level = level;
        manifest.documents[0].minimum_authority_level = level;
        blocked(projectDocumentAccess(manifest, "S2", "source_verification", level));
        assert.strictEqual(documentDecision(manifest.documents[0], "S2", "source_verification", level).allowed, false);
      }
    }
  },
  {
    name: "missing or wrong role and duty contexts expose no permitted documents",
    validate() {
      for (const [role, duty, level] of [["S3", "source_verification", "L0"], ["S2", "orchestration", "L0"],
        ["UNKNOWN", "source_verification", "L0"], ["S2", "", "L0"], ["S2", null, "L0"]]) {
        blocked(projectDocumentAccess(readJson(BASE), role, duty, level));
      }
    }
  },
  {
    name: "schema rejection is applied by the projector instead of depending on a prior CLI check",
    validate() {
      const malformed = [null, [], {}, { ...readJson(BASE), documents: null },
        { ...readJson(BASE), role_profiles: "S2" }, { ...readJson(BASE), allow_all: true }];
      for (const manifest of malformed) blocked(project(manifest));
    }
  },
  {
    name: "all manifest control failures clear the complete allow list",
    validate() {
      for (const control of ["need_to_know", "no_bulk_read", "audit_required", "exception_requires_approval"]) {
        const manifest = structuredClone(readJson(BASE));
        manifest.controls[control] = false;
        blocked(project(manifest));
      }
    }
  },
  {
    name: "restricted and overbroad sensitive raw delivery cannot become ready",
    validate() {
      for (const classification of ["restricted", "sensitive"]) {
        const manifest = structuredClone(readJson(BASE));
        manifest.documents[0].classification = classification;
        if (classification === "sensitive") manifest.documents[0].allowed_roles.push("EXECUTOR");
        blocked(project(manifest), classification === "restricted" ? "DOCUMENT_ACCESS_RESTRICTED_RAW" : "DOCUMENT_ACCESS_SENSITIVE_RAW_TOO_BROAD");
        assert.strictEqual(documentDecision(manifest.documents[0], "S2", "source_verification", "L0").allowed, false);
      }
    }
  },
  {
    name: "reference-only delivery cannot satisfy required reading",
    validate() {
      const manifest = structuredClone(readJson(BASE));
      manifest.documents[0].delivery_mode = "reference_only";
      blocked(project(manifest), "DOCUMENT_ACCESS_REQUIRED_REFERENCE_ONLY");
    }
  },
  {
    name: "duplicate policy records and profile tiers are rejected independent of array order",
    validate() {
      const file = "sample-payloads/invalid-document-access-manifest-ambiguous.json";
      validate(file, 1, ["DOCUMENT_ACCESS_DUPLICATE_PATH", "DOCUMENT_ACCESS_DUPLICATE_PROFILE"]);
      const manifest = structuredClone(readJson(file));
      blocked(project(manifest), "DOCUMENT_ACCESS_DUPLICATE_PATH");
      manifest.documents.reverse();
      manifest.role_profiles.reverse();
      blocked(project(manifest), "DOCUMENT_ACCESS_DUPLICATE_PROFILE");
    }
  },
  {
    name: "higher declared authority uses only its selected profile rather than unioning lower tiers",
    validate() {
      const manifest = structuredClone(readJson(BASE));
      manifest.role_profiles.push({ ...manifest.role_profiles[0], authority_level: "L1", optional_documents: [] });
      const low = project(manifest);
      const high = projectDocumentAccess(manifest, "S2", "source_verification", "L1");
      assert.strictEqual(low.status, "ready");
      assert.strictEqual(low.allowed_documents.length, 3);
      assert.strictEqual(high.status, "ready");
      assert.deepStrictEqual(high.allowed_documents.map(item => item.path), ["docs/source-map.md"]);
      assert.strictEqual(high.authorization_verified, false);
    }
  },
  {
    name: "noncanonical and directory paths cannot stand in for a document",
    validate() {
      for (const value of ["../SUPPORT.md", "./docs/source-map.md", "docs//source-map.md", "docs\\source-map.md",
        "https://example.test/policy", "docs/*", "/etc/hosts", "docs"]) {
        const manifest = structuredClone(readJson(BASE));
        manifest.documents[0].path = value;
        blocked(project(manifest));
      }
    }
  },
  {
    name: "symlink files and intermediate directories cannot redirect a policy path",
    validate() {
      const directory = fs.mkdtempSync(path.join(ROOT, ".tmp-document-access-"));
      try {
        fs.symlinkSync(path.join(ROOT, "SUPPORT.md"), path.join(directory, "linked.md"));
        fs.symlinkSync(path.join(ROOT, "docs"), path.join(directory, "linked-dir"));
        for (const suffix of ["linked.md", "linked-dir/source-map.md"]) {
          const manifest = structuredClone(readJson(BASE));
          manifest.documents[0].path = path.relative(ROOT, path.join(directory, suffix));
          blocked(project(manifest), "DOCUMENT_ACCESS_DOC_PATH_MISSING");
        }
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    }
  },
  {
    name: "CLI reports blocked and invalid input with nonzero exits and never exposes malformed content",
    validate() {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-document-access-cli-"));
      const invoke = (file, extra = []) => spawnSync(process.execPath,
        [path.join(ROOT, "document-access-runner.js"), file, "S2", "source_verification", "L0", ...extra],
        { cwd: directory, encoding: "utf8" });
      try {
        const ready = invoke(path.join(ROOT, BASE));
        assert.strictEqual(ready.status, 0, ready.stderr);
        assert.strictEqual(JSON.parse(ready.stdout).status, "ready");
        const denied = invoke(path.join(ROOT, "sample-payloads/invalid-document-access-manifest-ambiguous.json"));
        assert.strictEqual(denied.status, 1, denied.stderr);
        blocked(JSON.parse(denied.stdout));
        const malformed = path.join(directory, "malformed.json");
        fs.writeFileSync(malformed, '{"private_value":"fixture-only-sensitive-marker",');
        const failed = invoke(malformed);
        assert.strictEqual(failed.status, 2);
        assert.strictEqual(failed.stdout, "");
        assert(!failed.stderr.includes("fixture-only-sensitive-marker"));
        assert.strictEqual(invoke(path.join(ROOT, BASE), ["--allow-all"]).status, 2);
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    }
  }
);

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
