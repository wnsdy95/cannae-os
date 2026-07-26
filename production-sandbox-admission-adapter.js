#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  resolveRepository,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");
const {
  artifactRefKind,
  createProductionSandboxAdmission,
  objectDigest,
  signProductionSandboxEvidence,
  validateProductionSandboxPolicy,
  verifyProductionSandboxAdmissionBundle,
  verifyProductionSandboxEvidence
} = require("./production-sandbox-admission");

const KINDS = Object.freeze({
  policy: "production-sandbox-policies",
  evidence: "production-sandbox-evidence",
  admission: "production-sandbox-admissions"
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sameRef(left, right) {
  return Boolean(left && right &&
    left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path &&
    left.sha256 === right.sha256);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function assertValid(payload, type, label) {
  const validation = validatePayload(payload, type);
  const failures = validation.issues.filter(item =>
    item.severity === "error" || item.severity === "critical");
  if (failures.length > 0) {
    throw new Error(
      `${label} failed validation: ` +
      unique(failures.map(item => item.code)).join(", ")
    );
  }
}

function artifactRef(result, artifactId) {
  return {
    artifact_id: artifactId,
    relative_path: result.relative_path,
    sha256: result.sha256
  };
}

function storeView(options) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(
    options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")
  );
  const verification = verifyRepositoryArtifacts({
    repositoryPath: repository.root,
    artifactRoot
  });
  if (!verification.valid) {
    throw new Error(
      `Repository artifact store is invalid: ` +
      verification.issues.map(item => item.code).join(", ")
    );
  }
  const namespacePath = path.join(
    artifactRoot,
    "repositories",
    repository.key
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(namespacePath, "manifest.json"), "utf8")
  );
  return {
    artifactRoot,
    manifest,
    namespacePath,
    repository,
    verification
  };
}

function safeArtifactPath(view, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]+/).includes("..")) {
    throw new Error("Artifact reference path is unsafe.");
  }
  const candidate = path.resolve(view.artifactRoot, relativePath);
  if (candidate !== view.artifactRoot &&
      !candidate.startsWith(`${view.artifactRoot}${path.sep}`)) {
    throw new Error("Artifact reference resolves outside the artifact root.");
  }
  return candidate;
}

function loadEntry(view, entry) {
  const bytes = fs.readFileSync(safeArtifactPath(view, entry.relative_path));
  if (sha256(bytes) !== entry.sha256) {
    throw new Error(`Artifact bytes changed: ${entry.relative_path}`);
  }
  return JSON.parse(bytes.toString("utf8"));
}

function loadArtifactRef(view, ref, type) {
  if (artifactRefKind(ref) !== "concrete") {
    throw new Error(`A concrete ${type} artifact reference is required.`);
  }
  const matches = (view.manifest.artifacts || []).filter(entry =>
    entry.artifact_id === ref.artifact_id &&
    entry.relative_path === ref.relative_path &&
    entry.sha256 === ref.sha256);
  if (matches.length !== 1) {
    throw new Error(
      `Artifact reference is not uniquely retained: ${ref.artifact_id}`
    );
  }
  const payload = loadEntry(view, matches[0]);
  assertValid(payload, type, type);
  return {
    entry: matches[0],
    payload,
    ref: clone(ref)
  };
}

function writeJsonArtifact(options, descriptor) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(
    options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")
  );
  const result = writeRepositoryArtifact({
    repositoryPath: repository.root,
    artifactRoot,
    missionId: descriptor.missionId,
    waveId: descriptor.waveId,
    kind: descriptor.kind,
    artifactId: descriptor.artifactId,
    payload: descriptor.payload,
    createdAt: descriptor.createdAt
  });
  return {
    result,
    ref: artifactRef(result, descriptor.artifactId)
  };
}

function assertRepositoryBinding(repository, binding) {
  if (!binding ||
      binding.repository_key !== repository.key ||
      binding.identity_fingerprint !== repository.identity_fingerprint) {
    throw new Error(
      "Production sandbox artifact does not match the target repository."
    );
  }
}

