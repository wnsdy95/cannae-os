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
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-packet-git-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
const git = args => child.execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8" });
const json = value => JSON.stringify(value, null, 2) + "\n";
let fixtures = 0;
function check(name, run) { run(); fixtures++; console.log("PASS " + name); }
function deny(matches, change, run) {
  fault = { matches, change }; injections = 0;
  try {
    assert.throws(run, error => error.message === "PROJECT_PACKET_GIT_UNAVAILABLE");
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
  console.log(JSON.stringify({ valid: true, fixtures, native_model_calls: 0, scope: "Injected process failures around real local Git results, not host-sleep recovery." }));
} finally { child.spawnSync = realSpawn; fs.rmSync(root, { recursive: true, force: true }); }
