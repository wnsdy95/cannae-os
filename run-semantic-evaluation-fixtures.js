#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { captureRequest, compileOrder } = require("./request-order-compiler");
const { completeAnalysis, REQUEST_TEXT } = require("./request-order-compiler-fixtures/support");
const { prepareEvaluation, revalidatePreview } = require("./semantic-omission-evaluator");
const { prepareInvocation, verifyTransferConsent, collectEvaluation } = require("./codex-semantic-collector");
const { assessResponse } = require("./semantic-omission-contract");
const { signOperatorRecord } = require("./operator-consent-contract");
const { digest } = require("./order-intake-contract");
const clone = value => JSON.parse(JSON.stringify(value));
const roots = [];
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
function environment(mutate = () => {}, text = REQUEST_TEXT) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-semantic-")); roots.push(root);
  const repository = path.join(root, "repo"), stateRoot = path.join(root, "private");
  fs.mkdirSync(repository); fs.mkdirSync(stateRoot, { mode: 0o700 });
  const git = args => execFileSync("git", args, { cwd: repository, stdio: "pipe" });
  git(["init", "-q"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.com"]);
  fs.writeFileSync(path.join(repository, "README.md"), "Synthetic semantic fixture\n");
  git(["add", "."]); git(["commit", "-qm", "fixture"]);
  const options = { repository, artifactRoot: path.join(root, "artifacts"), mission: "MIS-INTAKE", wave: "W1", requestId: "MR-SEMANTIC", text };
  const request = captureRequest(options), analysis = completeAnalysis(request.artifact_ref);
  if (text !== REQUEST_TEXT) for (const item of analysis.statements) {
    if (item.kind !== "request_quote") continue;
    const start = Buffer.from(text).indexOf(Buffer.from(item.text));
    if (start >= 0) item.source = { kind: "request", start_byte: start, end_byte: start + Buffer.byteLength(item.text) };
  }
  mutate(analysis);
  const draft = compileOrder(analysis, options);
  const pair = crypto.generateKeyPairSync("ed25519"), key = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  return { root, options, draft, analysis, configuration: { stateRoot, trustedPublicKey: pair.publicKey.export({ type: "spki", format: "pem" }) }, key };
}
function preview(env) { return prepareEvaluation({ ...env.options, draftId: env.draft.id }); }
function invocation(env, model = "fixture-valid", extra = {}) {
  return prepareInvocation(preview(env), { executable: path.join(__dirname, "semantic-evaluation-fixtures/fake-codex.js"), model, ...extra });
}
function consent(env, input, overrides = {}) {
  return signOperatorRecord({ schema_version: "0.1", type: "SemanticEvaluationTransferConsent", id: crypto.randomUUID(),
    purpose: "one_semantic_evaluation_transfer", invocation_sha256: input.invocation_sha256, principal_id: crypto.randomUUID(),
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(),
    execution_authorized: false, release_authorized: false, ...overrides }, env.key);
}
function response(input) {
  const quote = "Do not publish or modify customer data.", start = Buffer.from(input.input.request).indexOf(Buffer.from(quote));
  return { requirements: [{ source_quote: quote, start_byte: start, end_byte: start + Buffer.byteLength(quote), kind: "prohibition",
    coverage: input.input.targets.map(target => ({ target_id: target.id, disposition: "omitted", pointer: "", quote: "", explanation: "No preserved boundary." })) }],
    conflicts: [], execution_authorized: false, release_authorized: false };
}
async function main() {
  try {
    await check("valid/invalid response samples preserve paraphrases without authority", () => {
      const sample = require("./semantic-evaluation-fixtures/response-cases.json");
      const result = assessResponse(sample.valid, sample.request, sample.targets);
      assert.equal(result.verdict, "complete"); assert.equal(result.semantic_completeness_proven, false);
      assert.throws(() => assessResponse(sample.invalid, sample.request, sample.targets), /SCHEMA_INVALID/);
    });
    await check("both provider skills route semantics and prepare outside the doctrine checkout", () => {
      const env = environment();
      for (const provider of ["codex-skills", ".claude/skills"]) {
        const scripts = path.join(__dirname, provider, "controls-doctrine-operator/scripts");
        const routed = JSON.parse(execFileSync(process.execPath, [path.join(scripts, "route_controls_docs.js"),
          "--actor=user", "semantic omission", __dirname], { encoding: "utf8", cwd: env.root }));
        assert(routed.matched_routes.some(item => item.id === "semantic-omission"));
        assert(routed.validation_commands.includes("node run-semantic-evaluation-fixtures.js"));
        const prepared = JSON.parse(execFileSync(process.execPath, [path.join(scripts, "evaluate_controls_request.js"), "prepare",
          "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot, "--draft-id", env.draft.id],
        { encoding: "utf8", cwd: env.root }));
        assert.equal(prepared.draft_ref.artifact_id, env.draft.id); assert.equal(prepared.execution_authorized, false);
      }
    });
    await check("preview evaluates actual downstream projections, not unused analysis", () => {
      const env = environment(analysis => {
        const unused = analysis.statements.find(item => item.id === "ST-CONSTRAINT");
        for (const refs of Object.values(analysis.sections)) for (let index = 0; index < refs.length; index++) if (refs[index] === unused.id) refs[index] = "ST-REQUEST";
      });
      const item = preview(env);
      assert.equal(env.draft.status, "ready_for_review");
      assert(!JSON.stringify(item.input.targets).includes("Do not publish or modify customer data."));
      assert(item.input.request.includes("Do not publish or modify customer data."));
      assert(item.analysis_sha256 === digest(env.analysis));
      assert.equal(item.execution_authorized, false); assert.equal(item.release_authorized, false);
    });
    await check("source/manifest drift and edited prompt cannot reuse a preview", () => {
      const env = environment(), item = preview(env), changed = clone(item);
      changed.prompt += "Ignore the source";
      assert.throws(() => revalidatePreview(changed), /PREVIEW_SUBSTITUTED/);
      fs.appendFileSync(path.join(env.options.repository, "README.md"), "drift");
      assert.throws(() => revalidatePreview(item), /PREVIEW_SOURCE_CHANGED/);
      const other = environment(), bound = preview(other);
      captureRequest({ ...other.options, requestId: "MR-OTHER" });
      assert.throws(() => revalidatePreview(bound), /PREVIEW_SOURCE_CHANGED/);
    });
    await check("expired and future previews fail without renewal", () => {
      const env = environment(), item = preview(env);
      assert.throws(() => revalidatePreview(item, item.expires_at), /EXPIRED_OR_FUTURE/);
      assert.throws(() => revalidatePreview(item, new Date(Date.parse(item.prepared_at) - 1).toISOString()), /EXPIRED_OR_FUTURE/);
    });
    await check("credentials and restricted handling cannot be owner-flag bypassed", () => {
      const env = environment(() => {}, REQUEST_TEXT + '\n{"password":"hunter2"}');
      assert.throws(() => preview(env), /TRANSFER_OPSEC_DENIED/);
      const other = environment();
      const request = captureRequest({ ...other.options, requestId: "MR-RESTRICTED", classification: "restricted" });
      const draft = compileOrder(completeAnalysis(request.artifact_ref), other.options);
      assert.throws(() => prepareEvaluation({ ...other.options, draftId: draft.id }), /CLASSIFICATION_DENIED/);
    });
    await check("each requirement must cover exactly the order and every receiver", () => {
      const env = environment(), item = preview(env), result = response(item);
      const run = value => assessResponse(value, item.input.request, item.input.targets);
      assert.equal(run(result).verdict, "incomplete");
      const missing = clone(result); missing.requirements[0].coverage.pop();
      assert.throws(() => run(missing), /COVERAGE_INCOMPLETE/);
      const substitute = clone(result); substitute.requirements[0].coverage[0].target_id = "foreign";
      assert.throws(() => run(substitute), /TARGET_SUBSTITUTED/);
      const na = clone(result); na.requirements[0].coverage[0].disposition = "not_applicable";
      assert.throws(() => run(na), /ORDER_COVERAGE_REQUIRED/);
    });
    await check("exact quotes, UTF-8 spans, typed responses and pointers fail closed", () => {
      const env = environment(), item = preview(env), result = response(item);
      const run = value => assessResponse(value, item.input.request, item.input.targets);
      for (const mutate of [row => row.requirements[0].start_byte++, row => row.requirements[0].source_quote = "fabricated"]) {
        const bad = clone(result); mutate(bad); assert.throws(() => run(bad), /SOURCE_QUOTE_INVALID/);
      }
      const duplicate = clone(result); duplicate.requirements.push(clone(duplicate.requirements[0]));
      assert.throws(() => run(duplicate), /REQUIREMENT_DUPLICATE/);
      const bad = clone(result); bad.requirements[0].coverage[0] = { ...bad.requirements[0].coverage[0], disposition: "preserved", pointer: "/__proto__/x", quote: "forged" };
      assert.throws(() => run(bad), /POINTER_INVALID/);
      bad.requirements[0].coverage[0].pointer = "/mission/statement";
      assert.throws(() => run(bad), /CANDIDATE_QUOTE_INVALID/);
      const authority = clone(result); authority.release_authorized = true;
      assert.throws(() => run(authority), /SCHEMA_INVALID/);
      const unknown = clone(result); unknown.extra = true;
      assert.throws(() => run(unknown), /SCHEMA_INVALID/);
    });
    await check("uncertainty/conflict never becomes a complete assessment", () => {
      const item = preview(environment()), result = response(item); result.conflicts = ["Unresolved source conflict."];
      assert.equal(assessResponse(result, item.input.request, item.input.targets).verdict, "uncertain");
    });
    await check("Unicode provenance uses bytes rather than character indices", () => {
      const item = preview(environment(() => {}, "\uAC00\r\n" + REQUEST_TEXT)), result = response(item);
      assert.equal(assessResponse(result, item.input.request, item.input.targets).verdict, "incomplete");
      result.requirements[0].start_byte = item.input.request.indexOf(result.requirements[0].source_quote);
      assert.throws(() => assessResponse(result, item.input.request, item.input.targets), /SOURCE_QUOTE_INVALID/);
    });
    await check("wrong key, purpose, time, scope and old order consent are rejected", () => {
      const env = environment(), input = invocation(env), approved = consent(env, input);
      verifyTransferConsent(approved, input, env.configuration.trustedPublicKey);
      for (const change of [{ invocation_sha256: "f".repeat(64) }, { purpose: "order_adoption" }, { type: "OperatorConsentRecord" },
        { created_at: "2020-01-01T00:00:00Z", expires_at: "2020-01-01T00:01:00Z" }, { release_authorized: true }]) {
        assert.throws(() => verifyTransferConsent(consent(env, input, change), input, env.configuration.trustedPublicKey), /TRANSFER_CONSENT/);
      }
      assert.throws(() => verifyTransferConsent(approved, input, environment().configuration.trustedPublicKey), /CONSENT_INVALID/);
      assert.throws(() => verifyTransferConsent(approved, input, env.configuration.trustedPublicKey, Date.parse(approved.expires_at)), /EXPIRED_OR_FUTURE/);
      const duration = consent(env, input, { expires_at: new Date(Date.now() + 121000).toISOString() });
      assert.throws(() => verifyTransferConsent(duration, input, env.configuration.trustedPublicKey), /EXPIRED_OR_FUTURE/);
    });
    await check("unauthorized calls cannot reserve a journal or launch the provider", async () => {
      const env = environment(), input = invocation(env);
      await assert.rejects(collectEvaluation(input, { approved: true, actor: "USER" }, env.configuration), /CONSENT_INVALID/);
      assert.deepEqual(fs.readdirSync(env.configuration.stateRoot), []);
    });
    await check("bounded fake-provider collection retains evidence and rejects exact replay", async () => {
      const env = environment(), input = invocation(env), approval = consent(env, input);
      const result = await collectEvaluation(input, approval, env.configuration);
      assert.equal(result.status, "evaluated", JSON.stringify(result.failure_reasons));
      assert.equal(result.assessment.verdict, "incomplete"); assert.equal(result.process_exit_confirmed, true); assert.equal(result.process_group_absent, true);
      assert.equal(result.semantic_completeness_proven, false); assert.equal(result.release_authorized, false);
      await assert.rejects(collectEvaluation(input, approval, env.configuration), /ALREADY_RESERVED/);
      const retained = JSON.parse(fs.readFileSync(path.join(result.directory, "result.json")));
      assert.equal(retained.invocation_sha256, input.invocation_sha256);
      assert.equal(result.journal_sha256, require("node:crypto").createHash("sha256")
        .update(fs.readFileSync(path.join(result.directory, "result.json"))).digest("hex"));
      assert.equal(Object.hasOwn(retained, "journal_sha256"), false);
    });
    for (const [model, reason] of [["fixture-timeout", "SEMANTIC_TIMEOUT"], ["fixture-output", "SEMANTIC_OUTPUT_LIMIT"],
      ["fixture-malformed", "SEMANTIC_EVENT_JSON_INVALID"], ["fixture-null", "SEMANTIC_EVENT_JSON_INVALID"],
      ["fixture-invalid-utf8", "SEMANTIC_EVENT_UTF8_INVALID"], ["fixture-tool", "SEMANTIC_UNEXPECTED_TOOL_OR_DIAGNOSTIC"],
      ["fixture-unknown", "SEMANTIC_EVENT_UNKNOWN"], ["fixture-invalid", "SEMANTIC_RESPONSE_SCHEMA_INVALID"],
      ["fixture-workspace", "SEMANTIC_WORKSPACE_CHANGED"], ["fixture-two-turns", "SEMANTIC_MULTIPLE_TURNS"],
      ["fixture-diagnostic", "SEMANTIC_UNEXPECTED_TOOL_OR_DIAGNOSTIC"], ["fixture-missing-turn", "SEMANTIC_RESPONSE_UNAVAILABLE"],
      ["fixture-final-substitute", "SEMANTIC_FINAL_MESSAGE_SUBSTITUTED"], ["fixture-symlink", "SEMANTIC_COLLECTION_FAILED"]]) {
      await check(`${model} leaves a consumed, non-authorizing failed invocation`, async () => {
        const env = environment(), input = invocation(env, model, { timeoutMs: model === "fixture-timeout" ? 100 : 10000, maxOutputBytes: 8192 });
        const approved = consent(env, input), result = await collectEvaluation(input, approved, env.configuration);
        assert.equal(result.status, "not_evaluated"); assert(result.failure_reasons.includes(reason), JSON.stringify(result.failure_reasons));
        assert.equal(result.process_exit_confirmed, true); assert.equal(result.process_group_absent, true);
        const journal = path.join(result.directory, "result.json"), original = fs.readFileSync(journal);
        // Test durable ID consumption independently of the original approval's expiry.
        const proposal = invocation(env, model, { timeoutMs: input.profile.timeout_ms, maxOutputBytes: input.profile.max_output_bytes });
        const collision = consent(env, proposal, { id: approved.id, principal_id: approved.principal_id });
        verifyTransferConsent(collision, proposal, env.configuration.trustedPublicKey);
        await assert.rejects(collectEvaluation(proposal, collision, env.configuration), /ALREADY_RESERVED/);
        assert.deepEqual(fs.readFileSync(journal), original);
      });
    }
    await check("abort before launch consumes approval without executing", async () => {
      const env = environment(), input = invocation(env), controller = new AbortController(); controller.abort();
      const result = await collectEvaluation(input, consent(env, input), { ...env.configuration, signal: controller.signal });
      assert.equal(result.status, "not_evaluated"); assert(result.failure_reasons.includes("SEMANTIC_CANCELLED")); assert(!result.pid);
    });
    async function started(directory) {
      for (let count = 0; count < 250; count++) {
        if (fs.existsSync(path.join(directory, "provider-started"))) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error("Fixture process startup was not observed");
    }
    await check("abort after observed startup confirms actual child and group exit", async () => {
      const env = environment(), input = invocation(env, "fixture-timeout"), approval = consent(env, input), controller = new AbortController();
      const running = collectEvaluation(input, approval, { ...env.configuration, signal: controller.signal });
      await started(path.join(env.configuration.stateRoot, approval.id)); controller.abort();
      const result = await running;
      assert.equal(result.status, "not_evaluated"); assert(result.failure_reasons.includes("SEMANTIC_CANCELLED"));
      assert.equal(result.process_exit_confirmed, true); assert.equal(result.process_group_absent, true);
    });
    await check("a response cannot survive target drift during the invocation", async () => {
      const env = environment(), input = invocation(env, "fixture-slow"), approval = consent(env, input);
      const running = collectEvaluation(input, approval, env.configuration);
      await started(path.join(env.configuration.stateRoot, approval.id));
      fs.appendFileSync(path.join(env.options.repository, "README.md"), "Changed after transfer\n");
      const result = await running;
      assert.equal(result.status, "not_evaluated"); assert(result.failure_reasons.includes("SEMANTIC_PREVIEW_SOURCE_CHANGED"));
      assert.equal(result.process_exit_confirmed, true); assert.equal(result.process_group_absent, true);
    });
    await check("split UTF-8 event chunks do not corrupt the native event stream", async () => {
      const env = environment(), input = invocation(env, "fixture-unicode"), result = await collectEvaluation(input, consent(env, input), env.configuration);
      assert.equal(result.status, "evaluated", JSON.stringify(result.failure_reasons));
    });
    await check("a denied group signal cannot crash a stream callback or become success", async () => {
      const env = environment(), input = invocation(env, "fixture-tool"), kill = process.kill;
      let denied = false;
      process.kill = function(pid, signal) {
        if (pid < 0 && signal === "SIGTERM" && !denied) { denied = true; const error = new Error("Synthetic signal denial"); error.code = "EPERM"; throw error; }
        return kill.call(process, pid, signal);
      };
      try {
        const result = await collectEvaluation(input, consent(env, input), env.configuration);
        assert.equal(denied, true); assert.equal(result.status, "not_evaluated");
        assert(result.failure_reasons.includes("SEMANTIC_PROCESS_SIGNAL_FAILED"));
        assert.equal(result.process_exit_confirmed, true); assert.equal(result.process_group_absent, true);
      } finally { process.kill = kill; }
    });
    await check("private diagnostic write failure still terminates the actual child", async () => {
      const env = environment(), input = invocation(env, "fixture-tool"), open = fs.openSync;
      fs.openSync = function(file, ...args) {
        if (typeof file === "string" && file.endsWith("/diagnostic.json")) throw new Error("Synthetic private diagnostic write failure");
        return open.call(this, file, ...args);
      };
      try {
        const result = await collectEvaluation(input, consent(env, input), env.configuration);
        assert.equal(result.status, "not_evaluated"); assert(result.failure_reasons.includes("SEMANTIC_DIAGNOSTIC_WRITE_FAILED"));
        assert.equal(result.process_exit_confirmed, true); assert.equal(result.process_group_absent, true);
      } finally { fs.openSync = open; }
    });
    await check("response growth after stat is rejected by a bounded read", async () => {
      const env = environment(), input = invocation(env), approved = consent(env, input), open = fs.openSync, read = fs.readSync;
      const file = path.join(fs.realpathSync(env.configuration.stateRoot), approved.id, "response.json"); let responseFd;
      fs.openSync = function(filename, ...args) { const fd = open.call(this, filename, ...args); if (filename === file) responseFd = fd; return fd; };
      fs.readSync = function(fd, ...args) { if (fd === responseFd) { fs.appendFileSync(file, "x"); responseFd = undefined; } return read.call(this, fd, ...args); };
      try {
        const result = await collectEvaluation(input, approved, env.configuration);
        assert.equal(result.status, "not_evaluated"); assert(result.failure_reasons.includes("SEMANTIC_RESPONSE_SIZE_CHANGED"));
        assert.equal(result.process_exit_confirmed, true); assert.equal(result.process_group_absent, true);
      } finally { fs.openSync = open; fs.readSync = read; }
    });
    await check("final journal write failure cannot erase confirmed termination or claim a verdict", async () => {
      const env = environment(), input = invocation(env), approved = consent(env, input), open = fs.openSync;
      const resultFile = path.join(fs.realpathSync(env.configuration.stateRoot), approved.id, "result.json");
      let writes = 0;
      fs.openSync = function(file, ...args) {
        if (typeof file === "string" && file === resultFile && ++writes === 4) {
          throw new Error("Synthetic final journal write failure");
        }
        return open.call(this, file, ...args);
      };
      try {
        const result = await collectEvaluation(input, approved, env.configuration);
        assert.equal(writes, 4);
        assert.equal(result.status, "not_evaluated"); assert.equal(result.result_persisted, false); assert.equal(result.journal_sha256, null);
        assert(result.failure_reasons.includes("SEMANTIC_JOURNAL_RESULT_WRITE_FAILED")); assert.equal(result.assessment, undefined);
        assert.equal(result.process_exit_confirmed, true); assert.equal(result.process_group_absent, true);
      } finally { fs.openSync = open; }
    });
    await check("limits, missing model and unsafe journal roots cannot broaden execution", async () => {
      const env = environment();
      assert.throws(() => invocation(env, "fixture-valid", { timeoutMs: 240001 }), /LIMITS_INVALID/);
      assert.throws(() => invocation(env, "--help"), /MODEL_REQUIRED/);
      const input = invocation(env);
      await assert.rejects(collectEvaluation(input, consent(env, input), { ...env.configuration, stateRoot: env.options.repository }), /STATE_ROOT_UNSAFE/);
    });
    console.log(JSON.stringify({ passed, actual_model_invocations: 0, provider: "measured_fake_process", semantic_gate_complete: false }));
  } finally { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
