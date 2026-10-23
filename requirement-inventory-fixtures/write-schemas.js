const fs = require("node:fs"), path = require("node:path"), { z } = require("zod");
const { INVENTORY, COVERAGE, ASSIGNMENT } = require("../requirement-inventory-contract");
for (const [name, contract] of [["requirement-inventory", INVENTORY], ["semantic-coverage-proposal", COVERAGE], ["semantic-review-assignment", ASSIGNMENT]]) {
  const value = { ...z.toJSONSchema(contract), $id: `https://controls.local/schema-files/${name}.schema.json`, title: name };
  fs.writeFileSync(path.join(__dirname, `../schema-files/${name}.schema.json`), JSON.stringify(value, null, 2) + "\n");
}
