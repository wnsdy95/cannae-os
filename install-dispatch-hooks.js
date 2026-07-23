#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const CODEX_COMMAND = 'node "$HOME/.codex/skills/controls-doctrine-operator/scripts/enforce_controls_dispatch.js" --provider codex';
const CLAUDE_COMMAND = 'node "$HOME/.claude/skills/controls-doctrine-operator/scripts/enforce_controls_dispatch.js" --provider claude_code';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hookGroups(provider, command) {
  const groups = {
    SessionStart: [{
      matcher: provider === "codex" ? "startup|resume|clear|compact" : "startup|resume|clear|compact|fork",
      hooks: [{ type: "command", command, timeout: 30 }]
    }],
    PreToolUse: [{
      matcher: "*",
      hooks: [{ type: "command", command, timeout: 30 }]
    }],
    PostToolUse: [{
      matcher: "*",
      hooks: [{ type: "command", command, timeout: 30 }]
    }]
  };
  if (provider === "claude_code") {
    groups.PostToolUseFailure = [{
      matcher: "*",
      hooks: [{ type: "command", command, timeout: 30 }]
    }];
  }
  return groups;
}

function sameHandler(left, right) {
  return left && right && left.type === right.type && left.command === right.command;
}

function mergeHookGroups(targetHooks, additions) {
  const merged = clone(targetHooks || {});
  for (const [event, groups] of Object.entries(additions)) {
    if (!Array.isArray(merged[event])) merged[event] = [];
    for (const group of groups) {
      const duplicate = merged[event].some(existing =>
        existing.matcher === group.matcher &&
        Array.isArray(existing.hooks) &&
        existing.hooks.some(handler => group.hooks.some(candidate => sameHandler(handler, candidate))));
      if (!duplicate) merged[event].push(clone(group));
    }
  }
  return merged;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function providerTarget(repository, provider) {
  if (provider === "codex") {
    return {
      path: path.join(repository, ".codex", "hooks.json"),
      command: CODEX_COMMAND,
      description: "Cannae dispatch admission hooks. Project trust is required."
    };
  }
  if (provider === "claude_code") {
    return {
      path: path.join(repository, ".claude", "settings.json"),
      command: CLAUDE_COMMAND
    };
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

function configureProvider(repository, provider, options = {}) {
  const target = providerTarget(repository, provider);
  const current = readJson(target.path);
  const next = {
    ...current,
    ...(target.description && !current.description ? { description: target.description } : {}),
    hooks: mergeHookGroups(current.hooks, hookGroups(provider, options.command || target.command))
  };
  if (!options.dryRun) atomicWriteJson(target.path, next);
  return {
    provider,
    path: target.path,
    changed: JSON.stringify(current) !== JSON.stringify(next),
    config: next
  };
}

function parseArgs(argv) {
  const options = { provider: "all", repository: process.cwd(), dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--provider" || arg === "--repository" || arg === "--command") {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2)] = argv[index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const repository = fs.realpathSync(path.resolve(options.repository));
    const providers = options.provider === "all" ? ["codex", "claude_code"] :
      [options.provider === "claude" ? "claude_code" : options.provider];
    const results = providers.map(provider => configureProvider(repository, provider, options));
    process.stdout.write(`${JSON.stringify({
      status: options.dryRun ? "preview" : "configured",
      repository,
      warning: "Repository-local hooks are guardrails. Use externally installed managed hooks and OS/tool isolation for non-bypassable enforcement.",
      required_environment: [
        "CANNAE_REPOSITORY",
        "CANNAE_ARTIFACT_ROOT",
        "CANNAE_MISSION_ID",
        "CANNAE_WAVE_ID",
        "CANNAE_AGENT_ID",
        "CANNAE_PROVIDER_AGENT_ID (when the provider exposes a distinct agent identity)"
      ],
      results
    }, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  CLAUDE_COMMAND,
  CODEX_COMMAND,
  configureProvider,
  hookGroups,
  mergeHookGroups
};
