# Client Operation

Read when diagnosing discovery, invoking a native client, or investigating a
client/tool-channel failure. This guide does not authorize a native model call.

When a copy may be stale or bound to the wrong corpus, inspect it from the
already trusted checkout before running its scripts. Use that checkout's
`skill-installation-inspector.js --provider codex|claude --installed <absolute-loaded-skill-directory>`.
Compare the reported file/guide/script hashes and default root binding. A match
means current working-tree bytes, not last-commit-only provenance, native discovery
or permission to execute. Invocation overrides and client settings are not read.
A difference may be an older copy or an intentional local edit; appraise it before
refreshing. Preserve the copy, report missing/unsafe files, and never automatically
rewrite a marker, run the suspect router, reinstall or use `--force` to hide drift.
This is a troubleshooting/upgrade check, not extra context for every document task.

Verify discovery in the client's effective startup mode before diagnosing a
missing skill. A metadata listing is not body consumption or task execution;
Claude bare mode skips automatic discovery of the ordinary user skill directory.
Excluding user setting sources can also exclude installed user skills. Check
login in the exact launch environment without copying credentials or changing
persistent settings. Distinguish documented progress events from tool activity;
an interrupted or error-bearing response is not a completed review.
For tool-assisted phases, distinguish an advertised helper from a completed
current-route/source call. If the client cannot invoke it, hold dependent work
without inventing source contents or substituting a previous agent's route.
An empty MCP-call log alone does not exclude rejected tool attempts; inspect
client errors before choosing a bounded retry.
