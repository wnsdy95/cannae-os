const fs = require("node:fs"), path = require("node:path"), { z } = require("zod"), c = require("../native-training-product-contract");
const fixtures = require("./contracts"), root = path.resolve(__dirname, "..");
for (const schemas of [c.SCHEMAS, require("../task-training-contract").SCHEMAS, require("../training-session-contract").SCHEMAS]) {
  for (const [type, schema] of Object.entries(schemas)) fs.writeFileSync(path.join(root, "schema-files", `${type}.schema.json`),
    JSON.stringify({ ...z.toJSONSchema(schema), $id: `https://controls.local/schema-files/${type}.schema.json` }, null, 2) + "\n");
}
const now = Date.parse("2026-10-25T00:00:00Z");
for (const [type, value] of Object.entries(fixtures.samples(now))) for (const prefix of ["valid", "invalid"]) {
  fs.writeFileSync(path.join(root, "sample-payloads", `${prefix}-${type}.json`), JSON.stringify(prefix === "valid" ? value : { ...value, execution_authorized: true }, null, 2) + "\n");
}
const standard = fixtures.standard(now);
fs.writeFileSync(path.join(root, "sample-payloads/valid-task-training-standard-native.json"), JSON.stringify(standard, null, 2) + "\n");
fs.writeFileSync(path.join(root, "sample-payloads/invalid-task-training-standard-native.json"), JSON.stringify({ ...standard,
  cases: standard.cases.map((value, index) => index === 1 ? { ...value, instruction: standard.cases[0].instruction, input_text: standard.cases[0].input_text } : value) }, null, 2) + "\n");
