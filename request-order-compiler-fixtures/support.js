const { AUTHORITY, FIELDS } = require("../order-intake-contract");

const REQUEST_TEXT = "Prepare an internal comparison of two onboarding options.\n" +
  "Use only the supplied repository evidence. Do not publish or modify customer data.\n" +
  "The user decides the target segment and any budget change.\n" +
  "Return a recommendation with explicit uncertainties.\n";

function completeAnalysis(requestRef, missionId = "MIS-INTAKE", waveId = "W1") {
  const lines = REQUEST_TEXT.trimEnd().split("\n");
  const quote = (id, text) => {
    const start = Buffer.from(REQUEST_TEXT).indexOf(Buffer.from(text));
    return { id, kind: "request_quote", text, blocking: false, source: { kind: "request", start_byte: start, end_byte: start + Buffer.byteLength(text) } };
  };
  const proposed = (id, text, kind = "proposal") => ({ id, kind, text, blocking: false, source: { kind: "none" } });
  const statements = [quote("ST-REQUEST", lines[0]), quote("ST-CONSTRAINT", lines[1]), quote("ST-DECISION", lines[2]), quote("ST-OUTCOME", lines[3]),
    proposed("ST-PURPOSE", "Help USER compare onboarding options using traceable repository evidence."),
    proposed("ST-TASK-S2", "Extract evidence for each option without editing source records."),
    proposed("ST-TASK-S3", "Compare the two options and prepare a draft recommendation."),
    proposed("ST-FAILURE", "Do not treat missing evidence as a fact."),
    proposed("ST-FALLBACK", "Request clarification when evidence cannot support comparison."),
    proposed("ST-TOOLS", "Read repository-local evidence files."),
    proposed("ST-VERIFY", "Every factual claim cites an exact retained source quote."),
    proposed("ST-MOP", "Two alternatives are compared."),
    proposed("ST-MOE", "USER can inspect the evidence and uncertainty behind the recommendation."),
    proposed("ST-ASSUME", "The supplied evidence covers current onboarding.", "assumption")];
  const sections = Object.fromEntries(FIELDS.map(field => [field, []]));
  const mapping = {
    "mission.statement": ["ST-REQUEST"], "mission.target_end_state": ["ST-OUTCOME"], "intent.purpose": ["ST-PURPOSE"],
    "intent.key_tasks": ["ST-TASK-S2", "ST-TASK-S3"], "intent.failure_to_avoid": ["ST-FAILURE"],
    "situation.known_facts": ["ST-REQUEST"], "situation.assumptions": ["ST-ASSUME"], "situation.constraints": ["ST-CONSTRAINT"],
    "execution.concept": ["ST-TASK-S2", "ST-TASK-S3"], "execution.coordinating_instructions": ["ST-CONSTRAINT"],
    "sustainment.tools": ["ST-TOOLS"], "sustainment.fallback": ["ST-FALLBACK"],
    "command_and_signal.authority.requested": ["ST-REQUEST"], "command_and_signal.authority.approval_required": ["ST-DECISION"],
    "command_and_signal.authority.prohibited": ["ST-CONSTRAINT"], "command_and_signal.ccir.pir": ["ST-FALLBACK"],
    "command_and_signal.ccir.ffir": ["ST-FAILURE"], "command_and_signal.ccir.eefi": ["ST-CONSTRAINT"],
    "command_and_signal.reports.sitrep_trigger": ["ST-FALLBACK"], "assessment.mop": ["ST-MOP"],
    "assessment.moe": ["ST-MOE"], "assessment.verification": ["ST-VERIFY"]
  };
  Object.assign(sections, mapping);
  return { schema_version: "0.1", type: "MissionOrderAnalysis", id: "MOA-INTAKE", mission_id: missionId, wave_id: waveId,
    request_ref: requestRef, statements, sections,
    tasks: ["S2", "S3"].map(role => ({ id: `TASK-${role}`, assigned_to: role, task: `ST-TASK-${role}`, purpose: "ST-PURPOSE",
      deliverables: ["ST-OUTCOME"], verification: ["ST-VERIFY"], ccir: ["ST-FALLBACK"] })),
    retained_user_decisions: ["ST-DECISION"], ...AUTHORITY };
}

module.exports = { REQUEST_TEXT, completeAnalysis };
