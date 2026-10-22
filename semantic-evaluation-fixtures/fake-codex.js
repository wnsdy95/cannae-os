#!/usr/bin/env node
// A measured fake provider for process/protocol regression tests, never model evidence.
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("codex-cli 0.162.1"); process.exit(0); }
const model = args[args.indexOf("--model") + 1];
const output = args[args.indexOf("--output-last-message") + 1];
const workspace = args[args.indexOf("--cd") + 1];
const emit = value => process.stdout.write(JSON.stringify(value) + "\n");
let input = "";
process.stdin.setEncoding("utf8"); process.stdin.on("data", bytes => { input += bytes; });
process.stdin.on("end", () => {
  fs.writeFileSync(path.join(path.dirname(output), "provider-started"), "synthetic process only");
  if (model === "fixture-timeout") { setInterval(() => {}, 1000); return; }
  if (model === "fixture-output") { process.stdout.write("X".repeat(32768)); setInterval(() => {}, 1000); return; }
  if (model === "fixture-malformed") { console.log("not JSON"); return; }
  if (model === "fixture-tool") { emit({ type: "item.started", item: { type: "command_execution", command: "not executed" } }); return; }
  if (model === "fixture-unknown") { emit({ type: "new_unknown_event" }); return; }
  if (model === "fixture-diagnostic") { emit({ type: "item.completed", item: { type: "error", message: "Unexpected diagnostic" } }); return; }
  const data = JSON.parse(input.split("\n\nINPUT:\n")[1]);
  const quote = "Do not publish or modify customer data.";
  const start = Buffer.from(data.request).indexOf(Buffer.from(quote));
  const response = { requirements: [{ source_quote: quote, start_byte: start, end_byte: start + Buffer.byteLength(quote), kind: "prohibition",
    coverage: data.targets.map(target => ({ target_id: target.id, disposition: "omitted", pointer: "", quote: "", explanation: "Fixture response only." })) }],
    conflicts: [], execution_authorized: false, release_authorized: false };
  if (model === "fixture-invalid") response.release_authorized = true;
  if (model === "fixture-workspace") fs.writeFileSync(path.join(workspace, "unexpected.txt"), "changed");
  if (model === "fixture-symlink") {
    const other = path.join(path.dirname(output), "other.json"); fs.writeFileSync(other, JSON.stringify(response)); fs.symlinkSync(other, output);
  } else fs.writeFileSync(output, JSON.stringify(response));
  const finish = () => {
  emit({ type: "thread.started", thread_id: "fixture" });
  if (model !== "fixture-missing-turn") emit({ type: "turn.started" });
  if (model === "fixture-two-turns") emit({ type: "turn.started" });
  if (model === "fixture-unicode") {
    const bytes = Buffer.from(JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "\uAC00" } }) + "\n");
    const offset = bytes.indexOf(Buffer.from("\uAC00")); process.stdout.write(bytes.subarray(0, offset + 1)); process.stdout.write(bytes.subarray(offset + 1));
  }
  emit({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(model === "fixture-final-substitute" ? {} : response) } });
  emit({ type: "turn.completed", usage: { input_tokens: 0, output_tokens: 0 } });
  };
  if (model === "fixture-slow") setTimeout(finish, 500); else finish();
});
