#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), args = process.argv.slice(2);
if (args[0] === "--version") { console.log("codex-cli 0.162.1"); process.exit(0); }
const model = args[args.indexOf("--model") + 1];
if (model.startsWith("fixture-")) { require("../semantic-evaluation-fixtures/fake-codex"); }
else {
  let input = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", bytes => { input += bytes; });
  process.stdin.on("end", () => {
    const output = args[args.indexOf("--output-last-message") + 1], support = require("./support");
    const body = model === "analysis-amplified" ? support.amplifiedResponse() : support.response();
    JSON.parse(input.split("\n\nINPUT:\n")[1]);
    fs.writeFileSync(path.join(path.dirname(output), "provider-started"), "Synthetic analysis process, not model evidence.");
    if (model === "analysis-uncertain") body.statements.push({ id: "ST-UNRESOLVED", kind: "unknown", text: "Clarify an unresolved target.", blocking: true, source: { kind: "none" } });
    if (model === "analysis-forged") body.statements[0].text = "Invented source.";
    if (model === "analysis-authority") body.release_authorized = true;
    const finish = () => {
      fs.writeFileSync(output, JSON.stringify(body));
      for (const event of [{ type: "thread.started", thread_id: "synthetic-analysis" }, { type: "turn.started" },
        { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(body) } }, { type: "turn.completed", usage: { input_tokens: 0, output_tokens: 0 } }]) {
        process.stdout.write(JSON.stringify(event) + "\n");
      }
    };
    if (model === "analysis-slow") setTimeout(finish, 500); else finish();
  });
}
