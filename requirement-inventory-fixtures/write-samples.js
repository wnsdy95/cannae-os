const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const s = require("../order-adoption-fixtures/support"), contract = require("../requirement-inventory-contract");
const { reviewProof } = require("../requirement-inventory-controller");
const { loadVerifiedStore } = require("../campaign-supervisor");
const { validatePayload } = require("../validator-cli-prototype/validate");
const env = s.environment();
try {
  s.prepareSemanticReview(env);
  const proof = reviewProof(loadVerifiedStore(env.options.repository, env.options.artifactRoot), env.semanticReview.artifact_ref, env.plan, env.draft, s.optionsAt(env, 20).now);
  const values = { "requirement-inventory": proof.inventory.payload, "semantic-coverage-proposal": proof.coverage.payload,
    "semantic-review-assignment": contract.assignmentFor(proof, env.plan.agents[0].agent_id, env.plan) };
  for (const [type, value] of Object.entries(values)) {
    const invalid = s.clone(value);
    if (type === "requirement-inventory") { invalid.fragments[0].end_byte++; Object.assign(invalid, contract.identified(invalid, "RI")); }
    else if (type === "semantic-coverage-proposal") invalid.id = "SCV-invalid-binding";
    else invalid.semantic_completeness_proven = true;
    for (const [prefix, payload, expected] of [["valid", value, true], ["invalid", invalid, false]]) {
      const result = validatePayload(payload, type); assert.equal(result.valid, expected, JSON.stringify(result.issues));
      assert.equal(result.can_execute, false);
      fs.writeFileSync(path.join(__dirname, `../sample-payloads/${prefix}-${type}.json`), JSON.stringify(payload, null, 2) + "\n");
    }
  }
} finally { fs.rmSync(env.root, { recursive: true, force: true }); }
