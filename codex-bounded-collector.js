const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { TextDecoder } = require("node:util");
const { z } = require("zod");
const { digest, sha256, AUTHORITY } = require("./order-intake-contract");
const { validOperatorSignature } = require("./operator-consent-contract");
const { VERSION, assertSelection } = require("./codex-model-selection-contract");
function requireThat(value, code) { if (!value) throw new Error(code); }

const DISABLED = Object.freeze(["shell_tool", "hooks", "apps", "plugins", "remote_plugin", "multi_agent", "goals", "browser_use",
  "browser_use_external", "computer_use", "in_app_browser", "skill_mcp_dependency_install", "skill_search", "memories",
  "image_generation", "code_mode", "code_mode_host", "daemon_auto_start", "unbounded_connection_retries",
  "view_image", "workspace_dependencies", "sleep_tool", "unified_exec", "stable_environment_tools"]);
const DIAGNOSTIC = "Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.";
function createCollector(adapter) {
adapter = Object.freeze({ ...adapter });
const { revalidatePreview } = adapter;
const CONSENT = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal(adapter.consentType),
  id: z.uuid(), purpose: z.literal(adapter.purpose),
  invocation_sha256: z.string().regex(/^[a-f0-9]{64}$/), principal_id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }), expires_at: z.iso.datetime({ offset: true }),
  execution_authorized: z.literal(false), release_authorized: z.literal(false),
  signature: z.strictObject({ algorithm: z.literal("Ed25519"), key_sha256: z.string().regex(/^[a-f0-9]{64}$/), value: z.string() }) });
