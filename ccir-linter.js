#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const CCIR_TYPES = new Set(["PIR", "FFIR", "EEFI", "DECISION_POINT"]);
const CCIR_REFERENCE_PATTERN = /\b(?:PIR|FFIR|EEFI|DP|CCIR|ALERT)-[A-Za-z0-9][A-Za-z0-9_-]*\b/g;

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function extractCcirReferences(text) {
  return String(text || "").match(CCIR_REFERENCE_PATTERN) || [];
}

function classificationsFor(blockedItem, ccirEntries) {
  const target = normalize(blockedItem);
  return ccirEntries.filter(entry => {
    const item = normalize(entry && entry.item);
    return item.length > 0 && target.length > 0 &&
      (item === target || item.includes(target) || target.includes(item));
  });
}

function collectCcirCatalog(ccirList) {
  const entries = Array.isArray(ccirList)
    ? ccirList
    : (ccirList && Array.isArray(ccirList.ccir) ? ccirList.ccir : null);
  if (!entries) {
    return null;
  }
  const catalog = new Map();
  for (const entry of entries) {
    if (typeof entry === "string") {
      if (!entry || catalog.has(entry)) throw new Error(`Invalid or duplicate CCIR id ${JSON.stringify(entry)}.`);
      catalog.set(entry, null);
    } else if (entry && typeof entry.id === "string") {
      if (!entry.id || catalog.has(entry.id)) throw new Error(`Invalid or duplicate CCIR id ${JSON.stringify(entry.id)}.`);
      const ccirType = entry.ccir_type || entry.type || null;
      if (ccirType && !CCIR_TYPES.has(ccirType)) throw new Error(`CCIR ${entry.id} has unknown type ${ccirType}.`);
      catalog.set(entry.id, ccirType);
    } else {
      throw new Error("Every mission CCIR entry requires a non-empty id.");
    }
  }
  return catalog;
}

function collectCcirIds(ccirList) {
  const catalog = collectCcirCatalog(ccirList);
  return catalog === null ? null : new Set(catalog.keys());
}

function lintSitrep(sitrep, knownCcirCatalog) {
  const findings = [];
  const blocked = Array.isArray(sitrep.blocked) ? sitrep.blocked : [];
  const ccirEntries = Array.isArray(sitrep.ccir) ? sitrep.ccir : [];
  const catalog = knownCcirCatalog instanceof Map
    ? knownCcirCatalog
    : knownCcirCatalog instanceof Set
      ? new Map([...knownCcirCatalog].map(id => [id, null]))
      : null;

  if (sitrep.status === "blocked" && blocked.length === 0) {
    findings.push(finding("warning", "STATUS_BLOCKED_WITHOUT_ITEMS", "SITREP status is blocked but the blocked list is empty."));
  }

  ccirEntries.forEach((entry, index) => {
    if (!CCIR_TYPES.has(entry && entry.type)) {
      findings.push(finding("error", "BAD_CCIR_TYPE", `ccir[${index}] uses unknown type "${entry && entry.type}"; expected PIR, FFIR, EEFI, or DECISION_POINT.`));
    }
    if (catalog) {
      if (!entry || typeof entry.ccir_id !== "string" || entry.ccir_id.length === 0) {
        findings.push(finding("error", "MISSING_CCIR_REFERENCE", `ccir[${index}] must name ccir_id when a mission CCIR catalog is supplied.`));
      } else if (!catalog.has(entry.ccir_id)) {
        findings.push(finding("error", "UNKNOWN_CCIR_REFERENCE", `ccir[${index}] references ${entry.ccir_id}, which is not in the mission CCIR list.`));
      } else {
        const expectedType = catalog.get(entry.ccir_id);
        if (expectedType && expectedType !== entry.type) {
          findings.push(finding("error", "CCIR_TYPE_MISMATCH", `ccir[${index}] classifies ${entry.ccir_id} as ${entry.type}, but the mission CCIR list defines ${expectedType}.`));
        }
      }
    }
  });

  blocked.forEach((blockedItem, index) => {
    const classifications = classificationsFor(blockedItem, ccirEntries);
    const classified = classifications.some(entry => CCIR_TYPES.has(entry.type));
    if (!classified) {
      findings.push(finding("error", "BLOCKED_ITEM_WITHOUT_CCIR", `blocked[${index}] "${blockedItem}" lacks a CCIR classification (PIR, FFIR, EEFI, or DECISION_POINT).`));
    }
    if (catalog) {
      const references = new Set([
        ...extractCcirReferences(blockedItem),
        ...classifications.flatMap(entry => [
          ...extractCcirReferences(entry.item),
          ...extractCcirReferences(entry.action)
        ])
      ]);
      for (const reference of references) {
        if (!catalog.has(reference)) {
          findings.push(finding("error", "UNKNOWN_CCIR_REFERENCE", `blocked[${index}] references ${reference}, which is not in the mission CCIR list.`));
        }
      }
    }
  });

  return findings;
}

function finding(severity, code, message) {
  return { severity, code, message };
}

function runSchemaValidator(filePath) {
  const validator = path.join(__dirname, "validator-cli-prototype", "validate.js");
  const result = spawnSync("node", [validator, filePath, "sitrep"], {
    cwd: __dirname,
    encoding: "utf8"
  });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    parsed = {
      valid: false,
      issues: [finding("critical", "VALIDATOR_OUTPUT_ERROR", error.message)]
    };
  }
  return { status: result.status, parsed };
}

function main() {
  const [, , sitrepArg, ccirListArg] = process.argv;
  if (!sitrepArg) {
    console.error("Usage: node ccir-linter.js <sitrep.json> [mission-ccir-list.json]");
    console.error("Without a mission CCIR list, only structural classification checks run; CCIR id references are not verified.");
    process.exit(2);
  }

  const sitrepPath = path.resolve(process.cwd(), sitrepArg);
  const sitrep = JSON.parse(fs.readFileSync(sitrepPath, "utf8"));
  const schemaResult = runSchemaValidator(sitrepPath);
  const findings = (schemaResult.parsed.issues || []).map(issue => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message
  }));

  let knownCcirCatalog = null;
  if (ccirListArg) {
    const ccirListPath = path.resolve(process.cwd(), ccirListArg);
    const ccirList = JSON.parse(fs.readFileSync(ccirListPath, "utf8"));
    try {
      knownCcirCatalog = collectCcirCatalog(ccirList);
    } catch (error) {
      findings.push(finding("critical", "BAD_CCIR_LIST", error.message));
    }
    if (!knownCcirCatalog) {
      findings.push(finding("critical", "BAD_CCIR_LIST", "Mission CCIR list must be an array of CCIR entries or an object with a ccir array."));
    }
  }

  findings.push(...lintSitrep(sitrep, knownCcirCatalog));
  const failed = findings.some(item => item.severity === "error" || item.severity === "critical");
  const output = {
    valid: !failed,
    finding_count: findings.length,
    findings
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { lintSitrep, collectCcirCatalog, collectCcirIds };
