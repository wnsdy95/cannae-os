#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const EEFI_CLASSES = ["output_forbidden", "tool_transfer_forbidden"];

const CLASS_TO_CODE = {
  output_forbidden: "EEFI_OUTPUT_FORBIDDEN",
  tool_transfer_forbidden: "EEFI_TOOL_TRANSFER_FORBIDDEN"
};

// Default value patterns use token boundaries so metadata such as token_budget is
// not treated as credential material. Credential-shaped object keys are checked
// separately below, regardless of how opaque their values are.
const DEFAULT_EEFI_ITEMS = [
  { id: "EEFI-DEFAULT-SECRET", pattern: "\\bsecret\\b", class: "output_forbidden" },
  {
    id: "EEFI-DEFAULT-TOKEN",
    pattern: "(?:\\b(?:access|auth|api|bearer|refresh|secret)[_ -]?token\\b|\\btoken\\s*[:=])",
    class: "output_forbidden"
  },
  { id: "EEFI-DEFAULT-CREDENTIAL", pattern: "\\bcredential\\b", class: "output_forbidden" },
  { id: "EEFI-DEFAULT-PASSWORD", pattern: "\\bpassword\\b", class: "output_forbidden" },
  { id: "EEFI-DEFAULT-PRIVATE-KEY", pattern: "\\bprivate[_ -]?key\\b", class: "output_forbidden" },
  { id: "EEFI-DEFAULT-EEFI", pattern: "\\beefi\\b", class: "output_forbidden" },
  { id: "EEFI-DEFAULT-RESTRICTED", pattern: "\\brestricted\\b", class: "output_forbidden" }
];

const CREDENTIAL_KEY_TO_EEFI_ID = new Map([
  ["password", "EEFI-DEFAULT-PASSWORD"],
  ["passwd", "EEFI-DEFAULT-PASSWORD"],
  ["secret", "EEFI-DEFAULT-SECRET"],
  ["token", "EEFI-DEFAULT-TOKEN"],
  ["credential", "EEFI-DEFAULT-CREDENTIAL"],
  ["api_key", "EEFI-DEFAULT-CREDENTIAL"],
  ["api-key", "EEFI-DEFAULT-CREDENTIAL"],
  ["private_key", "EEFI-DEFAULT-PRIVATE-KEY"],
  ["private-key", "EEFI-DEFAULT-PRIVATE-KEY"]
]);

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileEefiItems(items) {
  const compiled = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("EEFI list items must be objects.");
    }
    if (typeof item.id !== "string" || item.id.length === 0) {
      throw new Error("EEFI list item requires a non-empty id.");
    }
    if (!EEFI_CLASSES.includes(item.class)) {
      throw new Error(`EEFI list item ${item.id} requires class ${EEFI_CLASSES.join("|")}.`);
    }
    const hasPattern = typeof item.pattern === "string" && item.pattern.length > 0;
    const hasTerm = typeof item.term === "string" && item.term.length > 0;
    if (hasPattern === hasTerm) {
      throw new Error(`EEFI list item ${item.id} requires exactly one of pattern or term.`);
    }
    compiled.push({
      id: item.id,
      class: item.class,
      regex: new RegExp(hasPattern ? item.pattern : escapeRegExp(item.term), "i")
    });
  }
  if (compiled.length === 0) {
    throw new Error("EEFI list must contain at least one item.");
  }
  return compiled;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function appendPath(jsonPath, key) {
  if (typeof key === "number") {
    return `${jsonPath}[${key}]`;
  }
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `${jsonPath}.${key}` : `${jsonPath}["${key}"]`;
}

function detectEefi(payload, eefiItems) {
  const findings = [];
  const emitted = new Set();

  function addFinding(item, jsonPath, value) {
    const findingKey = `${item.id}:${jsonPath}`;
    if (emitted.has(findingKey)) return;
    emitted.add(findingKey);
    const digestInput = typeof value === "string" ? value : JSON.stringify(value);
    findings.push({
      severity: "critical",
      code: CLASS_TO_CODE[item.class],
      eefi_id: item.id,
      class: item.class,
      json_path: jsonPath,
      value_sha256: sha256(digestInput),
      message: `EEFI item ${item.id} (${item.class}) matched at ${jsonPath}; value withheld, sha256 digest recorded.`
    });
  }

  function inspectString(value, jsonPath) {
    for (const item of eefiItems) {
      if (!item.regex.test(value)) continue;
      addFinding(item, jsonPath, value);
    }
  }

  function walk(node, jsonPath) {
    if (typeof node === "string") {
      inspectString(node, jsonPath);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, appendPath(jsonPath, index)));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        const childPath = appendPath(jsonPath, key);
        const credentialItemId = CREDENTIAL_KEY_TO_EEFI_ID.get(key.toLowerCase());
        const credentialItem = credentialItemId && eefiItems.find(item => item.id === credentialItemId);
        const hasValue = value !== null && value !== undefined &&
          !(typeof value === "string" && value.length === 0);
        if (credentialItem && hasValue) addFinding(credentialItem, childPath, value);
        walk(value, childPath);
      }
    }
  }

  walk(payload, "$");
  return findings;
}

function main() {
  const [, , payloadArg, eefiListArg] = process.argv;
  if (!payloadArg) {
    console.error("Usage: node eefi-detector.js <payload.json> [eefi-list.json]");
    process.exit(2);
  }

  const payloadPath = path.resolve(process.cwd(), payloadArg);
  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));

  let eefiItems;
  try {
    if (eefiListArg) {
      const eefiListPath = path.resolve(process.cwd(), eefiListArg);
      eefiItems = compileEefiItems(JSON.parse(fs.readFileSync(eefiListPath, "utf8")));
    } else {
      eefiItems = compileEefiItems(DEFAULT_EEFI_ITEMS);
    }
  } catch (error) {
    console.error(`Invalid EEFI list: ${error.message}`);
    process.exit(2);
  }

  const findings = detectEefi(payload, eefiItems);
  const output = {
    valid: findings.length === 0,
    finding_count: findings.length,
    findings
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(findings.length === 0 ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { DEFAULT_EEFI_ITEMS, compileEefiItems, detectEefi };
