const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn, spawnSync } = require("node:child_process"), { TextDecoder } = require("node:util");
const { digest, sha256 } = require("./order-intake-contract");
const { VERSION, SELECTOR, model, need, assertSelection, AUTHORITY } = require("./codex-model-selection-contract");
const DISABLED = ["apps", "plugins", "remote_plugin", "hooks", "code_mode", "code_mode_host", "daemon_auto_start", "multi_agent", "memories"];
const groupExists = pid => { try { process.kill(-pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } };
function projection(result) {
  const value = result?.config;
  need(value && typeof value === "object" && !Array.isArray(value), "SEMANTIC_MODEL_CONFIG_INVALID");
  need(value.model === null || model.safeParse(value.model).success, "SEMANTIC_MODEL_CONFIG_INVALID");
  need([null, "openai"].includes(value.model_provider) && !value.openai_base_url && !value.model_providers?.openai,
    "SEMANTIC_MODEL_PROVIDER_UNSUPPORTED");
  return { model: value.model, model_provider: value.model_provider ?? "openai" };
}
function projectModel(value) {
  need(value && model.safeParse(value.id).success && model.safeParse(value.model).success && typeof value.isDefault === "boolean" &&
    typeof value.hidden === "boolean" && Array.isArray(value.supportedReasoningEfforts), "SEMANTIC_MODEL_CATALOG_INVALID");
  const efforts = value.supportedReasoningEfforts.map(item => item?.reasoningEffort);
  need(efforts.every(item => typeof item === "string"), "SEMANTIC_MODEL_CATALOG_INVALID");
  return { id: value.id, model: value.model, is_default: value.isDefault, hidden: value.hidden, reasoning_efforts: [...efforts].sort() };
}
async function resolveDefaultModel({ executable, cwd, home = os.homedir(), signal, timeoutMs = 15000 }) {
  need(process.platform !== "win32" && path.isAbsolute(executable || "") && path.isAbsolute(cwd || "") && path.isAbsolute(home), "SEMANTIC_MODEL_DISCOVERY_OPTIONS_INVALID");
  need(Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 15000, "SEMANTIC_MODEL_DISCOVERY_LIMIT_INVALID");
  executable = fs.realpathSync(executable); cwd = fs.realpathSync(cwd); home = fs.realpathSync(home);
  const stat = fs.statSync(executable);
  need(stat.isFile() && !(stat.mode & 0o6000) && stat.size > 0 && stat.size <= 536870912, "SEMANTIC_EXECUTABLE_INVALID");
  const executableSha256 = sha256(fs.readFileSync(executable));
  const env = { HOME: home, USER: os.userInfo().username, PATH: process.env.PATH || "/usr/bin:/bin", TMPDIR: os.tmpdir() };
  const version = spawnSync(executable, ["--version"], { cwd, env, encoding: "utf8", shell: false, timeout: 5000, maxBuffer: 4096 });
  need(!version.error && version.status === 0 && version.stdout.trim() === VERSION, "SEMANTIC_CLI_VERSION_UNSUPPORTED");
  need(!signal?.aborted, "SEMANTIC_MODEL_DISCOVERY_CANCELLED");
  const argv = ["app-server", "--listen", "stdio://", "-c", "analytics.enabled=false", ...DISABLED.flatMap(value => ["--disable", value])];
  let child, failure, finished = false, closed = false, total = 0, text = "", pending = null, nextId = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const request = (method, params) => new Promise((resolve, reject) => {
    need(!pending && !finished && !failure, "SEMANTIC_MODEL_PROTOCOL_INVALID");
    const id = ++nextId; pending = { id, resolve, reject };
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n", error => { if (error) stop("SEMANTIC_MODEL_DISCOVERY_IO_FAILED"); });
  });
  function stop(code) {
    failure ||= new Error(code); if (pending) { const current = pending; pending = null; current.reject(failure); }
    if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch {} }
  }
  function receive(line) {
    const value = JSON.parse(line);
    need(value && typeof value === "object" && !Array.isArray(value), "SEMANTIC_MODEL_PROTOCOL_INVALID");
    if (!Object.hasOwn(value, "id")) {
      const p = value.params, inertRemote = value.method === "remoteControl/status/changed" && p && p.status === "disabled" &&
        p.environmentId == null && typeof p.installationId === "string" && typeof p.serverName === "string" &&
        Object.keys(p).every(key => ["status", "environmentId", "installationId", "serverName"].includes(key));
      need(value.method === "account/updated" || inertRemote, "SEMANTIC_MODEL_UNEXPECTED_ACTIVITY"); return;
    }
    need(pending && value.id === pending.id && Object.hasOwn(value, "result") && !Object.hasOwn(value, "error") && !value.method,
      "SEMANTIC_MODEL_PROTOCOL_INVALID");
    const current = pending; pending = null; current.resolve(value.result);
  }
  let timer, killTimer, exitPromise, result;
  const abort = () => stop("SEMANTIC_MODEL_DISCOVERY_CANCELLED");
  try {
    child = spawn(executable, argv, { cwd, env, shell: false, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    exitPromise = new Promise(resolve => child.once("close", (code, signal) => {
      closed = true; if (!finished || code !== 0 || signal) stop("SEMANTIC_MODEL_DISCOVERY_EXITED"); resolve(code);
    }));
    child.on("error", () => stop("SEMANTIC_MODEL_DISCOVERY_SPAWN_FAILED"));
    child.stdin.on("error", () => stop("SEMANTIC_MODEL_DISCOVERY_IO_FAILED"));
    child.stdout.on("data", bytes => {
      total += bytes.length;
      if (total > 1048576) { stop("SEMANTIC_MODEL_DISCOVERY_OUTPUT_LIMIT"); return; }
      try {
        text += decoder.decode(bytes, { stream: true }); let end;
        while ((end = text.indexOf("\n")) !== -1 && !failure) { const line = text.slice(0, end); text = text.slice(end + 1); receive(line); }
      } catch (error) { stop(/^SEMANTIC_[A-Z_]+$/.test(error.message) ? error.message : "SEMANTIC_MODEL_PROTOCOL_INVALID"); }
    });
    child.stderr.on("data", bytes => { total += bytes.length; if (total > 1048576) stop("SEMANTIC_MODEL_DISCOVERY_OUTPUT_LIMIT"); });
    timer = setTimeout(() => stop("SEMANTIC_MODEL_DISCOVERY_TIMEOUT"), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
    // No task input, thread, turn, tool, authentication mutation or config-write RPC exists here.
    await request("initialize", { clientInfo: { name: "cannae_model_selection", version: "0.1.0" } });
    child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
    const config = projection(await request("config/read", { includeLayers: false, cwd })), rows = [], cursors = new Set();
    let cursor = null;
    for (let page = 0; page < 8; page++) {
      const catalog = await request("model/list", { includeHidden: true, limit: 100, cursor });
      need(Array.isArray(catalog?.data) && catalog.data.length <= 100 && (catalog.nextCursor === null || typeof catalog.nextCursor === "string" && catalog.nextCursor.length <= 4096), "SEMANTIC_MODEL_CATALOG_INVALID");
      rows.push(...catalog.data.map(projectModel)); cursor = catalog.nextCursor;
      if (cursor === null) break;
      need(cursor && !cursors.has(cursor) && page < 7, "SEMANTIC_MODEL_CATALOG_INCOMPLETE"); cursors.add(cursor);
    }
    need(rows.length > 0 && new Set(rows.map(row => row.model)).size === rows.length && new Set(rows.map(row => row.id)).size === rows.length, "SEMANTIC_MODEL_CATALOG_AMBIGUOUS");
    need(digest(config) === digest(projection(await request("config/read", { includeLayers: false, cwd }))), "SEMANTIC_MODEL_CONFIG_CHANGED");
    const matches = rows.filter(row => config.model ? row.model === config.model : row.is_default);
    need(matches.length === 1 && (config.model || !matches[0].hidden), "SEMANTIC_MODEL_DEFAULT_AMBIGUOUS");
    need(matches[0].reasoning_efforts.includes("medium"), "SEMANTIC_MODEL_REASONING_UNSUPPORTED");
    const body = { schema_version: "0.1", type: "CodexModelSelection", selector: "current_cli_default", source: config.model ? "configured_model" : "catalog_default",
      requested_model: matches[0].model, provider: "openai", reasoning_effort: "medium", resolved_at: new Date().toISOString(), cli_version: VERSION,
      executable_sha256: executableSha256, configuration_sha256: digest({ cwd, home, ...config }),
      catalog_sha256: digest(rows.sort((a, b) => a.model.localeCompare(b.model))),
      process_exit_confirmed: true, process_group_absent: true, model_access_attested: false, model_snapshot_attested: false, ...AUTHORITY };
    result = { ...body, selection_sha256: digest(body) }; finished = true;
  } catch (error) { stop(/^SEMANTIC_[A-Z_]+$/.test(error.message) ? error.message : "SEMANTIC_MODEL_DISCOVERY_FAILED"); }
  finally {
    signal?.removeEventListener("abort", abort); child?.stdin.end();
    if (child) {
      // Observe actual exit and group absence, including after a successful metadata response.
      const gentle = setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch {} } }, 500);
      killTimer = setInterval(() => { if (child.pid && groupExists(child.pid)) { try { process.kill(-child.pid, "SIGKILL"); } catch {} } }, 1000);
      await exitPromise; clearTimeout(gentle);
      for (let attempt = 0; attempt < 20 && child.pid && groupExists(child.pid); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
      if (!closed || child.pid && groupExists(child.pid)) failure = new Error("SEMANTIC_MODEL_DISCOVERY_EXIT_UNCONFIRMED");
      try { text += decoder.decode(); need(!text.trim(), "SEMANTIC_MODEL_PROTOCOL_INVALID"); } catch { failure ||= new Error("SEMANTIC_MODEL_PROTOCOL_INVALID"); }
    }
    clearTimeout(timer); clearInterval(killTimer);
  }
  if (failure) throw failure;
  need(sha256(fs.readFileSync(executable)) === executableSha256, "SEMANTIC_EXECUTABLE_OR_PROFILE_CHANGED");
  return assertSelection(result);
}
async function resolveHostProfiles(profiles, cwd, options = {}) {
  const selected = {};
  for (const key of ["semantic", "analysis", "training"]) {
    const profile = profiles[key]; if (!profile) { selected[key] = null; continue; }
    need(!Object.hasOwn(profile, "modelSelection"), "SEMANTIC_MODEL_SELECTION_HOST_ONLY");
    if (profile.model !== SELECTOR) { selected[key] = profile; continue; }
    const modelSelection = await resolveDefaultModel({ executable: profile.executable, cwd, ...options });
    selected[key] = { ...profile, model: modelSelection.requested_model, modelSelection };
  }
  return selected;
}
module.exports = { resolveDefaultModel, resolveHostProfiles, projection, projectModel, SELECTOR };
