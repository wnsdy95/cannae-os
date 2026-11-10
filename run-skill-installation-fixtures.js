#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validatePayload } = require("./validator-cli-prototype/validate");

const ROOT = __dirname;
const NAME = "controls-doctrine-operator";
const PROVIDERS = ["codex", "claude"];
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "controls-installation-")));
const source = path.join(temporary, "doctrine source");
const unrelated = path.join(temporary, "other project");
const bin = path.join(temporary, "bin");
let passed = 0;

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function sourceSkill(provider) {
  return path.join(source, provider === "codex" ? "codex-skills" : ".claude/skills", NAME);
}

function environment(label) {
  const home = path.join(temporary, label);
  fs.mkdirSync(home, { recursive: true });
  write(path.join(home, "settings-sentinel"), "Keep user settings.\n");
  return { HOME: home, PATH: `${bin}:/usr/bin:/bin`, LANG: "C",
    TMPDIR: temporary, CLI_PROBE_LOG: path.join(home, "cli-probes") };
}

function destination(env, provider) {
  const prefix = provider.toUpperCase();
  const home = env[`${prefix}_HOME`] || path.join(env.HOME, `.${provider}`);
  return path.join(env[`${prefix}_SKILLS_DIR`] || path.join(home, "skills"), NAME);
}

