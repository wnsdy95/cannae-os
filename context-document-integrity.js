const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const fail = code => { throw new Error(code); };
const excluded = new Set([".cache", ".cannae", ".cxt", ".git", ".idea", ".npm", ".nyc_output",
  ".pnpm-store", ".tmp", ".vscode", "build", "coverage", "dist", "node_modules", "temp", "tmp"]);

function canonicalDocumentPath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("~") &&
    !path.isAbsolute(value) && !/[\\:\x00-\x1f\x7f*?\[\]]/.test(value) &&
    value.split("/").every(part => part && part !== "." && part !== ".." && !excluded.has(part));
}

function documentBinding(root, relative) {
  if (!canonicalDocumentPath(relative)) fail("CONTEXT_DOCUMENT_PATH_INVALID");
  let fd;
  try {
    const base = fs.realpathSync(root);
    let current = base;
    for (const part of relative.split("/")) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) fail("CONTEXT_DOCUMENT_PATH_INVALID");
    }
    if (path.relative(base, fs.realpathSync(current)).split(path.sep).join("/") !== relative) {
      fail("CONTEXT_DOCUMENT_PATH_INVALID");
    }
    fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) fail("CONTEXT_DOCUMENT_PATH_INVALID");
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    const named = fs.lstatSync(current, { bigint: true });
    if (["dev", "ino", "size", "mtimeNs", "ctimeNs"].some(key => before[key] !== after[key] || after[key] !== named[key]) ||
        named.isSymbolicLink() || fs.realpathSync(current) !== current) fail("CONTEXT_DOCUMENT_CHANGED_DURING_READ");
    return { path: relative, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  } catch (error) {
    if (error.message.startsWith("CONTEXT_DOCUMENT_")) throw error;
    fail("CONTEXT_DOCUMENT_UNAVAILABLE");
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function expectedDocumentPaths(receipt, plan, agentId) {
  if (!receipt || receipt.wave_scope !== "agent" || receipt.agent_id !== agentId ||
      receipt.mission_id !== plan.mission_id || receipt.wave_id !== plan.wave_id ||
      receipt.capability_query !== plan.objective || !Array.isArray(receipt.recommended_documents)) {
    fail("CONTEXT_DOCUMENT_RECEIPT_MISMATCH");
  }
  const method = require("./method-deviation-contract");
  const assignment = method.methodAssignment(plan, agentId);
  return [...new Set([...receipt.recommended_documents.map(item => item.path),
    ...(assignment ? [method.METHOD_DOCUMENT] : []),
    ...(assignment?.broker ? [require("./method-control-contract").DOCUMENT] : [])])];
}

function assertContextDocuments(context, receipt, plan, doctrineRoot) {
  if (!context || context.mission_id !== plan.mission_id || context.wave_id !== plan.wave_id ||
      !plan.agents.some(agent => agent.agent_id === context.agent_id)) fail("CONTEXT_DOCUMENT_AGENT_MISMATCH");
  const expected = expectedDocumentPaths(receipt, plan, context.agent_id);
  const documents = context.documents;
  if (!Array.isArray(documents) || documents.length !== expected.length ||
      new Set(documents.map(item => item?.path)).size !== documents.length ||
      expected.some(relative => !documents.some(item => item?.path === relative))) {
    fail("CONTEXT_DOCUMENT_SET_MISMATCH");
  }
  // Inspect the full set before returning; this is integrity, not a content-delivery API.
  for (const document of documents) {
    if (documentBinding(doctrineRoot, document.path).sha256 !== document.sha256) fail("CONTEXT_DOCUMENT_DIGEST_MISMATCH");
  }
  return true;
}

module.exports = { canonicalDocumentPath, documentBinding, expectedDocumentPaths, assertContextDocuments };
