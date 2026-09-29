const fs = require("fs");
const path = require("path");
const { writeRepositoryArtifact } = require("./repository-artifact-store");
const { computeRepositoryState } = require("./verification-runner");
const { proposeCampaignSuccessor, successorDecisionOption, activateCampaignSuccessor } = require("./campaign-successor-controller");

// Synthetic fixture consent only. This helper is never an operator admission path.
function admitFixtureSuccessor(options, predecessor, terminalRef) {
  const time = options.now || new Date().toISOString();
  const state = computeRepositoryState(options.repository);
  const campaign = { ...JSON.parse(JSON.stringify(predecessor)), id: `${predecessor.id}-Successor`, created_at: time };
  campaign.repository_binding.baseline_revision = state.head_commit;
  const proposed = proposeCampaignSuccessor({ schema_version: "0.1", type: "CampaignSuccessorProposalRequest",
    mission_id: campaign.mission_id, terminal_ref: terminalRef, successor_campaign: campaign, repository_state: state }, options);
  const request = { schema_version: "0.1", type: "CampaignSuccessorActivationRequest", mission_id: campaign.mission_id,
    proposal_ref: proposed.proposal_ref, decision_ref: { artifact_id: "none", relative_path: "none", sha256: "none" } };
  const decision = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads/valid-decision-log.json"), "utf8"));
  Object.assign(decision, { id: `DL-${campaign.id}`, mission_id: campaign.mission_id, decided_at: options.now || new Date().toISOString(),
    decision_maker: "USER", decision_type: "scope", status: "complete", chosen_option: successorDecisionOption(request),
    authority_basis: { basis_type: "retained_authority", reference: predecessor.id, summary: "Synthetic fixture consent, not a real USER grant." },
    affected_artifacts: [proposed.proposal_ref.relative_path, terminalRef.relative_path] });
  decision.options_considered = [decision.chosen_option];
  const written = writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: options.artifactRoot,
    missionId: campaign.mission_id, waveId: "C0", kind: "decision-logs", artifactId: decision.id, payload: decision, createdAt: decision.decided_at });
  request.decision_ref = { artifact_id: decision.id, relative_path: written.relative_path, sha256: written.sha256 };
  return { campaign, request, result: activateCampaignSuccessor(request, options) };
}
module.exports = { admitFixtureSuccessor };
