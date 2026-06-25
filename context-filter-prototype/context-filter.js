#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function filterItem(item, target) {
  const isFinal = target === "FINAL_OUTPUT";
  const allowed = (item.allowed_roles || []).includes(target);

  if (item.eefi) {
    return packet(item, "denied", "EEFI must not be delivered through context packet.");
  }

  if (isFinal) {
    if (!item.release_to_final) {
      return packet(item, "denied", "Item is not approved for final output.");
    }
    if (item.classification === "public") {
      return packet(item, "raw", "Public item approved for final output.", item.raw_value);
    }
    if (item.classification === "internal") {
      return packet(item, "summary", "Internal item may be summarized for final output.", item.summary);
    }
    if (item.classification === "sensitive") {
      return packet(item, "redacted", "Sensitive item requires redaction for final output.", item.summary);
    }
    return packet(item, "denied", "Restricted item cannot be released to final output.");
  }

  if (item.classification === "public") {
    return packet(item, "raw", "Public item may be delivered.", item.raw_value);
  }

  if (!allowed) {
    if (item.classification === "internal") {
      return packet(item, "summary", "Role is not explicitly allowed; internal item downgraded to summary.", item.summary);
    }
    return packet(item, "denied", "Role is not allowed for this classification.");
  }

  if (item.classification === "internal") {
    return packet(item, "raw", "Role is allowed for internal item.", item.raw_value);
  }

  if (item.classification === "sensitive") {
    return packet(item, "summary", "Sensitive item delivered as summary only.", item.summary);
  }

  if (item.classification === "restricted") {
    return packet(item, "reference_only", "Restricted item delivered by reference only.", item.source);
  }

  return packet(item, "denied", "No delivery rule matched.");
}

function packet(item, deliveryMode, rationale, value) {
  return {
    item_id: item.id,
    classification: item.classification,
    eefi: item.eefi,
    delivery_mode: deliveryMode,
    value: value || (deliveryMode === "reference_only" ? item.source : item.summary),
    source: item.source,
    rationale
  };
}

function filterContext(items, target) {
  return {
    target,
    delivered_at: new Date(0).toISOString(),
    items: items.map(item => filterItem(item, target))
  };
}

function main() {
  const [, , itemsArg, targetArg] = process.argv;
  if (!itemsArg || !targetArg) {
    console.error("Usage: node context-filter-prototype/context-filter.js <context-items.json> <ROLE|FINAL_OUTPUT>");
    process.exit(2);
  }

  const itemsPath = path.resolve(process.cwd(), itemsArg);
  const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  process.stdout.write(`${JSON.stringify(filterContext(items, targetArg), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { filterContext };
