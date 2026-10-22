#!/usr/bin/env node

const fs = require("fs"), path = require("path");
const gate = require("./method-deviation-gate");
function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv, flags = {};
  const allowed = { status: ["repository", "artifact-root", "mission", "wave", "agent"],
    propose: ["repository", "artifact-root", "input"], report: ["repository", "artifact-root", "input"],
    respond: ["repository", "artifact-root", "input"] }[command];
  if (!allowed) throw new Error("Usage: method-deviation-runner.js status|propose|report|respond --repository <repo> [--artifact-root <path>] [--input <json> | --mission <id> --wave <id> [--agent <id>]]");
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]?.slice(2), value = rest[index + 1];
    if (!rest[index]?.startsWith("--") || !allowed.includes(key) || Object.hasOwn(flags, key) || !value || value.startsWith("--")) {
      throw new Error("Unsupported, repeated or incomplete method argument.");
    }
    flags[key] = value;
  }
  if (!flags.repository) throw new Error("--repository is required.");
  const options = { repository: path.resolve(flags.repository),
    artifactRoot: path.resolve(flags["artifact-root"] || path.join(flags.repository, ".cannae", "artifacts")) };
  let result;
  if (command === "status") {
    if (!flags.mission || !flags.wave) throw new Error("status requires --mission and --wave.");
    const store = gate.load(options), matches = store.manifest.artifacts.filter(entry => entry.kind === "mission-wave-plans" &&
      entry.mission_id === flags.mission && entry.wave_id === flags.wave);
    if (matches.length !== 1) throw new Error("One exact retained method plan is required.");
    const plan = gate.read(store, gate.reference(matches[0]), "mission-wave-plans", "mission-wave-plan");
    const agents = plan.payload.agents.filter(agent => !flags.agent || agent.agent_id === flags.agent);
    if (!agents.length) throw new Error("Requested agent is not assigned.");
    result = { configured: Boolean(plan.payload.method_control), plan_ref: plan.ref,
      drift_denial_refs: gate.driftDenials(store, flags.mission).map(item => item.ref),
      agents: agents.map(agent => ({ agent_id: agent.agent_id, ...gate.methodState(store, plan, agent.agent_id) })) };
  } else {
    if (!flags.input) throw new Error("--input is required.");
    const request = JSON.parse(fs.readFileSync(path.resolve(flags.input), "utf8"));
    if (command === "propose") result = gate.proposeMethod(options, request);
    if (command === "report") result = gate.reportMethod(options, request);
    if (command === "respond") {
      if (!request || Object.keys(request).join() !== "denyRef") throw new Error("respond requires exactly one denyRef.");
      result = gate.respondToDrift(options, request.denyRef);
    }
  }
  return { ...result, execution_authorized: false, continuation_authorized: false, release_authorized: false };
}
module.exports = { main };
if (require.main === module) {
  try { console.log(JSON.stringify(main(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
