#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { validatePayload } = require("./validator-cli-prototype/validate");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function substantiveItems(items) {
  return (items || []).filter(item => !/^none$/i.test(String(item).trim()));
}

function includesText(haystack, needle) {
  return String(haystack || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

function check(name, ok, detail = "") {
  return { name, ok, detail };
}

function verifyDissemination(opord, backbrief, rehearsal) {
  for (const [payload, type] of [[opord, "opord"], [backbrief, "backbrief"], [rehearsal, "rehearsal"]]) {
    const validation = validatePayload(payload, type);
    if (!validation.valid) throw new Error(`DISSEMINATION_INVALID:${type}:${validation.issues.map(item => item.code).join(",")}`);
  }
  const task = (opord.execution.tasks || []).find(item => item.id === backbrief.task_order);

  const checks = [
    check("backbrief references current OPORD", backbrief.parent_order === opord.id),
    check("backbrief stays in same mission", backbrief.mission_id === opord.mission_id),
    check("backbrief task exists in OPORD", Boolean(task)),
    check("task stays in the same mission", task && task.mission_id === opord.mission_id),
    check("backbrief actor matches task assignee", task && backbrief.actor === task.assigned_to),
    check("backbrief restates commander intent", includesText(backbrief.understanding.commander_intent, opord.intent.purpose)),
    check("backbrief restates assigned task", task && includesText(backbrief.understanding.assigned_task, task.task)),
    check("backbrief keeps stop conditions", substantiveItems(backbrief.stop_conditions).length > 0),
    check("backbrief carries approval-required boundaries", substantiveItems(backbrief.approval_awareness.approval_required_actions).length > 0),
    check("rehearsal references current OPORD", rehearsal.parent_order === opord.id),
    check("rehearsal stays in the same mission", rehearsal.mission_id === opord.mission_id),
    check("rehearsal references backbrief", rehearsal.backbriefs.includes(backbrief.id)),
    check("rehearsal sequence includes backbrief actor", rehearsal.sequence.some(step => step.actor === backbrief.actor)),
    check("execute disposition has no unresolved required changes", rehearsal.disposition !== "execute" || substantiveItems(rehearsal.required_changes).length === 0)
  ];
  return checks;
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 0 && argv.length !== 3) throw new Error("Usage: orders-dissemination-runner.js [<opord.json> <backbrief.json> <rehearsal.json>]");
  const files = argv.length ? argv : ["opord", "backbrief", "rehearsal"].map(name => path.join(__dirname, "runtime-demo-payloads", `${name}.json`));
  const checks = verifyDissemination(...files.map(readJson));

  for (const item of checks) {
    console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}`);
    if (!item.ok && item.detail) console.log(`  ${item.detail}`);
  }

  const failed = checks.filter(item => !item.ok);
  console.log(JSON.stringify({
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    execution_authorized: false,
    release_authorized: false
  }, null, 2));

  process.exit(failed.length === 0 ? 0 : 1);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { verifyDissemination };
