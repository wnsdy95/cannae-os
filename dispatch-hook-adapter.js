#!/usr/bin/env node

const path = require("path");
const {
  admitToolRequest,
  completeToolRequest,
  sessionStart
} = require("./dispatch-runtime-controller");

function readStdin() {
  const chunks = [];
  let chunk;
  while ((chunk = process.stdin.read()) !== null) chunks.push(chunk);
  if (chunks.length > 0) return Buffer.concat(chunks).toString("utf8");
  return require("fs").readFileSync(0, "utf8");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--provider") {
      index += 1;
      if (index >= argv.length) throw new Error("--provider requires a value.");
      options.provider = argv[index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function providerName(value) {
  if (value === "codex") return "codex";
  if (value === "claude" || value === "claude_code") return "claude_code";
  throw new Error(`Unsupported hook provider: ${value || "missing"}`);
}

function envRequired(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for dispatch enforcement.`);
  return value;
}

function runtimeOptions(input) {
  const repository = path.resolve(process.env.CANNAE_REPOSITORY || input.cwd || process.cwd());
  const artifactRoot = path.resolve(process.env.CANNAE_ARTIFACT_ROOT || path.join(repository, ".cannae", "artifacts"));
  const cwd = path.resolve(input.cwd || repository);
  if (cwd !== repository && !cwd.startsWith(`${repository}${path.sep}`)) {
    throw new Error("Hook working directory is outside CANNAE_REPOSITORY.");
  }
  return { repository, artifactRoot };
}

function identity(provider, input) {
  return {
    missionId: envRequired("CANNAE_MISSION_ID"),
    waveId: envRequired("CANNAE_WAVE_ID"),
    agentId: envRequired("CANNAE_AGENT_ID"),
    provider,
    sessionId: String(input.session_id || ""),
    providerAgentId: String(input.agent_id || process.env.CANNAE_PROVIDER_AGENT_ID || "main")
  };
}

function denyPayload(provider, reasonCodes) {
  const reason = `Cannae dispatch denied: ${reasonCodes.join(", ")}`;
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    },
    systemMessage: provider === "codex" ? reason : undefined
  };
}

function postFailurePayload(provider, reasonCodes) {
  const reason = `Cannae post-tool checkpoint failed: ${reasonCodes.join(", ")}`;
  if (provider === "codex") {
    return {
      continue: false,
      stopReason: reason,
      systemMessage: reason
    };
  }
  return {
    decision: "block",
    reason
  };
}

function sessionPayload(provider, result) {
  const lease = result.lease_ref && result.lease_ref.artifact_id !== "none"
    ? result.lease_ref.artifact_id
    : result.prior_lease_ref && result.prior_lease_ref.artifact_id !== "none"
      ? result.prior_lease_ref.artifact_id
      : "none";
  const message = [
    `Cannae dispatch state: ${result.status}.`,
    `Lease: ${lease}.`,
    `Tool execution authorized: ${result.execution_authorized === true}.`,
    `Release authorized: false.`,
    `Reasons: ${(result.reason_codes || []).join(", ")}.`
  ].join(" ");
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: message
    },
    systemMessage: provider === "codex" && result.execution_authorized !== true ? message : undefined
  };
}

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => [key, clean(item)]));
}

function handle(provider, input) {
  const options = runtimeOptions(input);
  const actor = identity(provider, input);
  if (!actor.sessionId) throw new Error("Hook input does not include session_id.");

  if (input.hook_event_name === "PreToolUse") {
    const result = admitToolRequest(options, actor, input);
    return result.decision === "allow" ? null : denyPayload(provider, result.reason_codes || ["ADMISSION_FAILED"]);
  }
  if (input.hook_event_name === "PostToolUse" || input.hook_event_name === "PostToolUseFailure") {
    const result = completeToolRequest(options, actor, input);
    return result.status === "active" ? null : postFailurePayload(provider, result.reason_codes || [result.status]);
  }
  if (input.hook_event_name === "SessionStart") {
    return sessionPayload(provider, sessionStart(options, actor, input));
  }
  throw new Error(`Unsupported hook event: ${input.hook_event_name || "missing"}`);
}

function main() {
  let provider = "codex";
  let input = null;
  try {
    const parsed = parseArgs(process.argv.slice(2));
    provider = providerName(parsed.provider);
    input = JSON.parse(readStdin());
    const output = handle(provider, input);
    if (output) process.stdout.write(`${JSON.stringify(clean(output))}\n`);
  } catch (error) {
    const eventName = input && input.hook_event_name;
    if (eventName === "PreToolUse") {
      process.stdout.write(`${JSON.stringify(clean(denyPayload(provider, ["ADMISSION_CONTROLLER_ERROR", error.message])))}\n`);
    } else if (eventName === "PostToolUse" || eventName === "PostToolUseFailure") {
      process.stdout.write(`${JSON.stringify(clean(postFailurePayload(provider, ["CHECKPOINT_CONTROLLER_ERROR", error.message])))}\n`);
    } else if (eventName === "SessionStart") {
      process.stdout.write(`${JSON.stringify(clean(sessionPayload(provider, {
        status: "blocked",
        execution_authorized: false,
        reason_codes: ["SESSION_CONTROLLER_ERROR", error.message]
      })))}\n`);
    } else {
      console.error(`Cannae dispatch hook failed before event classification: ${error.message}`);
      process.exitCode = 2;
    }
  }
}

if (require.main === module) main();

module.exports = {
  clean,
  denyPayload,
  handle,
  postFailurePayload,
  sessionPayload
};
