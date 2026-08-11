#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SECRET_PATTERNS = [
  {
    code: "PRIVATE_KEY_MATERIAL",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    message: "Value contains private key material."
  },
  {
    code: "CREDENTIAL_ASSIGNMENT",
    pattern: /\b(secret|token|credential|password|passwd|api[_-]?key|private[_ -]?key)\b\s*[:=]\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s"',;}\]]+)/i,
    message: "Value assigns a secret, token, credential, password, or private key."
  },
  {
    code: "BEARER_CREDENTIAL",
    pattern: /\bbearer\s+[a-z0-9._~+/=-]{12,}/i,
    message: "Value carries a bearer credential."
  },
  {
    code: "TOKEN_LIKE_VALUE",
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/,
    message: "Value matches a known credential token shape."
  }
];

const RESTRICTED_TERM_PATTERNS = [
  {
    code: "RESTRICTED_TERM",
    pattern: /\bdo[_ -]?not[_ -]?disclose\b/i,
    message: "Value carries an explicit non-disclosure marking."
  },
  {
    code: "RESTRICTED_TERM",
    pattern: /\beefi\b/i,
    message: "Value carries an EEFI marking and must not pass unreviewed."
  }
];

const CREDENTIAL_FIELD_NAME = /^(password|passwd|secret|token|credential|api[_-]?key|private[_ -]?key)$/i;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function finding(severity, code, fieldPath, value, message, extra = {}) {
  return {
    severity,
    code,
    path: fieldPath,
    value_sha256: sha256(value),
    message,
    ...extra
  };
}

function loadEefiPatterns(patternList) {
  return (patternList || []).map(entry => ({
    code: "EEFI_PATTERN_MATCH",
    eefi_id: entry.eefi_id,
    pattern: new RegExp(entry.pattern, "i"),
    message: "Value matches a registered EEFI pattern."
  }));
}

function lintString(fieldPath, key, value, eefiPatterns, findings) {
  if (CREDENTIAL_FIELD_NAME.test(key) && value.length > 0) {
    findings.push(finding("error", "CREDENTIAL_FIELD_NAME", fieldPath, value, "Field name indicates a credential value that must not appear in the payload."));
  }
  for (const rule of [...SECRET_PATTERNS, ...RESTRICTED_TERM_PATTERNS]) {
    if (rule.pattern.test(value)) {
      findings.push(finding("error", rule.code, fieldPath, value, rule.message));
    }
  }
  for (const rule of eefiPatterns) {
    if (rule.pattern.test(value)) {
      findings.push(finding("error", rule.code, fieldPath, value, rule.message, { eefi_id: rule.eefi_id }));
    }
  }
}

function walk(node, fieldPath, key, eefiPatterns, findings) {
  if (typeof node === "string") {
    lintString(fieldPath, key, node, eefiPatterns, findings);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, `${fieldPath}[${index}]`, key, eefiPatterns, findings));
    return;
  }
  if (node && typeof node === "object") {
    for (const [childKey, childValue] of Object.entries(node)) {
      walk(childValue, fieldPath ? `${fieldPath}.${childKey}` : childKey, childKey, eefiPatterns, findings);
    }
  }
}

function lintPayload(payload, patternList) {
  const findings = [];
  walk(payload, "", "", loadEefiPatterns(patternList), findings);
  return findings;
}

function main() {
  const [, , payloadArg, patternsArg] = process.argv;
  if (!payloadArg) {
    console.error("Usage: node opsec-linter.js <payload.json> [eefi-patterns.json]");
    process.exit(2);
  }

  const payload = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), payloadArg), "utf8"));
  const patternList = patternsArg
    ? JSON.parse(fs.readFileSync(path.resolve(process.cwd(), patternsArg), "utf8"))
    : [];
  const findings = lintPayload(payload, patternList);
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

module.exports = { lintPayload };
