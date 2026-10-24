#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), readline = require("node:readline");
const args = process.argv.slice(2), root = __dirname, settings = () => JSON.parse(fs.readFileSync(path.join(root, "settings.json")));
if (args[0] === "--version") { console.log(settings().version || "codex-cli 0.162.1"); process.exit(0); }
if (args[0] === "exec") {
  fs.appendFileSync(path.join(root, "exec.jsonl"), JSON.stringify({ model: args[args.indexOf("--model") + 1], args }) + "\n");
  require(settings().providerScript); return;
}
if (args[0] !== "app-server") process.exit(2);
fs.writeFileSync(path.join(root, "pid.txt"), String(process.pid));
const reply = (id, result) => process.stdout.write(JSON.stringify({ id, result }) + "\n");
let reads = 0;
readline.createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line), current = settings();
  fs.appendFileSync(path.join(root, "requests.jsonl"), JSON.stringify(message) + "\n");
  if (current.mode === "timeout") { setInterval(() => {}, 1000); return; }
  if (current.mode === "invalid-utf8") { process.stdout.write(Buffer.from([0xc3, 0x28, 0x0a])); return; }
  if (current.mode === "unknown-request") { process.stdout.write(JSON.stringify({ id: "server", method: "item/tool/requestApproval", params: {} }) + "\n"); return; }
  if (current.mode === "activity") { process.stdout.write(JSON.stringify({ method: "turn/started", params: {} }) + "\n"); return; }
  if (message.method === "initialize") {
    if (current.mode?.startsWith("remote-")) process.stdout.write(JSON.stringify({ method: "remoteControl/status/changed", params: {
      installationId: "synthetic", serverName: "synthetic", environmentId: null, status: current.mode.slice(7) } }) + "\n");
    return reply(message.id, { userAgent: "synthetic metadata only" });
  }
  if (message.method === "initialized") return;
  if (message.method === "config/read") {
    reads++; const model = current.mode === "drift" && reads > 1 ? "changed-model" : current.model;
    return reply(message.id, { config: { model, model_provider: current.provider ?? null, private_password: "synthetic-do-not-retain" }, layers: null, origins: {} });
  }
  if (message.method === "model/list") return reply(message.id, { data: current.models, nextCursor: current.mode === "cursor-loop" ? "loop" : null });
  process.exit(3);
});
