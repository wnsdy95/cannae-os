#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { inspectInstallation } = require("./skill-installation-inspector");
const ROOT = __dirname, NAME = "controls-doctrine-operator", temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-install-inspect-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
let passed = 0;
const write = (file, body) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); };
const check = (name, run) => { run(); passed++; console.log("PASS " + name); };
function project() {
  const root = path.join(temporary, "corpus"); fs.mkdirSync(root);
  assert.equal(spawnSync("git", ["init", "-q", root], { env }).status, 0);
  for (const provider of ["codex", "claude"]) {
    const directory = path.join(root, provider === "codex" ? "codex-skills" : ".claude/skills", NAME);
    write(path.join(directory, "SKILL.md"), "Synthetic entrypoint.\n");
    write(path.join(directory, "references/client-operation.md"), "Synthetic conditional guide.\n");
    write(path.join(directory, "scripts/route_controls_docs.js"), "throw new Error('Installed script must not execute');\n");
  }
  assert.equal(spawnSync("git", ["-C", root, "add", "."], { env }).status, 0);
  assert.equal(spawnSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "synthetic baseline"], { env }).status, 0);
  return root;
}
try {
  const root = project();
  for (const provider of ["codex", "claude"]) {
    const source = path.join(root, provider === "codex" ? "codex-skills" : ".claude/skills", NAME);
    const linked = path.join(temporary, provider + "-link"), copied = path.join(temporary, provider + "-copy");
    fs.symlinkSync(source, linked); fs.cpSync(source, copied, { recursive: true });
    write(path.join(copied, ".cannae-os-root"), root + "\n");
    const inspect = directory => inspectInstallation(provider, directory, root);
    check(provider + ": matching link and copy do not execute installed code or grant native acceptance", () => {
      for (const directory of [linked, copied]) {
        const result = inspect(directory); assert.equal(result.valid, true);
        assert.equal(result.source_set_sha256, result.installed_set_sha256);
        for (const flag of ["installed_code_executed", "native_discovery_verified", "native_body_read_verified", "workflow_execution_verified", "settings_changed", "installation_changed", "can_execute"]) assert.equal(result[flag], false);
      }
    });
    check(provider + ": stale entry guide and executable report exact changed paths", () => {
      for (const relative of ["SKILL.md", "references/client-operation.md", "scripts/route_controls_docs.js"]) {
        const file = path.join(copied, relative), before = fs.readFileSync(file);
        fs.appendFileSync(file, "Changed local copy.\n");
        const result = inspect(copied); assert.equal(result.valid, false);
        assert(result.findings.some(item => item.path === relative && item.code === "content_differs"));
        assert(!JSON.stringify(result).includes("Changed local copy.")); fs.writeFileSync(file, before);
      }
    });
    check(provider + ": working-tree changes are compared as bytes, not inherited from HEAD", () => {
      const file = path.join(source, "references/client-operation.md"), before = fs.readFileSync(file), prior = inspect(copied);
      fs.appendFileSync(file, "Uncommitted source change.\n");
      const result = inspect(copied); assert.equal(result.valid, false); assert.equal(result.source_revision, prior.source_revision);
      assert.notEqual(result.source_set_sha256, prior.source_set_sha256); assert.equal(inspect(linked).valid, true);
      fs.writeFileSync(file, before);
    });
    check(provider + ": missing wrong relative malformed symlink and hardlink markers require appraisal", () => {
      const marker = path.join(copied, ".cannae-os-root"), saved = fs.readFileSync(marker);
      for (const body of [null, temporary + "\n", "relative/path\n", root + "\nsecond line", root + "\0"]) {
        if (body === null) fs.unlinkSync(marker); else write(marker, body);
        assert.equal(inspect(copied).valid, false); write(marker, saved);
      }
      const target = path.join(temporary, provider + "-marker"); write(target, saved);
      for (const kind of ["symbolic", "hard"]) {
        fs.unlinkSync(marker); if (kind === "symbolic") fs.symlinkSync(target, marker); else fs.linkSync(target, marker);
        assert.equal(inspect(copied).valid, false); fs.unlinkSync(marker); write(marker, saved);
      }
    });
    check(provider + ": unsafe source/installed support files and missing files never match", () => {
      const file = path.join(copied, "references/client-operation.md"), saved = path.join(temporary, provider + "-saved.md");
      fs.renameSync(file, saved); assert.equal(inspect(copied).valid, false);
      for (const kind of ["symbolic", "hard"]) {
        if (kind === "symbolic") fs.symlinkSync(saved, file); else fs.linkSync(saved, file);
        assert.equal(inspect(copied).valid, false); fs.unlinkSync(file);
      }
      fs.renameSync(saved, file);
      const directory = path.join(copied, "references"); fs.renameSync(directory, directory + "-saved"); fs.symlinkSync(directory + "-saved", directory);
      assert.equal(inspect(copied).valid, false); fs.unlinkSync(directory); fs.renameSync(directory + "-saved", directory);
    });
    check(provider + ": unknown entries are reported without reading or following their contents", () => {
      const secret = path.join(temporary, provider + "-private"), extra = path.join(copied, "private");
      write(path.join(secret, "password.txt"), "synthetic must not be read"); fs.symlinkSync(secret, extra);
      const open = fs.openSync;
      fs.openSync = function(file, ...rest) {
        assert(!String(file).startsWith(extra + path.sep)); assert(!String(file).startsWith(secret + path.sep));
        assert(!String(file).endsWith("/password.txt")); return open.call(fs, file, ...rest);
      };
      try { const result = inspect(copied); assert.equal(result.valid, false); assert(result.findings.some(item => item.path === "private" && item.code === "unexpected_entry")); }
      finally { fs.openSync = open; fs.unlinkSync(extra); }
    });
    check(provider + ": source drift during a bounded read cannot return a current installation", () => {
      const file = path.join(source, "SKILL.md"), before = fs.readFileSync(file), read = fs.readSync; let changed = false;
      fs.readSync = function(...args) { const result = read.apply(fs, args); if (!changed) { changed = true; fs.appendFileSync(file, "drift"); } return result; };
      try { assert.throws(() => inspect(copied), /FILE_CHANGED|SOURCE_CHANGED/); }
      finally { fs.readSync = read; fs.writeFileSync(file, before); }
    });
    check(provider + ": mode changes are visible without rewriting a user's copy", () => {
      const file = path.join(copied, "scripts/route_controls_docs.js"), mode = fs.statSync(file).mode;
      fs.chmodSync(file, mode ^ 0o111); assert(inspect(copied).findings.some(item => item.code === "executable_mode_differs"));
      assert.equal(fs.statSync(file).mode & 0o111, (mode ^ 0o111) & 0o111); fs.chmodSync(file, mode);
    });
    check(provider + ": CLI inspects a real source link from unrelated cwd without invoking a client", () => {
      const link = path.join(temporary, provider + "-real-link");
      fs.symlinkSync(path.join(ROOT, provider === "codex" ? "codex-skills" : ".claude/skills", NAME), link);
      const run = args => spawnSync(process.execPath, [path.join(ROOT, "skill-installation-inspector.js"), ...args], { cwd: temporary, env, encoding: "utf8", timeout: 30000 });
      const result = run(["--provider", provider, "--installed", link]); assert.equal(result.status, 0, result.stdout + result.stderr);
      const report = JSON.parse(result.stdout); assert.equal(report.status, "matches_current_source"); assert.equal(report.installed_code_executed, false);
      const invalid = run(["--provider", provider, "--installed", "relative"]); assert.equal(invalid.status, 1);
      assert.equal(JSON.parse(invalid.stdout).code, "SKILL_INSTALLATION_ARGUMENTS_INVALID");
      const missing = run(["--provider", provider, "--installed", path.join(temporary, "absent")]); assert.equal(missing.status, 1);
      assert.equal(JSON.parse(missing.stdout).status, "unavailable");
    });
  }
  console.log(JSON.stringify({ valid: true, fixtures: passed, native_model_calls: 0, installed_code_executed: false, user_settings_changed: false }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
