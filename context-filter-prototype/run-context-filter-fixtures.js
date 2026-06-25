#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { filterContext } = require("./context-filter");

const items = JSON.parse(fs.readFileSync(path.join(__dirname, "context-items.demo.json"), "utf8"));

const s3 = filterContext(items, "S3");
const redTeam = filterContext(items, "RED_TEAM");
const finalOutput = filterContext(items, "FINAL_OUTPUT");

function mode(packet, itemId) {
  const item = packet.items.find(candidate => candidate.item_id === itemId);
  return item && item.delivery_mode;
}

const checks = [
  {
    name: "S3 receives internal blocked deployment context raw",
    ok: mode(s3, "CTX-DEMO-001") === "raw"
  },
  {
    name: "S3 is denied EEFI credential context",
    ok: mode(s3, "CTX-DEMO-002") === "denied"
  },
  {
    name: "Red Team receives sensitive architecture only as summary",
    ok: mode(redTeam, "CTX-DEMO-004") === "summary"
  },
  {
    name: "Final output receives public context raw",
    ok: mode(finalOutput, "CTX-DEMO-003") === "raw"
  },
  {
    name: "Final output denies non-release sensitive context",
    ok: mode(finalOutput, "CTX-DEMO-004") === "denied"
  }
];

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
}

const failed = checks.filter(check => !check.ok);
console.log(JSON.stringify({
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
