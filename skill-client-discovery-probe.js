#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { parseFrontmatter } = require("./validate-controls-skill");

const NAME = "controls-doctrine-operator";
const LIMIT = 4 * 1024 * 1024;
const TIMEOUT = 20000;
const SANDBOX = "/usr/bin/sandbox-exec";

function profile(root) {
  const protectedPaths = [path.join(os.homedir(), ".claude"), path.join(os.homedir(), ".claude.json"),
    path.join(os.homedir(), ".codex", "auth.json"), path.join(os.homedir(), ".codex", "config.toml"),
    path.join(os.homedir(), "Library", "Keychains"), path.join(os.homedir(), ".local", "state", "cannae-operator")];
  return `(version 1)(allow default)(deny network*)(deny file-write*)` +
    `(allow file-write* (subpath ${JSON.stringify(root)}) (literal "/dev/null"))` +
    `(deny file-read* ${protectedPaths.map(file => `(subpath ${JSON.stringify(file)})`).join(" ")})` +
    '(deny mach-lookup (global-name-regex #"^com\\.apple\\.(securityd|SecurityServer|secd)"))';
}

function environment(home) {
  return { HOME: home, CODEX_HOME: path.join(home, ".codex"),
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"), TMPDIR: home,
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, LANG: "en_US.UTF-8",
    TERM: "dumb", DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" };
}

function verifyContainment(root, env) {
  const policy = profile(root);
  const network = spawnSync(SANDBOX, ["-p", policy, process.execPath, "-e",
    'const s=require("node:net").connect({host:"127.0.0.1",port:9});' +
    's.on("connect",()=>process.exit(3));s.on("error",e=>process.exit(["EPERM","EACCES"].includes(e.code)?0:4));'],
  { cwd: root, env, encoding: "utf8", timeout: 3000 });
  assert.equal(network.status, 0, "OS network denial was not verified; no client may start.");
  const guard = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-discovery-write-guard-"));
  try {
    const sentinel = path.join(fs.realpathSync(guard), "sentinel");
    fs.writeFileSync(sentinel, "unchanged");
    const write = spawnSync(SANDBOX, ["-p", policy, process.execPath, "-e",
      'try{require("node:fs").writeFileSync(process.argv[1],"changed");process.exit(3)}' +
      'catch(e){process.exit(["EPERM","EACCES"].includes(e.code)?0:4)}', sentinel],
    { cwd: root, env, encoding: "utf8", timeout: 3000 });
    assert.equal(write.status, 0, "OS write boundary was not verified; no client may start.");
    assert.equal(fs.readFileSync(sentinel, "utf8"), "unchanged");
  } finally {
    fs.rmSync(guard, { recursive: true, force: true });
  }
}

function runClient(binary, args, root, env, initialize) {
  return new Promise((resolve, reject) => {
    const child = spawn(SANDBOX, ["-p", profile(root), binary, ...args], {
      cwd: path.join(root, "workspace"), env, detached: true, stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "", stderr = "", pending = "", failure = null, response = null;
    const stop = message => {
      failure ||= new Error(message);
      if (child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); }
        catch (error) { if (error.code !== "ESRCH") failure = error; }
      }
    };
    const timer = setTimeout(() => stop("Native metadata probe timed out."), TIMEOUT);
    child.on("error", error => { failure = error; });
    child.stdin.on("error", error => { if (error.code !== "EPIPE") stop(error.message); });
    child.stderr.on("data", chunk => {
      stderr += chunk;
      if (stderr.length > LIMIT) stop("Native stderr exceeded the output limit.");
    });
    child.stdout.on("data", chunk => {
      stdout += chunk;
      if (stdout.length > LIMIT) { stop("Native stdout exceeded the output limit."); return; }
      if (!initialize) return;
      pending += chunk;
      let end;
      while ((end = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (!line) continue;
        let frame;
        try { frame = JSON.parse(line); }
        catch { stop("Invalid native control response."); return; }
        if (frame.type === "assistant" || frame.type === "result" || frame.type === "control_request") {
          stop("Unexpected model/tool activity during metadata-only initialization."); return;
        }
        if (frame.type === "control_response") {
          if (response || frame.response?.request_id !== initialize.request_id || frame.response?.subtype !== "success") {
            stop("Unexpected or failed initialization response."); return;
          }
          response = frame.response.response;
          child.stdin.end();
        }
      }
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Native process failed (${code ?? signal}): ${stderr.slice(0,1200)}`));
      else if (initialize && !response) reject(new Error("Native initialization returned no metadata."));
      else resolve({ stdout, response });
    });
    if (initialize) child.stdin.write(JSON.stringify(initialize) + "\n");
    else child.stdin.end();
  });
}

function textParts(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textParts);
  if (value && typeof value === "object") return Object.values(value).flatMap(textParts);
  return [];
}

function claudeDiscovery(response, description) {
  assert(Array.isArray(response?.commands), "Native initialization has no command list.");
  const matches = response.commands.filter(command => command.name === NAME);
  assert(matches.length <= 1, "Native client returned duplicate skill commands.");
  if (!matches.length) return false;
  assert([description, `${description} (user)`].includes(matches[0].description),
    "Discovered description does not match the bundle or its user-scope annotation.");
  return true;
}

async function probe(provider, binary, mode) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `cannae-${provider}-discovery-`)));
  const home = path.join(root, "home");
  const env = environment(home);
  const source = path.join(__dirname, provider === "codex" ? "codex-skills" : ".claude/skills", NAME);
  const entry = fs.readFileSync(path.join(source, "SKILL.md"), "utf8");
  const description = parseFrontmatter(entry).values.description;
  try {
    for (const directory of [home, env.CODEX_HOME, env.CLAUDE_CONFIG_DIR, path.join(root, "workspace")]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    const destination = path.join(provider === "codex" ? env.CODEX_HOME : env.CLAUDE_CONFIG_DIR, "skills", NAME);
    if (mode !== "absent") {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (["link", "bare-link", "excluded-user-link"].includes(mode)) fs.symlinkSync(source, destination);
      else fs.cpSync(source, destination, { recursive: true });
    }
    verifyContainment(root, env);
    const version = (await runClient(binary, ["--version"], root, env)).stdout.trim();
    let found;
    if (provider === "codex") {
      const result = await runClient(binary, ["--no-daemon", "debug", "prompt-input"], root, env);
      const parts = textParts(JSON.parse(result.stdout));
      found = parts.some(text => text.includes(NAME) && text.includes(description));
    } else {
      const result = await runClient(binary, [...(mode === "bare-link" ? ["--bare"] : []), "--print", "--verbose",
        "--input-format", "stream-json", "--output-format", "stream-json", "--no-session-persistence",
        "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", mode === "excluded-user-link" ? "" : "user", "--tools", "",
        "--settings", '{"disableAllHooks":true}'],
      root, env, { type: "control_request", request_id: "skill-discovery-only",
        request: { subtype: "initialize", hooks: null } });
      found = claudeDiscovery(result.response, description);
    }
    const expected = !["absent", "bare-link", "excluded-user-link"].includes(mode);
    assert.equal(found, expected, `${provider} ${mode} discovery differs from the installed bundle.`);
    return { provider, version, installation: mode, discovered: found, expected,
      containment_verified: true, entry_sha256: createHash("sha256").update(entry).digest("hex") };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert(process.platform === "darwin", "This opt-in native probe requires macOS network/write containment.");
  assert(args.length === 2 || args.length === 4,
    "Usage: node skill-client-discovery-probe.js --codex /absolute/binary [--claude /absolute/binary]");
  const providers = [];
  for (let i = 0; i < args.length; i += 2) {
    const provider = args[i].slice(2);
    assert(["codex", "claude"].includes(provider) && args[i] === `--${provider}`);
    assert(!providers.some(item => item.provider === provider), "Duplicate provider.");
    assert(path.isAbsolute(args[i + 1]), "Use an explicit absolute native binary path.");
    const binary = fs.realpathSync(args[i + 1]);
    fs.accessSync(binary, fs.constants.X_OK);
    providers.push({ provider, binary });
  }
  const results = [];
  for (const { provider, binary } of providers) {
    for (const mode of ["absent", "link", "copy", ...(provider === "claude" ? ["bare-link", "excluded-user-link"] : [])]) {
      try {
        results.push({ valid: true, ...await probe(provider, binary, mode) });
        console.error(`PASS ${provider} ${mode}: native metadata matches the isolated installation`);
      } catch (error) {
        results.push({ valid: false, provider, installation: mode, error: error.message });
        console.error(`FAIL ${provider} ${mode}: ${error.message}`);
      }
    }
  }
  const valid = results.every(result => result.valid);
  console.log(JSON.stringify({ valid, scope: "isolated_native_skill_discovery_only",
    isolation_required: "OS-denied network and writes outside temporary root; checked before client startup",
    model_prompt_sent: false, user_home_changed: false, workflow_execution_verified: false, results }, null, 2));
  if (!valid) process.exitCode = 1;
}

function verifyClaudeSkillBody(event, { directory, body, args } = {}) {
  assert(typeof directory === "string" && path.isAbsolute(directory), "Expected an explicit skill directory.");
  assert(typeof body === "string" && body.trim(), "Expected the exact installed instruction body.");
  assert(args === undefined || typeof args === "string", "Skill arguments must be the observed string, if present.");
  assert(event?.type === "user" && event.isSynthetic === true && event.message?.role === "user",
    "Expected the native loaded-skill user event, not discovery metadata.");
  const content = event.message.content;
  assert(Array.isArray(content) && content.length === 1 && content[0].type === "text", "Unexpected loaded-skill content.");
  const prefix = `Base directory for this skill: ${directory}\n\n`;
  assert(typeof content[0].text === "string" && content[0].text.startsWith(prefix), "Loaded skill directory mismatch.");
  let loaded = content[0].text.slice(prefix.length);
  if (args) {
    const suffix = `\n\nARGUMENTS: ${args}`;
    assert(loaded.endsWith(suffix), "Loaded skill arguments mismatch.");
    loaded = loaded.slice(0, -suffix.length);
  }
  assert.equal(loaded.trim(), body.trim(), "Loaded skill body mismatch.");
  return { body_verified: true, body_sha256: createHash("sha256").update(body.trim()).digest("hex"),
    arguments_sha256: args === undefined ? null : createHash("sha256").update(args).digest("hex"),
    semantic_execution_verified: false };
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { environment, profile, textParts, claudeDiscovery, verifyClaudeSkillBody };