function persistProductionSandboxPolicy(options, policy) {
  assertValid(policy, "production-sandbox-policy", "Production sandbox policy");
  const repository = resolveRepository(options.repository);
  assertRepositoryBinding(repository, policy.repository_binding);
  const structural = validateProductionSandboxPolicy(policy);
  if (!structural.valid) {
    throw new Error(
      `Production sandbox policy failed verification: ` +
      structural.codes.join(", ")
    );
  }
  const written = writeJsonArtifact(options, {
    missionId: options.missionId,
    waveId: options.waveId,
    kind: KINDS.policy,
    artifactId: policy.id,
    payload: policy,
    createdAt: policy.valid_from
  });
  return {
    policy: clone(policy),
    policy_ref: written.ref,
    production_execution_authorized: false,
    release_authorized: false
  };
}

function persistProductionSandboxEvidence(options, evidence) {
  assertValid(
    evidence,
    "production-sandbox-evidence",
    "Production sandbox evidence"
  );
  const view = storeView(options);
  assertRepositoryBinding(view.repository, evidence.repository_binding);
  const policy = loadArtifactRef(
    view,
    evidence.policy_ref,
    "production-sandbox-policy"
  );
  const verification = verifyProductionSandboxEvidence({
    policy: policy.payload,
    policyRef: policy.ref,
    evidence,
    evaluatedAt: options.now || evidence.observed_at
  });
  if (!verification.valid) {
    throw new Error(
      `Production sandbox evidence failed verification: ` +
      verification.codes.join(", ")
    );
  }
  const written = writeJsonArtifact(options, {
    missionId: options.missionId,
    waveId: options.waveId,
    kind: KINDS.evidence,
    artifactId: evidence.id,
    payload: evidence,
    createdAt: evidence.observed_at
  });
  return {
    evidence: clone(evidence),
    evidence_ref: written.ref,
    verification,
    production_execution_authorized: false,
    release_authorized: false
  };
}

function issueProductionSandboxAdmission(options, descriptor) {
  const issuedAt = options.now || new Date().toISOString();
  const view = storeView(options);
  const policy = loadArtifactRef(
    view,
    descriptor.policyRef,
    "production-sandbox-policy"
  );
  assertRepositoryBinding(view.repository, policy.payload.repository_binding);
  const evidenceRecords = (descriptor.evidenceRefs || []).map(ref =>
    loadArtifactRef(view, ref, "production-sandbox-evidence"));
  const admission = createProductionSandboxAdmission({
    policy: policy.payload,
    policyRef: policy.ref,
    evidenceRecords,
    admissionPrivateKeyPem: options.admissionPrivateKeyPem,
    admissionId: descriptor.admissionId,
    issuedAt
  });
  assertValid(
    admission,
    "production-sandbox-admission",
    "Production sandbox admission"
  );
  const verification = verifyProductionSandboxAdmissionBundle({
    policy: policy.payload,
    policyRef: policy.ref,
    evidenceRecords,
    admission,
    evaluatedAt: issuedAt
  });
  if (!verification.valid) {
    throw new Error(
      `Production sandbox admission failed verification: ` +
      verification.codes.join(", ")
    );
  }
  const written = writeJsonArtifact(options, {
    missionId: options.missionId,
    waveId: options.waveId,
    kind: KINDS.admission,
    artifactId: admission.id,
    payload: admission,
    createdAt: admission.issued_at
  });
  return {
    admission,
    admission_ref: written.ref,
    verification,
    production_execution_authorized: true,
    production_deployment_verified: true,
    release_authorized: false
  };
}