function executableDigest(file) {
  const stat = fs.statSync(file);
  requireThat(stat.isFile() && stat.size > 0 && stat.size <= 536870912, "SEMANTIC_EXECUTABLE_INVALID");
  return sha256(fs.readFileSync(file));
}
function prepareProfile(options) {
  requireThat(process.platform !== "win32", "SEMANTIC_PLATFORM_UNSUPPORTED");
  requireThat(typeof options.executable === "string" && path.isAbsolute(options.executable), "SEMANTIC_EXECUTABLE_REQUIRED");
  const executable = fs.realpathSync(options.executable);
  const version = spawnSync(executable, ["--version"], { encoding: "utf8", shell: false, timeout: 5000, maxBuffer: 4096,
    env: { HOME: os.homedir(), PATH: process.env.PATH || "/usr/bin:/bin" } });
  requireThat(!version.error && version.status === 0 && version.stdout.trim() === VERSION, "SEMANTIC_CLI_VERSION_UNSUPPORTED");
  requireThat(typeof options.model === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.model), "SEMANTIC_MODEL_REQUIRED");
  const selection = options.modelSelection;
  if (selection) {
    assertSelection(selection);
    requireThat(selection.requested_model === options.model && selection.executable_sha256 === executableDigest(executable) &&
      selection.cli_version === VERSION, "SEMANTIC_MODEL_SELECTION_PROFILE_MISMATCH");
  }
  const timeout = options.timeoutMs ?? 240000, maxBytes = options.maxOutputBytes ?? 1048576;
  requireThat(Number.isSafeInteger(timeout) && timeout >= 100 && timeout <= 240000 && Number.isSafeInteger(maxBytes) &&
    maxBytes >= 1024 && maxBytes <= 1048576, "SEMANTIC_LIMITS_INVALID");
  return { executable, executable_sha256: executableDigest(executable), cli_version: VERSION,
      requested_model: options.model, ...(selection ? { model_selection: selection } : {}), reasoning_effort: "medium", disabled_features: [...DISABLED], enabled_features: [], host_skill_discovery_attested: false,
      timeout_ms: timeout, max_output_bytes: maxBytes, maximum_invocations: 1,
      sandbox: "read-only", upstream_cost_cap_enforced: false, native_context_attested: false, model_snapshot_attested: false };
}
function prepareInvocation(preview, options) {
  revalidatePreview(preview);
  const profile = prepareProfile(options); adapter.verifyProfile?.(profile, preview);
  const invocation = { schema_version: "0.1", type: adapter.invocationType, preview, profile, ...AUTHORITY };
  return { ...invocation, invocation_sha256: digest(invocation) };
}
function assertInvocationIntegrity(invocation) {
  requireThat(invocation?.type === adapter.invocationType, "SEMANTIC_INVOCATION_PURPOSE_INVALID");
  const { invocation_sha256: expected, ...body } = invocation;
  requireThat(expected === digest(body), "SEMANTIC_INVOCATION_SUBSTITUTED");
  requireThat(invocation.preview && typeof invocation.preview === "object" && !Array.isArray(invocation.preview), "SEMANTIC_INVOCATION_PREVIEW_INVALID");
  const { preview_sha256: previewDigest, ...previewBody } = invocation.preview;
  requireThat(previewDigest === digest(previewBody), "SEMANTIC_INVOCATION_PREVIEW_SUBSTITUTED");
  if (invocation.profile?.model_selection) {
    const selection = assertSelection(invocation.profile.model_selection);
    requireThat(selection.requested_model === invocation.profile.requested_model && selection.executable_sha256 === invocation.profile.executable_sha256 &&
      selection.cli_version === invocation.profile.cli_version, "SEMANTIC_MODEL_SELECTION_PROFILE_MISMATCH");
  }
  return expected;
}
function verifyInvocation(invocation) {
  const expected = assertInvocationIntegrity(invocation);
  const current = prepareInvocation(invocation.preview, { executable: invocation.profile.executable,
    model: invocation.profile.requested_model, modelSelection: invocation.profile.model_selection,
    timeoutMs: invocation.profile.timeout_ms, maxOutputBytes: invocation.profile.max_output_bytes });
  requireThat(current.invocation_sha256 === expected, "SEMANTIC_EXECUTABLE_OR_PROFILE_CHANGED");
}
function verifyTransferConsent(consent, invocation, trustedPublicKey, now = Date.now()) {
  assertInvocationIntegrity(invocation);
  requireThat(CONSENT.safeParse(consent).success && validOperatorSignature(consent, trustedPublicKey), "SEMANTIC_TRANSFER_CONSENT_INVALID");
  const start = Date.parse(consent.created_at), end = Date.parse(consent.expires_at);
  requireThat(start <= now && now < end && end - start > 0 && end - start <= 120000 &&
    end <= Date.parse(invocation.preview.expires_at), "SEMANTIC_TRANSFER_CONSENT_EXPIRED_OR_FUTURE");
  requireThat(consent.invocation_sha256 === invocation.invocation_sha256, "SEMANTIC_TRANSFER_CONSENT_SUBSTITUTED");
}
function within(root, file) { return file === root || file.startsWith(root + path.sep); }
function privateRoot(directory, preview) {
  requireThat(path.isAbsolute(directory), "SEMANTIC_STATE_ROOT_INVALID");
  const root = fs.realpathSync(directory), stat = fs.statSync(root);
  requireThat(stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0 &&
    !within(preview.repository, root) && !within(preview.artifact_root, root) && !within(__dirname, root) &&
    !within(root, preview.repository) && !within(root, preview.artifact_root) && !within(root, __dirname), "SEMANTIC_STATE_ROOT_UNSAFE");
  const git = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree", "--is-inside-git-dir"], { encoding: "utf8", shell: false });
  requireThat(!git.error && !git.stdout.trim().split(/\r?\n/).includes("true"), "SEMANTIC_STATE_ROOT_UNSAFE");
  return root;
}
function durable(file, value, exclusive = false) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n");
  const descriptor = fs.openSync(file, exclusive ? "wx" : "w", 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); return sha256(bytes); }
  finally { fs.closeSync(descriptor); }
}
function syncDirectory(directory) {
  const fd = fs.openSync(directory, "r"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function groupExists(pid) { try { process.kill(-pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } }
function signalGroup(pid, signal) {
  try { process.kill(-pid, signal); return true; }
  catch (error) { return error.code === "ESRCH"; }
}

// Only a trusted operator host may configure the key and private one-use journal.
// No public run CLI or agent-facing execution endpoint is exposed in this slice.
async function collectEvaluation(invocation, consent, configuration) {
  verifyInvocation(invocation);
  verifyTransferConsent(consent, invocation, configuration.trustedPublicKey);
  adapter.verifyScope?.(invocation.preview, configuration);
  const root = privateRoot(configuration.stateRoot, invocation.preview), directory = path.join(root, consent.id);
  const identity = adapter.collectionIdentity?.(invocation.preview);
  if (identity) {
    requireThat(z.uuid().safeParse(identity.collection_id).success, "SEMANTIC_COLLECTION_IDENTITY_INVALID");
    const identityDirectory = path.join(root, `collection-${identity.collection_id}`);
    try { fs.mkdirSync(identityDirectory, { mode: 0o700 }); }
    catch (error) { if (error.code === "EEXIST") throw new Error("SEMANTIC_COLLECTION_IDENTITY_ALREADY_RESERVED"); throw error; }
    durable(path.join(identityDirectory, "reservation.json"), { ...identity, consent_id: consent.id,
      invocation_sha256: invocation.invocation_sha256, consent_sha256: digest(consent), reserved_at: new Date().toISOString() }, true);
    syncDirectory(identityDirectory); syncDirectory(root);
  }
  try { fs.mkdirSync(directory, { mode: 0o700 }); }
  catch (error) { if (error.code === "EEXIST") throw new Error("SEMANTIC_TRANSFER_ALREADY_RESERVED"); throw error; }
  syncDirectory(root);
  const workspace = path.join(directory, "workspace"); fs.mkdirSync(workspace, { mode: 0o700 });
  const schemaFile = path.join(directory, "response.schema.json"), responseFile = path.join(directory, "response.json");
  durable(path.join(directory, "invocation.json"), invocation, true);
  durable(path.join(directory, "consent.json"), consent, true);
  durable(schemaFile, invocation.preview.response_schema, true);
  const record = { schema_version: "0.1", type: adapter.collectionType, status: "invocation_reserved",
    invocation_sha256: invocation.invocation_sha256, consent_id: consent.id,
    started_at: new Date().toISOString(), failure_reasons: [], actual_model_invocation_started: false,
    completed_turns: 0, event_counts: {}, process_exit_confirmed: false, process_group_absent: false,
    semantic_completeness_proven: false, calibrated_for_admission: false, ...AUTHORITY };
  if (identity) Object.assign(record, { collection_identity: identity, native_thread_id: null, native_account_identity_attested: false,
    pre_inference_native_identity_attested: false });
  const save = () => durable(path.join(directory, "result.json"), record);
  save(); syncDirectory(directory);
  const nativeEventsPath = identity ? path.join(directory, "native-events.jsonl") : null;
  const nativeEventsFd = identity ? fs.openSync(nativeEventsPath, "wx", 0o600) : null;
  const profile = invocation.profile;
  const argv = ["exec", "--ignore-user-config", "--strict-config", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "--cd", workspace,
    "--model", profile.requested_model, "-c", 'model_reasoning_effort="medium"', "-c", 'approval_policy="never"', "-c", 'web_search="disabled"',
    "-c", "project_doc_max_bytes=0", "-c", "mcp_servers={}", "-c", 'shell_environment_policy.inherit="none"',
    ...DISABLED.flatMap(feature => ["--disable", feature]),
    "--output-schema", schemaFile, "--output-last-message", responseFile, "--color", "never", "--json", "-"];
  record.argv_sha256 = digest(argv); save();
  let child, exitPromise, timer, killTimer, scopeTimer, journalSha256 = null, pending = "", finalMessage = null, totalBytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true }), stdoutHash = crypto.createHash("sha256"), stderrHash = crypto.createHash("sha256");
  function terminate(signal) {
    if (!signalGroup(child.pid, signal)) {
      if (!record.failure_reasons.includes("SEMANTIC_PROCESS_SIGNAL_FAILED")) record.failure_reasons.push("SEMANTIC_PROCESS_SIGNAL_FAILED");
      // A racing exited process may reject a group signal. Never throw from a stream callback.
      try { child.kill(signal); } catch { /* Group absence is still independently checked. */ }
    }
  }
  function stop(reason) {
    if (!record.failure_reasons.includes(reason)) record.failure_reasons.push(reason);
    if (child?.pid && !record.process_exit_confirmed) {
      terminate("SIGTERM");
      killTimer ||= setTimeout(() => { if (groupExists(child.pid)) terminate("SIGKILL"); }, 1000);
    }
  }
  function event(line) {
    if (!line.trim() || record.failure_reasons.length) return;
    let value; try { value = JSON.parse(line); } catch { stop("SEMANTIC_EVENT_JSON_INVALID"); return; }
    if (!value || typeof value !== "object" || Array.isArray(value)) { stop("SEMANTIC_EVENT_JSON_INVALID"); return; }
    const allowed = ["thread.started", "turn.started", "turn.completed", "turn.failed", "error", "item.started", "item.updated", "item.completed"];
    if (!allowed.includes(value.type)) { stop("SEMANTIC_EVENT_UNKNOWN"); return; }
    record.event_counts[value.type] = (record.event_counts[value.type] || 0) + 1;
    if (identity && value.type === "thread.started") {
      if (record.native_thread_id || record.actual_model_invocation_started || !z.uuid().safeParse(value.thread_id).success) {
        stop("SEMANTIC_NATIVE_THREAD_INVALID"); return;
      }
      record.native_thread_id = value.thread_id;
      try { save(); } catch { stop("SEMANTIC_NATIVE_THREAD_JOURNAL_FAILED"); }
    }
    if (value.type === "turn.started") {
      if (record.actual_model_invocation_started) stop("SEMANTIC_MULTIPLE_TURNS");
      record.actual_model_invocation_started = true;
      if (identity && !record.native_thread_id) stop("SEMANTIC_NATIVE_THREAD_MISSING_BEFORE_TURN");
    }
    if (identity && (value.type === "turn.completed" || value.type.startsWith("item.")) &&
        (!record.native_thread_id || !record.actual_model_invocation_started || record.completed_turns)) {
      stop("SEMANTIC_NATIVE_EVENT_ORDER_INVALID"); return;
    }
    if (value.type === "turn.completed") { record.completed_turns++; record.usage = value.usage; }
    if (["turn.failed", "error"].includes(value.type)) stop("SEMANTIC_PROVIDER_FAILED");
    if (value.type.startsWith("item.")) {
      const item = value.item;
      if (item?.type === "error" && item.message === DIAGNOSTIC) return;
      if (!item || !["agent_message", "reasoning"].includes(item.type)) {
        const diagnostic = { item_type: String(item?.type || "missing").slice(0, 128),
          message: typeof item?.message === "string" ? item.message.slice(0, 8192) : "" };
        // Quarantined operator-only data, never part of the returned assessment.
        try { durable(path.join(directory, "diagnostic.json"), diagnostic, true); record.diagnostic_sha256 = digest(diagnostic); }
        catch { stop("SEMANTIC_DIAGNOSTIC_WRITE_FAILED"); }
        stop("SEMANTIC_UNEXPECTED_TOOL_OR_DIAGNOSTIC");
      }
      if (value.type === "item.completed" && item?.type === "agent_message") finalMessage = item.text;
    }
  }
  const abort = () => stop("SEMANTIC_CANCELLED");
  try {
    verifyInvocation(invocation); verifyTransferConsent(consent, invocation, configuration.trustedPublicKey);
    adapter.verifyScope?.(invocation.preview, configuration);
    requireThat(!configuration.signal?.aborted, "SEMANTIC_CANCELLED");
    child = spawn(profile.executable, argv, { cwd: workspace, shell: false, detached: true,
      env: { HOME: os.homedir(), USER: os.userInfo().username, PATH: process.env.PATH || "/usr/bin:/bin", TMPDIR: os.tmpdir() },
      stdio: ["pipe", "pipe", "pipe"] });
    child.on("error", () => stop("SEMANTIC_SPAWN_FAILED"));
    child.stdin.on("error", () => stop("SEMANTIC_STDIN_FAILED"));
    exitPromise = new Promise(resolve => child.once("close", (code, signal) => {
      record.process_exit_confirmed = true; record.exit_code = code; record.signal = signal; resolve({ code, signal });
    }));
    record.pid = child.pid || null; record.status = "running"; save();
    configuration.signal?.addEventListener("abort", abort, { once: true });
    if (adapter.verifyScope) scopeTimer = setInterval(() => {
      try { adapter.verifyScope(invocation.preview, configuration); }
      catch { stop("SEMANTIC_TRAINING_SCOPE_CHANGED"); }
    }, 1000);
    child.stdout.on("data", bytes => {
      stdoutHash.update(bytes); totalBytes += bytes.length;
      if (totalBytes > profile.max_output_bytes) { stop("SEMANTIC_OUTPUT_LIMIT"); return; }
      if (nativeEventsFd !== null) {
        try { fs.writeSync(nativeEventsFd, bytes); } catch { stop("SEMANTIC_NATIVE_EVENTS_WRITE_FAILED"); return; }
      }
      try { pending += decoder.decode(bytes, { stream: true }); }
      catch { stop("SEMANTIC_EVENT_UTF8_INVALID"); return; }
      const lines = pending.split("\n"); pending = lines.pop(); lines.forEach(event);
    });
    child.stderr.on("data", bytes => { stderrHash.update(bytes); totalBytes += bytes.length; if (totalBytes > profile.max_output_bytes) stop("SEMANTIC_OUTPUT_LIMIT"); });
    timer = setTimeout(() => stop("SEMANTIC_TIMEOUT"), Math.min(profile.timeout_ms,
      Date.parse(invocation.preview.expires_at) - Date.now()));
    child.stdin.end(invocation.preview.prompt);
    const exit = await exitPromise;
    try { pending += decoder.decode(); } catch { stop("SEMANTIC_EVENT_UTF8_INVALID"); }
    if (pending) event(pending);
    if (exit.code !== 0 || exit.signal) stop("SEMANTIC_PROCESS_FAILED");
    requireThat(exit.code === 0 && !exit.signal && record.failure_reasons.length === 0 &&
      record.actual_model_invocation_started && record.completed_turns === 1, "SEMANTIC_RESPONSE_UNAVAILABLE");
    verifyInvocation(invocation);
    adapter.verifyScope?.(invocation.preview, configuration);
    requireThat(fs.readdirSync(workspace).length === 0, "SEMANTIC_WORKSPACE_CHANGED");
    const fd = fs.openSync(responseFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let bytes;
    try {
      const stat = fs.fstatSync(fd); requireThat(stat.isFile() && stat.size > 0 && stat.size <= profile.max_output_bytes, "SEMANTIC_RESPONSE_SIZE_INVALID");
      if (identity) { requireThat(stat.nlink === 1 && stat.uid === process.getuid(), "SEMANTIC_RESPONSE_FILE_UNSAFE"); fs.fchmodSync(fd, 0o600); }
      const buffer = Buffer.alloc(stat.size + 1), length = fs.readSync(fd, buffer, 0, buffer.length, 0);
      requireThat(length === stat.size, "SEMANTIC_RESPONSE_SIZE_CHANGED"); bytes = buffer.subarray(0, length);
    }
    finally { fs.closeSync(fd); }
    requireThat(Buffer.from(bytes.toString("utf8")).equals(bytes), "SEMANTIC_RESPONSE_UTF8_INVALID");
    const response = JSON.parse(bytes.toString("utf8"));
    requireThat(typeof finalMessage === "string" && digest(JSON.parse(finalMessage)) === digest(response), "SEMANTIC_FINAL_MESSAGE_SUBSTITUTED");
    record.assessment = adapter.assessResponse(response, invocation.preview);
    record.response_sha256 = sha256(bytes); record.status = "evaluated";
  } catch (error) {
    stop(/^SEMANTIC_[A-Z_]+$/.test(error.message) ? error.message : "SEMANTIC_COLLECTION_FAILED");
    record.status = "not_evaluated";
  } finally {
    clearTimeout(timer); clearInterval(scopeTimer); configuration.signal?.removeEventListener("abort", abort);
    if (child?.pid && groupExists(child.pid)) {
      terminate("SIGKILL");
      for (let count = 0; count < 100 && groupExists(child.pid); count++) await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (exitPromise && !record.process_exit_confirmed) await exitPromise;
    clearTimeout(killTimer);
    record.process_group_absent = child?.pid ? !groupExists(child.pid) : true;
    if (!record.process_group_absent) { record.status = "not_evaluated"; record.failure_reasons.push("SEMANTIC_PROCESS_GROUP_REMAINS"); }
    if (record.status !== "evaluated") delete record.assessment;
    record.stdout_sha256 = stdoutHash.digest("hex"); record.stderr_sha256 = stderrHash.digest("hex");
    if (nativeEventsFd !== null) {
      try {
        fs.fsyncSync(nativeEventsFd); record.native_events_sha256 = sha256(fs.readFileSync(nativeEventsPath));
        if (record.status === "evaluated" && record.native_events_sha256 !== record.stdout_sha256) {
          record.status = "not_evaluated"; record.failure_reasons.push("SEMANTIC_NATIVE_EVENTS_CHANGED"); delete record.assessment;
        }
      } catch { record.status = "not_evaluated"; record.failure_reasons.push("SEMANTIC_NATIVE_EVENTS_WRITE_FAILED"); delete record.assessment; }
      finally { fs.closeSync(nativeEventsFd); }
    }
    record.ended_at = new Date().toISOString();
    record.result_persisted = true;
    try { journalSha256 = save(); }
    catch { record.status = "not_evaluated"; record.result_persisted = false;
      record.failure_reasons.push("SEMANTIC_JOURNAL_RESULT_WRITE_FAILED"); delete record.assessment; }
  }
  return { ...record, journal_sha256: journalSha256, directory };
}
return { VERSION, prepareProfile, prepareInvocation, verifyTransferConsent, collectEvaluation };
}
module.exports = { VERSION, createCollector };
