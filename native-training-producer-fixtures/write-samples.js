const fs = require("node:fs"), path = require("node:path"), { z } = require("zod"), c = require("../native-training-producer");
const root = path.resolve(__dirname, ".."), type = "native-training-producer-inspection";
fs.writeFileSync(path.join(root, "schema-files", type + ".schema.json"), JSON.stringify({ ...z.toJSONSchema(c.INSPECTION), $id: `https://controls.local/schema-files/${type}.schema.json` }, null, 2) + "\n");
const valid = c.inspect(c.legacySnapshot().method_sha256), invalid = { ...valid, source_revision: "0".repeat(40) };
for (const [prefix, payload] of [["valid", valid], ["invalid", invalid]]) fs.writeFileSync(path.join(root, "sample-payloads", `${prefix}-${type}.json`), JSON.stringify(payload, null, 2) + "\n");
