#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const child = require("node:child_process"), realSpawn = child.spawnSync;
let fault = null, injections = 0;
child.spawnSync = (command, args, options) => {
  const result = realSpawn(command, args, options);
  if (command !== "git" || !fault || !fault.matches(args)) return result;
  assert(!result.error && !result.signal, "Fixture setup Git call must actually complete.");
  injections++;
  return fault.change(result);
};
const packet = require("./project-document-packet");
const terms = require("./project-terminology"), dependencies = require("./project-knowledge-dependencies");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-packet-git-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
const git = args => child.execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8" });
const json = value => JSON.stringify(value, null, 2) + "\n";
let fixtures = 0;
function check(name, run) { run(); fixtures++; console.log("PASS " + name); }
function deny(matches, change, run, code = "PROJECT_PACKET_GIT_UNAVAILABLE") {
  fault = { matches, change }; injections = 0;
  try {
    assert.throws(run, error => error.message === code);
    assert.equal(injections, 1, "Stop at the first failed metadata invocation.");
  } finally { fault = null; }
}
try {
  fs.mkdirSync(path.join(root, "docs"));
  const body = "Owner decides. Draft only.\n";
  fs.writeFileSync(path.join(root, "docs/policy.md"), body);
  fs.writeFileSync(path.join(root, ".gitignore"), ".cannae/\nignored.md\n");
  git(["init", "-q"]); git(["add", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"]);
  const request = structuredClone(require("./sample-payloads/valid-project-document-packet-request.json"));
  const failures = [
    ["timeout with a completed-looking status", result => ({ ...result, error: Object.assign(new Error("synthetic timeout"), { code: "ETIMEDOUT" }) })],
    ["termination with a completed-looking status", result => ({ ...result, signal: "SIGTERM" })],
    ["missing terminal status", result => ({ ...result, status: null })]
  ];
  for (const provider of ["codex", "claude_code"]) {
    request.recipient.provider = provider;
    const stages = [
      ["root", args => args[1] === root && args[3] === "--show-toplevel", () => packet.repositoryIdentity(root)],
      ["git-directory", args => args[3] === "--absolute-git-dir", () => packet.repositoryIdentity(root)],
      ["head", args => args[3] === "--verify", () => packet.repositoryIdentity(root)],
      ["source-ignore", args => args[2] === "check-ignore" && args.at(-1) === "docs/policy.md", () => packet.compilePacket(request, root)],
      ["source-root", args => args[1] === path.join(root, "docs") && args[3] === "--show-toplevel", () => packet.compilePacket(request, root)],
      ["output-ignore", args => args[2] === "check-ignore" && args.at(-1) === ".cannae/document-packets/probe", () => packet.prepare(request, root)]
    ];
    for (const [stage, matches, run] of stages) for (const [name, change] of failures) {
      check(`${provider}: ${stage} rejects ${name}`, () => {
        deny(matches, change, run);
        assert(!fs.existsSync(path.join(root, ".cannae/document-packets")), "Failed preparation cannot publish a packet.");
      });
    }
    check(`${provider}: normal metadata, ignore status one and denied-source controls retain their meaning`, () => {
      const compiled = packet.compilePacket(request, root);
      assert.equal(compiled.documents[0].content, body);
      assert.equal(compiled.execution_authorized, false); assert.equal(compiled.release_authorized, false);
      assert.equal(packet.outputParent(root, false), path.join(root, ".cannae/document-packets"));
      fs.writeFileSync(path.join(root, "ignored.md"), body);
      const ignored = structuredClone(request); ignored.documents[0].path = "ignored.md";
      assert.throws(() => packet.compilePacket(ignored, root), /PROJECT_PACKET_SOURCE_EXCLUDED/);
      fs.symlinkSync(path.join(root, "docs/policy.md"), path.join(root, "alias.md"));
      const aliased = structuredClone(request); aliased.documents[0].path = "alias.md";
      try { assert.throws(() => packet.compilePacket(aliased, root), /PROJECT_PACKET_PATH_INVALID/); }
      finally { fs.unlinkSync(path.join(root, "alias.md")); }
    });
  }
  check("CLI returns only the stable failure code, no packet, path or Git stderr", () => {
    const file = path.join(root, "request.json"); fs.writeFileSync(file, json(request));
    const originalLog = console.log, originalError = console.error, originalExit = process.exitCode;
    const out = [], err = []; console.log = value => out.push(value); console.error = value => err.push(value);
    fault = { matches: args => args[3] === "--show-toplevel",
      change: result => ({ ...result, error: Object.assign(new Error(root), { code: "ETIMEDOUT" }), stderr: root }) };
    injections = 0;
    try {
      packet.main(["prepare", "--repository", root, "--request", file]);
      assert.equal(process.exitCode, 1); assert.deepEqual(out, []);
      assert.deepEqual(err, ["PROJECT_PACKET_GIT_UNAVAILABLE"]); assert.equal(injections, 1);
    } finally { fault = null; console.log = originalLog; console.error = originalError; process.exitCode = originalExit; }
  });
  const dependency = structuredClone(require("./sample-payloads/valid-project-knowledge-dependency-request.json"));
  dependency.sources[0].path = "docs/policy.md"; dependency.sources[0].sha256 = packet.sha256(body);
  const stages = [
    ["terminology root", args => args[1] === root && args[3] === "--show-toplevel", () => terms.identity(root), "TERMINOLOGY_GIT_UNAVAILABLE"],
    ["terminology Git directory", args => args[3] === "--absolute-git-dir", () => terms.identity(root), "TERMINOLOGY_GIT_UNAVAILABLE"],
    ["dependency source root", args => args[1] === path.join(root, "docs") && args[3] === "--show-toplevel", () => dependencies.register(dependency, root), "KNOWLEDGE_DEPENDENCY_GIT_UNAVAILABLE"],
    ["dependency output ignore", args => args[2] === "check-ignore", () => dependencies.register(dependency, root), "KNOWLEDGE_DEPENDENCY_GIT_UNAVAILABLE"]
  ];
  for (const [stage, matches, run, code] of stages) for (const [name, change] of failures) {
    check(`${stage} rejects ${name} before publishing knowledge state`, () => {
      deny(matches, change, run, code);
      assert(!fs.existsSync(path.join(root, dependencies.OUTPUT)), "Failed initial registration must not create knowledge output.");
    });
  }
  check("normal knowledge registration remains non-authorizing and failed reinspection holds required work", () => {
    assert.equal(terms.identity(root).root, root);
    const registered = dependencies.register(dependency, root);
    assert.equal(registered.results[0].status, "registered_inputs_current");
    assert.equal(registered.can_execute, false); assert.equal(registered.transfer_authorized, false);
    const file = path.join(root, registered.record_path), before = fs.readFileSync(file);
    fault = { matches: args => args[1] === path.join(root, "docs") && args[3] === "--show-toplevel", change: failures[0][1] };
    injections = 0;
    try {
      const result = dependencies.inspect(root, dependency.work_id);
      assert.equal(result.results[0].status, "held");
      assert(result.results[0].findings.some(row => row.code === "source_unavailable" && row.required));
      assert.equal(injections, 1);
      assert.equal(result.can_execute, false); assert.equal(result.transfer_authorized, false);
    } finally { fault = null; }
    assert.deepEqual(fs.readFileSync(file), before);
    deny(args => args[2] === "check-ignore", failures[0][1],
      () => dependencies.prepareRefresh(root, dependency.work_id, registered.record_sha256), "KNOWLEDGE_DEPENDENCY_GIT_UNAVAILABLE");
    assert(!fs.existsSync(path.join(root, dependencies.DRAFTS)), "Failed refresh cannot publish a draft.");
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(dependencies.inspect(root, dependency.work_id).results[0].status, "registered_inputs_current");
  });
  check("late source and output metadata failures cannot publish a dependency version", () => {
    for (const [name, matches] of [
      ["SOURCE", args => args[1] === path.join(root, "docs") && args[3] === "--show-toplevel"],
      ["OUTPUT", args => args[2] === "check-ignore"]
    ]) {
      const request = { ...structuredClone(dependency), work_id: "WORK-LATE-" + name };
      let seen = 0;
      deny(args => matches(args) && ++seen === 2, failures[0][1],
        () => dependencies.register(request, root), "KNOWLEDGE_DEPENDENCY_GIT_UNAVAILABLE");
      assert.equal(seen, 2);
      assert(!fs.existsSync(path.join(root, dependencies.OUTPUT, request.work_id, "000001.json")));
    }
  });
  check("a post-publication metadata failure preserves its record and cannot be retried as an initial registration", () => {
    const request = { ...structuredClone(dependency), work_id: "WORK-AFTER-WRITE" };
    const file = path.join(root, dependencies.OUTPUT, request.work_id, "000001.json");
    deny(args => args[1] === root && args[3] === "--show-toplevel" && fs.existsSync(file), failures[0][1],
      () => dependencies.register(request, root), "TERMINOLOGY_GIT_UNAVAILABLE");
    const before = fs.readFileSync(file);
    assert.equal(dependencies.inspect(root, request.work_id).results[0].status, "registered_inputs_current");
    assert.throws(() => dependencies.register(request, root), /KNOWLEDGE_DEPENDENCY_PREDECESSOR_STALE/);
    assert.deepEqual(fs.readFileSync(file), before);
    assert(!fs.existsSync(path.join(path.dirname(file), "000002.json")));
  });
  check("knowledge CLIs expose stable failures without emitting state or private process diagnostics", () => {
    const originalLog = console.log, originalError = console.error, originalWrite = process.stdout.write, originalExit = process.exitCode;
    const out = [], err = [];
    console.log = value => out.push(String(value)); console.error = value => err.push(String(value));
    process.stdout.write = value => { out.push(String(value)); return true; };
    try {
      fault = { matches: args => args[3] === "--show-toplevel",
        change: result => ({ ...result, error: Object.assign(new Error(root), { code: "ETIMEDOUT" }), stderr: root }) };
      injections = 0; terms.main(["init", "--repository", root]);
      assert.equal(process.exitCode, 1); assert.deepEqual(out, []);
      assert.deepEqual(err, ["TERMINOLOGY_GIT_UNAVAILABLE"]); assert.equal(injections, 1);
      err.length = 0; injections = 0;
      terms.main(["inspect-dependencies", "--repository", root]);
      assert.equal(process.exitCode, 1); assert.deepEqual(out, []);
      assert.deepEqual(err, ["KNOWLEDGE_DEPENDENCY_INPUT_UNAVAILABLE"]); assert.equal(injections, 1);
    } finally { fault = null; console.log = originalLog; console.error = originalError; process.stdout.write = originalWrite; process.exitCode = originalExit; }
  });
  console.log(JSON.stringify({ valid: true, fixtures, native_model_calls: 0, scope: "Injected process failures around real local Git results, not host-sleep recovery." }));
} finally { child.spawnSync = realSpawn; fs.rmSync(root, { recursive: true, force: true }); }
