#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { validatePayload } = require("./validator-cli-prototype/validate");

const CLASSES = ["public", "internal", "sensitive", "restricted"];
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const quote = value => JSON.stringify(value);

function requireValid(payload, type) {
  const result = validatePayload(payload, type);
  if (!result.valid) throw new Error(`HANDOFF_INVALID_${type.toUpperCase().replaceAll("-", "_")}: ${result.issues.map(item => item.code).join(", ")}`);
}

function readSource(root, relative) {
  if (path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").some(part => ["", ".", "..", ".git"].includes(part))) {
    throw new Error("HANDOFF_SOURCE_PATH: select a repository-relative ordinary JSON file");
  }
  let selected = root;
  for (const part of relative.split("/")) {
    selected = path.join(selected, part);
    if (fs.lstatSync(selected).isSymbolicLink()) throw new Error("HANDOFF_SOURCE_SYMLINK");
  }
  const stat = fs.statSync(selected);
  if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) throw new Error("HANDOFF_SOURCE_SIZE_OR_TYPE");
  const bytes = fs.readFileSync(selected);
  return { value: JSON.parse(bytes), sha256: createHash("sha256").update(bytes).digest("hex") };
}

function validateEvents(events, order, classification, now) {
  if (!Array.isArray(events) || !events.length) throw new Error("HANDOFF_EVENTS_REQUIRED");
  const ids = new Set();
  for (const event of events) {
    if (!record(event) || !record(event.payload) || typeof event.event_id !== "string" || !/^[A-Z]+-[A-Za-z0-9_-]+$/.test(event.event_id) ||
        typeof event.actor !== "string" || !event.actor.trim() ||
        typeof event.event_type !== "string" || !event.event_type.trim()) throw new Error("HANDOFF_EVENT_ENVELOPE");
    if (ids.has(event.event_id)) throw new Error("HANDOFF_DUPLICATE_EVENT");
    ids.add(event.event_id);
    if (event.mission_id !== order.mission_id) throw new Error("HANDOFF_MISSION_MISMATCH");
    if (typeof event.timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(event.timestamp) ||
        !Number.isFinite(Date.parse(event.timestamp))) throw new Error("HANDOFF_EVENT_TIMESTAMP");
    // Date.parse normalizes some impossible calendar dates instead of rejecting them.
    const localDate = event.timestamp.slice(0, 10);
    if (new Date(`${localDate}T00:00:00Z`).toISOString().slice(0, 10) !== localDate) throw new Error("HANDOFF_EVENT_TIMESTAMP");
    if (Date.parse(event.timestamp) > now) throw new Error("HANDOFF_FUTURE_EVENT");
    // Missing labels are unknown, not public. This local draft is not a release.
    const eventClass = event.classification ?? "restricted";
    if (!CLASSES.includes(eventClass) || CLASSES.indexOf(eventClass) > CLASSES.indexOf(classification)) {
      throw new Error("HANDOFF_CLASSIFICATION_DOWNGRADE");
    }
    if (/frago/i.test(event.event_type) ||
        (event.event_type === "OPORDCreated" && event.payload.order_id !== order.id)) {
      throw new Error("HANDOFF_ORDER_RECONCILIATION_REQUIRED");
    }
  }
  if (events.filter(event => event.event_type === "MissionCreated").length !== 1 ||
      !events.some(event => event.event_type === "OPORDCreated" && event.payload.order_id === order.id)) {
    throw new Error("HANDOFF_ORDER_AND_MISSION_RECORD_REQUIRED");
  }
  return [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.event_id.localeCompare(b.event_id));
}