function requestScopeCodes(policy, admission, request, toolInput, executor) {
  const codes = [];
  if (!request) return codes;
  if (request.schema_version !== "0.3" ||
      request.gateway && request.gateway.assurance_level !==
        "managed_exclusive" ||
      !sameRef(
        request.production_sandbox_admission_ref,
        admission && admission.__ref
      ) ||
      !sameObject(request.repository_binding, policy.repository_binding) ||
      !sameObject(request.gateway, policy.gateway)) {
    codes.push("PRODUCTION_SANDBOX_REQUEST_BINDING_MISMATCH");
  }
  const toolCall = request.tool_call || {};
  if (!(policy.execution_scope.allowed_operation_classes || [])
    .includes(toolCall.operation_class) ||
      !(policy.execution_scope.allowed_execution_modes || [])
        .includes(toolCall.execution_mode)) {
    codes.push("PRODUCTION_SANDBOX_REQUEST_SCOPE_DENIED");
  }
  if (toolInput !== undefined &&
      (!toolInput || toolInput.type !== "OciSandboxToolInput" ||
       !policy.execution_scope.executor_policy_refs.some(ref =>
         sameRef(ref, toolInput.sandbox_policy_ref)))) {
    codes.push("PRODUCTION_SANDBOX_EXECUTOR_POLICY_DENIED");
  }
  if (executor && (!toolInput ||
      (executor.execution_mode !== toolCall.execution_mode ||
       !sameRef(executor.executor_policy_ref, toolInput.sandbox_policy_ref)))) {
    codes.push("PRODUCTION_SANDBOX_EXECUTOR_BINDING_MISMATCH");
  }
  return unique(codes);
}

function verifyProductionSandboxAdmission(options) {
  const evaluatedAt = options.evaluatedAt || options.now ||
    new Date().toISOString();
  try {
    const view = storeView(options);
    const admissionRecord = loadArtifactRef(
      view,
      options.admissionRef ||
        options.request && options.request.production_sandbox_admission_ref,
      "production-sandbox-admission"
    );
    const admission = clone(admissionRecord.payload);
    Object.defineProperty(admission, "__ref", {
      value: clone(admissionRecord.ref),
      enumerable: false
    });
    const policy = loadArtifactRef(
      view,
      admission.policy_ref,
      "production-sandbox-policy"
    );
    const evidenceRecords = admission.evidence_refs.map(ref =>
      loadArtifactRef(view, ref, "production-sandbox-evidence"));
    const verification = verifyProductionSandboxAdmissionBundle({
      policy: policy.payload,
      policyRef: policy.ref,
      evidenceRecords,
      admission,
      evaluatedAt
    });
    const codes = [...verification.codes];
    addCodes(codes, requestScopeCodes(
      policy.payload,
      admission,
      options.request,
      options.toolInput,
      options.executor
    ));
    if (options.request && options.toolInput &&
        !codes.includes("PRODUCTION_SANDBOX_EXECUTOR_POLICY_DENIED") &&
        artifactRefKind(options.toolInput.sandbox_policy_ref) === "concrete") {
      const executorPolicy = loadArtifactRef(
        view,
        options.toolInput.sandbox_policy_ref,
        "oci-linux-sandbox-policy"
      );
      if (executorPolicy.payload.gateway_binding_sha256 !==
            objectDigest(options.request.gateway) ||
          !sameObject(
            executorPolicy.payload.repository_binding,
            options.request.repository_binding
          )) {
        addCodes(codes, [
          "PRODUCTION_SANDBOX_EXECUTOR_POLICY_BINDING_MISMATCH"
        ]);
      }
    }
    return {
      ...verification,
      valid: codes.length === 0,
      codes: unique(codes).sort(),
      production_execution_authorized: codes.length === 0,
      production_deployment_verified: codes.length === 0,
      release_authorized: false,
      expires_at: admission.expires_at,
      admission_ref: clone(admissionRecord.ref),
      policy_ref: clone(policy.ref),
      evidence_refs: evidenceRecords.map(item => clone(item.ref))
    };
  } catch (error) {
    return {
      valid: false,
      codes: ["PRODUCTION_SANDBOX_ADMISSION_LOAD_FAILED"],
      error: error.message,
      production_execution_authorized: false,
      production_deployment_verified: false,
      release_authorized: false
    };
  }
}

