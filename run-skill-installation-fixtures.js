#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { analyzeRoutingPreflight } = require("./agent-routing-preflight-runner");

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

function documentStarter(env) {
  const starter = "Use $controls-doctrine-operator to draft or revise this document from the supplied sources, preserving my intent, authority boundaries, unknowns, and handoff context.";
  const relative = "agents/openai.yaml";
  const metadata = fs.readFileSync(path.join(destination(env, "codex"), relative), "utf8");
  assert.equal(metadata, fs.readFileSync(path.join(sourceSkill("codex"), relative), "utf8"));
  assert(metadata.includes(`  default_prompt: ${JSON.stringify(starter)}\n`));
  assert(metadata.includes('  short_description: "Write and route source-grounded documents"\n'));
  const probes = fs.readFileSync(env.CLI_PROBE_LOG);
  const results = PROVIDERS.map(provider => {
    const result = spawnSync(process.execPath, [path.join(destination(env, provider), "scripts/route_controls_docs.js"),
      "--actor=user", "--", starter], { cwd: unrelated, env, encoding: "utf8", timeout: 20000 });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.query, starter);
    assert.equal(output.operating_mode.actor, "user");
    assert(output.matched_routes.some(route => route.id === "document-authoring"));
    assert(output.recommended_documents.some(doc => doc.path === "docs/document-authoring-workflow.md"));
    return output;
  });
  const normalized = results.map((output, index) => {
    const prefix = PROVIDERS[index] === "codex" ? "codex-skills" : ".claude/skills";
    const coverage = `node ${prefix}/${NAME}/scripts/route_controls_docs.js --coverage .`;
    assert(output.validation_commands.includes(coverage));
    for (const target of ["codex-skills", ".claude/skills"]) {
      assert(output.validation_commands.includes(`node validate-controls-skill.js ${target}/${NAME}`));
    }
    return { ...output, validation_commands: output.validation_commands.map(command => command === coverage ? "provider coverage" : command).sort() };
  });
  assert.deepEqual(normalized[0], normalized[1]);
  assert.deepEqual(fs.readFileSync(env.CLI_PROBE_LOG), probes, "A starter routing check must not invoke a client or mission");
  assert(!fs.existsSync(path.join(unrelated, ".cannae")), "Direct starter routing must not create mission artifacts");
}

function documentedCommands(env, provider, { loadedDirectory, status = 0, query } = {}) {
  const entry = fs.readFileSync(path.join(destination(env, provider), "SKILL.md"), "utf8");
  const section = entry.split("## Start With The Task\n")[1]?.split("\n## ")[0];
  assert(section, "Missing entrypoint startup section");
  const blocks = [...section.matchAll(/^```bash\n([\s\S]*?)\n```/gm)].map(match => match[1]);
  assert.equal(blocks.length, 2, "Test both human and delegated startup examples literally");
  const sentinel = fs.readFileSync(path.join(unrelated, "README.md"));
  const probes = fs.readFileSync(env.CLI_PROBE_LOG);
  for (const [index, command] of blocks.entries()) {
    const invocation = query === undefined ? command : command.replace(/"(?:Draft an SOP and handoff document from the supplied policy\.|Draft a source-grounded SOP without publication\.)"/, '"$TASK_QUERY"');
    if (query !== undefined) assert.notEqual(invocation, command, "Use the actual documented command with variable task text");
    const result = spawnSync("/bin/bash", ["-c", invocation], {
      cwd: unrelated, env: { ...env, TASK_QUERY: query, ...(loadedDirectory ? { CONTROLS_SKILL_DIR: loadedDirectory } : {}) },
      encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024
    });
    assert.equal(result.status, status, result.stderr || result.stdout);
    if (status) { assert.equal(result.stdout, ""); continue; }
    const output = JSON.parse(result.stdout);
    assert.equal(output.repo_root, fs.realpathSync(source));
    assert.equal(output.operating_mode.actor, index ? "ai" : "user");
    if (index) {
      assert.equal(output.operating_mode.role, "S3");
      assert.equal(output.operating_mode.authority, "scoped-execution");
      assert.equal(output.capability_routing.provisional_organization.authority_expansion_authorized, false);
    } else assert.equal(output.operating_mode.decision_authority, "human_user");
    if (query === undefined) assert(output.recommended_documents.some(item => item.path === "docs/document-authoring-workflow.md"));
    else assert.equal(output.query, query);
    const readme = output.recommended_documents.find(item => item.path === "README.md");
    assert(readme);
    assert.deepEqual(fs.readFileSync(path.join(output.repo_root, readme.path)), fs.readFileSync(path.join(source, "README.md")));
    assert.notDeepEqual(fs.readFileSync(path.join(output.repo_root, readme.path)), sentinel,
      "A target-project file must not substitute for the routed corpus file");
  }
  assert.deepEqual(fs.readFileSync(path.join(unrelated, "README.md")), sentinel);
  assert.deepEqual(fs.readFileSync(env.CLI_PROBE_LOG), probes, "Routing examples must not invoke native clients");
}

