#!/usr/bin/env node

const fs = require("fs");

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

function main() {
  const opord = readJson("runtime-demo-payloads/opord.json");
  const backbrief = readJson("runtime-demo-payloads/backbrief.json");
  const rehearsal = readJson("runtime-demo-payloads/rehearsal.json");
  const task = (opord.execution.tasks || []).find(item => item.id === backbrief.task_order);

  const checks = [
    check("backbrief references current OPORD", backbrief.parent_order === opord.id),
    check("backbrief stays in same mission", backbrief.mission_id === opord.mission_id),
    check("backbrief task exists in OPORD", Boolean(task)),
    check("backbrief actor matches task assignee", task && backbrief.actor === task.assigned_to),
    check("backbrief restates commander intent", includesText(backbrief.understanding.commander_intent, opord.intent.purpose)),
    check("backbrief restates assigned task", task && includesText(backbrief.understanding.assigned_task, task.task)),
    check("backbrief keeps stop conditions", substantiveItems(backbrief.stop_conditions).length > 0),
    check("backbrief carries approval-required boundaries", substantiveItems(backbrief.approval_awareness.approval_required_actions).length > 0),
    check("rehearsal references current OPORD", rehearsal.parent_order === opord.id),
    check("rehearsal references backbrief", rehearsal.backbriefs.includes(backbrief.id)),
    check("rehearsal sequence includes backbrief actor", rehearsal.sequence.some(step => step.actor === backbrief.actor)),
    check("execute disposition has no unresolved required changes", rehearsal.disposition !== "execute" || substantiveItems(rehearsal.required_changes).length === 0)
  ];

  for (const item of checks) {
    console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}`);
    if (!item.ok && item.detail) console.log(`  ${item.detail}`);
  }

  const failed = checks.filter(item => !item.ok);
  console.log(JSON.stringify({
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length
  }, null, 2));

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
