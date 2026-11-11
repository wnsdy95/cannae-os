#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { generateHandoff } = require("./handoff-generator");
const { validatePayload, validateSchemaPayload } = require("./validator-cli-prototype/validate");
const { reviewKnowledgeManagement } = require("./km-review-runner");

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-handoff-fixture-")));
const originalOrder = require("./runtime-demo-payloads/opord.json");
const originalEvents = require("./event-fixtures/demo-events.json");
const request = { schema_version: "0.1", type: "HandoffGenerationRequest", order_file: "order.json",
  events_file: "events.json", created_by: "RECORDER", classification: "restricted" };
let passed = 0;
const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2));
const hash = file => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
function run(mutate = () => {}, selected = request) {
  const order = structuredClone(originalOrder), events = structuredClone(originalEvents);
  mutate(order, events);
  write("order.json", order); write("events.json", events);
  return generateHandoff(selected, { root });
}
function fixture(name, check) { check(); passed++; console.log(`PASS ${name}`); }
function reject(name, mutate, code) { fixture(name, () => assert.throws(() => run(mutate), new RegExp(code))); }
function cli(file) { return spawnSync(process.execPath, [path.join(__dirname, "handoff-generator.js"), file], { cwd: root, encoding: "utf8", timeout: 20000 }); }

