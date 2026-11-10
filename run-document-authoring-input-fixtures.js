#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = __dirname;
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-document-input-")));
const projects = [path.join(temporary, "project A"), path.join(temporary, "project B")];
const env = { ...process.env };
delete env.CANNAE_OS_HOME;
for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
let passed = 0;

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function git(args) {
  const result = spawnSync("git", args, { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function fixture(name, check) {
  check(); passed++; console.log(`PASS ${name}`);
}

function invoke(router, args, options = {}) {
  const result = spawnSync(process.execPath, [...(options.nodeArgs || []), router, ...args], {
    cwd: options.cwd || projects[1], env: { ...env, ...options.env },
    encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(result.status, options.status || 0, result.stderr || result.stdout);
  if (options.status) {
    assert.equal(result.stdout, "", "A rejected input set cannot publish a partial route or receipt.");
    if (options.reason) assert(result.stderr.includes(options.reason), result.stderr);
    return result;
  }
  const output = JSON.parse(result.stdout);
  assert(!result.stdout.includes("PROJECT_ONLY_SENTINEL"), "Source contents appeared in routing output.");
  return output;
}

function inputs(root = projects[0], file = "SUPPORT.md") {
  return [`--input-repository=${root}`, `--input-source=${file}`];
}

try {
  for (const [index, project] of projects.entries()) {
    fs.mkdirSync(project);
    git(["init", "-q", project]);
    write(path.join(project, "SUPPORT.md"), `PROJECT_ONLY_SENTINEL_${index}\n`);
    write(path.join(project, "accounts.csv"), "company,segment\nPROJECT_ONLY_SENTINEL,business\n");
    write(path.join(project, "policies", "Access rules.md"), "PROJECT_ONLY_SENTINEL policy\n");
    write(path.join(project, "private", "secret.md"), "PROJECT_ONLY_SENTINEL private\n");
    write(path.join(project, ".gitignore"), "private/\n");
  }
  git(["-C", projects[0], "add", "-f", "private/secret.md"]);
  fs.symlinkSync(path.join(projects[0], "SUPPORT.md"), path.join(projects[0], "alias.md"));
  fs.symlinkSync(path.join(projects[0], "policies"), path.join(projects[0], "alias-dir"));
  write(path.join(projects[0], ".cannae", "state.md"), "PROJECT_ONLY_SENTINEL state\n");
  const noRead = path.join(temporary, "deny-source-content.cjs");
  write(noRead, `const fs=require("node:fs"),path=require("node:path"); const read=fs.readFileSync;
const roots=${JSON.stringify(projects)};
fs.readFileSync=function(file,...args){if(typeof file==="string" && roots.some(root=>path.resolve(file).startsWith(root+path.sep)))throw Error("Unexpected project content read");return read.call(this,file,...args);};\n`);

  for (const tree of ["codex-skills", ".claude/skills"]) {
    const skill = path.join(ROOT, tree, "controls-doctrine-operator");
    const router = path.join(skill, "scripts", "route_controls_docs.js");
    const prefix = tree === "codex-skills" ? "Codex" : "Claude";
    const modes = [["--actor=user"], ["--actor=ai", "--role=S3", "--department=operations", "--authority=source-verification"]];

    fixture(`${prefix}: project references remain distinct from doctrine in human and delegated modes`, () => {
      for (const mode of modes) {
        const result = invoke(router, [...mode, ...inputs(), "Draft a support SOP from SUPPORT.md."], { nodeArgs: ["--require", noRead] });
        assert.equal(result.repo_root, ROOT);
        assert.equal(result.task_inputs.repository_root, projects[0]);
        assert.deepEqual(result.task_inputs.sources, [{ path: "SUPPORT.md", exists: true }]);
        assert.equal(result.task_inputs.delivery_mode, "reference_only");
        assert.equal(result.task_inputs.content_loaded, false);
        assert.equal(result.task_inputs.authorization_verified, false);
        assert.deepEqual(result.task_references.input_resolved, [{ reference: "SUPPORT.md", path: "SUPPORT.md" }]);
        assert(!result.recommended_documents.some(item => item.path === "SUPPORT.md"));
        assert(result.recommended_documents.some(item => item.path === "docs/document-authoring-workflow.md"));
        assert.equal(result.operating_mode.decision_authority, mode[0] === "--actor=user" ? "human_user" : "bounded_ai_delegate");
      }
    });
    fixture(`${prefix}: two same-named project inputs retain the explicit physical repository`, () => {
      for (const root of projects) {
        const result = invoke(router, ["--actor=user", ...inputs(root), "Draft an SOP from SUPPORT.md."], { cwd: ROOT });
        assert.equal(result.task_inputs.repository_root, root);
      }
    });
    fixture(`${prefix}: explicit doctrine sources and project sources can coexist without substitution`, () => {
      const result = invoke(router, ["--actor=user", "--source=SUPPORT.md", ...inputs(), "Compare the two selected policies for an SOP."]);
      assert(result.recommended_documents.some(item => item.path === "SUPPORT.md"));
      assert.equal(result.repo_root, ROOT);
      assert.equal(result.task_inputs.repository_root, projects[0]);
      assert.deepEqual(result.task_inputs.sources.map(item => item.path), ["SUPPORT.md"]);
    });
    fixture(`${prefix}: project mode never guesses undeclared query files from the doctrine corpus`, () => {
      const result = invoke(router, ["--actor=user", ...inputs(), "Draft an SOP from SUPPORT.md and SECURITY.md."]);
      assert(!result.recommended_documents.some(item => item.path === "SECURITY.md"));
      assert(result.task_references.unresolved.some(item => item.reference === "SECURITY.md" && item.reason === "input_source_not_declared"));
    });
    fixture(`${prefix}: exact space-containing and data file paths need no corpus extension or basename lookup`, () => {
      const result = invoke(router, ["--actor=user", ...inputs(projects[0], "policies/Access rules.md"),
        "--input-source=accounts.csv", "--input-source=accounts.csv", "Draft an SOP from `policies/Access rules.md` and the selected data."]);
      assert.deepEqual(result.task_inputs.sources.map(item => item.path), ["policies/Access rules.md", "accounts.csv"]);
      assert(result.task_references.input_resolved.some(item => item.path === "policies/Access rules.md"));
      invoke(router, ["--actor=user", ...inputs(projects[0], "Access rules.md"), "Draft an SOP."], { status: 2, reason: "INPUT_SOURCE_UNRESOLVED" });
    });
    fixture(`${prefix}: absent files do not fall back to same-named doctrine files`, () => {
      invoke(router, ["--actor=user", ...inputs(projects[0], "SECURITY.md"), "Draft an SOP."], { status: 2, reason: "INPUT_SOURCE_UNRESOLVED" });
    });
    fixture(`${prefix}: ignored tracked files, local state, links, directories and escaped paths fail`, () => {
      for (const file of ["private/secret.md", ".cannae/state.md", "alias.md", "alias-dir/Access rules.md",
        "policies", "../SUPPORT.md", "./SUPPORT.md", "/etc/hosts", "policies\\Access rules.md", "https://example.test/source.md"]) {
        invoke(router, ["--actor=user", ...inputs(projects[0], file), "Draft an SOP."], { status: 2, reason: "INPUT_SOURCE_" });
      }
    });
    fixture(`${prefix}: project root must be explicit distinct and exactly a Git worktree root`, () => {
      for (const root of [ROOT, temporary, path.join(projects[0], "policies"), path.join(temporary, "missing")]) {
        invoke(router, ["--actor=user", ...inputs(root), "Draft an SOP."], { status: 2, reason: "INPUT_REPOSITORY_INVALID" });
      }
      const result = invoke(router, ["--actor=user", ...inputs(), "Draft an SOP."], { env: { GIT_DIR: path.join(ROOT, ".git"), GIT_WORK_TREE: ROOT } });
      assert.equal(result.task_inputs.repository_root, projects[0]);
    });
    fixture(`${prefix}: incomplete duplicate and misspelled options never turn into successful query text`, () => {
      for (const args of [["--input-source=SUPPORT.md"], [`--input-repository=${projects[0]}`],
        [...inputs(), `--input-repository=${projects[1]}`], ["--input-soruce=SUPPORT.md"], ["-s"],
        ["--source"], ["--input-source="], ["--input-repository", "--input-source=SUPPORT.md"]]) {
        invoke(router, ["--actor=user", ...args, "Draft an SOP."], { status: 2 });
      }
      const literal = invoke(router, ["--actor=user", "--", "--source examples for a document authoring guide"]);
      assert.equal(literal.query, "--source examples for a document authoring guide");
      const unknown = invoke(router, ["--api-key=fixture-only-secret-value", "Draft an SOP."], { status: 2 });
      assert(!unknown.stderr.includes("fixture-only-secret-value"));
    });
    fixture(`${prefix}: receipt and artifact modes reject unsupported project inputs before publication`, () => {
      for (const flags of [["--receipt"], ["--coverage"], ["--overwrite-artifact"], [`--target-repository=${projects[0]}`],
        ["--artifact-root=unused"], ["--write-artifact", `--target-repository=${projects[0]}`]]) {
        invoke(router, [...modes[1], ...inputs(), ...flags, "Draft an SOP."], { status: 2, reason: "INPUT_REFERENCE_MODE_UNSUPPORTED" });
      }
      assert(!fs.existsSync(path.join(projects[0], ".cannae", "artifacts")));
    });
    fixture(`${prefix}: input references cannot turn a mission capability gap into authority`, () => {
      const result = invoke(router, [...modes[1], ...inputs(projects[0], "accounts.csv"),
        "--capability-query=Develop ICP sales targeting from the customer data.", "Draft an SOP for the assigned analysis."]);
      assert.equal(result.capability_routing.status, "gap_detected");
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
      assert.equal(result.capability_routing.provisional_organization.standing_department_activation_authorized, false);
    });
    fixture(`${prefix}: copied and linked bundles resolve inputs from another working directory`, () => {
      const copy = path.join(temporary, prefix + " copy");
      const link = path.join(temporary, prefix + " link");
      fs.cpSync(skill, copy, { recursive: true });
      write(path.join(copy, ".cannae-os-root"), ROOT + "\n");
      fs.symlinkSync(skill, link);
      for (const location of [copy, link]) {
        const result = invoke(path.join(location, "scripts", "route_controls_docs.js"), ["--actor=user", ...inputs(), "Draft an SOP from SUPPORT.md."]);
        assert.equal(result.repo_root, ROOT);
        assert.equal(result.task_inputs.repository_root, projects[0]);
      }
    });
  }
  for (const [index, project] of projects.entries()) {
    assert.equal(fs.readFileSync(path.join(project, "SUPPORT.md"), "utf8"), `PROJECT_ONLY_SENTINEL_${index}\n`);
  }
  console.log(JSON.stringify({ valid: true, fixtures: passed, native_client_execution: false, content_delivery_tested: false }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
