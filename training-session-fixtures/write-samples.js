const fs = require("node:fs"), path = require("node:path"), { z } = require("zod");
const { SCHEMAS } = require("../training-session-contract"), { samples } = require("./contracts"), root = path.resolve(__dirname, "..");
for (const [type, schema] of Object.entries(SCHEMAS)) fs.writeFileSync(path.join(root, "schema-files", `${type}.schema.json`),
  JSON.stringify({ ...z.toJSONSchema(schema), $id: `https://controls.local/schema-files/${type}.schema.json` }, null, 2) + "\n");
for (const [type, value] of Object.entries(samples())) for (const prefix of ["valid", "invalid"]) fs.writeFileSync(path.join(root, "sample-payloads", `${prefix}-${type}.json`),
  JSON.stringify(prefix === "valid" ? value : { ...value, execution_authorized: true }, null, 2) + "\n");
