const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const entry = (name = "fixture-valid", extra = {}) => ({ id: name, model: name, hidden: false, isDefault: true,
  supportedReasoningEfforts: [{ reasoningEffort: "medium" }], ...extra });
function fixture(changes = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-model-discovery-")));
  const executable = path.join(root, "codex"); fs.copyFileSync(path.join(__dirname, "fake-codex.js"), executable); fs.chmodSync(executable, 0o700);
  const initial = { model: null, models: [entry()], providerScript: path.join(__dirname, "../semantic-evaluation-fixtures/fake-codex.js"), ...changes };
  const write = value => fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify(value)); write(initial);
  const read = name => fs.existsSync(path.join(root, name)) ? fs.readFileSync(path.join(root, name), "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
  return { root, executable, initial, write, read, options: { executable, cwd: root, home: root } };
}
module.exports = { fixture, entry };
