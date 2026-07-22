#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { superviseCampaign } = require("./campaign-supervisor");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");
const { incidentDigest, rotationDigest, stateDigest } = require("./transparency-operations");

const SAMPLE = name => JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", name), "utf8"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function write(environment, kind, payload, wave = "C0") {
  return writeRepositoryArtifact({
    repositoryPath: environment.repositoryPath,
    artifactRoot: environment.artifactRoot,
    missionId: environment.missionId,
    waveId: wave,
    kind,
    artifactId: payload.id,
    payload,
    createdAt: payload.created_at || payload.generated_at || "2026-07-22T10:00:00Z"
  });
}

function ref(payload, result) {
  return { artifact_id: payload.id, relative_path: result.relative_path, sha256: result.sha256 };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "controls-transparency-supervisor-"));
const environment = {
  repositoryPath: path.join(root, "repo"),
  artifactRoot: path.join(root, "artifacts"),
  missionId: "MIS-Transparency-Supervisor"
};
fs.mkdirSync(environment.repositoryPath, { recursive: true });
git(environment.repositoryPath, ["init", "-q"]);
git(environment.repositoryPath, ["config", "user.email", "fixtures@controls.local"]);
git(environment.repositoryPath, ["config", "user.name", "Controls Fixtures"]);
fs.writeFileSync(path.join(environment.repositoryPath, "README.md"), "transparency supervisor fixture\n");
git(environment.repositoryPath, ["add", "README.md"]);
git(environment.repositoryPath, ["commit", "-qm", "fixture baseline"]);
const repository = resolveRepository(environment.repositoryPath);

const trustPolicyId = "VTP-Transparency-Supervisor";
const transparencyPolicy = SAMPLE("valid-transparency-policy.json");
transparencyPolicy.id = "TP-Transparency-Supervisor";
transparencyPolicy.trust_policy_id = trustPolicyId;
transparencyPolicy.repository_binding = {
  repository_key: repository.key,
  identity_fingerprint: repository.identity_fingerprint
};
const transparencyPolicyWrite = write(environment, "transparency-policies", transparencyPolicy);

const trustPolicy = SAMPLE("valid-verifier-trust-policy-v0.7.json");
trustPolicy.id = trustPolicyId;
trustPolicy.repository_binding = clone(transparencyPolicy.repository_binding);
trustPolicy.transparency_assurance.transparency_policy_ref = ref(transparencyPolicy, transparencyPolicyWrite);
trustPolicy.transparency_assurance.state_stream_id = transparencyPolicy.state_stream_id;
for (const verifier of trustPolicy.verifiers) verifier.allowed_repository_keys = [repository.key];
const trustPolicyWrite = write(environment, "verifier-trust-policies", trustPolicy);

const campaign = SAMPLE("valid-self-improvement-campaign.json");
campaign.schema_version = "0.4";
campaign.id = "SIC-Transparency-Supervisor";
campaign.mission_id = environment.missionId;
campaign.repository_binding = {
  repository_key: repository.key,
  identity_fingerprint: repository.identity_fingerprint,
  baseline_revision: repository.head_commit
};
campaign.attestation_policy = {
  required: true,
  trust_policy_ref: ref(trustPolicy, trustPolicyWrite),
  minimum_valid_attestations: 2,
  minimum_independence_groups: 2,
  require_distinct_key_ids: true,
  max_attestation_age_seconds: 900
};
write(environment, "self-improvement-campaigns", campaign);

const state = SAMPLE("valid-transparency-state.json");
state.id = "TS-Transparency-Supervisor-Unbound-Incident-Evidence";
state.policy_id = transparencyPolicy.id;
state.trust_policy_id = trustPolicy.id;
state.repository_binding = clone(transparencyPolicy.repository_binding);
state.stream_id = transparencyPolicy.state_stream_id;

const observationWrapper = state.evidence.observations[0];
const observationWrite = write(environment, "transparency-observations", observationWrapper.observation, "C1");
observationWrapper.artifact_ref = ref(observationWrapper.observation, observationWrite);
state.logs[0].observation_ref = clone(observationWrapper.artifact_ref);

const rotationWrapper = state.evidence.root_rotations[0];
const previousRootWrite = write(environment, "sigstore-trusted-roots", rotationWrapper.previous_trusted_root, "C1");
const nextRootWrite = write(environment, "sigstore-trusted-roots", rotationWrapper.next_trusted_root, "C1");
rotationWrapper.rotation.previous_trusted_root_ref = ref(rotationWrapper.previous_trusted_root, previousRootWrite);
rotationWrapper.rotation.next_trusted_root_ref = ref(rotationWrapper.next_trusted_root, nextRootWrite);
rotationWrapper.rotation.rotation_sha256 = rotationDigest(rotationWrapper.rotation);
const rotationWrite = write(environment, "trust-root-rotations", rotationWrapper.rotation, "C1");
rotationWrapper.artifact_ref = ref(rotationWrapper.rotation, rotationWrite);
state.trusted_roots[0].trusted_root_ref = clone(rotationWrapper.rotation.next_trusted_root_ref);

const missingEvidenceRef = {
  artifact_id: "TO-Transparency-Supervisor-Missing",
  relative_path: `repositories/${repository.key}/missions/${environment.missionId}/C1/transparency-observations/TO-Transparency-Supervisor-Missing.json`,
  sha256: "a".repeat(64)
};
const incident = SAMPLE("valid-transparency-incident.json");
incident.id = "TI-Transparency-Supervisor-Unbound-Evidence";
incident.policy_id = transparencyPolicy.id;
incident.evidence_refs = [missingEvidenceRef];
incident.incident_sha256 = incidentDigest(incident);
const incidentWrite = write(environment, "transparency-incidents", incident, "C1");
const incidentRef = ref(incident, incidentWrite);
state.evidence.incidents = [{ artifact_ref: incidentRef, incident }];
state.incidents = [{
  incident_id: incident.id,
  incident_ref: incidentRef,
  kind: incident.kind,
  status: incident.status,
  revocations: clone(incident.revocations)
}];
state.status = "blocked";
state.blocking_codes = ["TRANSPARENCY_INCIDENT_ACTIVE"];
state.valid_until = "none";
state.state_sha256 = stateDigest(state);
write(environment, "transparency-states", state, "C1");

try {
  const result = superviseCampaign({
    repositoryPath: environment.repositoryPath,
    artifactRoot: environment.artifactRoot,
    campaignId: campaign.id,
    evaluatedAt: "2026-07-22T10:03:00Z"
  });
  assert(result.history.trustPolicyBlockingCodes.includes("TRUST_ADMISSION_TRANSPARENCY_STATE_MANIFEST_INVALID"));
  assert(result.order.blocking_codes.includes("TRUST_ADMISSION_TRANSPARENCY_STATE_UNAVAILABLE"));
  assert.equal(result.order.schema_version, "0.7");
  assert.equal(result.order.execution_authorized, false);
  process.stdout.write(`${JSON.stringify({
    valid: true,
    fixture_count: 1,
    fixtures: ["supervisor rejects incident evidence references absent from the mission manifest"]
  }, null, 2)}\n`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