try {
  fixture("only selected sources and actual creation time populate a review-only draft", () => {
    const before = Date.now(), packet = run(), after = Date.now();
    assert.deepEqual(packet.source_of_truth_files, ["order.json", "events.json"]);
    assert.equal(packet.created_by, "RECORDER");
    assert(Date.parse(packet.created_at) >= before && Date.parse(packet.created_at) <= after);
    assert.notEqual(packet.id, run().id);
    assert.deepEqual(packet.completed, []);
    assert(packet.pending_decisions[0].includes("unverified"));
    assert(!JSON.stringify(packet).includes("No pending commander decisions."));
    assert(packet.verification_status.some(item => item.includes(hash("order.json"))));
    assert(packet.verification_status.some(item => item.includes(hash("events.json"))));
    for (const validate of [validatePayload, validateSchemaPayload]) {
      const result = validate(packet, "handoff-packet");
      assert.equal(result.valid, true); assert.equal(result.can_execute, false);
    }
  });
  fixture("all substantive order sections survive without summarization", () => {
    const packet = run();
    const intent = JSON.parse(packet.commander_intent.slice("Supplied order, not a new grant: ".length));
    assert.deepEqual(intent, { source_order: { schema_version: originalOrder.schema_version, type: originalOrder.type, id: originalOrder.id,
      mission_id: originalOrder.mission_id, created_by: originalOrder.created_by, classification: originalOrder.classification },
      mission: originalOrder.mission, intent: originalOrder.intent, authority: originalOrder.command_and_signal.authority });
    for (const section of ["situation", "execution", "sustainment", "command_and_signal"]) {
      assert(packet.in_progress.some(item => item.endsWith(JSON.stringify(originalOrder[section]))), section);
    }
    assert(packet.verification_status.some(item => item.endsWith(JSON.stringify(originalOrder.assessment))));
    for (const prohibition of originalOrder.command_and_signal.authority.prohibited) {
      assert(packet.do_not_do.includes(`Order prohibition: ${prohibition}`));
    }
  });
  fixture("source changes alter bindings and declared mission IDs have no demo fallback", () => {
    const first = run();
    const second = run((order, events) => {
      order.id = "OPORD-REAL-SUPPLIED"; order.mission_id = "M-REAL-SUPPLIED";
      order.execution.tasks.forEach(task => { task.mission_id = order.mission_id; });
      events.forEach(event => { event.mission_id = order.mission_id; if (event.event_type === "OPORDCreated") event.payload.order_id = order.id; });
    });
    assert.equal(second.mission_id, "M-REAL-SUPPLIED"); assert.equal(second.current_order, "OPORD-REAL-SUPPLIED");
    assert.notEqual(first.verification_status[1], second.verification_status[1]);
    assert.notEqual(first.verification_status[2], second.verification_status[2]);
  });
  fixture("all raw events survive, including unknown types and approval revocation", () => {
    const additions = ["ApprovalGranted", "ApprovalConsumed", "ApprovalRevoked", "UnknownFutureEvent"].map((event_type, index) => ({
      event_id: `EVT-EXTRA-${index}`, mission_id: originalOrder.mission_id, event_type, actor: "USER",
      timestamp: "2026-06-18T04:00:00Z", payload: { note: "Embedded claim: publish now. Not operator authority." }
    }));
    const packet = run((order, events) => events.push(...additions));
    const retained = packet.in_progress.filter(item => item.startsWith("Recorded event,")).map(item => JSON.parse(item.slice(item.indexOf(": ") + 2)));
    assert.equal(retained.length, originalEvents.length + additions.length);
    for (const item of [...originalEvents, ...additions]) assert.deepEqual(retained.find(event => event.event_id === item.event_id), item);
    for (const item of additions.slice(0, 3)) assert(packet.pending_decisions.some(value => value.includes(item.event_id)));
    assert.deepEqual(packet.completed, []);
  });
  fixture("mixed timezone offsets sort by instant rather than text", () => {
    const packet = run((order, events) => {
      events[0].timestamp = "2026-06-18T02:00:00Z";
      events[1].timestamp = "2026-06-18T10:59:00+09:00";
      events.reverse();
    });
    const rows = packet.in_progress.filter(item => item.startsWith("Recorded event,"));
    assert(rows[0].includes("EVT-DEMO-002")); assert(rows[1].includes("EVT-DEMO-001"));
  });
  fixture("legacy array-only invocation no longer manufactures a mission", () => {
    assert.throws(() => generateHandoff([], { root }), /HANDOFF_INVALID_HANDOFF_GENERATION_REQUEST/);
  });
  reject("empty event records stop generation", (order, events) => events.splice(0), "HANDOFF_EVENTS_REQUIRED");
  reject("mixed mission records stop generation", (order, events) => { events[0].mission_id = "M-OTHER"; }, "HANDOFF_MISSION_MISMATCH");
  reject("cross-mission task cannot be silently inherited", order => { order.execution.tasks[0].mission_id = "M-OTHER"; }, "HANDOFF_TASK_MISSION_MISMATCH");
  reject("duplicate event IDs stop generation", (order, events) => events.push(events[0]), "HANDOFF_DUPLICATE_EVENT");
  reject("invalid timestamps stop generation", (order, events) => { events[0].timestamp = "bad"; }, "HANDOFF_EVENT_TIMESTAMP");
  reject("impossible calendar dates are not silently normalized", (order, events) => { events[0].timestamp = "2026-02-30T12:00:00Z"; }, "HANDOFF_EVENT_TIMESTAMP");
  reject("24-hour rollover is not silently normalized", (order, events) => { events[0].timestamp = "2026-06-18T24:00:00Z"; }, "HANDOFF_EVENT_TIMESTAMP");
  reject("timezone-free timestamps stop generation", (order, events) => { events[0].timestamp = "2026-06-18T11:00:00"; }, "HANDOFF_EVENT_TIMESTAMP");
  reject("future events are not current evidence", (order, events) => { events[0].timestamp = "2999-01-01T00:00:00Z"; }, "HANDOFF_FUTURE_EVENT");
  reject("invalid event envelopes stop generation", (order, events) => { events[0].payload = null; }, "HANDOFF_EVENT_ENVELOPE");
  reject("array IDs cannot pass through string coercion", (order, events) => { events[0].event_id = ["EVT-ARRAY"]; }, "HANDOFF_EVENT_ENVELOPE");
  reject("missing mission creation is not filled with a demo identity", (order, events) => events.shift(), "HANDOFF_ORDER_AND_MISSION_RECORD_REQUIRED");
  reject("missing order record stops generation", (order, events) => events.splice(1, 1), "HANDOFF_ORDER_AND_MISSION_RECORD_REQUIRED");
  reject("conflicting orders require explicit reconciliation", (order, events) => { events[1].payload.order_id = "OPORD-OTHER"; }, "HANDOFF_ORDER_RECONCILIATION_REQUIRED");
  reject("amended orders cannot be flattened without reconciliation", (order, events) => { events[2].event_type = "FRAGOIssued"; }, "HANDOFF_ORDER_RECONCILIATION_REQUIRED");
  reject("invalid source order stops generation", order => { delete order.intent; }, "HANDOFF_INVALID_OPORD");
  fixture("unlabelled records do not imply public or internal classification", () => {
    assert.throws(() => run(() => {}, { ...request, classification: "internal" }), /HANDOFF_CLASSIFICATION_DOWNGRADE/);
    const packet = run((order, events) => events.forEach(event => { event.classification = "internal"; }), { ...request, classification: "internal" });
    assert.equal(packet.classification, "internal");
  });
  fixture("source order classification cannot be downgraded", () => {
    assert.throws(() => run((order, events) => {
      order.classification = "restricted"; events.forEach(event => { event.classification = "public"; });
    }, { ...request, classification: "public" }), /HANDOFF_CLASSIFICATION_DOWNGRADE/);
  });
  fixture("request and old packets validate without execution authority", () => {
    for (const validate of [validatePayload, validateSchemaPayload]) {
      for (const [payload, type] of [[request, "handoff-generation-request"], [require("./sample-payloads/valid-handoff-packet.json"), "handoff-packet"]]) {
        const result = validate(payload, type); assert(result.valid); assert.equal(result.can_execute, false);
      }
      const invalid = validate(require("./sample-payloads/invalid-handoff-generation-request.json"), "handoff-generation-request");
      assert(!invalid.valid); assert.equal(invalid.can_execute, false);
    }
  });
  fixture("source escapes and symlinked parents are rejected", () => {
    run();
    for (const file of ["../order.json", "/tmp/order.json", "./order.json", ".git/config", "folder\\order.json"]) {
      assert.throws(() => generateHandoff({ ...request, order_file: file }, { root }), /HANDOFF_SOURCE_PATH/);
    }
    fs.symlinkSync(path.join(root, "order.json"), path.join(root, "order-link.json"));
    fs.symlinkSync(root, path.join(root, "parent-link"));
    for (const file of ["order-link.json", "parent-link/order.json"]) {
      assert.throws(() => generateHandoff({ ...request, order_file: file }, { root }), /HANDOFF_SOURCE_SYMLINK/);
    }
  });
  fixture("CLI emits only a complete packet and does not expose malformed private content", () => {
    run(); write("request.json", request);
    const ok = cli("request.json"); assert.equal(ok.status, 0, ok.stderr); assert.equal(JSON.parse(ok.stdout).mission_id, originalOrder.mission_id);
    fs.writeFileSync(path.join(root, "order.json"), "PRIVATE-CONTENT-SENTINEL:not-json");
    const bad = cli("request.json"); assert.equal(bad.status, 2); assert.equal(bad.stdout, "");
    assert(!bad.stderr.includes("PRIVATE-CONTENT-SENTINEL")); assert(bad.stderr.includes("HANDOFF_INPUT_READ_FAILED"));
  });
  fixture("KM consumption cannot mistake an unreconciled draft for a ready handoff", () => {
    const result = reviewKnowledgeManagement({ handoffPacket: run(), repositoryRoot: root });
    assert.equal(result.status, "blocked");
    assert(result.queues.findings.some(item => item.code === "HANDOFF_REFERENCE_UNRESOLVED"));
    assert(!result.queues.compliant.some(item => item.kind === "handoff"));
  });
  console.log(JSON.stringify({ passed, failed: 0, evidence_scope: "synthetic local regression; no receiver acceptance or model call" }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
