#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { coverageReport, doctrineIndexAudit } = require("./source-map-linter");
const { REGISTRY_PATH, navigationAudit, renderNavigation, span } = require("./source-map-navigation");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-source-map-"));
  const output = "docs/example-doctrine.md";
  const readmeIndex = `[Example](${output})\n`;
  const doctrineIndex = `\`${output}\`\n`;

  try {
    write(root, "docs/military-operating-deep-research-queue.md", [
      "<!-- doctrine-index:start -->",
      "- `example-doctrine.md`: fixture",
      "<!-- doctrine-index:end -->",
      ""
    ].join("\n"));
    write(root, output, "# Example Doctrine\n");
    write(root, "README.md", readmeIndex);
    write(root, "docs/source-map.md", doctrineIndex);
    write(root, "docs/research-compendium.md", doctrineIndex);

    const valid = doctrineIndexAudit(root);
    assert(valid.findings.length === 0, "fully indexed doctrine should pass");

    write(root, "docs/research-compendium.md", "missing\n");
    const unindexed = doctrineIndexAudit(root);
    assert(unindexed.findings.some(item =>
      item.code === "DOCTRINE_OUTPUT_NOT_INDEXED" &&
      item.path === output &&
      item.index === "docs/research-compendium.md"),
    "missing compendium index should fail");

    fs.unlinkSync(path.join(root, output));
    const missing = doctrineIndexAudit(root);
    assert(missing.findings.some(item =>
      item.code === "DOCTRINE_OUTPUT_MISSING" && item.path === output),
    "missing doctrine output should fail");

    write(root, "docs/military-operating-deep-research-queue.md", [
      "<!-- doctrine-index:start -->",
      "- `../outside.md`: traversal fixture",
      "<!-- doctrine-index:end -->",
      ""
    ].join("\n"));
    const traversal = doctrineIndexAudit(root);
    assert(traversal.findings.some(item => item.code === "DOCTRINE_INDEX_PATH_INVALID"),
      "traversal doctrine path should fail");

    const before = new Date().toISOString().slice(0, 10);
    const report = coverageReport();
    const after = new Date().toISOString().slice(0, 10);
    assert([before, after].includes(report.as_of), "coverage snapshot must use the actual UTC audit date");
    assert(report.covered_hosts.some(item => item.host === "ts.sdk.modelcontextprotocol.io" &&
      item.files.includes("docs/method-control-channel.md")), "the official SDK source must be checked, not silently ignored");

    const navigationCases = runNavigationFixtures();
    const orientationCases = runOrientationFixtures();
    const total = 6 + navigationCases + orientationCases;
    process.stdout.write(`PASS source-map doctrine/index/navigation fixtures (${total}/${total})\n`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runOrientationFixtures() {
  const read = file => fs.readFileSync(path.join(__dirname, file), "utf8");
  const readme = read("README.md");
  const active = span(readme, "### Active Skill Status", "### Retained Guarded Prototypes");
  assert(active.includes("G4 has bounded maintenance acceptance; G1/G2/G3/G5 remain partial.") &&
    active.includes("docs/skill-first-product-scope.md#active-objectives") &&
    active.includes("docs/completion-backlog.md#active-core-work"),
  "Maturity must orient readers to active acceptance and the current queue.");
  const deferred = span(readme, "### Deferred Platform Work", "## Limitations And Safety Notes");
  assert(deferred.includes("not the active") && deferred.includes("new USER scope") &&
    deferred.includes("docs/skill-first-product-scope.md#deferred-platform-work") &&
    deferred.includes("automatic hallucination elimination are not"),
  "Deferred platform inventory and non-claims must not become skill acceptance.");
  const cases = read("docs/document-authoring-case-study.md");
  for (const [heading, anchor] of [
    ["## Native Optional Reading And Source Appraisal", "native-optional-reading-and-source-appraisal"],
    ["## OR72 Snapshot And Locator Correction", "or72-snapshot-and-locator-correction"],
    ["## Cross-Client Recovery Handoff", "cross-client-recovery-handoff"],
    ["## Role And Format Reading Correction", "role-and-format-reading-correction"],
    ["## Declared Routing Reference Integrity", "declared-routing-reference-integrity"],
    ["## Current Authoring Families", "current-authoring-families"],
    ["## Artifact Family State Audit", "artifact-family-state-audit"],
    ["## Mapped Replanning And Compressed Reports", "mapped-replanning-and-compressed-reports"],
    ["## Source-Bound Review And Logistics Reading", "source-bound-review-and-logistics-reading"]
  ]) {
    assert(cases.split("\n").filter(line => line === heading).length === 1, "Case anchor must have one actual target.");
    for (const file of ["README.md", "docs/source-map.md", "docs/research-compendium.md", "docs/military-operating-deep-research-queue.md"]) {
      const target = `${file === "README.md" ? "docs/" : ""}document-authoring-case-study.md#${anchor}`;
      assert(read(file).includes(`](${target})`), `${file} lost its exact case pointer.`);
    }
  }
  const lesson = "Check unregistered maturity/roadmap prose as well as the opening scope notice.\n" +
    "Separate active acceptance gaps from retained implementation and deferred work.\n" +
    "After a durable lesson within an existing document, link its exact case and\n" +
    "limits from the source map and compendium; unchanged filenames do not mean\n" +
    "unchanged knowledge. Prefer concise pointers over duplicating the case log,\n" +
    "preserve historical bytes and keep private project evidence out of public indexes.";
  for (const provider of ["codex-skills", ".claude/skills"]) {
    assert(read(`${provider}/controls-doctrine-operator/references/self-improvement-loop.md`).includes(lesson),
      `${provider} lost narrative and same-file lesson maintenance guidance.`);
  }
  assert(read("docs/knowledge-management-sop.md").includes("File-index coverage alone will not catch that gap."));
  for (const provider of ["codex-skills", ".claude/skills"]) {
    assert(read(`${provider}/controls-doctrine-operator/references/self-improvement-loop.md`)
      .includes("Check the reverse mapping too: every declared routing reference must remain an"));
    const routing = read(`${provider}/controls-doctrine-operator/references/document-routing.md`);
    assert(routing.includes("unavailable_declared_document_count") &&
      routing.includes("On `ROUTING_DOCUMENT_UNAVAILABLE`") &&
      routing.includes("An unrelated unselected reference can fail the whole-corpus audit without"));
  }
  const backlog = read("docs/completion-backlog.md");
  const current = span(backlog, "## Active Core Work", "## Evidence History");
  const history = backlog.slice(backlog.indexOf("## Evidence History"));
  const oldQueue = span(history, "This is the current queue, based on the 2026-11-12 requirement audit. The", "### Superseded Requirement Table (2026-11-14)");
  const oldAudit = span(history, "The rows derive from the five USER objectives, not from the number of files or", "### Earlier Checkpoints");
  assert(sha256(oldQueue) === "ada611245dcf968bbd8ec9fc88dc4fcef38bf84c3395146171a9c3d0c2e28c96" &&
    sha256(oldAudit) === "6bf66b3d38617cc435d2d25f96c1f029ecd131c9754460492684729d1f4c1762",
  "Superseded queue and audit must retain their exact historical bodies.");
  const requirements = text => text.split("\n").filter(line => /^\| A\d\d \|/.test(line))
    .map(line => line.split("|").slice(1, 3).map(value => value.trim()));
  const currentRequirements = requirements(current);
  assert(currentRequirements.length === 21 && new Set(currentRequirements.map(row => row[0])).size === 21 &&
    JSON.stringify(currentRequirements) === JSON.stringify(requirements(oldAudit)),
  "Reconciliation must not silently add, drop or redefine the audited USER requirements.");
  assert(!current.includes("This is the current queue, based on the 2026-11-12") &&
    current.includes("### Audit Basis And Disposition Changes"),
  "Superseded instructions must be historical, with current disposition changes explained.");
  for (const file of ["README.md", "docs/source-map.md", "docs/research-compendium.md", "docs/military-operating-deep-research-queue.md"]) {
    const target = `${file === "README.md" ? "docs/" : ""}completion-backlog.md#audit-basis-and-disposition-changes`;
    assert(read(file).includes(`](${target})`), `${file} lost the current audit basis.`);
  }
  const auditLesson = provider => span(read(`${provider}/controls-doctrine-operator/references/self-improvement-loop.md`),
    "Audit the requirement separately from individual artifact decisions. An approved",
    "Compare evidence in its recorded representation. A native final message, a");
  assert(auditLesson("codex-skills") === auditLesson(".claude/skills") &&
    auditLesson("codex-skills").includes("not every prose update needs a model rerun."),
  "Both skills must retain the same requirement/artifact audit procedure.");
  const rows = current.split("\n").filter(line => /^\| A\d\d \|/.test(line));
  const verified = rows.filter(line => line.split("|")[3].trim().startsWith("Verified (bounded)."));
  const partial = rows.filter(line => line.split("|")[3].trim().startsWith("Partial."));
  assert(verified.length === 16 && partial.length === 4 &&
    verified.some(line => line.startsWith("| A14 |")) &&
    verified.some(line => line.startsWith("| A16 |")) &&
    partial.map(line => line.split("|")[1].trim()).join(",") === "A01,A05,A10,A20" &&
    active.includes("Sixteen required rows") && active.includes("four remain partial") &&
    current.includes("not 80% product completion") && current.includes("**A14, partial -> verified (bounded):**") &&
    current.includes("**A16, partial -> verified (bounded):**"),
  "Family-state evidence must update the inventory without closing native quality gaps or inventing a product percentage.");
  // These assertions protect declared orientation and links, not semantic truth.
  return 12;
}

function runNavigationFixtures() {
  let count = 0;
  const cases = [];
  const candidate = "# Candidates\n\n## Version One\nOld draft.\n\n## Version Two\nProposed only.\n\n## Appraisal\nLocal check only.\n\n## History\nNext: review the old draft.\n";
  const base = {
    version: 1,
    documents: [{
      id: "example", label: "Example V2",
      candidate: { file: "docs/candidate.md", start: "## Version Two", end: "## Appraisal", sha256: sha256(span(candidate, "## Version Two", "## Appraisal")) },
      disposition: { status: "proposed", review: "local-source-delta-checked", adoption: "not-adopted" },
      basis: [{ file: "docs/candidate.md", start: "## Appraisal", end: "## History", sha256: sha256(span(candidate, "## Appraisal", "## History")) }],
      references: [{ file: "README.md", start: "## Current", end: "## History" },
        { file: "docs/index.md", start: "## Current", end: "## History" }]
    }]
  };
  const fixture = (name, mutation, code, cli) => cases.push({ name, mutation, code, cli });
  const update = (root, file, change) => write(root, file, change(fs.readFileSync(path.join(root, file), "utf8")));
  const manifest = (root, change) => update(root, REGISTRY_PATH, text => {
    const data = JSON.parse(text); change(data); return JSON.stringify(data);
  });
  fixture("current bindings pass", () => {});
  fixture("actual linter CLI accepts consistent navigation", () => {}, null, []);
  fixture("actual linter CLI rejects an existing stale target", root => update(root, "README.md", text => text.replace("#version-two", "#version-one")), "DOCUMENT_NAVIGATION_STATE_MISMATCH", []);
  fixture("report mode also rejects stale state", root => update(root, "README.md", text => text.replace("not-adopted", "adopted")), "DOCUMENT_NAVIGATION_STATE_MISMATCH", ["--report"]);
  fixture("valid existing old anchor is stale", root => update(root, "README.md", text => text.replace("#version-two", "#version-one")), "DOCUMENT_NAVIGATION_STATE_MISMATCH");
  fixture("review status cannot differ", root => update(root, "README.md", text => text.replace("local-source-delta-checked", "native-reviewed")), "DOCUMENT_NAVIGATION_STATE_MISMATCH");
  fixture("adoption status cannot differ", root => update(root, "README.md", text => text.replace("not-adopted", "adopted")), "DOCUMENT_NAVIGATION_STATE_MISMATCH");
  fixture("candidate body drift", root => update(root, "docs/candidate.md", text => text.replace("Proposed only.", "Approved.")), "DOCUMENT_NAVIGATION_SOURCE_CHANGED");
  fixture("appraisal body drift", root => update(root, "docs/candidate.md", text => text.replace("Local check only.", "Accepted.")), "DOCUMENT_NAVIGATION_SOURCE_CHANGED");
  fixture("whitespace changes are not trimmed", root => update(root, "docs/candidate.md", text => text.replace("Proposed only.\n", "Proposed only. \n")), "DOCUMENT_NAVIGATION_SOURCE_CHANGED");
  fixture("missing candidate source", root => fs.unlinkSync(path.join(root, "docs/candidate.md")), "DOCUMENT_NAVIGATION_SOURCE_INVALID");
  fixture("missing boundary", root => update(root, "docs/candidate.md", text => text.replace("## Appraisal", "## Removed")), "DOCUMENT_NAVIGATION_SOURCE_INVALID");
  fixture("duplicate boundary", root => update(root, "docs/candidate.md", text => text + "\n## Version Two\n"), "DOCUMENT_NAVIGATION_SOURCE_INVALID");
  fixture("case-equivalent fragment is ambiguous", root => update(root, "docs/candidate.md", text => text.replace("# Candidates\n", "# Candidates\n## VERSION TWO\n")), "DOCUMENT_NAVIGATION_ANCHOR_AMBIGUOUS");
  fixture("punctuation-equivalent fragment is ambiguous", root => update(root, "docs/candidate.md", text => text.replace("# Candidates\n", "# Candidates\n## Version *Two*\n")), "DOCUMENT_NAVIGATION_ANCHOR_AMBIGUOUS");
  fixture("fenced sample heading is not a fragment", root => update(root, "docs/candidate.md", text => text + "\n```markdown\n## Version Two\n```\n"));
  fixture("reversed boundaries", root => manifest(root, data => {
    const c = data.documents[0].candidate; [c.start, c.end] = [c.end, c.start];
  }), "DOCUMENT_NAVIGATION_SOURCE_INVALID");
  fixture("higher unrelated version does not become current", root => update(root, "docs/candidate.md", text => text + "\n## Version Ninety Nine\nDifferent exercise.\n"));
  fixture("historical verdict and next action are allowed", root => update(root, "README.md", text => text + "Historical candidate: [Example V1](docs/candidate.md#version-one).\nNext: review V1.\n"));
  fixture("current pointer hidden in history", root => update(root, "README.md", text => text.replace("## Current\n", "## Current\n## History\n").replace("\n## History\nRetained", "\nRetained")), "DOCUMENT_NAVIGATION_OUTSIDE_CURRENT_SECTION");
  fixture("missing current marker", root => update(root, "README.md", text => text.replace("<!-- current-document:example:start -->", "")), "DOCUMENT_NAVIGATION_REFERENCE_INVALID");
  fixture("duplicate current marker", root => update(root, "README.md", text => text + "\n" + renderNavigation(base.documents[0], "README.md")), "DOCUMENT_NAVIGATION_REFERENCE_INVALID");
  fixture("fenced pointer is not visible current navigation", root => update(root, "README.md", text => text.replace("<!-- current-document:example:start -->", "```markdown\n<!-- current-document:example:start -->").replace("<!-- current-document:example:end -->", "<!-- current-document:example:end -->\n```")), "DOCUMENT_NAVIGATION_REFERENCE_INVALID");
  fixture("same-file relative link", root => {
    const doc = structuredClone(base.documents[0]);
    doc.references.push({ file: "docs/candidate.md", start: "# Candidates", end: "## Version One" });
    manifest(root, data => { data.documents = [doc]; });
    update(root, "docs/candidate.md", text => text.replace("# Candidates\n", `# Candidates\n${renderNavigation(doc, "docs/candidate.md")}\n`));
  });
  fixture("missing registry", root => fs.unlinkSync(path.join(root, REGISTRY_PATH)), "DOCUMENT_NAVIGATION_REGISTRY_INVALID");
  fixture("malformed registry", root => write(root, REGISTRY_PATH, "{"), "DOCUMENT_NAVIGATION_REGISTRY_INVALID");
  fixture("empty registry", root => manifest(root, data => { data.documents = []; }), "DOCUMENT_NAVIGATION_REGISTRY_INVALID");
  fixture("unknown registry property", root => manifest(root, data => { data.approved = true; }), "DOCUMENT_NAVIGATION_REGISTRY_INVALID");
  fixture("contradictory adopted candidate", root => manifest(root, data => { data.documents[0].disposition.status = "adopted"; }), "DOCUMENT_NAVIGATION_REGISTRY_INVALID");
  fixture("proposal is not adoption", root => manifest(root, data => { data.documents[0].disposition.adoption = "adopted"; }), "DOCUMENT_NAVIGATION_REGISTRY_INVALID");
  fixture("traversal rejected", root => manifest(root, data => { data.documents[0].candidate.file = "docs/../README.md"; }), "DOCUMENT_NAVIGATION_REGISTRY_INVALID");
  fixture("absolute source rejected", root => manifest(root, data => { data.documents[0].candidate.file = "/etc/passwd"; }), "DOCUMENT_NAVIGATION_REGISTRY_INVALID");
  fixture("duplicate ID", root => manifest(root, data => { data.documents.push(structuredClone(data.documents[0])); }), "DOCUMENT_NAVIGATION_DUPLICATE_ID");
  fixture("duplicate reference", root => manifest(root, data => { data.documents[0].references.push(data.documents[0].references[0]); }), "DOCUMENT_NAVIGATION_DUPLICATE_REFERENCE");
  fixture("dropped index registration", root => manifest(root, data => { data.documents[0].references.pop(); }), "DOCUMENT_NAVIGATION_UNREGISTERED_MARKER");
  fixture("unknown marker", root => update(root, "docs/index.md", text => text + "\n<!-- current-document:unknown:start -->\n"), "DOCUMENT_NAVIGATION_UNREGISTERED_MARKER");
  fixture("new unregistered corpus index", root => write(root, "docs/unregistered.md", renderNavigation(base.documents[0], "docs/unregistered.md")), "DOCUMENT_NAVIGATION_UNREGISTERED_MARKER");
  fixture("intermediate symlink rejected", root => {
    fs.renameSync(path.join(root, "docs"), path.join(root, "actual-docs"));
    fs.symlinkSync("actual-docs", path.join(root, "docs"));
  }, "DOCUMENT_NAVIGATION_REGISTRY_INVALID");
  fixture("candidate symlink rejected", root => {
    fs.renameSync(path.join(root, "docs/candidate.md"), path.join(root, "docs/original.md"));
    fs.symlinkSync("original.md", path.join(root, "docs/candidate.md"));
  }, "DOCUMENT_NAVIGATION_SOURCE_INVALID");
  fixture("separate document identities remain independent", root => {
    const second = structuredClone(base.documents[0]);
    second.id = "other"; second.label = "Other V1";
    second.candidate.start = "## Version One"; second.candidate.end = "## Version Two";
    second.candidate.sha256 = sha256(span(candidate, second.candidate.start, second.candidate.end));
    manifest(root, data => { data.documents.push(second); });
    for (const ref of second.references) update(root, ref.file, text => text.replace("## Current\n", `## Current\n${renderNavigation(second, ref.file)}\n`));
  });
  for (const test of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-navigation-"));
    try {
      write(root, REGISTRY_PATH, JSON.stringify(base));
      write(root, "docs/candidate.md", candidate);
      write(root, "docs/military-operating-deep-research-queue.md", "<!-- doctrine-index:start -->\n- `candidate.md`\n<!-- doctrine-index:end -->\n");
      write(root, "docs/source-map.md", "`docs/candidate.md`\n");
      write(root, "docs/research-compendium.md", "`docs/candidate.md`\n");
      for (const ref of base.documents[0].references) write(root, ref.file,
        `# Fixture\n## Current\n${renderNavigation(base.documents[0], ref.file)}\n## History\nRetained next action.\n` +
        (ref.file === "README.md" ? "[Corpus document](docs/candidate.md)\n" : ""));
      test.mutation(root);
      const result = navigationAudit(root);
      assert(test.code ? result.findings.some(item => item.code === test.code) : result.findings.length === 0,
        `${test.name}: ${JSON.stringify(result.findings)}`);
      if (test.cli) {
        const child = spawnSync(process.execPath, [path.join(__dirname, "source-map-linter.js"), ...test.cli], { cwd: root, encoding: "utf8" });
        assert(child.status === (test.code ? 1 : 0), `${test.name}: CLI exit ${child.status}: ${child.stderr}`);
        const response = JSON.parse(child.stdout);
        assert(test.code ? !response.valid && response.findings.some(item => item.code === test.code) : response.valid,
          `${test.name}: CLI result lost navigation findings`);
      }
      count++;
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  const actual = navigationAudit();
  assert(actual.findings.length === 0 && actual.documents.includes("support-sop") && actual.references === 6,
    `actual maintained navigation: ${JSON.stringify(actual.findings)}`);
  return count + 1;
}

try {
  run();
} catch (error) {
  process.stderr.write(`FAIL ${error.message}\n`);
  process.exit(1);
}
