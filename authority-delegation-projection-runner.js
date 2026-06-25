#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function isPastExpiry(now, expiresAt) {
  return typeof now === "string" &&
    typeof expiresAt === "string" &&
    !Number.isNaN(Date.parse(now)) &&
    !Number.isNaN(Date.parse(expiresAt)) &&
    Date.parse(now) >= Date.parse(expiresAt);
}

function titleFor(row) {
  return `${row.delegatee} ${row.status} ${row.scope.action}`;
}

function bodyFor(row) {
  const base = `${row.delegatee} may approve ${row.scope.action} on ${row.scope.target} for ${row.approving_for_roles.join(", ")}.`;
  if (row.status === "active" && row.lifecycle_alert === "expiry_projection_due") {
    return `${base} Expiry has passed; record an ApprovalDelegationTerminated event.`;
  }
  if (row.termination) {
    return `${base} Terminated by ${row.termination.actor} as ${row.status}: ${row.termination.reason}`;
  }
  return base;
}

function eventPayload(event) {
  return event.payload || event;
}

function applyDelegation(state, event) {
  const payload = eventPayload(event);
  const scope = payload.delegation_scope || {};
  state.delegations[payload.id] = {
    id: payload.id,
    status: payload.delegation_status_after || "active",
    delegator: payload.delegator,
    delegatee: payload.delegatee,
    approving_for_roles: payload.approving_for_roles || [],
    delegated_decisions: payload.delegated_decisions || [],
    scope: {
      task_scope: scope.task_scope || [],
      action: scope.action,
      tool: scope.tool,
      target: scope.target,
      max_roe_class: scope.max_roe_class,
      max_residual_risk: scope.max_residual_risk,
      valid_from: scope.valid_from,
      expires_at: scope.expires_at
    },
    controls: {
      retained_authorities: scope.retained_authorities || [],
      prohibited_context_classes: scope.prohibited_context_classes || [],
      subdelegation_allowed: payload.subdelegation_allowed,
      release_review_required_for_sensitive: payload.release_review_required_for_sensitive
    }
  };
}

function applyTermination(state, event) {
  const payload = eventPayload(event);
  const row = state.delegations[payload.delegation_event_id];
  if (!row) {
    state.orphan_terminations.push(payload.id);
    return;
  }
  row.status = payload.termination_kind;
  row.termination = {
    id: payload.id,
    actor: payload.actor,
    authority: payload.termination_authority,
    terminated_at: payload.terminated_at,
    reason: payload.reason
  };
}

function projectDelegations(input) {
  const state = {
    mission_id: input.mission_id,
    generated_at: input.generated_at,
    delegations: {},
    orphan_terminations: []
  };

  for (const event of input.events || []) {
    if (event.event_type === "ApprovalDelegated" || eventPayload(event).type === "APPROVAL_DELEGATION_EVENT") {
      applyDelegation(state, event);
    }
  }
  for (const event of input.events || []) {
    if (event.event_type === "ApprovalDelegationTerminated" || eventPayload(event).type === "APPROVAL_DELEGATION_REVOCATION_EVENT") {
      applyTermination(state, event);
    }
  }

  const rows = Object.values(state.delegations)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(row => {
      const lifecycleAlert = row.status === "active" && isPastExpiry(input.generated_at, row.scope.expires_at)
        ? "expiry_projection_due"
        : null;
      const projected = {
        ...row,
        lifecycle_alert: lifecycleAlert,
        dashboard: {
          class: row.status === "active" ? "amber" : "gray",
          label: lifecycleAlert ? "DUE" : row.status.toUpperCase(),
          title: titleFor(row),
          body: bodyFor({ ...row, lifecycle_alert: lifecycleAlert })
        }
      };
      return projected;
    });

  const summary = rows.reduce((counts, row) => {
    counts.total += 1;
    counts[row.status] = (counts[row.status] || 0) + 1;
    if (row.lifecycle_alert) counts.projection_due += 1;
    return counts;
  }, { total: 0, active: 0, revoked: 0, expired: 0, projection_due: 0 });

  return {
    mission_id: input.mission_id,
    generated_at: input.generated_at,
    summary,
    delegations: rows,
    orphan_terminations: state.orphan_terminations
  };
}

function main() {
  const [, , eventsArg] = process.argv;
  if (!eventsArg) {
    console.error("Usage: node authority-delegation-projection-runner.js <delegation-events.json>");
    process.exit(2);
  }

  const projection = projectDelegations(readJson(eventsArg));
  process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { projectDelegations };
