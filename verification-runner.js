#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  parseArtifactWriteFlags,
  resolveRepository,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");

const PROHIBITED_EXECUTABLES = new Set(["bash", "cmd", "env", "fish", "powershell", "pwsh", "sh", "sudo", "zsh"]);
const READ_ONLY_GIT_COMMANDS = new Set(["diff", "grep", "log", "ls-files", "rev-parse", "show", "status"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function gitBuffer(repositoryPath, args, required = true) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: null, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    if (!required) return Buffer.alloc(0);
    throw new Error(Buffer.from(result.stderr || result.stdout || "Git command failed.").toString("utf8").trim());
  }
  return Buffer.from(result.stdout || Buffer.alloc(0));
}

function computeRepositoryState(repositoryPath) {
  const repository = resolveRepository(repositoryPath);
  const hash = crypto.createHash("sha256");
  const status = gitBuffer(repository.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const unstaged = gitBuffer(repository.root, ["diff", "--binary", "--"]);
  const staged = gitBuffer(repository.root, ["diff", "--binary", "--cached", "--"]);
  const untracked = gitBuffer(repository.root, ["ls-files", "--others", "--exclude-standard", "-z"])
    .toString("utf8").split("\0").filter(Boolean).sort();

  hash.update(repository.head_commit);
  hash.update("\0status\0");
  hash.update(status);
  hash.update("\0unstaged\0");
  hash.update(unstaged);
  hash.update("\0staged\0");
  hash.update(staged);
  for (const relative of untracked) {
    const candidate = path.resolve(repository.root, relative);
    if (candidate !== repository.root && !candidate.startsWith(`${repository.root}${path.sep}`)) {
      throw new Error(`Untracked path escapes repository: ${relative}`);
    }
    const stat = fs.lstatSync(candidate);
    hash.update(`\0untracked\0${relative}\0${stat.mode}\0`);
    if (stat.isFile()) hash.update(fs.readFileSync(candidate));
  }

  return {
    head_commit: repository.head_commit,
    worktree_fingerprint: hash.digest("hex")
  };
}

function safeWorkingDirectory(repositoryRoot, relative) {
  if (typeof relative !== "string" || relative.length === 0 || path.isAbsolute(relative) || /^[A-Za-z]:[\\/]/.test(relative)) {
    throw new Error("Verification working_directory must be repository-relative.");
  }
  if (relative.split(/[\\/]+/).includes("..")) throw new Error("Verification working_directory cannot traverse upward.");
  const resolved = path.resolve(repositoryRoot, relative);
  if (resolved !== repositoryRoot && !resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error("Verification working_directory resolves outside the repository.");
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Verification working_directory does not exist: ${relative}`);
  }
  const real = fs.realpathSync(resolved);
  if (real !== repositoryRoot && !real.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error("Verification working_directory escapes the repository through a symlink.");
  }
  return real;
}

function resolveExecutable(executable) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(executable)) throw new Error("Verification executable must be a basename.");
  const candidates = String(process.env.PATH || "").split(path.delimiter)
    .filter(Boolean).map(folder => path.join(folder, executable));
  for (const candidate of candidates) {
    try {
      const real = fs.realpathSync(candidate);
      const stat = fs.statSync(real);
      if (stat.isFile() && (stat.mode & 0o111) !== 0) return real;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "EACCES") throw error;
    }
  }
  throw new Error(`Verification executable not found on PATH: ${executable}`);
}

function enforceCommandPolicy(check, campaign, repositoryRoot) {
  const policy = campaign.verification_policy || {};
  if (!(policy.allowed_executables || []).includes(check.executable)) {
    throw new Error(`Executable is outside campaign verification policy: ${check.executable}`);
  }
  if (PROHIBITED_EXECUTABLES.has(check.executable.toLowerCase())) {
    throw new Error(`Shell or privilege-wrapper execution is prohibited: ${check.executable}`);
  }
  if (check.timeout_ms > policy.max_timeout_ms_per_check) {
    throw new Error(`Check timeout exceeds campaign policy: ${check.id}`);
  }
  if (check.executable === "git" && !READ_ONLY_GIT_COMMANDS.has(check.args[0])) {
    throw new Error(`Git verification is restricted to read-only commands: ${check.id}`);
  }
  if (check.executable === "node") {
    const script = check.args[0];
    if (!script || script.startsWith("-") || path.isAbsolute(script) || !script.endsWith(".js") || script.split(/[\\/]+/).includes("..")) {
      throw new Error(`Node verification must name a repository-relative .js file as its first argument: ${check.id}`);
    }
    const scriptPath = path.resolve(safeWorkingDirectory(repositoryRoot, check.working_directory), script);
    if (scriptPath !== repositoryRoot && !scriptPath.startsWith(`${repositoryRoot}${path.sep}`)) {
      throw new Error(`Node verification script escapes the repository: ${check.id}`);
    }
    if (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile()) {
      throw new Error(`Node verification script does not exist: ${script}`);
    }
    const realScript = fs.realpathSync(scriptPath);
    if (realScript !== repositoryRoot && !realScript.startsWith(`${repositoryRoot}${path.sep}`)) {
      throw new Error(`Node verification script escapes the repository through a symlink: ${check.id}`);
    }
  }
}

function summarizeOutput(value, maxExcerptBytes = 2048) {
  const bytes = Buffer.from(value || Buffer.alloc(0));
  const excerptBytes = bytes.subarray(0, maxExcerptBytes);
  return {
    byte_size: bytes.length,
    sha256: sha256(bytes),
    excerpt: excerptBytes.toString("utf8"),
    truncated: bytes.length > excerptBytes.length
  };
}

function receiptDigest(receipt) {
  const value = JSON.parse(JSON.stringify(receipt));
  delete value.receipt_sha256;
  return sha256(jsonBytes(value));
}

function executeVerification(campaign, plan, repositoryPath) {
  const campaignValidation = validatePayload(campaign, "self-improvement-campaign");
  const planValidation = validatePayload(plan, "verification-plan");
  const failures = [...campaignValidation.issues, ...planValidation.issues]
    .filter(item => item.severity === "error" || item.severity === "critical");
  if (failures.length > 0) throw new Error(`Verification input validation failed: ${[...new Set(failures.map(item => item.code))].join(", ")}`);

  const repository = resolveRepository(repositoryPath);
  if (campaign.repository_binding.repository_key !== repository.key ||
      campaign.repository_binding.identity_fingerprint !== repository.identity_fingerprint ||
      plan.repository_binding.repository_key !== repository.key ||
      plan.repository_binding.identity_fingerprint !== repository.identity_fingerprint) {
    throw new Error("Verification repository binding does not match the runtime repository.");
  }
  if (plan.campaign_id !== campaign.id || plan.mission_id !== campaign.mission_id) {
    throw new Error("Verification plan does not belong to the campaign mission.");
  }
  if (plan.checks.length > campaign.verification_policy.max_checks_per_plan) {
    throw new Error("Verification plan exceeds the campaign check budget.");
  }

  const stateBefore = computeRepositoryState(repository.root);
  if (stateBefore.head_commit !== plan.expected_repository_state.head_commit ||
      stateBefore.worktree_fingerprint !== plan.expected_repository_state.worktree_fingerprint) {
    throw new Error("Verification plan repository state is stale or does not match the candidate.");
  }

  const startedAt = new Date().toISOString();
  const checkResults = [];
  let stateChanged = false;
  const maxOutput = campaign.verification_policy.max_output_bytes_per_stream;

  for (const check of plan.checks) {
    const workingDirectory = safeWorkingDirectory(repository.root, check.working_directory);
    const resolvedExecutable = resolveExecutable(check.executable);
    const executableHash = sha256(fs.readFileSync(resolvedExecutable));
    if (stateChanged) {
      checkResults.push({
        id: check.id,
        purpose: check.purpose,
        argv: [check.executable, ...check.args],
        working_directory: check.working_directory,
        resolved_executable: resolvedExecutable,
        executable_sha256: executableHash,
        expected_exit_codes: check.expected_exit_codes,
        exit_code: -1,
        signal: "",
        status: "blocked",
        duration_ms: 0,
        stdout: summarizeOutput(Buffer.alloc(0)),
        stderr: summarizeOutput(Buffer.from("Blocked because an earlier verification command changed repository state."))
      });
      continue;
    }

    try {
      enforceCommandPolicy(check, campaign, repository.root);
    } catch (error) {
      checkResults.push({
        id: check.id,
        purpose: check.purpose,
        argv: [check.executable, ...check.args],
        working_directory: check.working_directory,
        resolved_executable: resolvedExecutable,
        executable_sha256: executableHash,
        expected_exit_codes: check.expected_exit_codes,
        exit_code: -1,
        signal: "",
        status: "blocked",
        duration_ms: 0,
        stdout: summarizeOutput(Buffer.alloc(0)),
        stderr: summarizeOutput(Buffer.from(error.message))
      });
      continue;
    }

    const start = process.hrtime.bigint();
    const result = spawnSync(resolvedExecutable, check.args, {
      cwd: workingDirectory,
      encoding: null,
      shell: false,
      timeout: check.timeout_ms,
      maxBuffer: maxOutput,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }
    });
    const durationMs = Number((process.hrtime.bigint() - start) / 1000000n);
    const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
    const outputExceeded = Boolean(result.error && result.error.code === "ENOBUFS");
    const exitCode = Number.isInteger(result.status) ? result.status : -1;
    let status = timedOut ? "timed_out" : outputExceeded ? "blocked" : check.expected_exit_codes.includes(exitCode) ? "passed" : "failed";
    const stateAfterCheck = computeRepositoryState(repository.root);
    stateChanged = stateAfterCheck.head_commit !== stateBefore.head_commit ||
      stateAfterCheck.worktree_fingerprint !== stateBefore.worktree_fingerprint;
    if (stateChanged) status = "failed";

    checkResults.push({
      id: check.id,
      purpose: check.purpose,
      argv: [check.executable, ...check.args],
      working_directory: check.working_directory,
      resolved_executable: resolvedExecutable,
      executable_sha256: executableHash,
      expected_exit_codes: check.expected_exit_codes,
      exit_code: exitCode,
      signal: result.signal || "",
      status,
      duration_ms: durationMs,
      stdout: summarizeOutput(result.stdout),
      stderr: summarizeOutput(result.stderr || (result.error ? Buffer.from(result.error.message) : Buffer.alloc(0)))
    });
  }

  const stateAfter = computeRepositoryState(repository.root);
  const unchanged = stateAfter.head_commit === stateBefore.head_commit &&
    stateAfter.worktree_fingerprint === stateBefore.worktree_fingerprint;
  const allPassed = checkResults.every(item => item.status === "passed");
  const anyBlocked = checkResults.some(item => item.status === "blocked");
  const environmentView = {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    LANG: process.env.LANG || "",
    LC_ALL: process.env.LC_ALL || "",
    CI: process.env.CI || ""
  };
  const receipt = {
    schema_version: "0.1",
    type: "VerificationReceipt",
    id: `VR-${String(plan.id).replace(/^[A-Z]+-/, "")}`,
    plan_id: plan.id,
    plan_sha256: sha256(jsonBytes(plan)),
    campaign_id: campaign.id,
    mission_id: campaign.mission_id,
    cycle_number: plan.cycle_number,
    candidate_id: plan.candidate_id,
    candidate_revision: plan.candidate_revision,
    repository_binding: {
      repository_key: repository.key,
      identity_fingerprint: repository.identity_fingerprint
    },
    repository_state_before: stateBefore,
    repository_state_after: stateAfter,
    repository_state_unchanged: unchanged,
    runner: {
      name: "cannae-verification-runner",
      version: "0.1",
      node_version: process.version,
      platform: process.platform,
      architecture: process.arch,
      shell_used: false,
      environment_sha256: sha256(jsonBytes(environmentView))
    },
    checks: checkResults,
    overall_status: allPassed && unchanged ? "passed" : anyBlocked ? "blocked" : "failed",
    started_at: startedAt,
    finished_at: new Date().toISOString()
  };
  receipt.receipt_sha256 = receiptDigest(receipt);
  return receipt;
}

function parseArgs(argv) {
  const positional = [];
  const artifactArgs = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      artifactArgs.push(argv[index]);
      if (["--repository", "--artifact-root"].includes(argv[index])) {
        index += 1;
        if (index >= argv.length) throw new Error(`${artifactArgs.at(-1)} requires a value.`);
        artifactArgs.push(argv[index]);
      }
    } else {
      positional.push(argv[index]);
    }
  }
  return { positional, artifactOptions: parseArtifactWriteFlags(artifactArgs) };
}

function main() {
  try {
    const { positional, artifactOptions } = parseArgs(process.argv.slice(2));
    if (positional.length !== 2 || !artifactOptions.repositoryPath) {
      throw new Error("Usage: node verification-runner.js <campaign.json> <plan.json> --repository <repo> [--write-artifact [--artifact-root <dir>] [--overwrite-artifact]]");
    }
    const campaign = JSON.parse(fs.readFileSync(path.resolve(positional[0]), "utf8"));
    const plan = JSON.parse(fs.readFileSync(path.resolve(positional[1]), "utf8"));
    const receipt = executeVerification(campaign, plan, artifactOptions.repositoryPath);
    const receiptValidation = validatePayload(receipt, "verification-receipt");
    const failures = receiptValidation.issues.filter(item => item.severity === "error" || item.severity === "critical");
    if (failures.length > 0) throw new Error(`Generated receipt failed validation: ${[...new Set(failures.map(item => item.code))].join(", ")}`);

    if (artifactOptions.writeArtifact) {
      const common = {
        repositoryPath: artifactOptions.repositoryPath,
        artifactRoot: artifactOptions.artifactRoot,
        missionId: campaign.mission_id,
        waveId: `C${plan.cycle_number}`,
        overwrite: artifactOptions.overwriteArtifact
      };
      const planWrite = writeRepositoryArtifact({ ...common, kind: "verification-plans", artifactId: plan.id, payload: plan, createdAt: plan.created_at });
      const receiptWrite = writeRepositoryArtifact({ ...common, kind: "verification-receipts", artifactId: receipt.id, payload: receipt, createdAt: receipt.finished_at });
      console.error(`Artifact written: ${planWrite.relative_path}`);
      console.error(`Artifact written: ${receiptWrite.relative_path}`);
    }
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    process.exit(receipt.overall_status === "passed" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = {
  computeRepositoryState,
  enforceCommandPolicy,
  executeVerification,
  receiptDigest,
  resolveExecutable,
  safeWorkingDirectory,
  summarizeOutput
};
