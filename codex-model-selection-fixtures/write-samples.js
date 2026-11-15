const fs = require("node:fs"), path = require("node:path"), { z } = require("zod");
const { SELECTION, VERSION, AUTHORITY } = require("../codex-model-selection-contract");
const { digest } = require("../order-intake-contract");
const root = path.resolve(__dirname, ".."), body = { schema_version: "0.1", type: "CodexModelSelection", selector: "current_cli_default",
  source: "configured_model", requested_model: "synthetic-model", provider: "openai", reasoning_effort: "medium", resolved_at: "2026-10-24T00:00:00Z",
  cli_version: VERSION, executable_sha256: "1".repeat(64), configuration_sha256: "2".repeat(64), catalog_sha256: "3".repeat(64),
  process_exit_confirmed: true, process_group_absent: true, model_access_attested: false, model_snapshot_attested: false, ...AUTHORITY };
const value = { ...body, selection_sha256: digest(body) };
fs.writeFileSync(path.join(root, "schema-files/codex-model-selection.schema.json"), JSON.stringify({
  ...z.toJSONSchema(SELECTION), $id: "https://cannae-os.dev/schemas/codex-model-selection.schema.json", title: "CodexModelSelection" }, null, 2) + "\n");
for (const [prefix, payload] of [["valid", value], ["invalid", { ...value, requested_model: "substituted-model" }]]) {
  fs.writeFileSync(path.join(root, `sample-payloads/${prefix}-codex-model-selection.json`), JSON.stringify(payload, null, 2) + "\n");
}
console.log("Generated the selection schema and two synthetic non-authorizing structural examples.");
