const path = require("node:path");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { writeRepositoryArtifact, resolveRepository } = require("./repository-artifact-store");
const { readRequest, replayDraft } = require("./request-order-compiler");
const { digest, same, AUTHORITY } = require("./order-intake-contract");
const contract = require("./requirement-inventory-contract");
const ref = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
const requireTrue = (condition, code) => { if (!condition) throw new Error(code); };
function valid(value, type) {
  const result = require("./validator-cli-prototype/validate").validatePayload(value, type);
  requireTrue(result.valid, `SEMANTIC_REVIEW_INVALID:${result.issues.map(item => item.code).join(",")}`);
}
function load(options) {
  const repository = resolveRepository(options.repository);
  return loadVerifiedStore(repository.root, options.artifactRoot || path.join(repository.root, ".cannae", "artifacts"));
}
function clock(options) {
  const now = options.now || new Date().toISOString(); requireTrue(Number.isFinite(Date.parse(now)), "SEMANTIC_REVIEW_CLOCK_INVALID"); return now;
}
function read(store, reference, kind, type) {
  const value = require("./effect-settlement-proof").loadSettlementArtifact(store, reference, kind, type);
  const entry = store.manifest.artifacts.find(item => same(ref(item), reference));
  requireTrue(entry && value.id === entry.artifact_id && value.mission_id === entry.mission_id && value.wave_id === entry.wave_id,
    "SEMANTIC_REVIEW_ARTIFACT_SCOPE_MISMATCH");
  return { payload: value, ref: reference, entry };
}
function inventoryProof(store, reference) {
  const item = read(store, reference, "requirement-inventories", "requirement-inventory"), value = item.payload;
  const before = require("./campaign-terminal-controller").prefixBeforeEntry(store, item.entry);
  const request = readRequest(before, value.request_ref, value);
  requireTrue(value.request_text_sha256 === request.text_sha256 && value.classification === request.classification &&
    value.expires_at === request.expires_at && value.fragments.map(item => item.quote).join("") === request.text &&
    Date.parse(value.recorded_at) === Date.parse(item.entry.created_at) && Date.parse(value.recorded_at) >= Date.parse(request.recorded_at),
  "REQUIREMENT_INVENTORY_SOURCE_MISMATCH");
  return { ...item, request };
}
function reviewProof(store, reference, plan, draft, now, requireReady = true) {
  const item = read(store, reference, "semantic-coverage-proposals", "semantic-coverage-proposal"), value = item.payload;
  const before = require("./campaign-terminal-controller").prefixBeforeEntry(store, item.entry);
  const inventory = inventoryProof(before, value.inventory_ref);
  const draftEntry = before.manifest.artifacts.find(entry => entry.kind === "order-drafts" && same(ref(entry), value.draft_ref));
  requireTrue(draftEntry && same(replayDraft(before, draftEntry), draft), "SEMANTIC_REVIEW_DRAFT_HISTORY_MISMATCH");
  requireTrue(same(value.draft_ref, plan.order_binding.draft_ref) && same(inventory.payload.request_ref, draft.request_ref) &&
    value.mission_id === plan.mission_id && value.wave_id === plan.wave_id && inventory.payload.mission_id === plan.mission_id &&
    inventory.payload.wave_id === plan.wave_id && value.classification === draft.classification &&
    value.expires_at === new Date(Math.min(Date.parse(inventory.payload.expires_at), Date.parse(plan.valid_until))).toISOString() &&
    Date.parse(value.recorded_at) === Date.parse(item.entry.created_at) && Date.parse(inventory.payload.recorded_at) <= Date.parse(value.recorded_at) &&
    Date.parse(draft.compiled_at) <= Date.parse(value.recorded_at) &&
    Date.parse(value.recorded_at) <= Date.parse(now) && Date.parse(now) < Date.parse(value.expires_at), "SEMANTIC_REVIEW_SCOPE_MISMATCH");
  const result = contract.assessCoverage(value, inventory.payload, draft, plan);
  requireTrue(result.status === value.status && (!requireReady || result.status === "ready_for_human_review"), "SEMANTIC_REVIEW_INCOMPLETE");
  return { coverage: item, inventory };
}
function persist(options, payload, kind, appraise) {
  const store = load(options), now = clock(options);
  appraise(store, now);
  const written = writeRepositoryArtifact({ repositoryPath: store.verification.repository.root, artifactRoot: store.artifactRoot,
    missionId: payload.mission_id, waveId: payload.wave_id, kind, artifactId: payload.id, payload, createdAt: payload.recorded_at,
    reuseExisting: true, publicationGuard: () => {
      const time = clock(options); requireTrue(Date.parse(time) >= Date.parse(payload.recorded_at), "SEMANTIC_REVIEW_CLOCK_ROLLBACK");
      appraise(load(options), time); return true;
    } });
  return { artifact_ref: { artifact_id: payload.id, relative_path: written.relative_path, sha256: written.sha256 }, status: payload.status, ...AUTHORITY };
}
function retainInventory(input, options) {
  requireTrue(contract.INVENTORY_INPUT.safeParse(input).success, "REQUIREMENT_INVENTORY_INPUT_INVALID");
  const store = load(options), now = clock(options), request = readRequest(store, input.request_ref);
  const payload = contract.buildInventory(request, input.request_ref, input, now); valid(payload, "requirement-inventory");
  return persist(options, payload, "requirement-inventories", (current, time) => {
    const actual = readRequest(current, input.request_ref);
    requireTrue(same(actual, request) && Date.parse(actual.recorded_at) <= Date.parse(time) && Date.parse(time) < Date.parse(actual.expires_at),
      "REQUIREMENT_INVENTORY_REQUEST_CHANGED");
  });
}
function retainCoverage(input, plan, options) {
  requireTrue(contract.COVERAGE_INPUT.safeParse(input).success, "SEMANTIC_COVERAGE_INPUT_INVALID");
  valid(plan, "mission-wave-plan");
  requireTrue(plan.schema_version === "0.2", "SEMANTIC_REVIEW_ORDER_PLAN_REQUIRED");
  const store = load(options), now = clock(options), inventory = inventoryProof(store, input.inventory_ref);
  const entry = store.manifest.artifacts.find(item => same(ref(item), plan.order_binding.draft_ref));
  requireTrue(entry, "SEMANTIC_REVIEW_DRAFT_REQUIRED"); const draft = replayDraft(store, entry);
  requireTrue(inventory.payload.mission_id === plan.mission_id && inventory.payload.wave_id === plan.wave_id &&
    same(inventory.payload.request_ref, draft.request_ref) && inventory.payload.request_text_sha256 === draft.request_text_sha256 &&
    Date.parse(draft.compiled_at) <= Date.parse(now) && Date.parse(now) < Date.parse(plan.valid_until), "SEMANTIC_REVIEW_SCOPE_MISMATCH");
  let payload = { schema_version: "0.1", type: "SemanticCoverageProposal", mission_id: plan.mission_id, wave_id: plan.wave_id,
    inventory_ref: input.inventory_ref, draft_ref: plan.order_binding.draft_ref, plan_sha256: digest(plan),
    request_text_sha256: inventory.payload.request_text_sha256, classification: draft.classification, recorded_at: now,
    expires_at: new Date(Math.min(Date.parse(inventory.payload.expires_at), Date.parse(plan.valid_until))).toISOString(), coverage: input.coverage,
    review_class: "human_inventory_and_coverage", model_calibrated_for_admission: false, semantic_completeness_proven: false, ...AUTHORITY };
  const result = contract.assessCoverage(payload, inventory.payload, draft, plan);
  requireTrue(result.findings.length === 0, "SEMANTIC_COVERAGE_BINDING_INVALID");
  payload = contract.identified({ ...payload, status: result.status }, "SCV"); valid(payload, "semantic-coverage-proposal");
  return persist(options, payload, "semantic-coverage-proposals", (current, time) => {
    const currentInventory = inventoryProof(current, input.inventory_ref);
    const currentEntry = current.manifest.artifacts.find(item => same(ref(item), payload.draft_ref));
    requireTrue(currentEntry && same(currentInventory.payload, inventory.payload) &&
      same(replayDraft(current, currentEntry), draft) && Date.parse(time) < Date.parse(payload.expires_at), "SEMANTIC_REVIEW_SOURCE_CHANGED");
  });
}
function main(argv = process.argv.slice(2)) {
  const [action, ...rest] = argv, options = {};
  requireTrue(["template", "retain-inventory", "retain-coverage"].includes(action),
    "Usage: requirement-inventory-controller.js <template|retain-inventory|retain-coverage> --repository <target> [options]");
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index], value = rest[index + 1];
    requireTrue(["--repository", "--artifact-root", "--input", "--plan", "--request-id"].includes(key) && value && !value.startsWith("--"), "SEMANTIC_REVIEW_CLI_OPTION_INVALID");
    const property = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    requireTrue(options[property] === undefined, "SEMANTIC_REVIEW_CLI_DUPLICATE_OPTION"); options[property] = value;
  }
  requireTrue(options.repository && (action === "template" ? options.requestId && !options.input && !options.plan :
    options.input && !options.requestId && (action === "retain-coverage" ? options.plan : !options.plan)), "SEMANTIC_REVIEW_CLI_INPUT_REQUIRED");
  const fs = require("node:fs"); let result;
  if (action === "template") {
    const store = load(options), entries = store.manifest.artifacts.filter(item => item.kind === "mission-requests" && item.artifact_id === options.requestId);
    requireTrue(entries.length === 1, "REQUIREMENT_INVENTORY_REQUEST_NOT_FOUND");
    const reference = ref(entries[0]), request = readRequest(store, reference);
    result = { request_ref: reference, ...contract.templateFor(request) };
  } else {
    const input = JSON.parse(fs.readFileSync(options.input, "utf8"));
    result = action === "retain-inventory" ? retainInventory(input, options) : retainCoverage(input, JSON.parse(fs.readFileSync(options.plan, "utf8")), options);
  }
  console.log(JSON.stringify(result, null, 2));
}
module.exports = { inventoryProof, reviewProof, retainInventory, retainCoverage, main };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
