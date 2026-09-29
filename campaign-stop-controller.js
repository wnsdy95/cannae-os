#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { manifestDigest, writeRepositoryArtifact } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");

const NONE = { artifact_id: "none", relative_path: "none", sha256: "none" };
function digest(value) { return require("./dispatch-runtime-controller").inputDigest(value); }
function reference(entry) { return { artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 }; }
function sameRef(left, right) { return Boolean(left && right && Object.keys(NONE).every(key => left[key] === right[key])); }
function assertValid(value, type) {
  const result = validatePayload(value, type);
  if (!result.valid) throw new Error(`CAMPAIGN_STOP_INVALID: ${type}: ${result.issues.filter(item => ["error", "critical"].includes(item.severity)).map(item => item.code).join(", ")}`);
}
function timestamp(value) {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms)) throw new Error("CAMPAIGN_STOP_TIME_INVALID");
  return ms;
}
function read(store, entry) {
  const root = fs.realpathSync(store.artifactRoot);
  const file = path.resolve(root, entry.relative_path);
  if (path.isAbsolute(entry.relative_path) || entry.relative_path.split(/[\\/]+/).includes("..") ||
      !file.startsWith(`${root}${path.sep}`) || !fs.realpathSync(file).startsWith(`${root}${path.sep}`) ||
      fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error("CAMPAIGN_STOP_UNSAFE_ARTIFACT");
  const bytes = fs.readFileSync(file);
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("CAMPAIGN_STOP_ARTIFACT_DIGEST_MISMATCH");
  return JSON.parse(bytes.toString("utf8"));
}
function exact(store, ref, kind, missionId, type) {
  const matches = store.manifest.artifacts.filter(entry => entry.kind === kind && entry.mission_id === missionId && sameRef(reference(entry), ref));
  if (matches.length !== 1) throw new Error(`CAMPAIGN_STOP_REFERENCE_INVALID: ${kind}`);
  const entry = matches[0];
  const payload = read(store, entry);
  assertValid(payload, type);
  if (payload.id !== entry.artifact_id || payload.mission_id !== entry.mission_id) throw new Error("CAMPAIGN_STOP_IDENTITY_MISMATCH");
  return { entry, payload };
}
function stopDecisionOption(request) {
  assertValid(request, "campaign-stop-request");
  return `stop-campaign:${digest({ ...request, decision_ref: NONE })}`;
}
function recordId(request) { return `CSR-${digest(request.campaign_ref).slice(0, 32)}`; }

function appraiseRequest(store, request, recordedAt) {
  assertValid(request, "campaign-stop-request");
  const at = timestamp(recordedAt);
  const campaign = exact(store, request.campaign_ref, "self-improvement-campaigns", request.mission_id, "self-improvement-campaign");
  const repository = store.verification ? store.verification.repository : store.repository;
  if (campaign.payload.repository_binding.repository_key !== repository.key ||
      campaign.payload.repository_binding.identity_fingerprint !== repository.identity_fingerprint) throw new Error("CAMPAIGN_STOP_REPOSITORY_MISMATCH");
  const decision = exact(store, request.decision_ref, "decision-logs", request.mission_id, "decision-log");
  const value = decision.payload;
  const decided = timestamp(value.decided_at);
  if (value.decision_maker !== "USER" || value.decision_type !== "scope" || value.status !== "complete" ||
      value.authority_basis.basis_type !== "retained_authority" || value.authority_basis.reference !== campaign.payload.id ||
      value.chosen_option !== stopDecisionOption(request) || !value.options_considered.includes(value.chosen_option) ||
      value.affected_artifacts.length !== 1 || value.affected_artifacts[0] !== request.campaign_ref.relative_path ||
      decided < timestamp(campaign.payload.created_at) || decided > at || at - decided > 3600000 ||
      timestamp(campaign.entry.created_at) > decided || timestamp(decision.entry.created_at) > at) {
    throw new Error("CAMPAIGN_STOP_USER_DECISION_REQUIRED");
  }
  // A later scope disposition cannot be silently replaced with an older stop grant.
  for (const entry of store.manifest.artifacts.filter(item => item.kind === "decision-logs" && item.mission_id === request.mission_id)) {
    if (entry.relative_path === decision.entry.relative_path || timestamp(entry.created_at) > at) continue;
    const other = read(store, entry);
    if (other.decision_maker === "USER" && other.decision_type === "scope" && other.status === "complete" &&
        (other.authority_basis?.reference === campaign.payload.id || other.affected_artifacts?.includes(request.campaign_ref.relative_path)) &&
        timestamp(other.decided_at) >= decided && timestamp(other.decided_at) <= at) {
      throw new Error("CAMPAIGN_STOP_CONFLICTING_USER_DECISION");
    }
  }
  return campaign;
}

function missionStopRecords(store, missionId) {
  if (!store.manifest) return [];
  return store.manifest.artifacts.filter(entry => entry.kind === "campaign-stop-records" && entry.mission_id === missionId).map(entry => {
    const record = read(store, entry);
    assertValid(record, "campaign-stop-record");
    if (record.id !== entry.artifact_id || record.id !== recordId(record.request) || record.request_sha256 !== digest(record.request) ||
        record.mission_id !== missionId || record.request.mission_id !== missionId || record.campaign_id !== record.request.campaign_ref.artifact_id ||
        timestamp(record.recorded_at) !== timestamp(entry.created_at)) throw new Error("CAMPAIGN_STOP_RECORD_BINDING_INVALID");
    // Manifests sort paths, not insertion time. Replay the exact retained revision.
    const repository = store.verification ? store.verification.repository : store.repository;
    const revision = record.observed_manifest.revision;
    if (revision >= store.manifest.manifest_revision || revision < store.manifest.integrity.history_start_revision) throw new Error("CAMPAIGN_STOP_HISTORY_INVALID");
    const history = number => JSON.parse(fs.readFileSync(path.join(store.artifactRoot, "repositories", repository.key,
      ".manifest-history", `manifest-r${String(number).padStart(8, "0")}.json`), "utf8"));
    const previous = history(revision);
    const published = history(revision + 1);
    if (manifestDigest(previous) !== record.observed_manifest.sha256 ||
        !published.artifacts.some(item => sameRef(reference(item), reference(entry))) ||
        previous.artifacts.some(item => item.relative_path === entry.relative_path)) throw new Error("CAMPAIGN_STOP_HISTORY_INVALID");
    const prefix = { ...store, manifest: previous };
    appraiseRequest(prefix, record.request, record.recorded_at);
    return { entry, record, ref: reference(entry) };
  });
}

function assertMissionNotStopped(store, missionId, campaignRef) {
  if (missionStopRecords(store, missionId).length && !(campaignRef &&
      require("./campaign-successor-controller").successorStopFenceSatisfied(store, missionId, campaignRef))) {
    const error = new Error("CAMPAIGN_CONTINUATION_BLOCKED: CAMPAIGN_STOP_REQUESTED; settle retained obligations and obtain separately contracted successor authority.");
    error.code = "CAMPAIGN_CONTINUATION_BLOCKED";
    throw error;
  }
}

function load(options) {
  return require("./campaign-supervisor").loadVerifiedStore(options.repository, options.artifactRoot);
}
function stopCampaign(request, options = {}) {
  assertValid(request, "campaign-stop-request");
  request = JSON.parse(JSON.stringify(request));
  const store = load(options);
  const previous = missionStopRecords(store, request.mission_id).find(item => sameRef(item.record.request.campaign_ref, request.campaign_ref));
  const now = options.now || new Date().toISOString();
  if (previous && previous.record.request_sha256 !== digest(request)) throw new Error("CAMPAIGN_STOP_IMMUTABLE");
  let record = previous?.record;
  if (!record) {
    const campaign = appraiseRequest(store, request, now);
    if (store.manifest.artifacts.some(entry => entry.mission_id === request.mission_id && timestamp(entry.created_at) > timestamp(now))) {
      throw new Error("CAMPAIGN_STOP_TIME_PRECEDES_HISTORY");
    }
    record = { schema_version: "0.1", type: "CampaignStopRecord", id: recordId(request),
      mission_id: request.mission_id, campaign_id: campaign.payload.id, request, request_sha256: digest(request),
      observed_manifest: { revision: store.manifest.manifest_revision, sha256: manifestDigest(store.manifest) },
      status: "stop_requested", recorded_at: now, settlement_complete: false, execution_completion_claimed: false,
      execution_authorized: false, continuation_authorized: false, release_authorized: false };
  }
  assertValid(record, "campaign-stop-record");
  const written = writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: store.artifactRoot,
    missionId: request.mission_id, waveId: "C0", kind: "campaign-stop-records", artifactId: record.id,
    payload: record, createdAt: record.recorded_at, reuseExisting: true,
    publicationGuard: ({ manifest }) => {
      const current = load(options);
      if (current.verification.manifest_sha256 !== manifestDigest(manifest)) throw new Error("CAMPAIGN_STOP_SNAPSHOT_CHANGED");
      const at = options.now || new Date().toISOString();
      if (timestamp(at) < timestamp(now) || timestamp(at) < timestamp(record.recorded_at)) throw new Error("CAMPAIGN_STOP_CLOCK_ROLLBACK");
      const retained = missionStopRecords(current, request.mission_id).find(item => item.record.id === record.id);
      if (retained) {
        if (digest(retained.record) !== digest(record)) throw new Error("CAMPAIGN_STOP_IMMUTABLE");
      } else {
        if (previous) throw new Error("CAMPAIGN_STOP_RECORD_LOST");
        if (current.verification.manifest_sha256 !== record.observed_manifest.sha256) throw new Error("CAMPAIGN_STOP_SNAPSHOT_CHANGED");
        appraiseRequest(current, request, at);
        if (current.manifest.artifacts.some(entry => entry.mission_id === request.mission_id && timestamp(entry.created_at) > timestamp(at))) {
          throw new Error("CAMPAIGN_STOP_TIME_PRECEDES_HISTORY");
        }
      }
      return true;
    }
  });
  return { record, record_ref: { artifact_id: record.id, relative_path: written.relative_path, sha256: written.sha256 },
    existing: !written.created, execution_authorized: false, release_authorized: false };
}

