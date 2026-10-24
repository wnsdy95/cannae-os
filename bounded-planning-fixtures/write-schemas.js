const fs = require("node:fs"), path = require("node:path"), { z } = require("zod");
const { REQUEST, PROPOSAL } = require("../bounded-planning-contract");
for (const [name, contract] of [["bounded-planning-request", REQUEST], ["bounded-planning-proposal", PROPOSAL]]) {
  const schema = { ...z.toJSONSchema(contract), $id: `https://controls.local/schema-files/${name}.schema.json`, title: name };
  fs.writeFileSync(path.join(__dirname, `../schema-files/${name}.schema.json`), JSON.stringify(schema, null, 2) + "\n");
}
