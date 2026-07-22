#!/usr/bin/env node

const crypto = require("crypto");

const INDEPENDENCE_DIMENSIONS = Object.freeze([
  "provider_id",
  "operator_id",
  "control_plane_id",
  "account_id",
  "project_id",
  "runner_pool_id",
  "infrastructure_id",
  "region_id",
  "zone_id"
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function exactDimensions(value) {
  return Array.isArray(value) && value.length === INDEPENDENCE_DIMENSIONS.length &&
    INDEPENDENCE_DIMENSIONS.every((dimension, index) => value[index] === dimension);
}

function validComponentId(value) {
  return typeof value === "string" && value.length <= 2048 &&
    /^[a-z][a-z0-9+.-]*:\S+$/.test(value);
}

function validClaims(claims) {
  return Boolean(claims && typeof claims === "object" && !Array.isArray(claims) &&
    Object.keys(claims).length === INDEPENDENCE_DIMENSIONS.length &&
    INDEPENDENCE_DIMENSIONS.every(dimension => validComponentId(claims[dimension])));
}

function sameClaims(left, right) {
  return validClaims(left) && validClaims(right) &&
    INDEPENDENCE_DIMENSIONS.every(dimension => left[dimension] === right[dimension]);
}

function componentId(provider, kind, value) {
  return `cannae:${provider}:${kind}:${encodeURIComponent(String(value))}`;
}

function expectedProfileClaims(profile) {
  if (!profile || !profile.provider) return {};
  const provider = profile.provider;
  const pinned = profile.provider_identity && profile.provider_identity.required_claims || {};
  const expected = { provider_id: `cannae:provider:${provider}` };
  if (profile.builder && profile.builder.key_id) {
    expected.control_plane_id = componentId("builder", "key", profile.builder.key_id);
  }
  if (provider === "generic_oci") {
    expected.account_id = componentId(provider, "tenant", pinned.tenant);
    expected.runner_pool_id = componentId(provider, "runner-pool", pinned.runner_pool);
  } else if (provider === "github_actions") {
    expected.project_id = componentId(provider, "repository", pinned.repository_id);
    expected.runner_pool_id = componentId(provider, "runner-environment", pinned.runner_environment);
  } else if (provider === "gitlab_ci") {
    expected.project_id = componentId(provider, "project", pinned.job_project_id);
    expected.runner_pool_id = componentId(provider, "runner", pinned.runner_id);
  } else if (provider === "local_sandbox") {
    expected.infrastructure_id = componentId(provider, "host-attestor", pinned.host_attestor_id);
    expected.runner_pool_id = componentId(provider, "sandbox-instance", pinned.sandbox_instance_id);
  } else if (provider === "tee") {
    expected.control_plane_id = componentId(provider, "appraisal-policy", pinned.appraisal_policy_sha256);
    expected.infrastructure_id = componentId(provider, "measurement", pinned.measurement);
  }
  return expected;
}

function profileClaimsMatchProvider(profile) {
  if (!validClaims(profile && profile.independence)) return false;
  return Object.entries(expectedProfileClaims(profile)).every(([key, value]) =>
    value && !value.endsWith(":undefined") && profile.independence[key] === value);
}

function computeVerifierIndependence(trustPolicy, runtimePolicy) {
  const required = Boolean(trustPolicy && ["0.6", "0.7"].includes(trustPolicy.schema_version));
  if (!required) {
    return {
      required: false,
      valid: true,
      satisfied: true,
      required_dimensions: [],
      minimum_independent_domains: 0,
      domain_count: 0,
      domains: [],
      bindings: [],
      blocking_codes: [],
      domain_by_verifier: new Map()
    };
  }

  const codes = [];
  const assurance = trustPolicy.independence_assurance || {};
  if (assurance.required !== true || assurance.correlation_rule !== "shared_required_component" ||
      !exactDimensions(assurance.required_dimensions) ||
      !Number.isInteger(assurance.minimum_independent_domains) || assurance.minimum_independent_domains < 2) {
    addCode(codes, "INDEPENDENCE_POLICY_INVALID");
  }
  if (!runtimePolicy || runtimePolicy.type !== "VerifierRuntimePolicy" || runtimePolicy.schema_version !== "0.2" ||
      runtimePolicy.trust_policy_id !== trustPolicy.id) {
    addCode(codes, "INDEPENDENCE_RUNTIME_POLICY_INVALID");
  }

  const profiles = new Map((runtimePolicy && runtimePolicy.profiles || []).map(profile => [profile.id, profile]));
  const assignments = runtimePolicy && runtimePolicy.assignments || [];
  const activeVerifiers = (trustPolicy.verifiers || []).filter(verifier => verifier.status === "active")
    .sort((left, right) => left.id.localeCompare(right.id));
  const bindings = [];
  for (const verifier of activeVerifiers) {
    const matches = assignments.filter(assignment => assignment.verifier_id === verifier.id);
    const profile = matches.length === 1 ? profiles.get(matches[0].profile_id) : null;
    if (!profile) {
      addCode(codes, "INDEPENDENCE_ASSIGNMENT_INVALID");
      continue;
    }
    if (!profileClaimsMatchProvider(profile)) {
      addCode(codes, "INDEPENDENCE_CLAIMS_INVALID");
      continue;
    }
    bindings.push({
      verifier_id: verifier.id,
      profile_id: profile.id,
      claims: clone(profile.independence)
    });
  }
  if (bindings.length !== activeVerifiers.length) addCode(codes, "INDEPENDENCE_ASSIGNMENT_INVALID");

  const parent = new Map(bindings.map(binding => [binding.verifier_id, binding.verifier_id]));
  const find = id => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    parent.set(second, first);
  };
  for (const dimension of INDEPENDENCE_DIMENSIONS) {
    const owner = new Map();
    for (const binding of bindings) {
      const value = binding.claims[dimension];
      if (owner.has(value)) union(binding.verifier_id, owner.get(value));
      else owner.set(value, binding.verifier_id);
    }
  }

  const membersByRoot = new Map();
  for (const binding of bindings) {
    const root = find(binding.verifier_id);
    const members = membersByRoot.get(root) || [];
    members.push(binding);
    membersByRoot.set(root, members);
  }
  const domains = [...membersByRoot.values()].map(members => {
    members.sort((left, right) => left.verifier_id.localeCompare(right.verifier_id));
    const sharedDimensions = INDEPENDENCE_DIMENSIONS.filter(dimension =>
      new Set(members.map(member => member.claims[dimension])).size < members.length);
    const identity = {
      required_dimensions: INDEPENDENCE_DIMENSIONS,
      members
    };
    return {
      domain_id: `VID-${sha256(JSON.stringify(identity)).slice(0, 24)}`,
      verifier_ids: members.map(member => member.verifier_id),
      shared_dimensions: sharedDimensions
    };
  }).sort((left, right) => left.domain_id.localeCompare(right.domain_id));
  const domainByVerifier = new Map();
  for (const domain of domains) {
    for (const verifierId of domain.verifier_ids) domainByVerifier.set(verifierId, domain.domain_id);
  }
  const minimum = Math.max(
    assurance.minimum_independent_domains || 0,
    trustPolicy.quorum && trustPolicy.quorum.minimum_independence_groups || 0
  );
  const structurallyValid = codes.length === 0;
  if (structurallyValid && domains.length < minimum) addCode(codes, "INDEPENDENCE_DOMAIN_QUORUM_UNAVAILABLE");

  return {
    required: true,
    valid: structurallyValid,
    satisfied: structurallyValid && domains.length >= minimum,
    required_dimensions: [...INDEPENDENCE_DIMENSIONS],
    minimum_independent_domains: minimum,
    domain_count: domains.length,
    domains,
    bindings: bindings.map(binding => ({
      ...binding,
      domain_id: domainByVerifier.get(binding.verifier_id) || "none"
    })),
    blocking_codes: codes.sort(),
    domain_by_verifier: domainByVerifier
  };
}

module.exports = {
  INDEPENDENCE_DIMENSIONS,
  computeVerifierIndependence,
  expectedProfileClaims,
  exactDimensions,
  profileClaimsMatchProvider,
  sameClaims,
  validClaims
};