function campaignStopStatus(options, missionId) {
  if (!missionId) throw new Error("--mission is required.");
  const store = load(options);
  const stops = missionStopRecords(store, missionId);
  const dispatch = require("./dispatch-runtime-controller").dispatchStatus(options, { missionId });
  if (dispatch.artifact_store.manifest_sha256 !== store.verification.manifest_sha256) throw new Error("CAMPAIGN_STOP_STATUS_CHANGED");
  return { type: "CampaignStopStatus", mission_id: missionId, status: stops.length ? "stop_requested" : "no_stop_record",
    stop_refs: stops.map(item => item.ref), leases: dispatch.leases, settlement_complete: false,
    execution_completion_claimed: false, execution_authorized: false, continuation_authorized: false, release_authorized: false };
}

function main(argv = process.argv.slice(2)) {
  try {
    const [action, ...args] = argv;
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      const key = { "--repository": "repository", "--artifact-root": "artifactRoot", "--request": "requestPath", "--mission": "missionId" }[args[index]];
      if (!key || !args[index + 1] || args[index + 1].startsWith("--") || options[key]) throw new Error(`Invalid argument: ${args[index]}`);
      options[key] = args[index + 1];
    }
    if (!["stop", "status", "decision-option"].includes(action)) throw new Error("Expected stop, status, or decision-option.");
    const request = options.requestPath && JSON.parse(fs.readFileSync(options.requestPath, "utf8"));
    if (action !== "status" && !request) throw new Error("--request is required.");
    if (action !== "decision-option" && !options.repository) throw new Error("--repository is required.");
    const result = action === "decision-option" ? { chosen_option: stopDecisionOption(request), consent_granted: false, execution_authorized: false, release_authorized: false }
      : action === "stop" ? stopCampaign(request, options) : campaignStopStatus(options, options.missionId);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) { console.error(error.message); return 2; }
}
if (require.main === module) process.exitCode = main();
module.exports = { assertMissionNotStopped, campaignStopStatus, missionStopRecords, stopCampaign, stopDecisionOption, main };
