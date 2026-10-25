const fs = require("node:fs"), path = require("node:path"), { z } = require("zod"), { SCHEMAS } = require("../task-training-contract");
const { samples } = require("./contracts"), root = path.resolve(__dirname, "..");
for (const [type, schema] of Object.entries(SCHEMAS)) {
  const json = z.toJSONSchema(schema); json.$id = `https://controls.local/schema-files/${type}.schema.json`;
  fs.writeFileSync(path.join(root, "schema-files", `${type}.schema.json`), JSON.stringify(json, null, 2) + "\n");
}
for (const [type, value] of Object.entries(samples())) {
  fs.writeFileSync(path.join(root, "sample-payloads", `valid-${type}.json`), JSON.stringify(value, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "sample-payloads", `invalid-${type}.json`), JSON.stringify({ ...value, execution_authorized: true }, null, 2) + "\n");
}