function addCodes(codes, additions) {
  for (const code of additions || []) {
    if (!codes.includes(code)) codes.push(code);
  }
}

function sameObject(left, right) {
  return Boolean(left && right &&
    objectDigest(left) === objectDigest(right));
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function readJson(filePath, label) {
  return JSON.parse(
    fs.readFileSync(path.resolve(required(filePath, label)), "utf8")
  );
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positional = [];
  const valueFlags = new Set([
    "repository",
    "artifact-root",
    "mission",
    "wave",
    "input",
    "policy-ref",
    "evidence-refs",
    "admission-ref",
    "admission-id",
    "private-key",
    "request",
    "tool-input",
    "executor",
    "at"
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith("--") && valueFlags.has(arg.slice(2))) {
      index += 1;
      if (index >= rest.length) throw new Error(`${arg} requires a value.`);
      const key = arg.slice(2).replace(
        /-([a-z])/g,
        (_, letter) => letter.toUpperCase()
      );
      options[key] = rest[index];
    } else {
      positional.push(arg);
    }
  }
  return { command, options, positional };
}

function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.command === "sign-evidence") {
      const signed = signProductionSandboxEvidence(
        readJson(parsed.options.input, "--input"),
        fs.readFileSync(
          path.resolve(required(parsed.options.privateKey, "--private-key")),
          "utf8"
        )
      );
      process.stdout.write(`${JSON.stringify(signed, null, 2)}\n`);
      return;
    }
    const options = {
      repository: path.resolve(
        required(parsed.options.repository, "--repository")
      ),
      artifactRoot: parsed.options.artifactRoot
        ? path.resolve(parsed.options.artifactRoot)
        : undefined,
      missionId: parsed.options.mission,
      waveId: parsed.options.wave,
      now: parsed.options.at
    };
    let result;
    if (parsed.command === "persist-policy") {
      result = persistProductionSandboxPolicy(
        {
          ...options,
          missionId: required(options.missionId, "--mission"),
          waveId: required(options.waveId, "--wave")
        },
        readJson(parsed.options.input, "--input")
      );
    } else if (parsed.command === "persist-evidence") {
      result = persistProductionSandboxEvidence(
        {
          ...options,
          missionId: required(options.missionId, "--mission"),
          waveId: required(options.waveId, "--wave")
        },
        readJson(parsed.options.input, "--input")
      );
    } else if (parsed.command === "issue") {
      result = issueProductionSandboxAdmission({
        ...options,
        missionId: required(options.missionId, "--mission"),
        waveId: required(options.waveId, "--wave"),
        admissionPrivateKeyPem: fs.readFileSync(
          path.resolve(required(parsed.options.privateKey, "--private-key")),
          "utf8"
        )
      }, {
        policyRef: readJson(parsed.options.policyRef, "--policy-ref"),
        evidenceRefs: readJson(
          parsed.options.evidenceRefs,
          "--evidence-refs"
        ),
        admissionId: parsed.options.admissionId
      });
    } else if (parsed.command === "verify") {
      result = verifyProductionSandboxAdmission({
        ...options,
        admissionRef: readJson(
          parsed.options.admissionRef,
          "--admission-ref"
        ),
        request: parsed.options.request
          ? readJson(parsed.options.request, "--request")
          : undefined,
        toolInput: parsed.options.toolInput
          ? readJson(parsed.options.toolInput, "--tool-input")
          : undefined,
        executor: parsed.options.executor
          ? readJson(parsed.options.executor, "--executor")
          : undefined
      });
    } else {
      throw new Error(
        "Usage: node production-sandbox-admission-adapter.js " +
        "<sign-evidence|persist-policy|persist-evidence|issue|verify> ..."
      );
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.valid === false || result.verification &&
        result.verification.valid === false) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  issueProductionSandboxAdmission,
  loadArtifactRef,
  persistProductionSandboxEvidence,
  persistProductionSandboxPolicy,
  verifyProductionSandboxAdmission
};
