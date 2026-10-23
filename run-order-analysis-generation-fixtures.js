#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), { execFileSync } = require("node:child_process");
const support = require("./order-analysis-fixtures/support"), generator = require("./order-analysis-generator"), contract = require("./order-analysis-generation-contract");
const collector = require("./codex-order-analysis-collector"), { signOperatorRecord } = require("./operator-consent-contract");
const roots = [], env = options => { const value = support.environment(options); roots.push(value.root); return value; };
const prepare = (value, extra = {}) => generator.prepareAnalysis({ ...value.options, requestId: value.request.id, ...extra });
const clone = value => JSON.parse(JSON.stringify(value)); let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function main() {
  try {
    await check("both issuance/channel source commitments include the shared collector, analysis contracts and result schemas", () => {
      for (const surface of [require("./dispatch-issuance-contract"), require("./method-control-contract")]) {
        for (const file of ["codex-bounded-collector.js", "codex-order-analysis-collector.js", "order-analysis-generator.js", "order-analysis-generation-contract.js",
          "order-intake-contract.js", "request-order-compiler.js", "operator-order-analysis-contract.js", "schema-files/order-analysis-response.schema.json", "schema-files/operator-order-analysis.schema.json"]) assert(surface.CODE.includes(file), file);
      }
    });
    await check("actual proposed response compiles through real intake and structural planning without manual analysis input", () => {
      const value = env(), preview = prepare(value), result = generator.compileAnalysis(support.response(), preview);
      const draft = require("./request-order-compiler").inspectDraft({ ...value.options, draftId: result.draft.id }).draft;
      assert.equal(draft.status, "ready_for_review"); assert.equal(draft.source_claims_verified, false); assert.equal(result.execution_authorized, false);
      assert.equal(draft.analysis.request_ref.artifact_id, value.request.id); assert.equal(draft.opord.execution.tasks.length, 2);
      const request = clone(require("./sample-payloads/valid-bounded-planning-request.json"));
      Object.assign(request, { mission_id: value.options.mission, wave_id: value.options.wave, draft_ref: result.draft.artifact_ref });
      const plan = require("./bounded-planning-controller").generatePlan(request, value.options);
      assert.equal(plan.proposal.status, "ready_for_review"); assert.equal(plan.plan.agents.length, 2);
      assert.equal(plan.execution_authorized, false); assert.equal(plan.release_authorized, false);
      assert.throws(() => require("./skill-mission-controller").openWave(plan.plan, value.options), /ORDER_ADOPTION_REQUIRED/);
    });
    await check("small repeated responses cannot publish unreadable amplified drafts or silently drop inherited boundaries", () => {
      const value = env(), preview = prepare(value), response = support.amplifiedResponse();
      assert(Buffer.byteLength(JSON.stringify(response)) < 1048576);
      const input = clone(response), analysis = contract.materialize(response, preview), compiler = require("./request-order-compiler");
      const manifest = () => require("./campaign-supervisor").loadVerifiedStore(value.options.repository, value.options.artifactRoot).manifest;
      const before = clone(manifest());
      assert.throws(() => contract.assessResponse(response, preview), /^Error: ORDER_INTAKE_DRAFT_TOO_LARGE$/);
      assert.throws(() => generator.compileAnalysis(response, preview), /^Error: ORDER_INTAKE_DRAFT_TOO_LARGE$/);
      assert.throws(() => compiler.compileOrder(analysis, value.options), /^Error: ORDER_INTAKE_DRAFT_TOO_LARGE$/);
      assert.deepEqual(manifest(), before); assert.deepEqual(response, input);
      assert.equal(manifest().artifacts.filter(item => item.kind === "order-drafts").length, 0);
      // A separate smaller proposal is still complete, reviewable and non-executable.
      response.statements.at(-1).text = "Synthetic bounded proposal. " + "x".repeat(15000);
      const result = generator.compileAnalysis(response, preview), draft = compiler.inspectDraft({ ...value.options, draftId: result.draft.id }).draft;
      assert.equal(draft.opord.execution.tasks.length, 64);
      assert.deepEqual(draft.analysis.tasks, response.tasks); assert.deepEqual(draft.analysis.retained_user_decisions, response.retained_user_decisions);
      for (const task of draft.opord.execution.tasks) {
        assert.deepEqual(task.inherited_constraints, draft.opord.situation.constraints);
        assert.equal(task.retained_user_decisions.length, response.retained_user_decisions.length);
        assert.equal(task.execution_authorized, false);
      }
      assert.equal(result.execution_authorized, false); assert.equal(result.release_authorized, false);
    });
    await check("blocking unknowns and missing required sections persist needs_clarification rather than ready execution", () => {
      for (const mutate of [body => body.statements.push({ id: "ST-UNKNOWN", kind: "unknown", text: "Clarify target.", blocking: true, source: { kind: "none" } }),
        body => { body.sections["command_and_signal.authority.prohibited"] = []; }]) {
        const value = env(), preview = prepare(value), body = support.response(); mutate(body);
        assert.equal(generator.compileAnalysis(body, preview).draft.status, "needs_clarification");
      }
    });
    await check("untrusted fields, invented facts/quotes, wrong references, duplicate references and roles fail closed", () => {
      const value = env(), preview = prepare(value);
      for (const mutate of [body => { body.release_authorized = true; }, body => { body.mission_id = "MIS-SUBSTITUTED"; },
        body => { body.statements[0].text = "Invented source."; }, body => { body.statements[0].source.start_byte++; },
        body => { body.statements[4].kind = "evidence_quote"; }, body => { body.sections["situation.known_facts"] = ["ST-PURPOSE"]; },
        body => { body.tasks[0].assigned_to = "COMMANDER"; }, body => { body.sections["intent.key_tasks"].push("ST-TASK-S2"); },
        body => { body.tasks[0].task = "ST-NOT-RETAINED"; }, body => { body.statements.push(clone(body.statements[0])); }]) {
        const body = support.response(); mutate(body); assert.throws(() => contract.materialize(body, preview), /^Error: SEMANTIC_ANALYSIS_/);
      }
      const limited = prepare(value, { allowedRoles: ["S2"] });
      assert.throws(() => contract.materialize(support.response(), limited), /ROLE_OUTSIDE_ENVELOPE/);
    });
    await check("preview type/prompt, current source/manifest and lifetime are reappraised before draft publication", () => {
      const value = env(), preview = prepare(value), changed = clone(preview); changed.prompt += "modified";
      assert.throws(() => generator.revalidatePreview(changed), /PREVIEW_SUBSTITUTED/);
      assert.throws(() => generator.revalidatePreview(preview, preview.expires_at), /PREVIEW_NOT_CURRENT/);
      assert.throws(() => generator.revalidatePreview(preview, new Date(Date.parse(preview.prepared_at) - 1).toISOString()), /PREVIEW_NOT_CURRENT/);
      fs.appendFileSync(path.join(value.options.repository, "README.md"), "drift");
      assert.throws(() => generator.compileAnalysis(support.response(), preview), /PREVIEW_SOURCE_CHANGED/);
    });
    await check("restricted or credential-bearing requests cannot use a transfer flag exception", () => {
      assert.throws(() => prepare(env({ classification: "restricted" })), /CLASSIFICATION_DENIED/);
      assert.throws(() => prepare(env({ text: support.REQUEST_TEXT + '\n{"password":"hunter2"}' })), /TRANSFER_OPSEC_DENIED/);
    });
    await check("the shared transport accepts only the exact analysis purpose and never reuses omission consent", async () => {
      const value = env(), preview = prepare(value), invocation = collector.prepareInvocation(preview, value.configuration.analysis);
      const pair = crypto.generateKeyPairSync("ed25519"), key = pair.privateKey.export({ type: "pkcs8", format: "pem" });
      const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
      const body = { schema_version: "0.1", type: "OrderAnalysisTransferConsent", id: crypto.randomUUID(), purpose: "one_order_analysis_transfer_and_draft",
        invocation_sha256: invocation.invocation_sha256, principal_id: crypto.randomUUID(), created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(), execution_authorized: false, release_authorized: false };
      assert.throws(() => collector.verifyTransferConsent(signOperatorRecord({ ...body, type: "SemanticEvaluationTransferConsent", purpose: "one_semantic_evaluation_transfer" }, key), invocation, publicKey), /TRANSFER_CONSENT_INVALID/);
      assert.throws(() => require("./codex-semantic-collector").verifyTransferConsent(signOperatorRecord(body, key), invocation, publicKey), /INVOCATION_PURPOSE_INVALID/);
      fs.mkdirSync(value.stateDir, { mode: 0o700 }); const consent = signOperatorRecord(body, key), configuration = { stateRoot: value.stateDir, trustedPublicKey: publicKey };
      const result = await collector.collectEvaluation(invocation, consent, configuration);
      assert.equal(result.status, "evaluated"); assert.equal(result.assessment.verdict, "ready_for_review"); assert.equal(result.process_group_absent, true);
      assert(result.journal_sha256); await assert.rejects(() => collector.collectEvaluation(invocation, consent, configuration), /ALREADY_RESERVED/);
    });
    await check("both provider wrappers prepare outside the doctrine checkout and reject run/model/clock overrides", () => {
      const value = env();
      for (const tree of ["codex-skills", ".claude/skills"]) {
        const script = path.join(__dirname, tree, "controls-doctrine-operator/scripts/prepare_controls_analysis.js");
        const args = ["prepare", "--repository", value.options.repository, "--artifact-root", value.options.artifactRoot, "--request-id", value.request.id];
        const output = JSON.parse(execFileSync(process.execPath, [script, ...args], { cwd: value.root, encoding: "utf8" }));
        assert.equal(output.type, "OrderAnalysisPreview"); assert.equal(output.execution_authorized, false);
        assert.throws(() => execFileSync(process.execPath, [script, ...args, "--model", "not-authorized"], { cwd: value.root, stdio: "pipe" }));
        assert.throws(() => execFileSync(process.execPath, [script, ...args, "--now", "2026-01-01T00:00:00Z"], { cwd: value.root, stdio: "pipe" }));
        assert.throws(() => execFileSync(process.execPath, [script, "run", ...args.slice(1)], { cwd: value.root, stdio: "pipe" }));
      }
    });
    console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, calibrated_for_admission: false, release_authorized: false }, null, 2));
  } finally { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
