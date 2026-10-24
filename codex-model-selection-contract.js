const { z } = require("zod");
const { digest, AUTHORITY } = require("./order-intake-contract");
const VERSION = "codex-cli 0.162.1", SELECTOR = "@cli-default";
const model = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const SELECTION = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("CodexModelSelection"),
  selector: z.literal("current_cli_default"), source: z.enum(["configured_model", "catalog_default"]),
  requested_model: model, provider: z.literal("openai"), reasoning_effort: z.literal("medium"),
  resolved_at: z.iso.datetime({ offset: true }), cli_version: z.literal(VERSION), executable_sha256: hex,
  configuration_sha256: hex, catalog_sha256: hex, selection_sha256: hex,
  process_exit_confirmed: z.literal(true), process_group_absent: z.literal(true),
  model_access_attested: z.literal(false), model_snapshot_attested: z.literal(false),
  execution_authorized: z.literal(false), release_authorized: z.literal(false), human_final_decision_authority: z.literal("USER") });
function need(value, code) { if (!value) throw new Error(code); }
function assertSelection(value) {
  need(SELECTION.safeParse(value).success, "SEMANTIC_MODEL_SELECTION_INVALID");
  const { selection_sha256, ...body } = value;
  need(selection_sha256 === digest(body), "SEMANTIC_MODEL_SELECTION_SUBSTITUTED"); return value;
}
function selectionIssues(value, type) {
  if (type !== "codex-model-selection") return [];
  try { assertSelection(value); return []; }
  catch (error) { return [{ severity: "critical", code: error.message, path: "$", message: "Model selection is exact non-authorizing host metadata, not inference or account-access proof." }]; }
}
module.exports = { VERSION, SELECTOR, SELECTION, model, need, assertSelection, selectionIssues, AUTHORITY };
