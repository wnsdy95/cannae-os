#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { buildTransparencyState, verifyTransparencyState } = require("./transparency-operations");
const { resolveRepository, verifyRepositoryArtifacts, writeRepositoryArtifact } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");

function parseArgs(argv) {
  const options = { writeArtifact: false };
  const values = new Set([
    "bundle", "state-id", "generated-at", "repository", "artifact-root", "mission", "wave"
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-artifact") {
      options.writeArtifact = true;
      continue;
    }
    if (arg.startsWith("--") && values.has(arg.slice(2))) {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      options[key] = argv[index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.bundle || !options.stateId) throw new Error("--bundle and --state-id are required.");
  if (options.writeArtifact && (!options.repository || !options.mission || !options.wave)) {
    throw new Error("--write-artifact requires --repository, --mission, and --wave.");
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function validationCodes(payload, type) {
  return validatePayload(payload, type).issues
    .filter(item => item.severity === "error" || item.severity === "critical")
    .map(item => item.code);
}

function validateBundle(bundle) {
  const checks = [
    [bundle.policy, "transparency-policy"],
    ...((bundle.trusted_roots || []).map(item => [item.trusted_root, "sigstore-trusted-root"])),
    ...((bundle.observations || []).map(item => [item.observation, "transparency-observation"])),
    ...((bundle.root_rotations || []).map(item => [item.rotation, "trust-root-rotation"])),
    ...((bundle.root_rotations || []).flatMap(item => [
      [item.previous_trusted_root, "sigstore-trusted-root"],
      [item.next_trusted_root, "sigstore-trusted-root"]
    ])),
    ...((bundle.incidents || []).map(item => [item.incident, "transparency-incident"]))
  ];
  if (bundle.previous_state) checks.push([bundle.previous_state.state, "transparency-state"]);
  const failures = checks.flatMap(([payload, type]) => validationCodes(payload, type).map(code => `${type}:${code}`));
  if (failures.length > 0) throw new Error(`Transparency bundle validation failed: ${[...new Set(failures)].join(", ")}`);
}

function sameRef(left, right) {
  return Boolean(left && right && left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path && left.sha256 === right.sha256);
}

function persistEvidence(options, bundle) {
  if (!bundle.policy_ref) {
    throw new Error("Writing transparency evidence requires bundle.policy_ref so the trust-policy binding can be checked exactly.");
  }
  const repository = resolveRepository(options.repository);
  if (bundle.repository_binding.repository_key !== repository.key ||
      bundle.repository_binding.identity_fingerprint !== repository.identity_fingerprint ||
      bundle.policy.repository_binding.repository_key !== repository.key ||
      bundle.policy.repository_binding.identity_fingerprint !== repository.identity_fingerprint) {
    throw new Error("Transparency bundle repository binding does not match the target repository.");
  }
  const written = new Map();
  const persist = (kind, payload, expectedRef, createdAt) => {
    const key = `${kind}:${payload.id}`;
    if (written.has(key)) {
      if (!sameRef(written.get(key), expectedRef)) throw new Error(`Conflicting embedded reference for ${key}.`);
      return;
    }
    const result = writeRepositoryArtifact({
      repositoryPath: options.repository,
      artifactRoot: options.artifactRoot,
      missionId: options.mission,
      waveId: options.wave,
      kind,
      artifactId: payload.id,
      payload,
      createdAt
    });
    const actualRef = { artifact_id: payload.id, relative_path: result.relative_path, sha256: result.sha256 };
    if (expectedRef && !sameRef(actualRef, expectedRef)) {
      throw new Error(`Persisted ${key} does not match its precomputed artifact reference.`);
    }
    written.set(key, actualRef);
  };

  for (const wrapper of bundle.trusted_roots || []) {
    persist("sigstore-trusted-roots", wrapper.trusted_root, wrapper.artifact_ref, wrapper.trusted_root.retrieved_at);
  }
  for (const wrapper of bundle.root_rotations || []) {
    persist("sigstore-trusted-roots", wrapper.previous_trusted_root,
      wrapper.rotation.previous_trusted_root_ref, wrapper.rotation.approved_at);
    persist("sigstore-trusted-roots", wrapper.next_trusted_root,
      wrapper.rotation.next_trusted_root_ref, wrapper.rotation.effective_at);
  }
  persist("transparency-policies", bundle.policy, bundle.policy_ref, bundle.policy.created_at);
  for (const wrapper of bundle.observations || []) {
    persist("transparency-observations", wrapper.observation, wrapper.artifact_ref, wrapper.observation.observed_at);
  }
  for (const wrapper of bundle.root_rotations || []) {
    persist("trust-root-rotations", wrapper.rotation, wrapper.artifact_ref, wrapper.rotation.approved_at);
  }
  for (const wrapper of bundle.incidents || []) {
    persist("transparency-incidents", wrapper.incident, wrapper.artifact_ref, wrapper.incident.detected_at);
  }

  const verification = verifyRepositoryArtifacts({
    repositoryPath: options.repository,
    artifactRoot: options.artifactRoot
  });
  if (!verification.valid) {
    throw new Error(`Persisted transparency evidence failed repository verification: ${verification.issues.map(item => item.code).join(", ")}`);
  }
  if (bundle.repository_binding.repository_key !== verification.repository.key ||
      bundle.repository_binding.identity_fingerprint !== verification.repository.identity_fingerprint ||
      bundle.policy.repository_binding.repository_key !== verification.repository.key ||
      bundle.policy.repository_binding.identity_fingerprint !== verification.repository.identity_fingerprint) {
    throw new Error("Transparency bundle repository binding does not match the verified target repository.");
  }
  const artifactRoot = path.resolve(options.artifactRoot || path.join(process.cwd(), ".cannae", "artifacts"));
  const manifest = readJson(path.join(artifactRoot, "repositories", verification.repository.key, "manifest.json"));
  const manifestMatches = (ref, kind = null) => manifest.artifacts.filter(entry =>
    (!kind || entry.kind === kind) && entry.mission_id === options.mission && sameRef({
      artifact_id: entry.artifact_id,
      relative_path: entry.relative_path,
      sha256: entry.sha256
    }, ref)).length === 1;
  for (const wrapper of bundle.incidents || []) {
    const refs = [
      ...(wrapper.incident.evidence_refs || []),
      ...((wrapper.incident.resolution && wrapper.incident.resolution.evidence_refs) || [])
    ];
    if (refs.some(ref => !manifestMatches(ref)) ||
        (wrapper.incident.supersedes_incident_ref &&
          !manifestMatches(wrapper.incident.supersedes_incident_ref, "transparency-incidents"))) {
      throw new Error(`Incident ${wrapper.incident.id} cites evidence outside the verified mission manifest.`);
    }
  }
  if (bundle.previous_state && !manifestMatches(bundle.previous_state.artifact_ref, "transparency-states")) {
    throw new Error("Previous transparency state is not present in the verified mission manifest.");
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const bundle = readJson(options.bundle);
    validateBundle(bundle);
    if (options.writeArtifact) persistEvidence(options, bundle);
    const state = buildTransparencyState({
      policy: bundle.policy,
      previousState: bundle.previous_state || null,
      trustedRoots: bundle.trusted_roots || [],
      observations: bundle.observations || [],
      rootRotations: bundle.root_rotations || [],
      incidents: bundle.incidents || [],
      trustPolicyId: bundle.trust_policy_id,
      repositoryBinding: bundle.repository_binding,
      generatedAt: options.generatedAt,
      stateId: options.stateId
    });
    const validation = validatePayload(state, "transparency-state");
    const semantic = verifyTransparencyState({
      state,
      policy: bundle.policy,
      previousState: bundle.previous_state && bundle.previous_state.state,
      evaluatedAt: state.generated_at,
      requireReady: false
    });
    const failures = validation.issues.filter(item => item.severity === "error" || item.severity === "critical");
    if (failures.length > 0 || !semantic.valid) {
      throw new Error(`Generated TransparencyState failed validation: ${[
        ...failures.map(item => item.code),
        ...semantic.codes
      ].join(", ")}`);
    }
    if (options.writeArtifact) {
      const written = writeRepositoryArtifact({
        repositoryPath: options.repository,
        artifactRoot: options.artifactRoot,
        missionId: options.mission,
        waveId: options.wave,
        kind: "transparency-states",
        artifactId: state.id,
        payload: state,
        createdAt: state.generated_at
      });
      console.error(`Artifact written: ${written.relative_path}`);
    }
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { parseArgs, validateBundle };
