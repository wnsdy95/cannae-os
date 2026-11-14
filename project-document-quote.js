const { isDeepStrictEqual } = require("node:util");
const { sha256 } = require("./project-document-packet");
const fail = code => { throw new Error(code); };

function validateSelection(selection) {
  const expected = ["delivered_sha256", "quote", ...(Object.hasOwn(selection || {}, "context_lines") ? ["context_lines"] : [])].sort();
  if (!selection || typeof selection !== "object" || Array.isArray(selection) ||
      !isDeepStrictEqual(Object.keys(selection).sort(), expected) ||
      typeof selection.delivered_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(selection.delivered_sha256) ||
      typeof selection.quote !== "string" || !selection.quote.trim() || selection.quote.length > 4096 || !selection.quote.isWellFormed() ||
      (Object.hasOwn(selection, "context_lines") && (!Number.isSafeInteger(selection.context_lines) || selection.context_lines < 0 || selection.context_lines > 5))) {
    fail("PROJECT_QUOTE_ARGUMENTS_INVALID");
  }
}

// Exact delivered text only: no normalization, Markdown interpretation or semantic verdict.
function locateQuote(document, selection) {
  validateSelection(selection);
  if (!document || typeof document.id !== "string" || !document.id ||
      !["raw", "summary", "representation"].includes(document.delivery_mode) ||
      !/^[a-f0-9]{64}$/.test(document.source_sha256 || "") ||
      typeof document.content !== "string" || !document.content.isWellFormed() ||
      document.delivered_sha256 !== selection.delivered_sha256 || sha256(document.content) !== selection.delivered_sha256) {
    fail("PROJECT_QUOTE_SOURCE_MISMATCH");
  }
  const text = document.content, quote = selection.quote;
  const start = text.indexOf(quote);
  if (start < 0) fail("PROJECT_QUOTE_NOT_FOUND");
  if (text.indexOf(quote, start + 1) >= 0) fail("PROJECT_QUOTE_AMBIGUOUS");
  const end = start + quote.length;
  const startLine = text.slice(0, start).split("\n").length;
  const endLine = text.slice(0, end - 1).split("\n").length;
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  const radius = selection.context_lines ?? 2;
  const first = Math.max(0, startLine - 1 - radius), last = Math.min(lines.length, endLine + radius);
  return {
    source_id: document.id, delivery_mode: document.delivery_mode,
    source_sha256: document.source_sha256, delivered_sha256: document.delivered_sha256, quote, quote_sha256: sha256(quote),
    quote_range: { start_byte: Buffer.byteLength(text.slice(0, start)), end_byte_exclusive: Buffer.byteLength(text.slice(0, end)),
      start_line: startLine, end_line_inclusive: endLine },
    context: { start_line: first + 1, end_line_inclusive: last, text: lines.slice(first, last).join("") },
    occurrence_count: 1, location_verified: true, semantic_support_assessed: false
  };
}

module.exports = { locateQuote, validateSelection };
