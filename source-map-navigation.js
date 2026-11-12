const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const z = require("zod");

const REGISTRY_PATH = "docs/source-map-navigation.json";
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const relativeFile = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  .refine(value => value.split("/").every(part => part && part !== "." && part !== ".."));
const heading = z.string().regex(/^#{1,6} [^\r\n]+$/);
const locator = z.object({
  file: relativeFile,
  start: heading,
  end: heading,
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
const registrySchema = z.object({
  version: z.literal(1),
  documents: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    label: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 -]*$/),
    candidate: locator.extend({ start: z.string().regex(/^#{1,6} [A-Za-z0-9][A-Za-z0-9 -]*$/) }),
    disposition: z.object({
      status: z.enum(["draft", "proposed", "adopted", "superseded"]),
      review: z.enum(["unreviewed", "local-source-delta-checked", "native-reviewed"]),
      adoption: z.enum(["not-adopted", "adopted"])
    }).strict().refine(state => state.status !== "adopted" || state.adoption === "adopted")
      .refine(state => !["draft", "proposed"].includes(state.status) || state.adoption === "not-adopted"),
    basis: z.array(locator).min(1),
    references: z.array(z.object({ file: relativeFile, start: heading, end: heading }).strict()).min(1)
  }).strict()).min(1)
}).strict();

function readFile(root, relative) {
  let current = fs.realpathSync(root);
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Symlinked navigation input.");
  }
  if (!fs.statSync(current).isFile()) throw new Error("Navigation input is not a file.");
  return fs.readFileSync(current, "utf8");
}

// Exact whole-line spans, including the start and excluding the end. No trimming
// or newline normalization: a digest describes these bytes, not rendered Markdown.
function visibleLines(text) {
  const lines = text.split("\n");
  const visible = [];
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    visible.push(index);
  }
  return { lines, visible };
}

function lineRange(text, start, end) {
  const { lines, visible } = visibleLines(text);
  const starts = visible.filter(index => lines[index] === start);
  const ends = visible.filter(index => lines[index] === end);
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) {
    throw new Error("Missing, ambiguous or reversed navigation boundaries.");
  }
  return { lines, first: starts[0], last: ends[0] };
}

function headingSlug(line) {
  return line.replace(/^#+ /, "").replace(/\s+#+\s*$/, "").toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "").replaceAll(" ", "-");
}

function span(text, start, end) {
  const { lines, first, last } = lineRange(text, start, end);
  return lines.slice(first, last).join("\n") + "\n";
}

function renderNavigation(document, file) {
  const relative = path.posix.relative(path.posix.dirname(file), document.candidate.file);
  const target = (relative === path.posix.basename(file) ? "" : relative) + "#" +
    headingSlug(document.candidate.start);
  const state = document.disposition;
  return [
    `<!-- current-document:${document.id}:start -->`,
    `Current document: [${document.label}](${target}).`,
    `State: ${state.status}; review: ${state.review}; adoption: ${state.adoption}.`,
    `<!-- current-document:${document.id}:end -->`
  ].join("\n");
}

function navigationAudit(root = process.cwd()) {
  const findings = [];
  const add = (code, file, id) => findings.push({ severity: "error", code, path: file, ...(id && { document_id: id }) });
  let registry, raw;
  try {
    raw = readFile(root, REGISTRY_PATH);
    registry = registrySchema.parse(JSON.parse(raw));
  } catch {
    add("DOCUMENT_NAVIGATION_REGISTRY_INVALID", REGISTRY_PATH);
    return { documents: [], references: 0, findings };
  }
  const ids = new Set(), documents = [], referenceFiles = new Map();
  let references = 0;
  for (const document of registry.documents) {
    if (ids.has(document.id)) add("DOCUMENT_NAVIGATION_DUPLICATE_ID", REGISTRY_PATH, document.id);
    ids.add(document.id);
    documents.push(document.id);
    for (const source of [document.candidate, ...document.basis]) {
      try {
        const text = readFile(root, source.file);
        const body = span(text, source.start, source.end);
        if (sha256(body) !== source.sha256) add("DOCUMENT_NAVIGATION_SOURCE_CHANGED", source.file, document.id);
        if (source === document.candidate) {
          const { lines, visible } = visibleLines(text);
          const matches = visible.filter(index => /^#{1,6} /.test(lines[index]) &&
            headingSlug(lines[index]) === headingSlug(source.start));
          if (matches.length !== 1) add("DOCUMENT_NAVIGATION_ANCHOR_AMBIGUOUS", source.file, document.id);
        }
      } catch {
        add("DOCUMENT_NAVIGATION_SOURCE_INVALID", source.file, document.id);
      }
    }
    const seen = new Set();
    for (const reference of document.references) {
      references++;
      if (seen.has(reference.file)) add("DOCUMENT_NAVIGATION_DUPLICATE_REFERENCE", reference.file, document.id);
      seen.add(reference.file);
      try {
        const text = readFile(root, reference.file);
        if (!referenceFiles.has(reference.file)) referenceFiles.set(reference.file, { text, ids: new Set() });
        referenceFiles.get(reference.file).ids.add(document.id);
        const start = `<!-- current-document:${document.id}:start -->`;
        const end = `<!-- current-document:${document.id}:end -->`;
        const block = lineRange(text, start, end);
        const region = lineRange(text, reference.start, reference.end);
        const actual = span(text, start, end) + end;
        if (actual !== renderNavigation(document, reference.file)) {
          add("DOCUMENT_NAVIGATION_STATE_MISMATCH", reference.file, document.id);
        }
        if (block.first <= region.first || block.last >= region.last) {
          add("DOCUMENT_NAVIGATION_OUTSIDE_CURRENT_SECTION", reference.file, document.id);
        }
      } catch {
        add("DOCUMENT_NAVIGATION_REFERENCE_INVALID", reference.file, document.id);
      }
    }
  }
  // Inspect the public top-level corpus too, so dropping a reference from the
  // registry cannot silently disable the check while its current block survives.
  try {
    const corpus = ["README.md", ...fs.readdirSync(path.join(root, "docs"), { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith(".md"))
      .map(entry => `docs/${entry.name}`)];
    for (const file of corpus) {
      if (!referenceFiles.has(file)) referenceFiles.set(file, { text: readFile(root, file), ids: new Set() });
    }
  } catch {
    add("DOCUMENT_NAVIGATION_INVENTORY_INVALID", REGISTRY_PATH);
  }
  for (const [file, reference] of referenceFiles) {
    for (const match of reference.text.matchAll(/<!-- current-document:([^:\s]+):(start|end) -->/g)) {
      if (!reference.ids.has(match[1])) add("DOCUMENT_NAVIGATION_UNREGISTERED_MARKER", file, match[1]);
    }
  }
  return { registry: REGISTRY_PATH, registry_sha256: sha256(raw), documents, references, findings };
}

module.exports = { REGISTRY_PATH, navigationAudit, renderNavigation, span };