function install(env, args = [], status = 0) {
  const result = spawnSync("/bin/bash", [path.join(source, "install-ai-cli-skills.sh"), ...args], {
    cwd: unrelated, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(result.status, status, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(path.join(env.HOME, "settings-sentinel"), "utf8"), "Keep user settings.\n");
  return result;
}

function route(env, provider, args = [], status = 0, cwd = unrelated) {
  const script = path.join(destination(env, provider), "scripts/route_controls_docs.js");
  const result = spawnSync(process.execPath, [script, ...args,
    "--actor=user", "--source=SUPPORT.md", "Draft a support SOP. Do not publish."], {
    cwd, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(result.status, status, result.stderr || result.stdout);
  if (status) {
    assert.equal(result.stdout, "", "failed root selection must not emit routing JSON");
    return result;
  }
  const output = JSON.parse(result.stdout);
  assert.equal(output.repo_root, fs.realpathSync(source));
  assert(output.recommended_documents.some(item => item.path === "SUPPORT.md"));
  assert(output.recommended_documents.some(item => item.path === "docs/document-authoring-workflow.md"));
  assert.equal(output.operating_mode.decision_authority, "human_user");
  return output;
}

function fixture(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

try {
  fs.mkdirSync(source);
  fs.mkdirSync(unrelated);
  fs.mkdirSync(bin);
  for (const file of ["install-ai-cli-skills.sh", "validate-controls-skill.js", "README.md", "SUPPORT.md",
    "docs", "schema-files", `codex-skills/${NAME}`, `.claude/skills/${NAME}`]) {
    fs.cpSync(path.join(ROOT, file), path.join(source, file), { recursive: true });
  }
  fs.symlinkSync(process.execPath, path.join(bin, "node"));
  for (const provider of PROVIDERS) {
    const command = path.join(bin, provider);
    write(command, `#!/bin/sh\nprintf '%s\\n' '${provider} fixture CLI'\nprintf '%s\\n' "$1" >> "$CLI_PROBE_LOG"\n`);
    fs.chmodSync(command, 0o755);
  }
  const init = spawnSync("git", ["init", "-q", source], {
    encoding: "utf8", env: { HOME: temporary, PATH: `${bin}:/usr/bin:/bin`, LANG: "C" }
  });
  assert.equal(init.status, 0, init.stderr);

  fixture("dry-run does not create installations or invoke client binaries", () => {
    const env = environment("dry run home");
    const result = install(env, ["--dry-run", "--copy"]);
    assert(result.stdout.includes("[dry-run]"));
    for (const provider of PROVIDERS) assert(!fs.existsSync(destination(env, provider)));
    assert(!fs.existsSync(env.CLI_PROBE_LOG), "dry-run invoked a client binary");
  });

  const env = environment("normal home");
  fixture("fresh default installation discovers both skill entrypoints", () => {
    install(env);
    for (const provider of PROVIDERS) {
      assert.equal(fs.realpathSync(destination(env, provider)), sourceSkill(provider));
      const entry = fs.readFileSync(path.join(destination(env, provider), "SKILL.md"), "utf8");
      assert(entry.startsWith("---\nname: controls-doctrine-operator\n"));
    }
  });
  fixture("linked routers find their corpus outside that repository", () => {
    const outputs = PROVIDERS.map(provider => route(env, provider));
    assert.deepEqual(outputs[0].recommended_documents, outputs[1].recommended_documents);
    assert.deepEqual(outputs[0].validation_commands, outputs[1].validation_commands);
  });
  fixture("matching link installation is idempotent", () => {
    const before = PROVIDERS.map(provider => fs.lstatSync(destination(env, provider)).ino);
    install(env);
    assert.deepEqual(PROVIDERS.map(provider => fs.lstatSync(destination(env, provider)).ino), before);
  });
  fixture("force-copy replaces links only and records the doctrine binding", () => {
    install(env, ["--copy", "--force"]);
    for (const provider of PROVIDERS) {
      assert(!fs.lstatSync(destination(env, provider)).isSymbolicLink());
      assert.equal(fs.readFileSync(path.join(destination(env, provider), ".cannae-os-root"), "utf8").trim(), source);
      assert.equal(fs.readFileSync(path.join(destination(env, provider), "SKILL.md"), "utf8"),
        fs.readFileSync(path.join(sourceSkill(provider), "SKILL.md"), "utf8"));
      route(env, provider);
    }
  });
  fixture("existing copies require force and preserve unrelated user files", () => {
    write(path.join(destination(env, "codex"), "local-note"), "Keep me.\n");
    install(env, ["--copy"], 1);
    assert.equal(fs.readFileSync(path.join(destination(env, "codex"), "local-note"), "utf8"), "Keep me.\n");
  });
  fixture("copied providers retain equivalent delegated receipts and bounded authority", () => {
    const receipts = PROVIDERS.map(provider => {
      const result = spawnSync(process.execPath, [
        path.join(destination(env, provider), "scripts/route_controls_docs.js"),
        "--receipt", "--scope=agent", "--mission=MIS-INSTALL", "--wave=W1", "--agent=writer",
        "--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution",
        "--capability-query=Draft a support SOP.", "--source=SUPPORT.md",
        "Draft a support SOP. Do not publish."
      ], { cwd: unrelated, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      assert.equal(result.status, 0, result.stderr);
      const receipt = JSON.parse(result.stdout);
      const validation = validatePayload(receipt, "routing-receipt");
      assert(validation.valid, JSON.stringify(validation.issues));
      assert.equal(receipt.agent_role, "S3");
      assert.equal(receipt.authority_scope, "scoped-execution");
      assert.equal(receipt.capability_routing.provisional_organization.authority_expansion_authorized, false);
      return receipt;
    });
    assert.deepEqual(receipts[0].recommended_documents, receipts[1].recommended_documents);
    assert.deepEqual(receipts[0].validation_commands, receipts[1].validation_commands);
    assert.deepEqual(receipts[0].capability_routing, receipts[1].capability_routing);
  });
  fixture("a single filename query is not consumed as a repository argument", () => {
    for (const provider of PROVIDERS) {
      const query = "docs/document-authoring-workflow.md";
      const result = spawnSync(process.execPath, [
        path.join(destination(env, provider), "scripts/route_controls_docs.js"), query
      ], { cwd: source, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).query, query);
    }
  });
  fixture("a later client conflict is detected before any installation", () => {
    const conflict = environment("conflict home");
    write(path.join(destination(conflict, "claude"), "local-note"), "Keep Claude.\n");
    install(conflict, [], 1);
    assert(!fs.existsSync(destination(conflict, "codex")), "Codex was partially installed before the Claude conflict");
    assert.equal(fs.readFileSync(path.join(destination(conflict, "claude"), "local-note"), "utf8"), "Keep Claude.\n");
  });
  fixture("failed copy staging leaves the existing installation intact", () => {
    const failingCopy = path.join(bin, "cp");
    write(failingCopy, "#!/bin/sh\nexit 47\n");
    fs.chmodSync(failingCopy, 0o755);
    try {
      assert(install(env, ["--force", "--copy"], 1).stderr.includes("destination was not replaced"));
      assert.equal(fs.readFileSync(path.join(destination(env, "codex"), "local-note"), "utf8"), "Keep me.\n");
      for (const provider of PROVIDERS) assert(fs.existsSync(path.join(destination(env, provider), "SKILL.md")));
    } finally {
      fs.unlinkSync(failingCopy);
    }
  });
  fixture("a file-valued later parent blocks installation before the first client changes", () => {
    const invalid = environment("invalid parent home");
    invalid.CLAUDE_SKILLS_DIR = path.join(invalid.HOME, "not-a-directory");
    write(invalid.CLAUDE_SKILLS_DIR, "Keep this file.\n");
    assert(install(invalid, ["--force"], 1).stderr.includes("not a directory"));
    assert(!fs.existsSync(destination(invalid, "codex")));
    assert.equal(fs.readFileSync(invalid.CLAUDE_SKILLS_DIR, "utf8"), "Keep this file.\n");
  });
  fixture("invalid source metadata or router blocks both replacements", () => {
    for (const [relative, content] of [["SKILL.md", "Missing required frontmatter.\n"],
      ["scripts/route_controls_docs.js", "invalid JavaScript syntax\n"]]) {
      const file = path.join(sourceSkill("claude"), relative);
      const original = fs.readFileSync(file);
      const before = PROVIDERS.map(provider => fs.lstatSync(destination(env, provider)).ino);
      try {
        write(file, content);
        install(env, ["--copy", "--force"], 1);
        assert.deepEqual(PROVIDERS.map(provider => fs.lstatSync(destination(env, provider)).ino), before);
        assert.equal(fs.readFileSync(path.join(destination(env, "codex"), "local-note"), "utf8"), "Keep me.\n");
      } finally {
        fs.writeFileSync(file, original);
      }
    }
  });
  fixture("custom homes and skill directories preserve paths containing spaces", () => {
    const custom = { ...environment("custom home"),
      CODEX_HOME: path.join(temporary, "custom codex"),
      CLAUDE_SKILLS_DIR: path.join(temporary, "custom claude skills") };
    install(custom, ["--copy"]);
    for (const provider of PROVIDERS) route(custom, provider);
    assert(!fs.existsSync(path.join(custom.HOME, ".codex")));
    assert(!fs.existsSync(path.join(custom.HOME, ".claude")));
  });
  fixture("copy snapshots stay unchanged until an explicit refresh", () => {
    for (const provider of PROVIDERS) {
      const original = fs.readFileSync(path.join(sourceSkill(provider), "SKILL.md"), "utf8");
      write(path.join(sourceSkill(provider), "SKILL.md"), original + "\nFixture-only source update.\n");
      assert.equal(fs.readFileSync(path.join(destination(env, provider), "SKILL.md"), "utf8"), original);
    }
    install(env, ["--copy", "--force"]);
    for (const provider of PROVIDERS) {
      assert.equal(fs.readFileSync(path.join(destination(env, provider), "SKILL.md"), "utf8"),
        fs.readFileSync(path.join(sourceSkill(provider), "SKILL.md"), "utf8"));
      route(env, provider);
    }
  });
  fixture("force cannot replace source trees through direct or parent-alias paths", () => {
    const alias = path.join(temporary, "source alias");
    fs.symlinkSync(source, alias);
    for (const parent of [path.join(source, "codex-skills"), path.join(alias, "codex-skills")]) {
      const unsafe = { ...environment(`unsafe ${passed} ${path.basename(parent)}`), CODEX_SKILLS_DIR: parent };
      const result = install(unsafe, ["--force", "--copy"], 1);
      assert(result.stderr.includes("overlap"), result.stderr);
      assert(fs.existsSync(path.join(sourceSkill("codex"), "SKILL.md")));
      assert(fs.existsSync(path.join(sourceSkill("claude"), "SKILL.md")));
    }
  });
  fixture("client destinations cannot overlap", () => {
    const same = path.join(temporary, "shared skills");
    const overlap = { ...environment("overlap home"), CODEX_SKILLS_DIR: same, CLAUDE_SKILLS_DIR: same };
    assert(install(overlap, ["--force"], 1).stderr.includes("overlap"));
    assert(!fs.existsSync(same));
  });
  fixture("invalid overrides and stale copy markers cannot silently select another corpus", () => {
    for (const provider of PROVIDERS) {
      route({ ...env, CANNAE_OS_HOME: path.join(temporary, "absent") }, provider, [], 2, source);
      route(env, provider, ["--doctrine-root", path.join(temporary, "absent")], 2, source);
      const marker = path.join(destination(env, provider), ".cannae-os-root");
      write(marker, `${path.join(temporary, "moved source")}\n`);
      route(env, provider, [], 2, source);
      route({ ...env, CANNAE_OS_HOME: source }, provider);
      route({ ...env, CANNAE_OS_HOME: path.join(temporary, "absent") }, provider, ["--doctrine-root", source]);
      write(marker, `${source}\n`);
    }
  });
  fixture("a foreign working corpus cannot override a bound installation", () => {
    for (const file of ["README.md", "docs/source-map.md", "schema-files/README.md"]) {
      write(path.join(unrelated, file), "# Foreign corpus\n");
    }
    for (const provider of PROVIDERS) route(env, provider);
  });
  fixture("copy markers cannot be relative paths or symlinked content", () => {
    for (const provider of PROVIDERS) {
      const marker = path.join(destination(env, provider), ".cannae-os-root");
      write(marker, "../doctrine source\n");
      route(env, provider, [], 2);
      fs.unlinkSync(marker);
      fs.symlinkSync(path.join(env.HOME, "settings-sentinel"), marker);
      route(env, provider, [], 2);
      fs.unlinkSync(marker);
      write(marker, `${source}\n`);
      assert.equal(fs.readFileSync(path.join(env.HOME, "settings-sentinel"), "utf8"), "Keep user settings.\n");
    }
  });
  fixture("an invalid positional root does not fall back to the current corpus", () => {
    for (const provider of PROVIDERS) {
      for (const absent of [path.join(temporary, "absent"), path.join(source, "absent")]) {
        const result = spawnSync(process.execPath, [
          path.join(destination(env, provider), "scripts/route_controls_docs.js"),
          "--actor=user", "Draft a support SOP.", absent
        ], { cwd: source, env, encoding: "utf8" });
        assert.equal(result.status, 2);
        assert.equal(result.stdout, "");
      }
    }
  });
  fixture("a detached copied skill without a binding fails clearly", () => {
    for (const provider of PROVIDERS) {
      const marker = path.join(destination(env, provider), ".cannae-os-root");
      fs.unlinkSync(marker);
      const empty = path.join(temporary, "empty working directory");
      fs.mkdirSync(empty, { recursive: true });
      assert(route(env, provider, [], 2, empty).stderr.includes("doctrine"));
    }
  });
  console.log(JSON.stringify({ valid: true, fixtures: passed, providers: PROVIDERS,
    native_client_execution: false, actual_home_modified: false }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
