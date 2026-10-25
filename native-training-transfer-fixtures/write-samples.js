const fs = require("node:fs"), path = require("node:path"), { z } = require("zod"), c = require("../native-training-transfer-contract"), root = path.resolve(__dirname, "..");
function schemaFor(type, schema) {
  const value = { ...z.toJSONSchema(schema), $id: `https://controls.local/schema-files/${type}.schema.json` };
  if (type === "native-training-transfer-review-request") {
    value.properties.labels.items = { $ref: "classification-label.schema.json" };
    value.properties.releasability_review = { $ref: "releasability-review.schema.json" };
    value.properties.release_review = { $ref: "release-review.schema.json" };
  }
  return value;
}
if (require.main === module) {
  for (const [type, schema] of Object.entries(c.SCHEMAS)) fs.writeFileSync(path.join(root, "schema-files", `${type}.schema.json`), JSON.stringify(schemaFor(type, schema), null, 2) + "\n");
  for (const [type, value] of Object.entries(require("./contracts").samples())) for (const prefix of ["valid", "invalid"]) fs.writeFileSync(path.join(root, "sample-payloads", `${prefix}-${type}.json`),
    JSON.stringify(prefix === "valid" ? value : { ...value, qualification_granted: true }, null, 2) + "\n");
}
module.exports = { schemaFor };
