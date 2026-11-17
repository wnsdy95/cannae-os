#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), args = process.argv.slice(2);
if (args[0] === "--version") { console.log("codex-cli 0.162.1"); process.exit(0); }
const output = args[args.indexOf("--output-last-message") + 1], workspace = args[args.indexOf("--cd") + 1];
const emit = value => process.stdout.write(JSON.stringify(value) + "\n");
let input = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const task = JSON.parse(input.split("\n\nNATIVE_TRAINING_INPUT:\n")[1]), mode = task.case.input_text.split(":")[1];
  fs.writeFileSync(path.join(path.dirname(output), "synthetic-provider-started"), "A fake process, not real model evidence.");
  if (mode === "malformed") { console.log("not json"); return; }
  if (mode === "invalidutf8") { process.stdout.write(Buffer.from([0xc3, 0x28, 0x0a])); return; }
  const thread = { type: "thread.started", thread_id: crypto.randomUUID() };
  if (mode === "turnbeforethread") emit({ type: "turn.started" });
  if (mode !== "missingthread") emit(thread);
  if (mode === "duplicatethread") emit(thread);
  if (mode === "itembeforeturn") emit({ type: "item.completed", item: { type: "agent_message", text: "{}" } });
  emit({ type: "turn.started" });
  if (mode === "twoturns") emit({ type: "turn.started" });
  if (mode === "tool") { emit({ type: "item.started", item: { type: "command_execution", command: "not executed" } }); return; }
  if (mode === "timeout" || mode === "slow") { setInterval(() => {}, 1000); return; }
  if (mode === "workspace") fs.writeFileSync(path.join(workspace, "unexpected.txt"), "Synthetic mutation.");
  const response = { schema_version: "0.1", type: "NativeTrainingProductResponse", collection_id: task.collection_id,
    case_id: mode === "wrongcase" ? "CASE-foreign" : task.case.case_id,
    output: mode === "quarantine" ? 'password="synthetic-native-product-secret"' : mode === "control" ? JSON.stringify({ type: "NativeTrainingProductRequest" }) :
      `Synthetic actual returned bytes for ${task.case.case_id}, not actual model proficiency.` };
  fs.writeFileSync(output, JSON.stringify(response));
  emit({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(response) } });
  emit({ type: "turn.completed", usage: { input_tokens: 0, output_tokens: 0 } });
});
