#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const terminology = require("./project-terminology");
const packet = require("./project-document-packet");
const { validatePayload } = require("./validator-cli-prototype/validate");
const ledgerSample = require("./sample-payloads/valid-project-terminology.json");
const requestSample = require("./sample-payloads/valid-project-document-packet-request.json");
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-term-delivery-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
let passed = 0;
const check = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
const git = (root, args) => execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8" });
try {
  for (const provider of ["codex", "claude_code"]) {
    const root = path.join(temporary, provider); fs.mkdirSync(root); git(root, ["init", "-q"]);
    fs.writeFileSync(path.join(root, ".gitignore"), ".cannae/\n"); git(root, ["add", ".gitignore"]);
    git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"]);
    const ledger = structuredClone(ledgerSample); ledger.repository = terminology.identity(root);
    ledger.entries.push({ ...structuredClone(ledger.entries[0]), id: "TERM-PRIVATE-1", concept_id: "CONCEPT-PRIVATE",
      term: "Internal-code-name", aliases: [], definition: "PRIVATE-TERM-NOT-FOR-RECIPIENT", allowed_roles: ["S6"] });
    const file = path.join(root, terminology.RELATIVE);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(ledger));
    const selection = terminology.projectSelection(root, { domain: "sales", task: null, actor: "ai", role: "S3", department: "sales", terms: ["ICP"] });
    const text = terminology.renderSelection(selection), excerpt = path.join(root, "review/terms.json");
    fs.mkdirSync(path.dirname(excerpt)); fs.writeFileSync(excerpt, text);
    const request = structuredClone(requestSample);
    request.task = "Draft a source-grounded sales handoff using SRC-TERMS. Do not publish.";
    request.recipient.provider = provider; request.recipient.department = "sales";
    Object.assign(request.documents[0], { id: "SRC-TERMS", path: "review/terms.json", allowed_roles: ["S3", "S6"],
      allowed_departments: ["sales"], source_sha256: packet.sha256(text) });
    request.terminology_binding = { source_id: "SRC-TERMS", ledger_sha256: selection.ledger_sha256, domain: "sales", task: null, terms: ["ICP"] };

    check(`${provider}: current scoped definitions survive actual packet preparation and inspection`, () => {
      const prepared = packet.prepare(request, root);
      const prompt = fs.readFileSync(prepared.prompt_path, "utf8");
      assert(prompt.includes("Company-level customer fit criteria."));
      const compiled = JSON.parse(fs.readFileSync(prepared.packet_path));
      assert.equal(JSON.parse(compiled.documents[0].content).confirmed[0].version, 1);
      assert(!prompt.includes("PRIVATE-TERM-NOT-FOR-RECIPIENT") && !prompt.includes("Synthetic user turn"));
      assert(!prompt.includes(root) && !prompt.includes(terminology.RELATIVE));
      assert.equal(packet.inspect(prepared.packet_path, prepared.packet_sha256, root).status, "review_candidate_current");
      assert.equal(prepared.terminology_readiness.status, "not_assessed");
      assert(!prompt.includes('"terminology_requirements"'));
      assert.equal(prepared.execution_authorized, false); assert.equal(prepared.release_authorized, false);
    });
    check(`${provider}: changing the ledger invalidates an unchanged retained excerpt`, () => {
      const prepared = packet.prepare(request, root), original = fs.readFileSync(file);
      const next = structuredClone(ledger); next.entries.push({ ...structuredClone(next.entries[0]), id: "TERM-ICP-2", version: 2,
        supersedes: "TERM-ICP-1", definition: "A corrected company segment meaning." });
      fs.writeFileSync(file, JSON.stringify(next));
      try {
        assert.throws(() => packet.inspect(prepared.packet_path, prepared.packet_sha256, root), /PROJECT_PACKET_TERMINOLOGY_STALE/);
        assert.throws(() => packet.prepare(request, root), /PROJECT_PACKET_TERMINOLOGY_STALE/);
        const changed = structuredClone(request); changed.terminology_binding.ledger_sha256 = terminology.read(root).digest;
        assert.throws(() => packet.prepare(changed, root), /PROJECT_PACKET_TERMINOLOGY_EXCERPT_MISMATCH/);
      } finally { fs.writeFileSync(file, original); }
    });
    check(`${provider}: removing the binding or type marker cannot reuse a recognizable selection`, () => {
      const unbound = structuredClone(request); delete unbound.terminology_binding;
      assert.throws(() => packet.prepare(unbound, root), /PROJECT_PACKET_TERMINOLOGY_BINDING_REQUIRED/);
      const legacy = structuredClone(selection); delete legacy.type;
      const legacyText = terminology.renderSelection(legacy); fs.writeFileSync(excerpt, legacyText);
      unbound.documents[0].source_sha256 = packet.sha256(legacyText);
      try { assert.throws(() => packet.prepare(unbound, root), /PROJECT_PACKET_TERMINOLOGY_BINDING_REQUIRED/); }
      finally { fs.writeFileSync(excerpt, text); }
    });
    check(`${provider}: recipient, meaning and header substitutions cannot replace the current selection`, () => {
      const changed = structuredClone(request); changed.recipient.role = "S6";
      assert.throws(() => packet.prepare(changed, root), /PROJECT_PACKET_TERMINOLOGY_EXCERPT_MISMATCH/);
      const altered = structuredClone(selection); altered.confirmed[0].definition = "A forged meaning.";
      const alteredText = terminology.renderSelection(altered); fs.writeFileSync(excerpt, alteredText);
      const forged = structuredClone(request); forged.documents[0].source_sha256 = packet.sha256(alteredText);
      try { assert.throws(() => packet.prepare(forged, root), /PROJECT_PACKET_TERMINOLOGY_EXCERPT_MISMATCH/); }
      finally { fs.writeFileSync(excerpt, text); }
      const compiled = structuredClone(packet.compilePacket(request, root)); delete compiled.request.terminology_binding;
      assert(validatePayload(compiled, "project-document-packet").issues.some(i => i.code === "PROJECT_PACKET_TERMINOLOGY_BINDING_REQUIRED"));
      assert.throws(() => packet.renderPrompt(compiled), /PROJECT_PACKET_TERMINOLOGY_BINDING_REQUIRED/);
    });
    check(`${provider}: a missing private ledger stops reuse and cannot be delivered as a raw source`, () => {
      const prepared = packet.prepare(request, root), original = fs.readFileSync(file); fs.unlinkSync(file);
      try { assert.throws(() => packet.inspect(prepared.packet_path, prepared.packet_sha256, root), /PROJECT_PACKET_TERMINOLOGY_UNAVAILABLE/); }
      finally { fs.writeFileSync(file, original); }
      const raw = structuredClone(request); raw.documents[0].path = terminology.RELATIVE;
      assert.throws(() => packet.prepare(raw, root), /PROJECT_PACKET_REQUEST_INVALID/);
      const missing = structuredClone(request); missing.terminology_binding.source_id = "SRC-MISSING";
      assert(validatePayload(missing, "project-document-packet-request").issues.some(i => i.code === "PROJECT_PACKET_TERMINOLOGY_BINDING_INVALID"));
    });
    const scenario = (options, run) => {
      const modified = structuredClone(ledger);
      if (options.mutate) options.mutate(modified);
      fs.writeFileSync(file, JSON.stringify(modified));
      try {
        const selected = terminology.projectSelection(root, { ...selection.selection,
          terms: options.terms || ["ICP"], task: options.task ?? null });
        const selectedText = terminology.renderSelection(selected); fs.writeFileSync(excerpt, selectedText);
        const candidate = structuredClone(request);
        candidate.terminology_binding = { ...candidate.terminology_binding, ledger_sha256: selected.ledger_sha256,
          terms: selected.selection.terms, task: selected.selection.task, required_terms: options.required || [] };
        candidate.documents[0].source_sha256 = packet.sha256(selectedText);
        run(candidate, selected);
      } finally { fs.writeFileSync(file, JSON.stringify(ledger)); fs.writeFileSync(excerpt, text); }
    };
    const rejectsRequired = candidate => {
      const parent = path.join(root, ".cannae/document-packets"), before = fs.readdirSync(parent).sort();
      assert.throws(() => packet.prepare(candidate, root), /PROJECT_PACKET_REQUIRED_TERMINOLOGY_UNRESOLVED/);
      assert.deepEqual(fs.readdirSync(parent).sort(), before, "unresolved requirements must not publish a candidate");
    };
    check(`${provider}: declared requirements survive the real wrapper and remain non-authorizing`, () => {
      scenario({ required: ["icp"] }, candidate => {
        const requestPath = path.join(root, ".cannae/request.json"); fs.writeFileSync(requestPath, JSON.stringify(candidate));
        const bundle = provider === "codex" ? "codex-skills" : ".claude/skills";
        const wrapper = path.join(__dirname, bundle, "controls-doctrine-operator/scripts/prepare_controls_documents.js");
        const prepared = JSON.parse(execFileSync(process.execPath, [wrapper, "prepare", "--repository", root, "--request", requestPath],
          { cwd: root, env, encoding: "utf8" }));
        assert.equal(prepared.terminology_readiness.status, "declared_requirements_satisfied");
        assert.equal(prepared.execution_authorized, false); assert.equal(prepared.release_authorized, false);
        assert(fs.readFileSync(prepared.prompt_path, "utf8").includes('"required_terms"'));
        assert.equal(packet.inspect(prepared.packet_path, prepared.packet_sha256, root).terminology_readiness.required_term_count, 1);
        const changed = JSON.parse(fs.readFileSync(prepared.packet_path));
        delete changed.request.terminology_binding.required_terms;
        fs.writeFileSync(prepared.packet_path, JSON.stringify(changed));
        assert.throws(() => packet.inspect(prepared.packet_path, prepared.packet_sha256, root), /PROJECT_PACKET_DIGEST_MISMATCH/);
      });
    });
    check(`${provider}: an empty declaration is distinguished from unassessed or satisfied requirements`, () => {
      scenario({ terms: ["Not-available"], required: [] }, candidate => {
        assert.equal(packet.prepare(candidate, root).terminology_readiness.status, "no_required_terms_declared");
      });
    });
    check(`${provider}: a missing required term blocks rather than treating source freshness as readiness`, () => {
      scenario({ terms: ["ICP", "Not-available"], required: ["Not-available"] }, rejectsRequired);
    });
    check(`${provider}: candidate-only, retired and inaccessible terms cannot satisfy prerequisites`, () => {
      for (const kind of ["candidate", "retired", "inaccessible"]) {
        scenario({ required: ["ICP"], mutate(value) {
          if (kind === "candidate") {
            value.entries[0].status = "candidate"; value.entries[0].basis.kind = "ai_inference";
          } else {
            value.entries.push({ ...structuredClone(value.entries[0]), id: "TERM-ICP-2", version: 2, supersedes: "TERM-ICP-1",
              ...(kind === "retired" ? { status: "retired" } : { allowed_roles: [], allowed_departments: [] }) });
          }
        } }, rejectsRequired);
      }
    });
    check(`${provider}: project/task conflicts block declared meanings`, () => {
      scenario({ required: ["ICP"], task: "TASK-01", mutate(value) {
        value.entries.push({ ...structuredClone(value.entries[0]), id: "TERM-TASK-1", concept_id: "CONCEPT-TASK",
          scope: { domain: "sales", task: "TASK-01" }, definition: "A different task-scoped meaning." });
      } }, rejectsRequired);
    });
    check(`${provider}: an unresolved new candidate does not replace the existing confirmed revision`, () => {
      scenario({ required: ["ICP"], mutate(value) {
        value.entries.push({ ...structuredClone(value.entries[0]), id: "TERM-ICP-2", version: 2, supersedes: "TERM-ICP-1",
          status: "candidate", definition: "A tentative revision.", basis: { kind: "ai_inference", reference: "Synthetic inference", excerpt: "Maybe." } });
      } }, (candidate, selected) => {
        assert.equal(selected.confirmed[0].version, 1); assert.equal(selected.candidates[0].version, 2);
        assert.equal(packet.prepare(candidate, root).terminology_readiness.status, "declared_requirements_satisfied");
      });
    });
    check(`${provider}: exact aliases use the selector's Unicode and case normalization`, () => {
      scenario({ terms: ["CAFE\u0301"], required: ["caf\u00e9"], mutate(value) {
        value.entries[0].aliases.push("Caf\u00e9");
      } }, candidate => assert.equal(packet.prepare(candidate, root).terminology_readiness.status, "declared_requirements_satisfied"));
    });
    check(`${provider}: malformed, blank, duplicate and unselected prerequisites fail validation`, () => {
      for (const required of [["ICP", "icp"], [" "], ["persona"]]) {
        const candidate = structuredClone(request); candidate.terminology_binding.required_terms = required;
        assert(validatePayload(candidate, "project-document-packet-request").issues.some(i => i.code === "PROJECT_PACKET_REQUIRED_TERMINOLOGY_INVALID"));
        assert.throws(() => packet.prepare(candidate, root), /PROJECT_PACKET_REQUEST_INVALID/);
      }
      const invalid = structuredClone(request); invalid.terminology_binding.required_terms = null;
      assert.equal(validatePayload(invalid, "project-document-packet-request").valid, false);
    });
    check(`${provider}: static validation and rendering cannot accept a candidate posing as confirmed`, () => {
      scenario({ required: ["ICP"] }, candidate => {
        const compiled = packet.compilePacket(candidate, root);
        const selected = JSON.parse(compiled.documents[0].content);
        selected.confirmed[0].status = "candidate";
        compiled.documents[0].content = terminology.renderSelection(selected);
        compiled.documents[0].source_sha256 = packet.sha256(compiled.documents[0].content);
        compiled.documents[0].delivered_sha256 = compiled.documents[0].source_sha256;
        compiled.request.documents[0].source_sha256 = compiled.documents[0].source_sha256;
        assert(validatePayload(compiled, "project-document-packet").issues.some(i => i.code === "PROJECT_PACKET_REQUIRED_TERMINOLOGY_UNRESOLVED"));
        assert.throws(() => packet.renderPrompt(compiled), /PROJECT_PACKET_REQUIRED_TERMINOLOGY_UNRESOLVED/);
      });
    });
    check(`${provider}: direct rendering rejects malformed declarations with the same fixed code`, () => {
      scenario({ required: ["ICP"] }, candidate => {
        const compiled = packet.compilePacket(candidate, root);
        for (const invalid of ["", null, {}, [3], [" "], ["ICP", "icp"], ["ideal customer profile"], Array(33).fill("ICP"), ["x".repeat(201)]]) {
          const changed = structuredClone(compiled); changed.request.terminology_binding.required_terms = invalid;
          assert.equal(validatePayload(changed, "project-document-packet").valid, false);
          assert.throws(() => packet.renderPrompt(changed), /PROJECT_PACKET_REQUIRED_TERMINOLOGY_INVALID/);
        }
      });
    });
    check(`${provider}: a reviewed fresh selection updates only the new packet`, () => {
      const oldPacket = packet.prepare(request, root), oldBytes = fs.readFileSync(oldPacket.prompt_path);
      ledger.entries.push({ ...structuredClone(ledger.entries[0]), id: "TERM-ICP-2", version: 2, supersedes: "TERM-ICP-1",
        definition: "A corrected company segment meaning." }); fs.writeFileSync(file, JSON.stringify(ledger));
      const fresh = terminology.projectSelection(root, selection.selection), freshText = terminology.renderSelection(fresh);
      fs.writeFileSync(excerpt, freshText);
      const next = structuredClone(request); next.terminology_binding.ledger_sha256 = fresh.ledger_sha256;
      next.documents[0].source_sha256 = packet.sha256(freshText);
      const newPacket = packet.prepare(next, root);
      assert.notEqual(newPacket.prompt_sha256, oldPacket.prompt_sha256);
      assert.deepEqual(fs.readFileSync(oldPacket.prompt_path), oldBytes);
      assert(fs.readFileSync(newPacket.prompt_path, "utf8").includes("A corrected company segment meaning."));
      assert.equal(newPacket.receiver_acceptance_verified, false);
    });
  }
  console.log(JSON.stringify({ passed, failed: 0, models_called: false, recipient_acceptance_verified: false }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
