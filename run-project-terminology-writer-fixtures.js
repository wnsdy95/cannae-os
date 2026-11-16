#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync, spawn } = require("node:child_process"), { createHash } = require("node:crypto");
const terms = require("./project-terminology"), changes = require("./project-terminology-change"), writer = require("./project-terminology-writer");
const { validatePayload } = require("./validator-cli-prototype/validate");
const requestSample = require("./sample-payloads/valid-project-terminology-change-request.json");
const reviewSample = require("./sample-payloads/valid-project-terminology-change-review.json");
const ROOT = __dirname, env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CANNAE_OS_HOME"));
const hash = value => createHash("sha256").update(value).digest("hex"), encode = value => JSON.stringify(value, null, 2) + "\n";
const copy = value => structuredClone(value);
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };

function worker(args) {
  const [root, proposal, proposalHash, reviewHash, stage] = args;
  const open = fs.openSync, writeFile = fs.writeFileSync, rename = fs.renameSync, names = new Map();
  fs.openSync = function(file, ...rest) { const fd = open.call(fs, file, ...rest); names.set(fd, file); return fd; };
  fs.writeFileSync = function(file, ...rest) {
    const result = writeFile.call(fs, file, ...rest);
    if (names.get(file) === path.join(root, writer.LOCK)) {
      if (stage === "after-lock") process.exit(77);
      if (stage === "hold") {
        writeFile.call(fs, path.join(root, "writer-ready"), "ready");
        const deadline = Date.now() + 15000;
        while (!fs.existsSync(path.join(root, "writer-continue"))) {
          if (Date.now() > deadline) process.exit(78);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        }
      }
    }
    return result;
  };
  fs.renameSync = function(from, to) {
    if (to === path.join(root, terms.RELATIVE) && stage === "before-rename") process.exit(77);
    const result = rename.call(fs, from, to);
    if (to === path.join(root, terms.RELATIVE) && stage === "after-rename") process.exit(77);
    return result;
  };
  try { console.log(JSON.stringify(writer.adopt(root, proposal, proposalHash, reviewHash))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

async function main() {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-term-writer-")));
  const children = [];
  let passed = 0, sequence = 0;
  const check = async (name, run) => { await run(); passed++; console.log("PASS " + name); };
  const ledger = (root, entries = []) => {
    write(path.join(root, terms.RELATIVE), encode({ schema_version: "0.1", type: "ProjectTerminology", repository: terms.identity(root), entries }));
    return terms.read(root);
  };
  function project(seed = false) {
    const root = path.join(temporary, "project-" + ++sequence); fs.mkdirSync(root);
    assert.equal(spawnSync("git", ["init", "-q", root], { env }).status, 0);
    write(path.join(root, ".gitignore"), ".cannae/\n");
    const request = copy(requestSample); write(path.join(root, request.source.path), request.change.basis.excerpt + "\n");
    if (seed) request.expected_ledger_sha256 = ledger(root).digest;
    return { root, request };
  }
  function prepare(p, mutate = () => {}) {
    const result = changes.prepare(p.request, p.root);
    const review = { ...copy(reviewSample), proposal_sha256: result.proposal_sha256,
      source_assessment: { candidate: "candidate_only", confirmed: "explicit_user_definition", retired: "explicit_user_retirement" }[p.request.change.status],
      created_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() };
    mutate(review);
    const reviewFile = path.join(p.root, path.posix.dirname(result.proposal_path), "review.json"), bytes = encode(review);
    write(reviewFile, bytes);
    return { root: p.root, ...result, review, reviewFile, reviewHash: hash(bytes) };
  }
  function observe(p, statement) {
    p.request.change.basis.excerpt = statement;
    p.request.source = { ...p.request.source, sha256: hash(statement + "\n"), start_byte: 0, end_byte: Buffer.byteLength(statement) };
    write(path.join(p.root, p.request.source.path), statement + "\n");
  }
  const adopt = b => writer.adopt(b.root, b.proposal_path, b.proposal_sha256, b.reviewHash);
  const inspect = (root, r) => writer.inspectAdoption(root, r.transaction_path, r.transaction_sha256);
  const childArgs = (b, stage) => [__filename, "worker", b.root, b.proposal_path, b.proposal_sha256, b.reviewHash, stage];
  function crash(b, stage) {
    const result = spawnSync(process.execPath, childArgs(b, stage), { env, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 77, result.stderr);
    const lock = writer.inspectWriter(b.root); assert.equal(lock.process_state, "exited"); return lock;
  }
  const recover = (root, lock) => writer.recover(root, lock.lock_id, lock.transaction_sha256);
  function cli(script, args, status = 0) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: temporary, env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, status, result.stderr);
    if (status) { assert.equal(result.stdout, ""); assert(!result.stderr.includes(temporary)); return result.stderr; }
    return JSON.parse(result.stdout);
  }
  try {
    await check("a proposal without an exact review cannot write the ledger or acquire a lock", () => {
      const p = project(), proposal = changes.prepare(p.request, p.root);
      assert.throws(() => writer.adopt(p.root, proposal.proposal_path, proposal.proposal_sha256, "0".repeat(64)), /TERMINOLOGY_MISSING/);
      assert(!fs.existsSync(path.join(p.root, terms.RELATIVE))); assert(!fs.existsSync(path.join(p.root, writer.LOCK)));
    });
    await check("an exact review cannot adopt a newly exposed or force-tracked proposal", () => {
      for (const state of ["ignore-exception", "tracked"]) {
        const p = project(), b = prepare(p), proposal = path.join(p.root, b.proposal_path);
        const before = fs.readFileSync(proposal), review = fs.readFileSync(b.reviewFile);
        if (state === "ignore-exception") fs.writeFileSync(path.join(p.root, ".gitignore"),
          ".cannae/knowledge/changes/**\n!.cannae/knowledge/changes/*/\n!.cannae/knowledge/changes/*/proposal.json\n");
        else assert.equal(spawnSync("git", ["-C", p.root, "add", "-f", "--", b.proposal_path], { env }).status, 0);
        assert.throws(() => adopt(b), /TERMINOLOGY_CHANGE_OUTPUT_NOT_IGNORED/);
        assert.deepEqual(fs.readFileSync(proposal), before); assert.deepEqual(fs.readFileSync(b.reviewFile), review);
        for (const relative of [terms.RELATIVE, writer.LOCK, ".cannae/knowledge/transactions"])
          assert(!fs.existsSync(path.join(p.root, relative)));
      }
    });
    await check("an ignored but tracked canonical ledger cannot receive a reviewed append", () => {
      const p = project(true), b = prepare(p), file = path.join(p.root, terms.RELATIVE), before = fs.readFileSync(file);
      assert.equal(spawnSync("git", ["-C", p.root, "add", "-f", "--", terms.RELATIVE], { env }).status, 0);
      assert.throws(() => adopt(b), /TERMINOLOGY_WRITER_OUTPUT_NOT_IGNORED/);
      assert.deepEqual(fs.readFileSync(file), before);
      assert(!fs.existsSync(path.join(p.root, writer.LOCK)));
      assert(!fs.existsSync(path.join(p.root, ".cannae/knowledge/transactions")));
    });
    await check("reviewed first append preserves snapshots and creates no execution or disclosure authority", () => {
      const p = project(), b = prepare(p), before = fs.readFileSync(path.join(p.root, b.proposal_path));
      const result = adopt(b), state = terms.read(p.root);
      assert.equal(result.status, "reviewed_append_completed"); assert.equal(result.canonical_ledger_written, true);
      for (const key of ["authorization_verified", "source_authenticity_verified", "policy_adoption_authorized", "transfer_authorized", "can_execute"]) assert.equal(result[key], false);
      assert.equal(state.value.entries.length, 1); assert.equal(state.value.entries[0].status, "confirmed");
      assert.deepEqual(state.value.entries[0].allowed_roles, []); assert.deepEqual(state.value.entries[0].allowed_departments, []);
      assert.equal(fs.statSync(path.join(p.root, terms.RELATIVE)).mode & 0o777, 0o600);
      assert.deepEqual(fs.readFileSync(path.join(p.root, b.proposal_path)), before);
      assert.equal(inspect(p.root, result).current_state, "matches_after");
      assert(!fs.existsSync(path.join(p.root, writer.LOCK)));
      const record = JSON.parse(fs.readFileSync(path.join(p.root, result.transaction_path)));
      assert.equal(validatePayload(record, "project-terminology-change-transaction").can_execute, false);
      assert.equal(fs.readFileSync(path.join(p.root, path.dirname(result.transaction_path), "before.json"), "utf8"), "null\n");
      assert.throws(() => adopt(b), /BASE_STALE/); assert.equal(terms.read(p.root).value.entries.length, 1);
    });
    await check("subsequent unrelated appends preserve earlier evidence and report extends-after", () => {
      const p = project(), first = adopt(prepare(p));
      const saved = fs.readFileSync(path.join(p.root, first.transaction_path));
      p.request.expected_ledger_sha256 = terms.read(p.root).digest;
      p.request.change.concept_id = "CONCEPT-OTHER"; p.request.change.term = "Other";
      p.request.change.aliases = []; p.request.change.definition = "Monthly reporting cadence.";
      observe(p, "In this project, Other means monthly reporting cadence.");
      const second = adopt(prepare(p));
      assert.equal(inspect(p.root, first).current_state, "extends_after");
      assert.equal(inspect(p.root, second).current_state, "matches_after");
      assert.deepEqual(fs.readFileSync(path.join(p.root, first.transaction_path)), saved);
    });
    await check("candidate correction retains confirmed meaning scope access and append-only lineage", () => {
      const p = project(), original = changes.compile(p.request, p.root).entry;
      original.allowed_roles = ["S3"]; original.allowed_departments = ["sales"];
      p.request.expected_ledger_sha256 = ledger(p.root, [original]).digest;
      p.request.change.status = "candidate"; p.request.change.basis.kind = "ai_inference";
      p.request.change.definition = "A tentative smaller company segment.";
      const result = adopt(prepare(p)), state = terms.read(p.root).value;
      assert.deepEqual(state.entries[0], original); assert.equal(state.entries[1].version, 2);
      assert.equal(state.entries[1].supersedes, original.id); assert.deepEqual(state.entries[1].allowed_roles, ["S3"]);
      const selection = terms.projectSelection(p.root, { actor: "ai", role: "S3", department: "sales", domain: "sales", terms: ["ICP"] });
      assert.equal(selection.confirmed[0].version, 1); assert.equal(selection.candidates[0].version, 2);
      assert.equal(terms.projectSelection(p.root, { actor: "ai", role: "S6", department: "sales", domain: "sales", terms: ["ICP"] }).confirmed.length, 0);
      assert.equal(inspect(p.root, result).canonical_entry_present, true);
      p.request.expected_ledger_sha256 = terms.read(p.root).digest;
      p.request.change.status = "confirmed";
      assert.throws(() => prepare(p), /CONTRACT_INVALID/);
    });
    await check("explicit confirmed correction and retirement require matching recorded assessments", () => {
      const p = project(); adopt(prepare(p));
      p.request.expected_ledger_sha256 = terms.read(p.root).digest;
      p.request.change.basis.kind = "user_confirmation"; p.request.change.definition = "A corrected company-level fit definition.";
      observe(p, "For this project, ICP now means a corrected company-level fit definition.");
      assert.throws(() => adopt(prepare(p, r => { r.source_assessment = "candidate_only"; })), /ASSESSMENT_MISMATCH/);
      adopt(prepare(p));
      p.request.expected_ledger_sha256 = terms.read(p.root).digest; p.request.change.status = "retired";
      observe(p, "Retire the sales definition of ICP; do not use it as the current definition.");
      adopt(prepare(p));
      const selection = terms.projectSelection(p.root, { actor: "user", domain: "sales", terms: ["ICP"] });
      assert.equal(selection.confirmed.length, 0); assert.equal(selection.retired[0].version, 3);
      assert.equal(terms.read(p.root).value.entries.length, 3);
    });
    await check("deferred rejected future expired altered and credential-shaped reviews cannot append", () => {
      for (const [mutate, error] of [
        [r => { r.decision = "defer"; }, /REVIEW_NOT_APPEND/], [r => { r.decision = "reject"; }, /REVIEW_NOT_APPEND/],
        [r => { r.created_at = new Date(Date.now() + 10000).toISOString(); }, /REVIEW_NOT_CURRENT/],
        [r => { r.created_at = new Date(Date.now() - 3000).toISOString(); r.expires_at = new Date(Date.now() - 1000).toISOString(); }, /REVIEW_NOT_CURRENT/],
        [r => { r.authorization_verified = true; }, /CONTRACT_INVALID/],
        [r => { r.proposal_sha256 = "0".repeat(64); }, /REVIEW_PROPOSAL_MISMATCH/],
        [r => { r.review_reference = 'password="synthetic-hunter2"'; }, /CONTRACT_INVALID/]
      ]) { const p = project(); assert.throws(() => adopt(prepare(p, mutate)), error); assert(!fs.existsSync(path.join(p.root, terms.RELATIVE))); }
    });
    await check("changed review source or base stops adoption without rewriting pending records", () => {
      for (const kind of ["review", "source", "ledger"]) {
        const p = project(), b = prepare(p), proposal = fs.readFileSync(path.join(p.root, b.proposal_path));
        if (kind === "review") fs.appendFileSync(b.reviewFile, "\n");
        if (kind === "source") fs.appendFileSync(path.join(p.root, p.request.source.path), "Changed.\n");
        if (kind === "ledger") ledger(p.root);
        assert.throws(() => adopt(b), /DIGEST_MISMATCH|SOURCE_STALE|BASE_STALE/);
        assert.deepEqual(fs.readFileSync(path.join(p.root, b.proposal_path)), proposal);
        assert(!fs.existsSync(path.join(p.root, writer.LOCK)));
      }
    });
    await check("a used exact review cannot append twice even after an external base restoration", () => {
      const p = project(true), base = fs.readFileSync(path.join(p.root, terms.RELATIVE)), b = prepare(p); adopt(b);
      fs.writeFileSync(path.join(p.root, terms.RELATIVE), base);
      assert.throws(() => adopt(b), /REVIEW_ALREADY_USED/);
      assert.deepEqual(fs.readFileSync(path.join(p.root, terms.RELATIVE)), base);
      assert(!fs.existsSync(path.join(p.root, writer.LOCK)));
    });
    await check("transaction snapshots remain root-bound and reject copied or replaced repositories", () => {
      const p = project(), result = adopt(prepare(p)), other = project();
      const parent = path.dirname(result.transaction_path);
      fs.cpSync(path.join(p.root, parent), path.join(other.root, parent), { recursive: true });
      assert.throws(() => inspect(other.root, result), /TRANSACTION_ORIGIN_MISMATCH/);
      fs.renameSync(path.join(p.root, ".git"), path.join(p.root, "old-git"));
      assert.equal(spawnSync("git", ["init", "-q", p.root], { env }).status, 0);
      assert.throws(() => inspect(p.root, result), /TRANSACTION_ORIGIN_MISMATCH/);
    });
    await check("changed snapshots or canonical history are refused rather than silently reconstructed", () => {
      const p = project(), result = adopt(prepare(p)), parent = path.join(p.root, path.dirname(result.transaction_path));
      for (const name of ["proposal.json", "review.json", "before.json", "after.json"]) {
        const file = path.join(parent, name), original = fs.readFileSync(file); fs.appendFileSync(file, "\n");
        try { assert.throws(() => inspect(p.root, result), /DIGEST_MISMATCH/); } finally { fs.writeFileSync(file, original); }
      }
      const state = terms.read(p.root).value; state.entries[0].definition = "Unreviewed replacement.";
      write(path.join(p.root, terms.RELATIVE), encode(state));
      assert.throws(() => inspect(p.root, result), /LEDGER_DIVERGED/);
    });
    await check("all exact outputs must be ignored and unsafe input leaves are rejected", () => {
      const p = project(), b = prepare(p);
      fs.writeFileSync(path.join(p.root, ".gitignore"), ".cannae/*\n!.cannae/knowledge/\n.cannae/knowledge/*\n!.cannae/knowledge/terminology.json\n");
      assert.throws(() => adopt(b), /OUTPUT_NOT_IGNORED/); assert(!fs.existsSync(path.join(p.root, writer.LOCK)));
      fs.writeFileSync(path.join(p.root, ".gitignore"), ".cannae/\n");
      const original = b.reviewFile + ".original"; fs.renameSync(b.reviewFile, original);
      fs.symlinkSync(original, b.reviewFile); assert.throws(() => adopt(b), /TERMINOLOGY_PATH_INVALID/);
      fs.unlinkSync(b.reviewFile); fs.linkSync(original, b.reviewFile); assert.throws(() => adopt(b), /TERMINOLOGY_FILE_INVALID/);
    });
    await check("ownership substitution retains both primary and cleanup errors without clearing another lock", () => {
      const p = project(), b = prepare(p), original = fs.writeFileSync, open = fs.openSync, names = new Map();
      fs.openSync = function(file, ...args) { const fd = open.call(fs, file, ...args); names.set(fd, file); return fd; };
      fs.writeFileSync = function(file, ...args) {
        const result = original.call(fs, file, ...args);
        if (typeof names.get(file) === "string" && names.get(file).endsWith("/before.json")) {
          const owner = JSON.parse(fs.readFileSync(path.join(p.root, writer.LOCK)));
          if (owner.pid === process.pid) { owner.pid = process.pid + 100000; original.call(fs, path.join(p.root, writer.LOCK), encode(owner)); }
        }
        return result;
      };
      try { assert.throws(() => adopt(b), error => error instanceof AggregateError && error.errors.length === 2); }
      finally { fs.writeFileSync = original; fs.openSync = open; }
      assert(fs.existsSync(path.join(p.root, writer.LOCK))); assert(!fs.existsSync(path.join(p.root, terms.RELATIVE)));
    });
    await check("source review expiry and exact ignore rules are rechecked before the canonical write", () => {
      for (const kind of ["source", "review", "expiry", "ignore", "tracked"]) {
        const p = project(true), b = prepare(p), before = fs.readFileSync(path.join(p.root, terms.RELATIVE));
        const writeFile = fs.writeFileSync, open = fs.openSync, now = Date.now, names = new Map();
        fs.openSync = function(file, ...args) { const fd = open.call(fs, file, ...args); names.set(fd, file); return fd; };
        fs.writeFileSync = function(file, ...args) {
          const result = writeFile.call(fs, file, ...args);
          if (typeof names.get(file) === "string" && /\/\.terminology-[a-f0-9-]+\.tmp$/.test(names.get(file))) {
            if (kind === "expiry") Date.now = () => now() + 7200000;
            else if (kind === "ignore") writeFile.call(fs, path.join(p.root, ".gitignore"),
              ".cannae/*\n!.cannae/knowledge/\n.cannae/knowledge/*\n!.cannae/knowledge/terminology.json\n");
            else if (kind === "tracked") assert.equal(spawnSync("git", ["-C", p.root, "add", "-f", "--", terms.RELATIVE], { env }).status, 0);
            else fs.appendFileSync(kind === "source" ? path.join(p.root, p.request.source.path) : b.reviewFile, "\n");
          }
          return result;
        };
        try { assert.throws(() => adopt(b), kind === "tracked" ? /TERMINOLOGY_WRITER_OUTPUT_NOT_IGNORED/ :
          /SOURCE_STALE|DIGEST_MISMATCH|REVIEW_NOT_CURRENT|OUTPUT_NOT_IGNORED/); }
        finally { fs.writeFileSync = writeFile; fs.openSync = open; Date.now = now; }
        assert.deepEqual(fs.readFileSync(path.join(p.root, terms.RELATIVE)), before);
        assert(!fs.existsSync(path.join(p.root, writer.LOCK)));
      }
    });
    await check("two live processes cannot share the writer lock or recover an active writer", async () => {
      const p = project(true), b = prepare(p);
      p.request.change.status = "candidate"; p.request.change.basis.kind = "ai_inference";
      const pending = prepare(p), pendingBytes = fs.readFileSync(path.join(p.root, pending.proposal_path));
      const child = spawn(process.execPath, childArgs(b, "hold"), { env, stdio: ["ignore", "pipe", "pipe"] });
      children.push(child); let stdout = "", stderr = "";
      child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
      const done = new Promise(resolve => child.on("exit", (code, signal) => resolve({ code, signal })));
      const deadline = Date.now() + 10000;
      while (!fs.existsSync(path.join(p.root, "writer-ready"))) {
        if (Date.now() > deadline || child.exitCode !== null) throw new Error("Writer did not reach hold: " + stderr);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      const lock = writer.inspectWriter(p.root); assert.equal(lock.process_state, "running");
      assert.throws(() => recover(p.root, lock), /WRITER_NOT_EXITED/);
      const competing = spawnSync(process.execPath, childArgs(pending, "normal"), { env, encoding: "utf8", timeout: 10000 });
      assert.equal(competing.status, 1); assert(competing.stderr.includes("TERMINOLOGY_WRITER_BUSY"));
      write(path.join(p.root, "writer-continue"), "continue");
      assert.deepEqual(await done, { code: 0, signal: null }, stderr);
      assert.equal(JSON.parse(stdout).canonical_ledger_written, true); assert.equal(terms.read(p.root).value.entries.length, 1);
      assert.deepEqual(fs.readFileSync(path.join(p.root, pending.proposal_path)), pendingBytes);
      assert.throws(() => adopt(pending), /BASE_STALE/);
    });
    for (const seed of [false, true]) for (const stage of ["after-lock", "before-rename", "after-rename"]) await check(stage + "/" + seed + ": exited-writer recovery observes but never rewrites the ledger", () => {
      const p = project(seed), b = prepare(p), lock = crash(b, stage);
      const observed = () => fs.existsSync(path.join(p.root, terms.RELATIVE)) ? fs.readFileSync(path.join(p.root, terms.RELATIVE)) : null;
      const before = observed();
      assert.throws(() => writer.recover(p.root, "wrong", lock.transaction_sha256), /RECOVERY_BINDING_MISMATCH/);
      const result = recover(p.root, lock);
      assert.equal(result.current_state, stage === "after-lock" ? "incomplete_record_matches_before" : stage === "before-rename" ? "matches_before" : "matches_after");
      assert.equal(result.canonical_ledger_written, false); assert.deepEqual(observed(), before);
      assert(!fs.existsSync(path.join(p.root, writer.LOCK)));
      if (stage === "before-rename") assert.throws(() => adopt(b), /REVIEW_ALREADY_USED/);
      if (stage === "after-rename") { assert.throws(() => adopt(b), /BASE_STALE/); assert.equal(terms.read(p.root).value.entries.length, 1); }
    });
    await check("foreign-process identity and divergent interrupted state cannot be cleared", () => {
      const p = project(true), b = prepare(p), lock = crash(b, "after-rename"), file = path.join(p.root, writer.LOCK), bytes = fs.readFileSync(file);
      const owner = JSON.parse(bytes); owner.hostname += "-unverifiable"; fs.writeFileSync(file, encode(owner));
      assert.equal(writer.inspectWriter(p.root).process_state, "unverifiable"); assert.throws(() => recover(p.root, lock), /WRITER_NOT_EXITED/);
      fs.writeFileSync(file, bytes);
      const state = terms.read(p.root).value; state.entries[0].definition = "A divergent manual change.";
      write(path.join(p.root, terms.RELATIVE), encode(state));
      assert.throws(() => recover(p.root, lock), /LEDGER_DIVERGED/); assert(fs.existsSync(file));
    });
    await check("an expired review can be observed historically but cannot authorize another append", () => {
      const p = project(), b = prepare(p), result = adopt(b);
      b.review.expires_at = new Date(Date.now() - 1000).toISOString(); b.review.created_at = new Date(Date.now() - 5000).toISOString();
      fs.writeFileSync(b.reviewFile, encode(b.review));
      assert.equal(inspect(p.root, result).current_state, "matches_after");
      assert.throws(() => adopt(b), /BASE_STALE/);
    });
    await check("formatting-only canonical rewrites are not reported as a new appended revision", () => {
      const p = project(), result = adopt(prepare(p)), state = terms.read(p.root).value;
      fs.writeFileSync(path.join(p.root, terms.RELATIVE), JSON.stringify(state));
      const observed = inspect(p.root, result);
      assert.equal(observed.current_state, "after_content_reencoded"); assert.equal(observed.canonical_entry_present, true);
      assert.notEqual(observed.ledger_sha256, result.ledger_sha256);
    });
    await check("missing recovery evidence after publication holds the lock and does not roll back", () => {
      const p = project(true), b = prepare(p), lock = crash(b, "after-rename"), before = fs.readFileSync(path.join(p.root, terms.RELATIVE));
      fs.unlinkSync(path.join(p.root, path.dirname(lock.transaction_path), "after.json"));
      assert.throws(() => recover(p.root, lock), /TERMINOLOGY_MISSING/);
      assert(fs.existsSync(path.join(p.root, writer.LOCK))); assert.deepEqual(fs.readFileSync(path.join(p.root, terms.RELATIVE)), before);
    });
    await check("same-spelling scopes and overlapping confirmed definitions retain ordinary clarification rules", () => {
      const p = project(); adopt(prepare(p));
      p.request.expected_ledger_sha256 = terms.read(p.root).digest;
      p.request.change.concept_id = "CONCEPT-SUPPORT"; p.request.change.scope.domain = "support";
      p.request.change.definition = "The initial contact procedure.";
      observe(p, "In support, I use ICP to mean the initial contact procedure.");
      adopt(prepare(p));
      assert.equal(terms.projectSelection(p.root, { actor: "user", domain: "support", terms: ["ICP"] }).confirmed.length, 1);
      assert.equal(terms.projectSelection(p.root, { actor: "user", domain: "sales", terms: ["ICP"] }).confirmed.length, 1);
      p.request.expected_ledger_sha256 = terms.read(p.root).digest;
      p.request.change.concept_id = "CONCEPT-OVERLAP"; p.request.change.scope.domain = "sales";
      p.request.change.definition = "A competing company segmentation rule.";
      observe(p, "Keep an additional sales meaning of ICP: a competing company segmentation rule.");
      adopt(prepare(p));
      assert.equal(terms.projectSelection(p.root, { actor: "user", domain: "sales", terms: ["ICP"] }).status, "clarification_required");
    });
    await check("an unverifiable lock is held for manual appraisal and never stolen by elapsed time", () => {
      const p = project(), b = prepare(p); write(path.join(p.root, writer.LOCK), "{}\n");
      assert.throws(() => writer.inspectWriter(p.root), /LOCK_INVALID/);
      assert.throws(() => adopt(b), /BUSY/);
      assert.equal(fs.readFileSync(path.join(p.root, writer.LOCK), "utf8"), "{}\n");
    });
    await check("actual reviewed append invalidates an old handoff and only a fresh selection can be prepared", () => {
      const packets = require("./project-document-packet"), p = project(), entry = changes.compile(p.request, p.root).entry;
      assert.equal(spawnSync("git", ["-C", p.root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
        "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-qm", "fixture"], { env }).status, 0);
      entry.allowed_roles = ["S3"]; entry.allowed_departments = ["sales"];
      p.request.expected_ledger_sha256 = ledger(p.root, [entry]).digest;
      const request = copy(require("./sample-payloads/valid-project-document-packet-request.json"));
      request.task = "Draft a sales handoff from SRC-TERMS. Do not publish.";
      request.recipient.department = "sales";
      Object.assign(request.documents[0], { id: "SRC-TERMS", path: "review/terms.json", allowed_departments: ["sales"] });
      const refresh = () => {
        const selection = terms.projectSelection(p.root, { actor: "ai", role: "S3", department: "sales", domain: "sales", terms: ["ICP"] });
        const text = terms.renderSelection(selection); write(path.join(p.root, "review/terms.json"), text);
        request.documents[0].source_sha256 = hash(text);
        request.terminology_binding = { source_id: "SRC-TERMS", ledger_sha256: selection.ledger_sha256, domain: "sales", task: null,
          terms: ["ICP"], required_terms: ["ICP"] };
      };
      refresh(); const old = packets.prepare(request, p.root), oldBytes = fs.readFileSync(old.prompt_path);
      p.request.change.basis.kind = "user_confirmation"; p.request.change.definition = "The corrected company-level fit criteria.";
      observe(p, "ICP now means the corrected company-level fit criteria for this project.");
      adopt(prepare(p));
      assert.throws(() => packets.inspect(old.packet_path, old.packet_sha256, p.root), /PROJECT_PACKET_TERMINOLOGY_STALE/);
      assert.throws(() => packets.prepare(request, p.root), /PROJECT_PACKET_TERMINOLOGY_STALE/);
      refresh(); const fresh = packets.prepare(request, p.root);
      assert.equal(packets.inspect(fresh.packet_path, fresh.packet_sha256, p.root).status, "review_candidate_current");
      assert.deepEqual(fs.readFileSync(old.prompt_path), oldBytes);
      assert.equal(fresh.execution_authorized, false); assert.equal(fresh.receiver_acceptance_verified, false);
      assert.equal(terms.projectSelection(p.root, { actor: "ai", role: "S6", department: "sales", domain: "sales", terms: ["ICP"] }).unavailable_terms.length, 1);
    });
    for (const provider of ["codex-skills", ".claude/skills"]) await check(provider + ": linked and copied installed wrappers adopt and inspect without a model", () => {
      const source = path.join(ROOT, provider, "controls-doctrine-operator"), link = path.join(temporary, "bundle-" + ++sequence), copied = link + "-copy";
      fs.symlinkSync(source, link); fs.cpSync(source, copied, { recursive: true }); write(path.join(copied, ".cannae-os-root"), ROOT + "\n");
      for (const bundle of [link, copied]) {
        const p = project(), b = prepare(p), script = path.join(bundle, "scripts/project_terminology.js");
        const result = cli(script, ["adopt-change", "--repository", p.root, "--proposal", b.proposal_path,
          "--proposal-sha256", b.proposal_sha256, "--review-sha256", b.reviewHash]);
        const observed = cli(script, ["inspect-adoption", "--repository", p.root, "--transaction", result.transaction_path,
          "--transaction-sha256", result.transaction_sha256]);
        assert.equal(observed.current_state, "matches_after"); assert.equal(observed.can_execute, false);
        assert(cli(script, ["recover-adoption", "--repository", p.root, "--force", "true"], 1).includes("TERMINOLOGY_WRITER_USAGE"));
      }
    });
    console.log(JSON.stringify({ valid: true, fixtures: passed, native_model_calls: 0,
      cooperative_process_lock_tested: true, protected_host_guarantee: false, impact_tracking_tested: false }));
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolve => child.once("exit", resolve)); child.kill("SIGKILL"); await stopped;
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (process.argv[2] === "worker") worker(process.argv.slice(3));
else main().catch(error => { console.error(error); process.exitCode = 1; });