function declaredObjectives(env) {
  const objectives = ["Research ICP and sales targeting using the canonical track view", "Maintain the project glossary"];
  const query = `${objectives.join("; also ")}. Do not publish.`;
  const probes = fs.readFileSync(env.CLI_PROBE_LOG);
  const outputs = PROVIDERS.map(provider => {
    const run = spawnSync(process.execPath, [path.join(destination(env, provider), "scripts/route_controls_docs.js"),
      "--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only",
      ...objectives.map(objective => `--capability-query=${objective}`), query],
    { cwd: unrelated, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.repo_root, fs.realpathSync(source));
    assert.equal(result.query, query);
    assert.deepEqual(result.capability_queries, objectives);
    assert.deepEqual(result.capability_assessments.map(item => item.status), ["gap_detected", "covered"]);
    assert.equal(result.capability_routing.status, "gap_detected");
    assert.equal(result.operating_mode.authority, "read-only");
    assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
    assert.equal(result.capability_routing.provisional_organization.standing_department_activation_authorized, false);
    return result;
  });
  assert.deepEqual(outputs[0].capability_routing, outputs[1].capability_routing);
  assert.deepEqual(outputs[0].recommended_documents, outputs[1].recommended_documents);
  assert.deepEqual(outputs[0].validation_commands, outputs[1].validation_commands);
  assert.deepEqual(fs.readFileSync(env.CLI_PROBE_LOG), probes);
}

function continuingTask(env) {
  const probes = fs.readFileSync(env.CLI_PROBE_LOG), outputs = [];
  for (const provider of PROVIDERS) {
    const folder = destination(env, provider);
    const reference = fs.readFileSync(path.join(folder, "references/document-routing.md"), "utf8");
    const section = reference.split("### Continuing Direct Tasks\n")[1]?.split("\n### ")[0];
    assert.equal(reference, fs.readFileSync(path.join(sourceSkill(provider), "references/document-routing.md"), "utf8"));
    assert(section.includes("hold identity-dependent continuation"));
    assert(section.includes("verify whether it binds the pair"));
    assert(section.includes("instead of assuming support or failure from its input shape alone"));
    assert(section.includes("actual router argv and unprojected return locally"));
    assert(section.includes("attributes the root check to the adapter"));
    assert(section.includes("client may disclose its working"));
    assert(section.includes("do not relocate refused inputs or relax disclosure controls"));
    assert(section.includes("compare two bindings separately"));
    assert(section.includes("sender's route token, successful reads or reading profile"));
    const entrypoint = fs.readFileSync(path.join(folder, "SKILL.md"), "utf8");
    assert(entrypoint.includes("check who supplies and verifies each"));
    assert(entrypoint.includes("Do not claim you inspected a withheld root"));
    const command = section?.match(/^```bash\n([\s\S]*?)\n```/m)?.[1];
    assert(command && command.includes('--task-root="/absolute/target-project"'));
    for (const next of [false, true]) {
      let invocation = command.replace("/absolute/target-project", "$TARGET_PROJECT");
      if (next) invocation = invocation.replace("Compare the next museum inventory and revise the SOP.", "Review the museum figures and draft the next SOP.")
        .replace("--role=S6 --department=knowledge", "--role=S2 --department=research");
      const run = spawnSync("/bin/bash", ["-c", invocation], { cwd: next ? temporary : unrelated,
        env: { ...env, CONTROLS_SKILL_DIR: folder, TARGET_PROJECT: unrelated }, encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
      assert.equal(run.status, 0, run.stderr); const result = JSON.parse(run.stdout);
      assert.equal(result.repo_root, source); assert.equal(result.task_context.root, unrelated);
      assert.equal(result.task_context.id, "TASK-61"); assert.equal(result.task_context.authorization_verified, false);
      assert.equal(result.operating_mode.role, next ? "S2" : "S6");
      assert.equal(result.operating_mode.department, next ? "research" : "knowledge");
      assert.equal(result.operating_mode.authority, "read-only");
      assert.deepEqual(result.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
      assert.equal(result.capability_routing.provisional_organization.standing_department_activation_authorized, false);
      outputs.push(result.capability_routing.provisional_organization.organization_id);
    }
  }
  assert.equal(new Set(outputs).size, 1, "Both installed providers and changed phase queries must retain one task cell");
  assert.deepEqual(fs.readFileSync(env.CLI_PROBE_LOG), probes);
  assert(!fs.existsSync(path.join(unrelated, ".cannae")), "Task identity must not open a mission or persist artifacts");
}

function documentedReceipts(env) {
  const query = "Draft a support SOP.";
  const probes = fs.readFileSync(env.CLI_PROBE_LOG);
  for (const provider of PROVIDERS) {
    const folder = destination(env, provider);
    const reference = fs.readFileSync(path.join(folder, "references/document-routing.md"), "utf8");
    const lines = reference.split("\n").filter(line => line.startsWith('node "${CONTROLS_SKILL_DIR}/scripts/route_controls_docs.js" --receipt'));
    assert.equal(lines.length, 2, "exercise both documented receipt commands");
    const receipts = lines.map(line => {
      const command = line.replace("<actual mission objective>", query)
        .replace("<wave mission>", query).replace("<agent task>", `${query} Do not publish.`);
      const run = spawnSync("/bin/bash", ["-c", command], {
        cwd: unrelated, env: { ...env, CONTROLS_SKILL_DIR: folder },
        encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024
      });
      assert.equal(run.status, 0, run.stderr || run.stdout);
      const receipt = JSON.parse(run.stdout);
      assert(validatePayload(receipt, "routing-receipt").valid);
      assert.equal(receipt.capability_query, query);
      assert(receipt.router_command.includes(" -- "));
      return receipt;
    });
    const projection = analyzeRoutingPreflight({ type: "AgentRoutingPreflightBundle", mission_id: "MIS-example",
      wave_id: "W2", expected_agents: ["plans-agent"], receipts });
    assert.equal(projection.status, "ready", projection.preflight_blocks.join("\n"));
  }
  assert.deepEqual(fs.readFileSync(env.CLI_PROBE_LOG), probes);
}

function receiptDependencyFailures(env) {
  const target = fs.mkdtempSync(path.join(temporary, "receipt-target-"));
  const init = spawnSync("git", ["init", "-q", target], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const probes = fs.readFileSync(env.CLI_PROBE_LOG);
  for (const dependency of ["validator-cli-prototype", "node_modules", "schema-files/routing-receipt.schema.json"]) {
    const original = path.join(source, dependency);
    const backup = path.join(target, "withheld-dependency");
    fs.renameSync(original, backup);
    try {
      // A parse failure must close the producer just like an unavailable validator.
      if (dependency.endsWith(".json")) write(original, "{");
      for (const provider of PROVIDERS) {
        route(env, provider);
        const artifactRoot = path.join(target, "artifacts");
        const run = spawnSync(process.execPath, [path.join(destination(env, provider), "scripts/route_controls_docs.js"),
          "--receipt", "--scope=agent", "--mission=MIS-DEPENDENCY", "--wave=W1", "--agent=writer",
          "--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution",
          "--capability-query=Draft a support SOP.", "--write-artifact", `--target-repository=${target}`,
          `--artifact-root=${artifactRoot}`, "--", "Draft a support SOP. Do not publish."],
        { cwd: unrelated, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
        assert.equal(run.status, 2, run.stderr);
        assert.equal(run.stdout, "");
        assert(run.stderr.includes("ROUTING_RECEIPT_VALIDATION_FAILED"), run.stderr);
        assert(!fs.existsSync(artifactRoot), "missing validator dependencies must not initialize a store");
      }
    } finally {
      if (dependency.endsWith(".json")) fs.rmSync(original);
      fs.renameSync(backup, original);
    }
  }
  assert.deepEqual(fs.readFileSync(env.CLI_PROBE_LOG), probes);
}

function comparisonGap(env) {
  const query = "Compare museum attendance by city";
  const probes = fs.readFileSync(env.CLI_PROBE_LOG);
  const results = PROVIDERS.map(provider => {
    const run = spawnSync(process.execPath, [path.join(destination(env, provider), "scripts/route_controls_docs.js"),
      "--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only", "--", query],
    { cwd: unrelated, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.repo_root, fs.realpathSync(source));
    assert.equal(result.query, query);
    assert.equal(result.capability_routing.status, "gap_detected");
    assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
    assert.equal(result.operating_mode.authority, "read-only");
    assert(!result.recommended_documents.some(x => x.path === "docs/transparency-operations.md"));
    for (const document of ["docs/knowledge-management-sop.md", "docs/context-releasability-policy.md",
      "docs/opsec-classification-model.md"]) {
      assert(result.operating_mode.mode_documents.includes(document));
      assert(result.recommended_documents.some(x => x.path === document));
    }
    for (const document of ["docs/reference-architecture.md", "docs/event-sourcing-model.md", "docs/command-post-dashboard.md"]) {
      assert(!result.recommended_documents.some(x => x.path === document));
    }
    assert(result.recommended_documents.some(x => x.path === "docs/force-structure-change-policy.md"));
    assert(result.validation_commands.includes("node run-self-improvement-fixtures.js"));
    assert(result.validation_commands.includes("node run-force-structure-change-fixtures.js"));
    return result;
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(fs.readFileSync(env.CLI_PROBE_LOG), probes);
}

function sourceReadingScope(env) {
  const probes = fs.readFileSync(env.CLI_PROBE_LOG);
  const specialists = ["docs/korean-military-sources.md", "docs/korean-org-culture.md", "docs/multinational-doctrine-consistency-review.md"];
  for (const [query, extra, expected] of [
    ["Draft a support SOP from source policy in Korean. Do not publish.", [], []],
    ["Write a research note about reporting in Korean military organizations.", [], specialists],
    ["Draft a support SOP from source policy.", ["--capability-query=Research Korean military doctrine"], specialists],
    ["Draft a support SOP from source policy.", ["--source=docs/korean-org-culture.md"], specialists]
  ]) {
    const results = PROVIDERS.map(provider => {
      const run = spawnSync(process.execPath, [path.join(destination(env, provider), "scripts/route_controls_docs.js"),
        "--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only", ...extra, "--", query],
      { cwd: unrelated, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      assert.equal(run.status, 0, run.stderr);
      const result = JSON.parse(run.stdout);
      assert.equal(result.repo_root, fs.realpathSync(source));
      assert.equal(result.query, query);
      assert.equal(result.operating_mode.authority, "read-only");
      for (const file of specialists) assert.equal(result.recommended_documents.some(row => row.path === file), expected.includes(file), query + ": " + file);
      for (const file of ["docs/source-map.md", "docs/source-reliability-rubric.md", ...result.operating_mode.mode_documents]) {
        assert(result.recommended_documents.some(row => row.path === file));
      }
      assert(result.validation_commands.includes("node run-doctrine-consistency-fixtures.js"));
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
      return result;
    });
    assert.deepEqual(results[0], results[1]);
  }
  assert.deepEqual(fs.readFileSync(env.CLI_PROBE_LOG), probes);
}

function skillOperationsReading(env) {
  const probes = fs.readFileSync(env.CLI_PROBE_LOG);
  const query = "Use the Codex and Claude skills to draft a support SOP. Do not publish.";
  for (const [extra, maintenance] of [[[], false], [["--capability-query=Review skill installation"], true],
    [["--source=docs/completion-backlog.md"], true]]) {
    const results = PROVIDERS.map(provider => {
      const installed = destination(env, provider);
      const entry = fs.readFileSync(path.join(installed, "SKILL.md"), "utf8");
      assert(entry.includes("Distinguish using a skill from maintaining it"));
      const reference = fs.readFileSync(path.join(installed, "references/document-routing.md"), "utf8");
      assert(reference.includes("### Using A Skill Versus Maintaining It"));
      assert(reference.includes("Guarded receipts retain the full selected skill-operations reading"));
      const run = spawnSync(process.execPath, [path.join(installed, "scripts/route_controls_docs.js"),
        "--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only", ...extra, "--", query],
      { cwd: unrelated, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      assert.equal(run.status, 0, run.stderr);
      const result = JSON.parse(run.stdout);
      assert.equal(result.repo_root, fs.realpathSync(source)); assert.equal(result.query, query);
      assert.equal(result.operating_mode.authority, "read-only");
      for (const file of ["docs/completion-backlog.md", "install-ai-cli-skills.sh", "docs/skill-operational-mission-lifecycle.md"]) {
        assert.equal(result.recommended_documents.some(row => row.path === file), maintenance, file);
      }
      for (const file of ["docs/skill-first-product-scope.md", "docs/document-authoring-workflow.md",
        "codex-skills/controls-doctrine-operator/references/document-routing.md", ...result.operating_mode.mode_documents]) {
        assert(result.recommended_documents.some(row => row.path === file));
      }
      for (const command of ["node run-skill-installation-fixtures.js", "node run-agent-routing-preflight-fixtures.js"]) {
        assert(result.validation_commands.includes(command));
      }
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
      return result;
    });
    assert.deepEqual(results[0].recommended_documents, results[1].recommended_documents);
    for (const key of ["query", "capability_query", "operating_mode", "matched_routes", "capability_routing"]) {
      assert.deepEqual(results[0][key], results[1][key]);
    }
    const commands = result => result.validation_commands.map(command => command.replace(
      /(?:codex-skills|\.claude\/skills)\/controls-doctrine-operator\/scripts\/route_controls_docs/, "PROVIDER/router")).sort();
    assert.deepEqual(commands(results[0]), commands(results[1]));
  }
  assert.deepEqual(fs.readFileSync(env.CLI_PROBE_LOG), probes);
}

function taskReadingScope(env) {
  const probes = fs.readFileSync(env.CLI_PROBE_LOG);
  for (const [query, technical, gap] of [
    ["Review the S6 draft (SRC-DRAFT) against the original request and sources. No dashboard or server development.", false, false],
    ["Draft a handoff document. Do not build a dashboard.", false, false],
    ["Draft a handoff document. No publication, external operations, dashboard or server development.", false, false],
    ["Draft a handoff document. Dashboard and service development remain deferred.", false, false],
    ["Draft a handoff document. No dashboard implementation, database development, or server work.", false, false],
    ["Draft a handoff document. No dashboard or server development. Inspect the server design.", true, false],
    ["Analyze museum attendance. No publication, external operations, dashboard or server development.", false, true],
    ["Draft a handoff document. Do not skip dashboard verification.", true, false],
    ["Revise outgoing document handoffs. Clarify document readiness; no publication, dashboard or service work.", false, false],
    ["Revise outgoing document handoffs. Review unit readiness; no dashboard or service work.", true, false],
    ["Revise outgoing document handoffs; no dashboard or service work. Review its design.", true, false],
    ["Analyze museum attendance; no publication, dashboard or service work.", false, true],
    ["Analyze museum attendance by city. Do not build a dashboard.", false, true]
  ]) {
    const results = PROVIDERS.map(provider => {
      const run = spawnSync(process.execPath, [path.join(destination(env, provider), "scripts/route_controls_docs.js"),
        "--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only", "--", query],
      { cwd: unrelated, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      assert.equal(run.status, 0, run.stderr);
      const result = JSON.parse(run.stdout);
      assert.equal(result.repo_root, fs.realpathSync(source));
      assert.equal(result.query, query);
      assert.equal(result.operating_mode.authority, "read-only");
      assert.equal(result.capability_routing.status, gap ? "gap_detected" : "covered");
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
      for (const file of ["docs/reference-architecture.md", "docs/event-sourcing-model.md", "docs/command-post-dashboard.md"]) {
        assert.equal(result.recommended_documents.some(row => row.path === file), technical, file);
      }
      for (const command of ["node run-maintenance-dashboard-fixtures.js", "node event-replay-prototype/run-event-fixtures.js"]) {
        assert(result.validation_commands.includes(command));
      }
      return result;
    });
    assert.deepEqual(results[0], results[1]);
  }
  assert.deepEqual(fs.readFileSync(env.CLI_PROBE_LOG), probes);
}

try {
  fs.mkdirSync(source);
  fs.mkdirSync(unrelated);
  write(path.join(unrelated, "README.md"), "# Target project, not doctrine\nKeep this source unchanged.\n");
  fs.mkdirSync(bin);
  for (const file of ["install-ai-cli-skills.sh", "validate-controls-skill.js", "README.md", "SUPPORT.md",
    "docs", "schema-files", "validator-cli-prototype", `codex-skills/${NAME}`, `.claude/skills/${NAME}`]) {
    fs.cpSync(path.join(ROOT, file), path.join(source, file), { recursive: true });
  }
  // Receipt validation uses the bound checkout's real runtime, not a validator stub.
  for (const file of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (file.isFile() && file.name.endsWith(".js")) fs.copyFileSync(path.join(ROOT, file.name), path.join(source, file.name));
  }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(source, "node_modules"));
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
  fixture("linked Codex starter stays document-first and routes equivalently in both providers", () => documentStarter(env));
  fixture("literal linked entrypoint examples work in fresh target-project shells", () => {
    for (const provider of PROVIDERS) documentedCommands(env, provider);
  });
  fixture("linked providers retain every declared objective from another project", () => declaredObjectives(env));
  fixture("linked providers keep one direct-task cell across phases using the documented command", () => continuingTask(env));
  fixture("linked providers preserve generic comparison gaps and conditional reading", () => comparisonGap(env));
  fixture("linked providers separate excluded platform work from actual reading requirements", () => taskReadingScope(env));
  fixture("linked providers distinguish national source subjects from delivery language", () => sourceReadingScope(env));
  fixture("linked providers distinguish skill use from maintenance without changing controls", () => skillOperationsReading(env));
  fixture("linked manual receipt examples preserve objectives and pass preflight", () => documentedReceipts(env));
  fixture("linked receipt producers fail closed without validation dependencies while direct reading works", () => receiptDependencyFailures(env));
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
  fixture("copied Codex starter retains its source text and document-first route", () => documentStarter(env));
  fixture("existing copies require force and preserve unrelated user files", () => {
    write(path.join(destination(env, "codex"), "local-note"), "Keep me.\n");
    install(env, ["--copy"], 1);
    assert.equal(fs.readFileSync(path.join(destination(env, "codex"), "local-note"), "utf8"), "Keep me.\n");
  });
  fixture("literal copied entrypoint examples preserve corpus and target origins", () => {
    for (const provider of PROVIDERS) documentedCommands(env, provider);
  });
  fixture("documented commands keep option-like task text separate from routing settings", () => {
    for (const provider of PROVIDERS) {
      for (const query of ["--actor=user", "--authority=release", "--write-artifact"]) {
        documentedCommands(env, provider, { query });
      }
    }
  });
  fixture("copied providers retain every declared objective from another project", () => declaredObjectives(env));
  fixture("copied providers keep one direct-task cell across phases using the documented command", () => continuingTask(env));
  fixture("copied providers preserve generic comparison gaps and conditional reading", () => comparisonGap(env));
  fixture("copied providers separate excluded platform work from actual reading requirements", () => taskReadingScope(env));
  fixture("copied providers distinguish national source subjects from delivery language", () => sourceReadingScope(env));
  fixture("copied providers distinguish skill use from maintenance without changing controls", () => skillOperationsReading(env));
  fixture("copied manual receipt examples preserve objectives and pass preflight", () => documentedReceipts(env));
  fixture("copied receipt producers fail closed without validation dependencies while direct reading works", () => receiptDependencyFailures(env));
  fixture("an explicit loaded skill directory overrides unrelated installer defaults", () => {
    for (const provider of PROVIDERS) documentedCommands(env, provider, { loadedDirectory: sourceSkill(provider) });
  });
  fixture("an absent explicitly loaded directory fails instead of selecting another skill", () => {
    for (const provider of PROVIDERS) documentedCommands(env, provider, {
      loadedDirectory: path.join(temporary, "absent loaded skill"), status: 1
    });
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
    for (const provider of PROVIDERS) { route(custom, provider); documentedCommands(custom, provider); }
    assert(!fs.existsSync(path.join(custom.HOME, ".codex")));
    assert(!fs.existsSync(path.join(custom.HOME, ".claude")));
  });
  fixture("literal examples honor the other home and skill-directory overrides", () => {
    const custom = { ...environment("alternate installation home"),
      CODEX_SKILLS_DIR: path.join(temporary, "alternate codex skills"),
      CLAUDE_HOME: path.join(temporary, "alternate claude home") };
    install(custom);
    for (const provider of PROVIDERS) documentedCommands(custom, provider);
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