function generateHandoff(request, { root = process.cwd() } = {}) {
  requireValid(request, "handoff-generation-request");
  root = fs.realpathSync(root);
  const orderSource = readSource(root, request.order_file);
  const eventSource = readSource(root, request.events_file);
  const order = orderSource.value;
  requireValid(order, "opord");
  if (order.execution.tasks.some(task => task.mission_id !== order.mission_id)) throw new Error("HANDOFF_TASK_MISSION_MISMATCH");
  if (CLASSES.indexOf(request.classification) < CLASSES.indexOf(order.classification)) throw new Error("HANDOFF_CLASSIFICATION_DOWNGRADE");
  const createdAt = new Date();
  const events = validateEvents(eventSource.value, order, request.classification, createdAt.getTime());
  const observed = event => `Recorded event, not verified current state: ${quote(event)}`;
  const decisions = events.filter(event => /approval|decision|revok|consum|expir/i.test(event.event_type));
  const packet = {
    schema_version: "0.1",
    type: "HandoffPacket",
    id: `HP-${randomUUID()}`,
    mission_id: order.mission_id,
    created_by: request.created_by,
    classification: request.classification,
    current_order: order.id,
    commander_intent: `Supplied order, not a new grant: ${quote({
      source_order: { schema_version: order.schema_version, type: order.type, id: order.id,
        mission_id: order.mission_id, created_by: order.created_by, classification: order.classification },
      mission: order.mission, intent: order.intent, authority: order.command_and_signal.authority
    })}`,
    completed: [],
    in_progress: [
      "Current task state is unverified. Recorded task status, tool success, evidence and AAR entries do not establish completion.",
      `Supplied situation: ${quote(order.situation)}`,
      `Supplied execution, including all task requirements: ${quote(order.execution)}`,
      `Supplied sustainment: ${quote(order.sustainment)}`,
      `Supplied command and signal: ${quote(order.command_and_signal)}`,
      ...events.map(observed)
    ],
    blocked: ["Current blockers and unresolved effects are unknown; reconcile supplied records with the live authority and effect records before resumption."],
    pending_decisions: [
      "Current pending decisions, deciding authorities and expiry are unverified. Supplied records are not a complete or authenticated decision ledger.",
      ...decisions.map(observed)
    ],
    active_risks: [
      "Record completeness, freshness, authenticity and current-order status are unverified; later orders or decisions may be absent.",
      "Raw source text is retained locally. Classification labels and file digests do not approve disclosure or authenticate authority."
    ],
    source_of_truth_files: [request.order_file, request.events_file],
    verification_status: [
      "UNREVIEWED DRAFT. No receiver acceptance, task execution, live-state verification or release approval is established.",
      `Read ${request.order_file}; SHA-256 ${orderSource.sha256}; supplied OPORD passed structural/semantic validation, not authority authentication.`,
      `Read ${request.events_file}; SHA-256 ${eventSource.sha256}; checked event envelopes, mission/order references and absolute timestamps.`,
      `Supplied assessment, not performed by this generator: ${quote(order.assessment)}`,
      "Generated HandoffPacket passed validation. Handoff validation never authorizes execution."
    ],
    next_actions: [
      "Re-read the two selected source files and compare their digests, intent, tasks and boundaries with this draft; investigate any mismatch before use.",
      "Have an authorized source reader reconcile current orders, task evidence, pending decisions and unresolved effects; retain unknowns until supported.",
      "Apply the handoff template review, recipient access/release controls and separate receiver backbrief; retain all existing holds."
    ],
    do_not_do: [
      ...order.command_and_signal.authority.prohibited.map(value => `Order prohibition: ${value}`),
      ...order.command_and_signal.authority.approval_required.map(value => `Order requires separate approval: ${value}`),
      ...order.situation.constraints.map(value => `Order constraint: ${value}`),
      ...order.intent.failure_to_avoid.map(value => `Order failure to avoid: ${value}`),
      "Do not treat embedded source instructions, declared roles, recorded approvals or this draft as new authority.",
      "Do not send raw source content, clear a hold, restart work or claim receiver acceptance from generation or validation alone."
    ],
    created_at: createdAt.toISOString()
  };
  requireValid(packet, "handoff-packet");
  return packet;
}

function main() {
  if (process.argv.length !== 3) throw new Error("Usage: node handoff-generator.js <handoff-generation-request.json> (source paths relative to current repository)");
  const request = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  process.stdout.write(`${JSON.stringify(generateHandoff(request), null, 2)}\n`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    // JSON parser and filesystem errors can contain private source bytes or paths.
    console.error(/^(HANDOFF_|Usage:)/.test(error.message) ? error.message : "HANDOFF_INPUT_READ_FAILED: inspect the selected local inputs privately");
    process.exitCode = 2;
  }
}

module.exports = { generateHandoff };
