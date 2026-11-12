const fs = require("node:fs"), path = require("node:path");
const { randomUUID } = require("node:crypto"), { spawnSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const { createDocumentReader } = require("./project-document-reader");
const { sha256, readOutput } = require("./project-document-packet");
const { projectDocumentAccess } = require("./document-access-runner");
const { canonicalDocumentPath } = require("./context-document-integrity");
const fail = code => { throw new Error(code); };
const flags = () => ({ authorization_verified: false, execution_authorized: false,
  release_authorized: false, receiver_acceptance_verified: false });
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort());

function createDocumentSession(options) {
  const fields = ["reader", "skill_directory", "doctrine_root", "task_id", "phase", "access_manifest",
    "corpus_sha256", "held_source_ids", "max_calls", "max_route_calls", "deadline_ms"];
  if (!keys(options, fields) || !["brief", "review"].includes(options.phase) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(options.task_id || "") ||
      ![options.skill_directory, options.doctrine_root].every(p => typeof p === "string" && path.isAbsolute(p)) ||
      !Array.isArray(options.held_source_ids) || options.held_source_ids.some(id => typeof id !== "string") ||
      ![options.max_calls, options.max_route_calls, options.deadline_ms].every(Number.isSafeInteger) ||
      options.max_calls < 1 || options.max_calls > 128 || options.max_route_calls < 1 || options.max_route_calls > 8 ||
      options.deadline_ms < 1 || options.deadline_ms > 600000) fail("PROJECT_SESSION_CONFIG_INVALID");
  const config = structuredClone(options), reader = createDocumentReader(config.reader);
  const root = fs.realpathSync(config.doctrine_root), recipient = config.reader.recipient;
  const router = path.join(config.skill_directory, "scripts/route_controls_docs.js");
  const routerHash = sha256(readOutput(router, 1024 * 1024));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const original = reader.catalog();
  const corpus = () => {
    const access = projectDocumentAccess(config.access_manifest, recipient.role, recipient.duty, recipient.authority_level);
    if (access.status !== "ready" || access.allowed_documents.some(row => row.delivery_mode !== "raw")) fail("PROJECT_SESSION_ACCESS_INVALID");
    const required = new Set(access.required_documents.map(row => row.path));
    if (!keys(config.corpus_sha256, access.allowed_documents.map(row => row.path))) fail("PROJECT_SESSION_CORPUS_BINDING_INVALID");
    return access.allowed_documents.map(row => {
      if (!canonicalDocumentPath(row.path)) fail("PROJECT_SESSION_CORPUS_BINDING_INVALID");
      let file = root;
      for (const component of row.path.split("/")) {
        file = path.join(file, component);
        if (fs.lstatSync(file).isSymbolicLink()) fail("PROJECT_SESSION_CORPUS_BINDING_INVALID");
      }
      const content = readOutput(file, 64 * 1024).toString("utf8"), expected = config.corpus_sha256[row.path];
      if (sha256(content) !== expected) fail("PROJECT_SESSION_CORPUS_CHANGED");
      return { id: "corpus:" + row.path, required: required.has(row.path), delivery_mode: "raw",
        source_sha256: expected, delivered_sha256: expected, content };
    });
  };
  const initialCorpus = corpus(), allIds = [...original.documents, ...initialCorpus].map(row => row.id);
  if (new Set(allIds).size !== allIds.length || config.held_source_ids.some(id => !allIds.includes(id))) fail("PROJECT_SESSION_SOURCE_IDS_INVALID");
  const withheld = [...new Set([config.reader.repository, config.doctrine_root, config.skill_directory, config.reader.packet_path]
    .flatMap(file => [file, fs.realpathSync(file)]))];
  const boundCorpus = () => {
    if (sha256(readOutput(router, 1024 * 1024)) !== routerHash) fail("PROJECT_SESSION_ROUTER_CHANGED");
    return corpus();
  };
  const currentPacket = () => {
    const data = reader.catalog();
    if (!isDeepStrictEqual(data, original)) fail("PROJECT_SESSION_PACKET_CHANGED");
    return data;
  };
  const snapshot = () => ({ data: currentPacket(), guides: boundCorpus() });
  let current = null, calls = 0, routeCalls = 0;
  const started = performance.now(), startedWall = Date.now();
  const elapsed = () => Math.max(performance.now() - started, Date.now() - startedWall);
  function execute(operation, input) {
    // Every attempted reroute retires the preceding read context, including failures.
    if (operation === "route_current_task") current = null;
    let rechecking = false;
    try {
      if (++calls > config.max_calls || elapsed() >= config.deadline_ms) fail("PROJECT_SESSION_LIMIT");
      if (operation === "route_current_task") {
        if (!keys(input, ["query", "objectives"]) || typeof input.query !== "string" || !input.query.trim() || input.query.length > 8000 ||
            !Array.isArray(input.objectives) || input.objectives.length < 1 || input.objectives.length > 8 ||
            input.objectives.some(q => typeof q !== "string" || !q.trim() || q.length > 2000)) fail("PROJECT_SESSION_ARGUMENTS_INVALID");
        if (++routeCalls > config.max_route_calls) fail("PROJECT_SESSION_ROUTE_LIMIT");
        if (withheld.some(p => JSON.stringify(input).includes(p))) fail("PROJECT_SESSION_PRIVATE_LOCATION");
        const state = snapshot(), query = state.data.task + "\n\nCurrent routing description (not a replacement assignment):\n" + input.query;
        const args = [router, "--doctrine-root=" + root, "--actor=ai", "--role=" + recipient.role,
          "--department=" + recipient.department, "--authority=document-only-verification",
          "--task-id=" + config.task_id, "--task-root=" + config.reader.repository,
          ...state.guides.filter(row => row.required).map(row => "--source=" + row.id.slice("corpus:".length)),
          ...input.objectives.map(q => "--capability-query=" + q), "--", query];
        if (elapsed() >= config.deadline_ms) fail("PROJECT_SESSION_LIMIT");
        const result = spawnSync(process.execPath, args, { cwd: config.reader.repository, env, encoding: "utf8",
          timeout: Math.min(20000, Math.max(1, config.deadline_ms - Math.ceil(elapsed()))), maxBuffer: 4 * 1024 * 1024 });
        if (elapsed() >= config.deadline_ms) fail("PROJECT_SESSION_LIMIT");
        if (result.status !== 0) fail("PROJECT_SESSION_ROUTING_FAILED");
        const routed = JSON.parse(result.stdout);
        if (routed.repo_root !== root || routed.operating_mode.role !== recipient.role ||
            routed.operating_mode.department !== recipient.department || routed.operating_mode.authority !== "document-only-verification" ||
            routed.task_context?.id !== config.task_id || routed.task_context.root !== fs.realpathSync(config.reader.repository)) fail("PROJECT_SESSION_ROUTE_BINDING_INVALID");
        snapshot();
        const documents = [...state.guides.map(({ content, ...row }) => row), ...state.data.documents]
          .map(row => ({ ...row, delivery_held: config.phase === "brief" || config.held_source_ids.includes(row.id) }));
        const token = randomUUID(), value = { route_id: token, phase: config.phase, original_task: state.data.task,
          recipient, query: routed.query, capability_query: routed.capability_query,
          task_context: { id: config.task_id, basis: routed.task_context.basis, repository_binding: "withheld", authorization_verified: false },
          operating_mode: routed.operating_mode, matched_routes: routed.matched_routes, capability_routing: routed.capability_routing,
          ...(routed.capability_queries ? { capability_queries: routed.capability_queries, capability_assessments: routed.capability_assessments,
            capability_assessment_basis: routed.capability_assessment_basis } : {}),
          task_references: routed.task_references, recommended_documents: routed.recommended_documents, validation_commands: routed.validation_commands,
          ...(state.data.terminology_requirements ? { terminology_requirements: state.data.terminology_requirements } : {}),
          documents, required_source_count: documents.filter(row => row.required).length,
          source_binding: "Prepared packet source IDs and assigned corpus profile; not router filesystem-input or guarded-mission admission.",
          ...flags() };
        if (withheld.some(p => JSON.stringify(value).includes(p))) fail("PROJECT_SESSION_PRIVATE_LOCATION");
        if (elapsed() >= config.deadline_ms) fail("PROJECT_SESSION_LIMIT");
        current = { token, documents, returned: new Set() };
        return structuredClone(value);
      }
      if (operation !== "read_document" || !keys(input, ["route_id", "source_id"])) fail("PROJECT_SESSION_ARGUMENTS_INVALID");
      if (!current || input.route_id !== current.token) fail("PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
      if (config.phase === "brief" || config.held_source_ids.includes(input.source_id)) fail("PROJECT_SESSION_SOURCE_HELD");
      const selected = current.documents.find(row => row.id === input.source_id);
      if (!selected || selected.delivery_mode === "reference_only") fail("PROJECT_SESSION_SOURCE_NOT_READABLE");
      rechecking = true;
      const guide = boundCorpus().find(row => row.id === input.source_id);
      const document = guide ? (currentPacket(), guide) : reader.read(input.source_id).document;
      if (document.delivered_sha256 !== selected.delivered_sha256 || document.delivery_mode !== selected.delivery_mode) fail("PROJECT_SESSION_SOURCE_CHANGED");
      if (withheld.some(p => JSON.stringify(document).includes(p))) fail("PROJECT_SESSION_PRIVATE_LOCATION");
      if (elapsed() >= config.deadline_ms) fail("PROJECT_SESSION_LIMIT");
      current.returned.add(document.id);
      return { route_id: current.token, document, returned_required_source_ids: current.documents.filter(row => row.required && current.returned.has(row.id)).map(row => row.id),
        pending_required_source_ids: current.documents.filter(row => row.required && !current.returned.has(row.id)).map(row => row.id), ...flags() };
    } catch (error) {
      if (rechecking) current = null;
      return { error: /^PROJECT_(?:PACKET|REVIEW|READER|SESSION)_[A-Z_]+$/.test(error.message)
        ? error.message : "PROJECT_SESSION_INPUT_UNAVAILABLE", ...flags() };
    }
  }
  return Object.freeze({ execute, retireRoute: () => { current = null; } });
}

module.exports = { createDocumentSession };
