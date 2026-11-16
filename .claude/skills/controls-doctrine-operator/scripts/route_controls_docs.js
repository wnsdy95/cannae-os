#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { TOPICS } = require("./read_controls_instructions");
const SKILL_DIRECTORIES = ["codex-skills/controls-doctrine-operator", ".claude/skills/controls-doctrine-operator"];
const instructionPaths = topic => SKILL_DIRECTORIES.map(directory => directory + "/" + TOPICS[topic]);

const DEFINITION_KEYWORDS = ["user-defined term", "user defined term", "project term", "project-scoped user definition", "project-specific user definition"];

const RULES = [
  {
    id: "skill-context-evaluation",
    keywords: [],
    docs: ["docs/evaluation-metrics.md", "docs/completion-backlog.md", "docs/skill-first-product-scope.md",
      ...instructionPaths("client-operation")],
    commands: ["node run-skill-context-evaluation-fixtures.js", "node run-skill-evaluation-fixtures.js"]
  },
  {
    id: "project-terminology",
    keywords: ["terminology", "glossary", "term definition", "shared vocabulary", "user vocabulary", "registered dependencies", "dependency impact", "dependency refresh", ...DEFINITION_KEYWORDS],
    docs: ["docs/project-terminology-workflow.md", "docs/glossary.md", "docs/knowledge-management-sop.md", "docs/document-authoring-workflow.md"],
    commands: ["node run-project-terminology-fixtures.js", "node run-project-terminology-handoff-fixtures.js",
      "node run-project-terminology-change-fixtures.js", "node run-project-terminology-writer-fixtures.js",
      "node run-project-knowledge-dependency-fixtures.js"]
  },
  {
    id: "document-authoring",
    keywords: ["document authoring", "document writing", "document revision", "document-authoring", "write a document", "revise a document", "sop", "standard operating procedure", "research note", "authoring workflow", "authoring review", "authoring-review", "handoff document", "draft a handoff", "documentation update"],
    docs: [
      "docs/document-authoring-workflow.md",
      "docs/knowledge-management-sop.md",
      "docs/sop-library.md",
      "docs/prompt-templates.md",
      "docs/handoff-packet-template.md",
      "docs/skill-first-product-scope.md"
    ],
    commands: ["node source-map-linter.js"]
  },
  {
    id: "readiness-intersection",
    keywords: ["minimum readiness", "readiness authority intersection", "readiness-authority-intersection", "readiness intersection", "approval cannot replace readiness"],
    docs: ["docs/readiness-authority-intersection.md", "docs/readiness-to-authority-policy.md", "docs/readiness-drop-reconciliation.md", "docs/completion-backlog.md"],
    commands: ["node readiness-gate-prototype/run-readiness-fixtures.js", "node run-authority-integration-fixtures.js", "node run-release-integration-fixtures.js"]
  },
  {
    id: "cli-model-selection",
    keywords: ["@cli-default", "cli default model", "default model binding", "codexmodelselection", "codex-model-selection"],
    docs: ["docs/codex-default-model-binding.md", "docs/model-transfer-consent.md", "docs/native-order-analysis.md"],
    commands: ["node run-codex-model-selection-fixtures.js", "node run-model-invocation-integrity-fixtures.js", "node run-operator-semantic-fixtures.js", "node run-native-order-analysis-fixtures.js", "node run-skill-control-evidence-fixtures.js"]
  },
  {
    id: "advisory-dependency",
    keywords: ["ip-address", "ip-zone", "zone parser", "ghsa-rxp7-6hxx-x8q5", "verifier dependency", "dependency migration", "historical producer", "parser denial of service"],
    docs: ["docs/github-release-independent-verification.md", "docs/completion-backlog.md"],
    commands: ["node run-github-release-independent-verification-fixtures.js", "node run-github-release-integrity-fixtures.js"]
  },
  {
    id: "force-registry",
    keywords: ["force registry", "force-registry", "capability registry", "performer registry", "organization registry", "forceregistryentity", "forceregistryrequest", "forceregistryproposal", "forceregistryauthorization", "forceregistryevent", "operate_controls_force_registry"],
    docs: ["docs/force-registry-enrollment.md", "docs/readiness-drop-reconciliation.md", "docs/readiness-to-authority-policy.md", "docs/force-structure-change-policy.md", "docs/completion-backlog.md"],
    commands: ["node run-force-registry-contract-fixtures.js", "node run-force-registry-fixtures.js"]
  },
  {
    id: "workload-controls",
    keywords: ["workload control", "workload-control", "workload-policy-assessment", "workloadcontrolinput", "workloadcontrolreceipt", "workloadcontrolfailure", "workloadpolicyassessment", "subject-bound", "workload assessment", "report input binding", "actual evidence scan"],
    docs: ["docs/subject-bound-workload-controls.md", "docs/skill-operational-mission-lifecycle.md", "docs/sensitive-output-filter.md", "docs/completion-backlog.md"],
    commands: ["node run-workload-control-fixtures.js", "node run-skill-control-enforcement-fixtures.js"]
  },
  {
    id: "force-readiness",
    keywords: ["readiness drop", "readiness-drop", "readiness revocation", "readiness_requalification_required", "training progression", "cross-mission capability", "readiness-to-authority", "agent-readiness", "reconcile_controls_readiness"],
    docs: ["docs/readiness-drop-reconciliation.md", "docs/readiness-to-authority-policy.md", "docs/training-progression-model.md", "docs/agent-readiness-ledger.md", "docs/force-structure-change-policy.md", "docs/completion-backlog.md"],
    commands: ["node run-readiness-drop-revocation-fixtures.js", "node run-aar-readiness-update-fixtures.js", "node run-force-structure-change-fixtures.js"]
  },
  {
    id: "analysis-reconciliation",
    keywords: ["analysis reconciliation", "analysis-reconciliation", "analysis hold", "analysis-hold", "failed request analysis", "order analysis recovery", "order analysis failed transfer", "operator-analysis-publication", "operator-reconciliation-contract-core"],
    docs: ["docs/order-analysis-reconciliation.md", "docs/native-order-analysis.md", "docs/model-transfer-reconciliation.md"],
    commands: ["node run-operator-analysis-reconciliation-contract-fixtures.js", "node run-operator-analysis-reconciliation-fixtures.js", "node run-operator-model-reconciliation-contract-fixtures.js", "node run-operator-model-reconciliation-fixtures.js", "node run-skill-control-evidence-fixtures.js"]
  },
  {
    id: "order-analysis-generation",
    keywords: ["order analysis", "order-analysis", "native planning", "native-order-planning", "prepare_controls_analysis", "codex-bounded-collector", "model invocation integrity", "model-invocation-integrity", "derived order", "draft too large", "order_intake_draft_too_large"],
    docs: ["docs/native-order-analysis.md", "docs/request-order-intake.md", "docs/model-transfer-consent.md", "docs/bounded-plan-synthesis.md"],
    commands: ["node run-request-order-compiler-fixtures.js", "node run-order-analysis-generation-fixtures.js", "node run-native-order-analysis-fixtures.js", "node run-model-invocation-integrity-fixtures.js", "node run-semantic-evaluation-fixtures.js", "node run-operator-semantic-fixtures.js", "node run-skill-control-evidence-fixtures.js"]
  },
  {
    id: "bounded-planning",
    keywords: ["bounded planning", "bounded-planning", "automatic plan", "structural synthesis", "plan_controls_mission"],
    docs: ["docs/bounded-plan-synthesis.md", "docs/requirement-inventory-admission.md", "docs/order-adoption-and-plan-binding.md", "docs/order-revision-and-supersession.md"],
    commands: ["node run-bounded-planning-fixtures.js", "node run-bounded-planning-metadata-fixtures.js", "node run-order-adoption-fixtures.js", "node run-order-revision-fixtures.js", "node run-skill-control-evidence-fixtures.js"]
  },
  {
    id: "semantic-admission",
    keywords: ["requirement inventory", "requirement-inventory", "semantic admission", "semantic-admission", "semantic coverage", "semantic-coverage", "human coverage review", "semantic review assignment", "semantic-review-assignment", "review_controls_requirements"],
    docs: ["docs/requirement-inventory-admission.md", "docs/order-adoption-and-plan-binding.md", "docs/operator-consent-and-adoption.md", "docs/semantic-omission-evaluation.md"],
    commands: ["node run-requirement-inventory-fixtures.js", "node run-operator-coverage-ui-fixtures.js", "node run-order-adoption-fixtures.js", "node run-skill-control-evidence-fixtures.js"]
  },
  {
    id: "semantic-omission",
    keywords: ["semantic omission", "semantic completeness", "semantic-omission", "semantic-evaluation", "codex-semantic", "model transfer consent", "model-transfer-consent", "operator-semantic", "semantic-control", "evaluate_controls_request", "model hold", "model-reconciliation", "model-transfer-reconciliation"],
    docs: ["docs/semantic-omission-evaluation.md", "docs/model-transfer-consent.md", "docs/model-transfer-reconciliation.md", "docs/request-order-intake.md", "docs/operator-consent-and-adoption.md", "docs/completion-backlog.md"],
    commands: ["node run-semantic-evaluation-fixtures.js", "node run-operator-semantic-fixtures.js", "node run-operator-model-reconciliation-fixtures.js", "node run-skill-control-evidence-fixtures.js"]
  },
  {
    id: "operational-cop",
    keywords: ["operational cop", "operational-cop", "operations screen", "live situation", "role-filtered situation", "critical alert scope"],
    docs: ["docs/operational-cop.md", "docs/local-operator-console.md", "docs/command-post-dashboard.md", "docs/completion-backlog.md"],
    commands: ["node run-operational-cop-fixtures.js"]
  },
  {
    id: "local-operator-console",
    keywords: ["operator consent", "operator-consent", "operator-reconciliation", "operator terminal", "terminal order reconciliation", "terminal review", "review terminal outcome", "cancel interrupted order", "decision outcome", "inspect outcome", "authenticated order review", "operator console", "local-operator-console", "operator worker", "worker exit", "interrupted owner decision", "evidence api", "viewer invitation", "serve_controls_operator"],
    docs: ["docs/local-operator-console.md", "docs/operator-consent-and-adoption.md", "docs/operator-terminal-reconciliation.md", "docs/order-adoption-and-plan-binding.md", "docs/completion-backlog.md"],
    commands: ["node run-operator-console-fixtures.js", "node run-operator-consent-fixtures.js", "node run-operator-console-worker-fixtures.js", "node run-operator-consent-outcome-fixtures.js", "node run-operator-reconciliation-fixtures.js"]
  },
  {
    id: "orientation",
    keywords: ["overview", "framework", "start", "read", "use", "description", "overall", "concept", "begin", "usage"],
    docs: [
      "README.md",
      "docs/military-llm-framework-v0.1.md",
      "docs/military-operating-system.md",
      "docs/glossary.md",
      "docs/source-map.md"
    ],
    commands: []
  },
  {
    id: "orders",
    keywords: ["order replay", "order-replay", "order revision", "order-revision", "revise_controls_order", "order adoption", "order-adoption", "order-backbrief", "order-rehearsal", "adopt_controls_order", "request intake", "mission analysis", "request-order-compiler", "compile_controls_order", "order-intake", "order-draft", "mission-request", "mission-order-analysis", "opord", "warno", "frago", "sitrep", "aar", "backbrief", "rehearsal", "prompt", "orders", "command", "issuance", "prompting", "dry-run"],
    docs: [
      "docs/prompt-templates.md",
      "docs/orders-production-pipeline.md",
      "docs/request-order-intake.md",
      "docs/order-adoption-and-plan-binding.md",
      "docs/order-revision-and-supersession.md",
      "docs/opord-annex-model.md",
      "docs/backbrief-and-rehearsal-sop.md",
      "docs/information-to-operations-cycle.md"
    ],
    commands: [
      "node runtime-demo-runner.js",
      "node orders-dissemination-runner.js runtime-demo-payloads/opord.json runtime-demo-payloads/backbrief.json runtime-demo-payloads/rehearsal.json",
      "node run-request-order-compiler-fixtures.js",
      "node run-order-adoption-fixtures.js",
      "node run-order-revision-fixtures.js"
    ]
  },
  {
    id: "intent-initiative",
    keywords: ["commander intent", "commander's intent", "mission command", "mission-command", "intent continuity", "intent-continuity", "intent lineage", "task conservation", "disciplined initiative", "disciplined-initiative", "disciplined method", "method control", "method assignment", "method deviation", "method-deviation", "method baseline", "method drift", "report before", "report after", "check_controls_intent", "operate_controls_methods"],
    docs: ["docs/mission-command-runtime-policy.md", "docs/disciplined-initiative-rules.md", "docs/intent-continuity-runtime.md", "docs/method-deviation-runtime.md", "docs/commander-handbook.md"],
    commands: ["node run-intent-continuity-fixtures.js", "node run-method-deviation-contract-fixtures.js"]
  },
  {
    id: "method-control-channel",
    keywords: ["method control channel", "method channel", "method-control", "method broker", "MCP method", "operate_controls_channel", "serve_controls_methods"],
    docs: ["docs/method-control-channel.md", "docs/method-deviation-runtime.md", "docs/enforced-dispatch-and-resume.md"],
    commands: ["node run-method-control-contract-fixtures.js"]
  },
  {
    id: "authority-risk-release",
    keywords: ["dependency migration", "verifier dependency", "producer compatibility", "lockfile update", "ip-address", "authority", "approval", "risk", "roe", "release", "scope", "delegation", "sign-off", "authorization", "hazard", "disclosure", "publish", "entrustment", "immutability", "attestation", "integrity", "drift", "tuf", "trusted-root", "bundle", "sigstore", "offline verification"],
    docs: [
      "docs/agent-roles-and-authority.md",
      "docs/tool-use-roe.md",
      "docs/approval-scope-policy.md",
      "docs/risk-acceptance-authority.md",
      "docs/context-releasability-policy.md",
      "docs/github-release-authorization.md",
      "docs/github-release-immutability.md",
      "docs/github-release-integrity-monitoring.md",
      "docs/github-release-independent-verification.md",
      "docs/policy-engine-rules.md"
    ],
    commands: [
      "node run-authority-integration-fixtures.js",
      "node run-release-integration-fixtures.js",
      "node run-github-release-publisher-fixtures.js",
      "node run-github-release-immutability-fixtures.js",
      "node run-github-release-integrity-fixtures.js",
      "node run-github-release-independent-verification-fixtures.js"
    ]
  },
  {
    id: "multi-agent-organization",
    keywords: ["agent", "multi-agent", "role", "staff", "department", "collaboration", "b2c2wg", "liaison", "assistant", "billet", "staff officer", "division", "teamwork", "branch"],
    docs: [
      "docs/llm-agent-org-chart.md",
      "docs/agent-roles-and-authority.md",
      "docs/interdepartment-collaboration-policy.md",
      "docs/b2c2wg-operating-model.md",
      "docs/agent-battle-rhythm.md"
    ],
    commands: [
      "node run-department-collaboration-fixtures.js"
    ]
  },
  {
    id: "force-structure",
    keywords: ["force", "structure", "unit", "role creation", "disband", "expand", "reduce", "dotmlpf", "formation", "buildup", "drawdown", "stand-up", "deactivation"],
    docs: [
      "docs/force-structure-change-policy.md",
      "docs/military-operating-deep-research-queue.md",
      "docs/multinational-doctrine-consistency-review.md"
    ],
    commands: [
      "node run-force-structure-change-fixtures.js"
    ]
  },
  {
    id: "model-force-assignment",
    keywords: ["model", "models", "allocate", "model allocation", "model assignment", "model routing", "model selection", "cascade", "small model", "smaller", "strong model", "frontier model", "submodel", "model profile", "capability band", "model force", "model registry", "integrated preflight", "dispatch manifest", "model usage"],
    docs: [
      "docs/model-force-assignment-policy.md",
      "docs/model-force-v0.2-operations.md",
      "docs/agent-metl.md",
      "docs/agent-readiness-ledger.md",
      "docs/evaluation-metrics.md",
      "docs/ai-special-operations-tf.md"
    ],
    commands: [
      "node run-model-force-assignment-fixtures.js",
      "node run-model-force-v0.2-fixtures.js"
    ]
  },
  {
    id: "repository-artifact-isolation",
    keywords: ["artifact", "artifacts", "output", "outputs", "deliverable", "repository output", "multi-repo", "multiple repositories", "cross-repository", "artifact store", "repository isolation", "generated file", "lease", "fencing", "stale writer", "concurrency"],
    docs: [
      "docs/repository-artifact-isolation-policy.md",
      "docs/knowledge-management-sop.md",
      "docs/model-force-v0.2-operations.md"
    ],
    commands: [
      "node run-repository-artifact-isolation-fixtures.js",
      "node run-repository-artifact-concurrency-fixtures.js",
      "node run-repository-artifact-recovery-fixtures.js",
      "node validator-cli-prototype/validate.js sample-payloads/valid-repository-artifact-manifest.json repository-artifact-manifest"
    ]
  },
  {
    id: "gateway-effect-review",
    keywords: ["gateway effect", "gateway settlement", "gateway reconciliation", "gateway-effect", "orphan admission"],
    docs: ["docs/gateway-effect-review.md", "docs/gateway-effect-settlement.md", "docs/protected-tool-gateway-contract.md", "docs/enforced-dispatch-and-resume.md", "docs/approval-scope-policy.md", "docs/completion-backlog.md"],
    commands: ["node run-gateway-effect-review-fixtures.js", "node run-gateway-effect-settlement-fixtures.js", "node run-oci-linux-sandbox-provider-fixtures.js", "node run-protected-tool-gateway-fixtures.js", "node run-tool-effect-review-fixtures.js", "node run-tool-effect-settlement-fixtures.js"]
  },
  {
    id: "tool-effect-review",
    keywords: ["unknown tool effects", "effect reconciliation", "effect settlement", "effect scope", "tool effect review", "tool-effect", "unresolved effects", "reconciled failure", "reconciled_failed_effects", "post-settlement revocation"],
    docs: ["docs/tool-effect-review.md", "docs/tool-effect-settlement.md", "docs/enforced-dispatch-and-resume.md", "docs/approval-scope-policy.md", "docs/completion-backlog.md"],
    commands: ["node run-tool-effect-review-fixtures.js", "node run-tool-effect-settlement-fixtures.js"]
  },
  {
    id: "dispatch-issuance-recovery",
    keywords: ["dispatch-issuance", "dispatch-lease-issuance", "issuance recovery", "partial issuance", "recover-issuance", "cancel-issuance"],
    docs: ["docs/dispatch-issuance-recovery.md", "docs/enforced-dispatch-and-resume.md", "docs/method-control-channel.md"],
    commands: ["node run-dispatch-issuance-contract-fixtures.js"]
  },
  {
    id: "enforced-dispatch",
    keywords: ["gateway ownership", "gateway obligations", "late gateway callback", "dispatch lease", "agent lease", "tool admission", "pretooluse", "posttooluse", "sessionstart", "resume session", "resumable execution", "execution checkpoint", "dispatch policy", "hook enforcement", "interrupt agent", "revoke lease", "tool replay", "runtime gate", "protected tool gateway", "tool gateway", "gateway transaction", "gateway recovery", "gateway identity", "authenticated reference", "mtls gateway", "tls exporter", "execution receipt", "idempotency", "protected process", "bounded process", "process executor", "native executable", "shebang", "interpreter", "exact argv", "execution envelope", "execution observation", "oci linux sandbox", "oci sandbox", "linux sandbox", "sandbox provider", "immutable image", "seccomp profile", "no new privileges", "no_new_privs", "cap drop", "read only rootfs", "recursive read only", "cgroup v2", "network none", "kernel probe", "container cleanup", "cleanup failure", "daemon unavailable", "container absence", "containment observation", "daemon substitution", "production sandbox", "production admission", "rats", "eat", "slsa provenance", "managed exclusive", "appraiser quorum", "external coordinator", "storage fencing", "exclusive path"],
    docs: [
      "docs/enforced-dispatch-and-resume.md",
      "docs/protected-tool-gateway-contract.md",
      "docs/gateway-identity-admission.md",
      "docs/protected-process-execution.md",
      "docs/oci-linux-sandbox-provider.md",
      "docs/production-sandbox-admission.md",
      "docs/skill-operational-mission-lifecycle.md",
      "docs/tool-use-roe.md",
      "docs/repository-artifact-isolation-policy.md",
      "docs/agent-roles-and-authority.md"
    ],
    commands: [
      "node run-dispatch-runtime-fixtures.js",
      "node run-protected-tool-gateway-fixtures.js",
      "node run-gateway-identity-adapter-fixtures.js",
      "node run-protected-process-executor-fixtures.js",
      "node run-oci-linux-sandbox-provider-fixtures.js",
      "node run-production-sandbox-admission-fixtures.js",
      "node run-production-sandbox-gateway-fixtures.js",
      "node validator-cli-prototype/validate.js sample-payloads/valid-dispatch-tool-policy.json dispatch-tool-policy",
      "node validator-cli-prototype/validate.js sample-payloads/valid-agent-dispatch-lease.json agent-dispatch-lease",
      "node validator-cli-prototype/validate.js sample-payloads/valid-agent-execution-checkpoint.json agent-execution-checkpoint",
      "node validator-cli-prototype/validate.js sample-payloads/valid-tool-gateway-request.json tool-gateway-request"
    ]
  },
  {
    id: "bounded-self-improvement",
    keywords: ["activate_controls_successor", "campaign-successor", "successor admission", "successor proposal", "campaign successor", "campaign terminal", "successor activation", "campaign stop", "campaign lifecycle", "campaign termination", "successor restart", "self-improvement", "self improvement", "autonomous improvement", "continuous improvement", "adaptive work", "improvement campaign", "checkpoint controller", "campaign supervisor", "cycle order", "resume campaign", "proof carrying", "verification receipt", "verification attestation", "comparative attestation", "signed comparative report", "attestation", "ed25519", "dsse", "signed quorum", "trust policy", "trust admission", "verifier readiness", "verifier independence", "failure domain", "correlation domain", "shared runner", "shared account", "shared project", "pre-dispatch admission", "pre-dispatch challenge", "challenge", "nonce", "liveness", "replay", "stale responder", "offline verifier", "remote verifier", "verifier identity", "verifier execution", "execution integrity", "execution evidence", "runtime policy", "github actions oidc", "gitlab ci oidc", "gitlab oidc", "native provider adapter", "jwks", "jwt", "verifier oci", "verifier sandbox", "verifier execution sandbox", "workload identity", "spiffe", "svid", "x509", "x.509", "transparency log", "transparency operations", "transparency state", "consistency proof", "witness", "monitor", "gossip", "root rotation", "equivocation", "revocation", "tuf", "merkle", "checkpoint", "sigstore", "sigstore bundle", "cosign bundle", "fulcio", "trustedroot", "trusted root", "rekor", "compare", "comparison", "comparative evaluation", "comparative promotion", "candidate promotion", "promote candidate", "promotion gate", "canary", "non-regression", "baseline", "baseline candidate", "improve in-progress work", "evolve work", "quality loop", "learning loop"],
    docs: [
      "docs/bounded-self-improvement-operations.md",
      "docs/campaign-terminal-reconciliation.md",
      "docs/campaign-successor-admission.md",
      "docs/sigstore-verifier-workload-admission.md",
      "docs/verifier-execution-integrity.md",
      "docs/github-actions-native-verifier-adapter.md",
      "docs/gitlab-ci-native-verifier-adapter.md",
      "docs/verifier-pre-dispatch-challenge.md",
      "docs/verifier-independence-assurance.md",
      "docs/transparency-operations.md",
      "docs/agent-roles-and-authority.md",
      "docs/approval-scope-policy.md",
      "docs/repository-artifact-isolation-policy.md",
      "docs/knowledge-management-sop.md",
      "docs/evaluation-metrics.md",
      "docs/runtime-automation-roadmap.md"
    ],
    commands: [
      "node run-self-improvement-fixtures.js",
      "node run-signed-self-improvement-fixtures.js",
      "node run-campaign-supervisor-fixtures.js",
      "node run-campaign-terminal-fixtures.js",
      "node run-campaign-successor-fixtures.js",
      "node run-verifier-trust-readiness-fixtures.js",
      "node run-verifier-identity-evidence-fixtures.js",
      "node run-sigstore-verifier-identity-fixtures.js",
      "node run-verifier-execution-evidence-fixtures.js",
      "node run-github-actions-oidc-fixtures.js",
      "node run-gitlab-ci-oidc-fixtures.js",
      "node run-verifier-challenge-fixtures.js",
      "node run-verifier-independence-fixtures.js",
      "node run-transparency-operations-fixtures.js",
      "node run-transparency-supervisor-fixtures.js",
      "node run-workload-identity-admission-fixtures.js",
      "node run-cycle-order-admission-fixtures.js",
      "node run-verification-runner-fixtures.js",
      "node run-verification-attestation-fixtures.js",
      "node run-comparative-evaluation-fixtures.js",
      "node run-comparative-evaluation-attestation-fixtures.js",
      "node validator-cli-prototype/validate.js sample-payloads/valid-self-improvement-campaign.json self-improvement-campaign",
      "node validator-cli-prototype/validate.js sample-payloads/valid-self-improvement-checkpoint.json self-improvement-checkpoint",
      "node validator-cli-prototype/validate.js sample-payloads/valid-self-improvement-cycle-order.json self-improvement-cycle-order",
      "node validator-cli-prototype/validate.js sample-payloads/valid-verification-receipt.json verification-receipt",
      "node validator-cli-prototype/validate.js sample-payloads/valid-verifier-trust-policy.json verifier-trust-policy",
      "node validator-cli-prototype/validate.js sample-payloads/valid-verifier-identity-evidence.json verifier-identity-evidence",
      "node validator-cli-prototype/validate.js sample-payloads/valid-sigstore-trusted-root.json sigstore-trusted-root",
      "node validator-cli-prototype/validate.js sample-payloads/valid-sigstore-verifier-identity-evidence.json sigstore-verifier-identity-evidence",
      "node validator-cli-prototype/validate.js sample-payloads/valid-verifier-runtime-policy.json verifier-runtime-policy",
      "node validator-cli-prototype/validate.js sample-payloads/valid-verifier-execution-evidence.json verifier-execution-evidence",
      "node validator-cli-prototype/validate.js sample-payloads/valid-github-actions-oidc-evidence.json github-actions-oidc-evidence",
      "node validator-cli-prototype/validate.js sample-payloads/valid-gitlab-ci-oidc-evidence.json gitlab-ci-oidc-evidence",
      "node validator-cli-prototype/validate.js sample-payloads/valid-verifier-challenge-set.json verifier-challenge-set",
      "node validator-cli-prototype/validate.js sample-payloads/valid-verification-attestation.json verification-attestation",
      "node validator-cli-prototype/validate.js sample-payloads/valid-comparative-evaluation-attestation.json comparative-evaluation-attestation"
    ]
  },
  {
    id: "sof-tf",
    keywords: ["sof", "special", "task force", "tf", "incident", "high-risk", "special forces", "specialized", "critical-risk"],
    docs: [
      "docs/ai-special-operations-tf.md",
      "docs/multinational-doctrine-consistency-review.md"
    ],
    commands: [
      "node run-sof-tf-fixtures.js"
    ]
  },
  {
    id: "sources-research",
    keywords: ["source", "research", "citation", "doctrine", "nato", "uk", "canada", "korea", "multinational", "sourcing", "investigation", "paper", "doctrinal", "u.s. military", "korean military", "coalition"],
    docs: [
      "docs/source-map.md",
      "docs/research-compendium.md",
      "docs/source-reliability-rubric.md",
      "docs/korean-military-sources.md",
      "docs/korean-org-culture.md",
      "docs/multinational-doctrine-consistency-review.md"
    ],
    commands: [
      "node source-map-linter.js",
      "node run-doctrine-consistency-fixtures.js"
    ]
  },
  {
    id: "document-access-context",
    keywords: ["document access", "need-to-know", "context", "classification", "opsec", "eefi", "records", "entry", "situational context", "confidential", "security"],
    docs: [
      "docs/role-document-access-policy.md",
      "docs/context-releasability-policy.md",
      "docs/opsec-classification-model.md",
      "docs/knowledge-management-sop.md"
    ],
    commands: [
      "node run-document-access-fixtures.js",
      "node run-release-review-fixtures.js"
    ]
  },
  {
    id: "project-document-delivery",
    keywords: ["project document packet", "project-document-packet", "project-document-review", "project-document-reader", "project-document-session", "project-document-quote", "exact quote lookup", "reviewed document preparation", "internal draft representation", "prepare_controls_documents", "project content preparation"],
    docs: ["docs/role-document-access-policy.md", "docs/context-releasability-policy.md", "docs/document-authoring-workflow.md"],
    commands: ["node run-project-document-packet-fixtures.js", "node run-project-document-review-fixtures.js", "node run-project-document-reader-fixtures.js", "node run-project-document-session-fixtures.js", "node run-project-document-quote-fixtures.js"]
  },
  {
    id: "runtime-validation",
    keywords: ["schema", "validator", "runner", "fixture", "test", "json", "runtime", "verification", "schematic", "test runner", "testing"],
    docs: [
      "schema-files/README.md",
      "sample-payloads/README.md",
      "docs/evaluation-fixtures.md",
      "docs/validator-prototype.md",
      "validator-cli-prototype/README.md"
    ],
    commands: [
      "node validator-cli-prototype/run-fixtures.js"
    ]
  },
  {
    id: "runtime-architecture-dashboard",
    keywords: ["architecture", "dashboard", "dashboards", "event", "projection", "ui", "database", "maintenance", "readiness", "architectural", "control panel", "eventing", "projected view", "upkeep", "preparedness", "server design", "service design"],
    docs: [
      "docs/reference-architecture.md",
      "docs/event-sourcing-model.md",
      "docs/command-post-dashboard.md",
      "docs/dashboard-wireframes.md",
      "docs/maintenance-readiness-model.md",
      "docs/data-model.sql.md"
    ],
    commands: [
      "node run-maintenance-dashboard-fixtures.js",
      "node event-replay-prototype/run-event-fixtures.js"
    ]
  },
  {
    id: "continuity-handoff",
    keywords: ["continuity", "handoff", "handoffs", "rotation", "succession", "knowledge", "km", "handover", "handovers", "succession planning", "replacement", "cycling", "knowledge transfer"],
    docs: [
      "docs/handoff-packet-template.md",
      "docs/document-authoring-workflow.md",
      "docs/personnel-continuity-model.md",
      "docs/knowledge-management-sop.md",
      "docs/event-sourcing-model.md"
    ],
    commands: [
      "node run-continuity-drill-fixtures.js",
      "node run-handoff-generation-fixtures.js"
    ]
  },
  {
    id: "skill-operations",
    keywords: ["skill", "routing", "operator", "inventory", "coverage", "install", "installer", "cli", "codex", "claude", "skillset", "skill adaptation", "skill improvement", "mandatory skill improvement", "route mapping", "documentation system", "doc taxonomy", "coverage report", "setup", "auto-setup", "mission lifecycle", "open wave", "context pack", "wave report", "wave closeout", "operational skill", "termination", "supersession", "expired wave", "abort wave", "implementation candidate", "completion backlog", "completion audit", "corpus maintenance", "implementation-candidate", "completion-backlog"],
    docs: [
      "docs/skill-first-product-scope.md",
      "docs/document-authoring-workflow.md",
      ".claude/skills/controls-doctrine-operator/SKILL.md",
      "docs/implementation-candidate-registry.md",
      "docs/completion-backlog.md",
      ".claude/skills/controls-doctrine-operator/references/self-improvement-loop.md",
      "install-ai-cli-skills.sh",
      "codex-skills/controls-doctrine-operator/SKILL.md",
      "codex-skills/controls-doctrine-operator/references/document-routing.md",
      "codex-skills/controls-doctrine-operator/references/self-improvement-loop.md",
      "docs/skill-operational-mission-lifecycle.md",
      ...Object.keys(TOPICS).flatMap(instructionPaths)
    ],
    commands: [
      "node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .",
      "node run-skill-control-enforcement-fixtures.js",
      "node run-skill-installation-fixtures.js",
      "node run-skill-installation-inspector-fixtures.js",
      "node run-skill-progressive-disclosure-fixtures.js",
      "node run-agent-routing-preflight-fixtures.js",
      "node implementation-candidate-registry.js audit",
      "node validate-controls-skill.js .claude/skills/controls-doctrine-operator",
      "node validate-controls-skill.js codex-skills/controls-doctrine-operator"
    ]
  }
];

const CAPABILITY_GAP_DOCS = [
  "docs/force-structure-change-policy.md",
  "docs/interdepartment-collaboration-policy.md",
  "docs/b2c2wg-operating-model.md",
  "docs/agent-roles-and-authority.md",
  "schema-files/force-structure-change-order.schema.json"
];

const CAPABILITY_GAP_COMMANDS = [
  "node run-force-structure-change-fixtures.js",
  "node validator-cli-prototype/validate.js sample-payloads/valid-force-structure-change-order.json force-structure-change-order"
];

const COMPARISON_KEYWORDS = new Set(["compare", "comparison", "baseline"]);
const IMPROVEMENT_GENERAL_DOCS = new Set([
  "docs/agent-roles-and-authority.md", "docs/approval-scope-policy.md",
  "docs/repository-artifact-isolation-policy.md", "docs/knowledge-management-sop.md",
  "docs/evaluation-metrics.md"
]);
const RUNTIME_SPECIALIST_DOCS = new Set([
  "docs/reference-architecture.md", "docs/event-sourcing-model.md",
  "docs/command-post-dashboard.md", "docs/dashboard-wireframes.md", "docs/data-model.sql.md"
]);
const EXECUTION_SPECIALIST_DOCS = new Set([
  "docs/enforced-dispatch-and-resume.md", "docs/protected-tool-gateway-contract.md",
  "docs/protected-process-execution.md", "docs/oci-linux-sandbox-provider.md",
  "docs/production-sandbox-admission.md"
]);
const KOREAN_SOURCE_DOCS = new Set([
  "docs/korean-military-sources.md", "docs/korean-org-culture.md"
]);
const MULTINATIONAL_SOURCE_DOC = "docs/multinational-doctrine-consistency-review.md";
const SKILL_GENERAL_DOCS = new Set([
  "docs/skill-first-product-scope.md", "docs/document-authoring-workflow.md",
  "codex-skills/controls-doctrine-operator/references/document-routing.md"
]);
const SKILL_USE_KEYWORDS = new Set([
  "skill", "skills", "skillset", "routing", "operator", "inventory", "coverage", "cli", "codex", "claude"
]);

const GENERIC_ROUTE_KEYWORDS = new Set([
  ...COMPARISON_KEYWORDS,
  "agent",
  "approval",
  "artifact",
  "artifacts",
  "assistant",
  "authority",
  "branch",
  "command",
  "context",
  "department",
  "framework",
  "incident",
  "maintenance",
  "model",
  "models",
  "output",
  "outputs",
  "research",
  "risk",
  "role",
  "scope",
  "source",
  "special",
  "staff",
  "teamwork",
  "tf",
  "unit",
  "use"
]);

const BASE_DOCUMENTS = ["README.md", "docs/source-map.md"];
const DELEGATION_DOCUMENTS = [
  "docs/role-document-access-policy.md", "docs/agent-roles-and-authority.md",
  "docs/approval-scope-policy.md", "docs/tool-use-roe.md"
];

const ROLE_DOCS = {
  COMMANDER: [
    "docs/risk-acceptance-authority.md",
    "docs/approval-scope-policy.md",
    "docs/context-releasability-policy.md"
  ],
  COS: [
    "docs/agent-battle-rhythm.md",
    "docs/interdepartment-collaboration-policy.md",
    "docs/personnel-continuity-model.md"
  ],
  S2: [
    "docs/source-map.md",
    "docs/source-reliability-rubric.md",
    "docs/opsec-classification-model.md"
  ],
  S3: [
    "docs/orders-production-pipeline.md",
    "docs/tool-use-roe.md",
    "docs/policy-engine-rules.md",
    "docs/enforced-dispatch-and-resume.md",
    "docs/protected-tool-gateway-contract.md",
    "docs/protected-process-execution.md",
    "docs/oci-linux-sandbox-provider.md",
    "docs/production-sandbox-admission.md"
  ],
  S4: [
    "docs/maintenance-readiness-model.md",
    "docs/agent-readiness-ledger.md",
    "docs/data-model.sql.md"
  ],
  S6: [
    "docs/knowledge-management-sop.md",
    "docs/context-releasability-policy.md",
    "docs/opsec-classification-model.md"
  ]
};

const DEPARTMENT_DOCS = [
  {
    keywords: ["operations", "ops", "s3", "operational"],
    docs: ["docs/orders-production-pipeline.md", "docs/information-to-operations-cycle.md"]
  },
  {
    keywords: ["intelligence", "intel", "s2", "information"],
    docs: ["docs/source-reliability-rubric.md", "docs/opsec-classification-model.md"]
  },
  {
    keywords: ["logistics", "readiness", "maintenance", "s4", "sustainment", "upkeep", "preparedness"],
    docs: ["docs/maintenance-readiness-model.md", "docs/agent-readiness-ledger.md"]
  },
  {
    keywords: ["systems", "platform", "architecture", "s6", "system", "platforms"],
    docs: ["docs/reference-architecture.md", "docs/event-sourcing-model.md"]
  },
  {
    keywords: ["collaboration", "cross-functional", "liaison", "cooperation", "contact"],
    docs: ["docs/interdepartment-collaboration-policy.md", "docs/b2c2wg-operating-model.md"]
  }
];

const AUTHORITY_DOCS = [
  {
    keywords: ["approval", "approve", "sign-off"],
    docs: ["docs/approval-scope-policy.md"]
  },
  {
    keywords: ["release", "external", "final", "disclosure", "publish", "finalized"],
    docs: ["docs/context-releasability-policy.md", "docs/opsec-classification-model.md"]
  },
  {
    keywords: ["risk", "acceptance", "high-risk", "hazard"],
    docs: ["docs/risk-acceptance-authority.md", "docs/tool-use-roe.md"]
  },
  {
    keywords: ["execution", "tool", "scoped-execution", "carry-out", "instrument"],
    docs: ["docs/tool-use-roe.md", "docs/policy-engine-rules.md", "docs/enforced-dispatch-and-resume.md", "docs/protected-tool-gateway-contract.md", "docs/protected-process-execution.md", "docs/oci-linux-sandbox-provider.md", "docs/production-sandbox-admission.md"]
  }
];

const ROUTABLE_EXTENSIONS = new Set([".md", ".html", ".css", ".json", ".js", ".go", ".sh", ".svg", ".yaml", ".yml"]);
const EXCLUDED_DIRS = new Set([
  ".cache",
  ".cannae",
  ".cxt",
  ".git",
  ".idea",
  ".npm",
  ".nyc_output",
  ".pnpm-store",
  ".tmp",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "temp",
  "tmp"
]);

const ROUTE_HINTS = [
  { id: "project-terminology", keywords: ["project-terminology", "project_terminology", "project-knowledge-dependenc"] },
  { id: "document-authoring", keywords: ["document-authoring", "authoring-review", "knowledge-management", "prompt-templates", "handoff-packet-template"] },
  { id: "cli-model-selection", keywords: ["codex-model-selection", "codex-default-model-binding"] },
  { id: "advisory-dependency", keywords: ["ip-zone", "pre-zone", "github-release-independent-verification"] },
  { id: "force-registry", keywords: ["force-registry", "operate_controls_force_registry", "operator-console/force.js"] },
  { id: "workload-controls", keywords: ["workload-control", "workload-policy-assessment", "subject-bound-workload"] },
  { id: "force-readiness", keywords: ["readiness-drop", "reconcile_controls_readiness", "readiness-to-authority", "training-progression", "agent-readiness-ledger"] },
  { id: "analysis-reconciliation", keywords: ["analysis-reconciliation", "operator-analysis-publication", "operator-reconciliation-contract-core", "order-analysis-fixtures/reconciliation", "order-analysis-fixtures/write-reconciliation"] },
  { id: "order-analysis-generation", keywords: ["order-analysis", "native-order-planning", "native-order-analysis", "codex-bounded-collector", "prepare_controls_analysis", "model-invocation-integrity"] },
  { id: "bounded-planning", keywords: ["bounded-planning", "bounded-plan-synthesis", "plan_controls_mission"] },
  { id: "semantic-admission", keywords: ["requirement-inventory", "semantic-coverage", "semantic-review-assignment", "review_controls_requirements"] },
  { id: "semantic-omission", keywords: ["semantic-omission", "semantic-evaluation", "codex-semantic", "evaluate_controls_request", "operator-semantic", "semantic-control", "model-transfer-consent", "model-reconciliation", "model-transfer-reconciliation"] },
  { id: "method-control-channel", keywords: ["method-control", "operate_controls_channel", "serve_controls_methods"] },
  { id: "operational-cop", keywords: ["operational-cop"] },
  { id: "local-operator-console", keywords: ["operator-console", "operator-consent", "operator-reconciliation", "operator-terminal-reconciliation", "serve_controls_operator"] },
  { id: "intent-initiative", keywords: ["intent-continuity", "intent-delegation", "commander-intent", "mission-command", "disciplined-initiative", "method-control-baseline", "method-deviation", "initiative-deviation", "degeneration-incident", "check_controls_intent"] },
  {
    id: "gateway-effect-review",
    keywords: ["gateway-effect", "review_gateway_effects", "settle_gateway_effects", "effect-settlement-fixture-support"]
  },
  {
    id: "tool-effect-review",
    keywords: ["tool-effect", "effect-review-evidence", "effect-settlement-proof"]
  },
  {
    id: "skill-operations",
    keywords: ["codex-skills", ".claude", "claude", "controls-doctrine-operator", "skill", "skills", "install-ai-cli-skills", "route_controls_docs", "operate_controls_mission", "skill-mission-controller", "mission-wave", "agent-context-pack", "wave-closeout", "operational-mission-lifecycle", "operator-skill", "openai.yaml", "implementation-candidate", "completion-backlog"]
  },
  {
    id: "orientation",
    keywords: ["assets", "banner", "diagram", "image", "operating-loop", "repository-map", "readme", "contributing", "code-of-conduct", "governance", "support", "changelog", "military-llm-framework", "military-operating-system", "glossary", "commander-handbook", "sop-library", "case-studies", "functional-domains", "experiments", "implementation-guide"]
  },
  {
    id: "orders",
    keywords: ["order-revision", "revise_controls_order", "order-adoption", "order-backbrief", "order-rehearsal", "adopt_controls_order", "request-order", "order-intake", "order-draft", "mission-request", "mission-order-analysis", "compile_controls_order", "opord", "warno", "frago", "sitrep", "aar", "backbrief", "rehearsal", "orders", "task-order", "runtime-demo", "information-to-operations", "decision-packet", "ccir-alert", "ccir-linter", "alert-router", "reporting-threshold", "prompt", "prompt-dsl", "prompt-templates"]
  },
  {
    id: "authority-risk-release",
    keywords: ["authority", "authority-gates", "approval", "risk", "roe", "release", "security", "policy-engine", "decision-risk", "disciplined-initiative", "mission-command", "readiness-to-authority", "tool-use", "approval-", "risk-acceptance", "release-gate", "release-review", "github-release", "release-immutability", "release-integrity", "release-attestation", "trusted-root", "bundle-verifier", "independent-verification", "operate-github-release", "operate-github-release-immutability", "operate-github-release-integrity", "operate-github-release-verification", "decision-packet"]
  },
  {
    id: "multi-agent-organization",
    keywords: ["agent", "routing-preflight", "department", "collaboration", "b2c2wg", "working-group", "liaison", "partner-command", "interop", "chief-of-staff", "metl", "battle-rhythm", "board-decision", "llm-agent-org-chart", "functional-domains"]
  },
  {
    id: "force-structure",
    keywords: ["force-structure", "force", "structure-change", "unit", "dotmlpf"]
  },
  {
    id: "model-force-assignment",
    keywords: ["model-force-assignment", "model-profile", "model-allocation", "model-routing", "capability-band", "model-force", "model-registry", "model-assignment-compiler", "integrated-mission-preflight", "model-usage-event", "model-force-v0.2", "training-progression", "readiness-event"]
  },
  {
    id: "repository-artifact-isolation",
    keywords: ["repository-artifact", "artifact-store", "artifact-verify", "artifact-recovery", "repository-lease", "lease", "fencing", "stale-writer", "write-ahead", "manifest-history", "artifact-isolation", "repository-output", "multi-repo", "cross-repository", "generated-artifact"]
  },
  {
    id: "enforced-dispatch",
    keywords: ["dispatch-issuance", "dispatch-lease-issuance", "enforced-dispatch", "dispatch-runtime", "dispatch-hook", "dispatch-tool-policy", "agent-dispatch-lease", "tool-admission-event", "agent-execution-checkpoint", "operate-dispatch-runtime", "enforce-controls-dispatch", "install-dispatch-hooks", "dispatch-hook-installer", "pretooluse", "posttooluse", "sessionstart", "resumable-execution", "protected-tool-gateway", "operate_protected_gateway", "gateway-identity", "authenticated-reference", "mtls", "tls-exporter", "tool-gateway", "tool-execution-receipt", "gateway-transaction", "protected-process", "protected-executor", "bounded-process", "native-executable", "shebang", "interpreter", "execution-envelope", "execution-observation", "operate_protected_executor", "exact-argv", "oci-linux-sandbox", "oci-sandbox", "sandbox-provider", "operate_oci_sandbox", "production-sandbox", "production-admission", "operate_production_sandbox", "rats", "eat", "slsa-provenance", "managed-exclusive", "appraiser-quorum", "external-coordinator", "storage-fencing", "exclusive-path", "seccomp", "no-new-privileges", "cgroup", "network-none", "kernel-probe", "container-cleanup"]
  },
  {
    id: "bounded-self-improvement",
    keywords: ["campaign-successor", "activate_controls_successor", "campaign-terminal", "reconcile_controls_campaign", "campaign-stop", "stop_controls_campaign", "self-improvement", "self-improvement-campaign", "self-improvement-checkpoint", "self-improvement-decision", "self-improvement-cycle-order", "campaign-supervisor", "cycle-order", "verification-plan", "verification-receipt", "verification-attestation", "comparative-evaluation-attestation", "signed-comparative-report", "verifier-trust-policy", "verifier-identity-evidence", "verifier-runtime-policy", "verifier-execution-evidence", "verifier-execution-integrity", "native-verifier-adapter", "gitlab-ci", "oidc", "jwks", "verifier-independence", "failure-domain", "correlation-domain", "execution-integrity", "verifier-challenge-set", "verifier-pre-dispatch-challenge", "pre-dispatch-challenge", "challenge", "nonce", "liveness", "replay", "sigstore-verifier-identity-evidence", "sigstore-trusted-root", "workload-identity", "spiffe", "svid", "x509", "transparency-log", "transparency-operations", "transparency-state", "transparency-policy", "transparency-observation", "transparency-incident", "trust-root-rotation", "consistency-proof", "witness", "monitor", "gossip", "equivocation", "revocation", "tuf", "merkle", "sigstore", "fulcio", "trustedroot", "rekor", "verifier-oci", "verifier-sandbox", "attestation", "ed25519", "dsse", "quorum", "verification-runner", "comparative-evaluation", "comparative-promotion", "canary", "non-regression", "baseline-candidate", "proof-carrying", "autonomous-improvement", "continuous-improvement", "adaptive-work", "quality-loop", "learning-loop"]
  },
  {
    id: "sof-tf",
    keywords: ["sof", "special-operations", "special", "tf", "task-force"]
  },
  {
    id: "sources-research",
    keywords: ["source", "research", "citation", "doctrine", "korean", "multinational", "reliability", "compendium", "culture"]
  },
  {
    id: "document-access-context",
    keywords: ["document-access", "context", "classification", "opsec", "eefi", "releasability", "sensitive-output", "evidence-redactor", "context-filter", "handoff-packet"]
  },
  { id: "project-document-delivery", keywords: ["project-document-packet", "project-document-review", "project-document-reader", "project-document-session", "project-document-quote", "prepare_controls_documents"] },
  {
    id: "runtime-validation",
    keywords: ["validation-stack", ".github", "github", "workflow", "workflows", "pull-request-template", "issue-template", "bug-report", "docs-change", "dependabot", "check-json", "check-markdown", "schema-files", "sample-payloads", "fixture", "fixtures", "validator", "validate", "linter", "runner", "run-", "prototype", "payloads", "evaluation-metrics"]
  },
  {
    id: "runtime-architecture-dashboard",
    keywords: ["architecture", "dashboard", "event", "projection", "ui", "database", "maintenance", "readiness", "data-model", "runtime", "event-replay", "common-operational-picture", "dry-run-approval", "resource-status", "resource-budget", "tool-fallback"]
  },
  {
    id: "continuity-handoff",
    keywords: ["continuity", "handoff", "rotation", "succession", "knowledge-management", "km-review", "decision-log", "source-record", "personnel-continuity"]
  }
];

function usage() {
  console.error("Doctrine binding: --doctrine-root=PATH overrides CANNAE_OS_HOME, the copy marker, the installed source location and then the working directory.");
  console.error("Required inputs: repeat --source=<corpus-relative-path>; unresolved inputs stop routing before a receipt is issued.");
  console.error("Project input references: --input-repository=<Git-root> --input-source=<exact-relative-file> (repeatable, direct output only; no content or authority is granted).");
  console.error("Reading provenance: --explain-reading adds selection reasons for direct analysis only; it does not assign required reading or grant access.");
  console.error("Usage: node scripts/route_controls_docs.js [--actor=user|ai] [--role=ROLE] [--department=DEPT] [--authority=SCOPE] [--capability-query=OBJECTIVE ...] [--task-id=ID --task-root=ABSOLUTE_PROJECT_DIRECTORY] [--all] [--limit=N] <query> [repo-root]");
  console.error("       node scripts/route_controls_docs.js --receipt --scope=wave|agent --mission=MISSION_ID --wave=WAVE_ID --agent=AGENT_ID --actor=ai --role=ROLE --department=DEPT --authority=SCOPE --capability-query=OBJECTIVE [--write-artifact --target-repository=PATH] -- <query> [repo-root]");
  console.error("       node scripts/route_controls_docs.js --coverage [repo-root]");
  process.exit(2);
}

function findRepoRoot(start) {
  let current = path.resolve(start || process.cwd());
  while (true) {
    if (
      fs.existsSync(path.join(current, "README.md")) &&
      fs.existsSync(path.join(current, "docs", "source-map.md")) &&
      fs.existsSync(path.join(current, "schema-files", "README.md"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function countMatches(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.reduce((score, keyword) => {
    const needle = String(keyword).toLowerCase();
    return score + (keywordMatches(lower, needle) ? 1 : 0);
  }, 0);
}

function resolveDoctrineRoot(options, positionalRoot) {
  const checkedRoot = (value, label, allowAncestor = false) => {
    let candidate = value && path.resolve(value);
    if (allowAncestor) {
      candidate = candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
        ? findRepoRoot(candidate) : null;
    }
    if (!candidate || findRepoRoot(candidate) !== candidate) {
      throw new Error(`${label} does not identify a doctrine repository. Correct the path or reinstall the skill.`);
    }
    return fs.realpathSync(candidate);
  };
  if (options.doctrineRoot !== null) {
    if (positionalRoot) throw new Error("Use --doctrine-root or a positional doctrine root, not both.");
    return checkedRoot(options.doctrineRoot, "--doctrine-root");
  }
  if (positionalRoot) return checkedRoot(positionalRoot, "Positional doctrine root", true);
  if (Object.hasOwn(process.env, "CANNAE_OS_HOME")) {
    return checkedRoot(process.env.CANNAE_OS_HOME, "CANNAE_OS_HOME");
  }
  const location = fs.realpathSync(__dirname);
  const marker = path.join(location, "..", ".cannae-os-root");
  let stat;
  try {
    stat = fs.lstatSync(marker);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (stat) {
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) {
      throw new Error("Invalid doctrine root marker. Reinstall the skill or set CANNAE_OS_HOME.");
    }
    const value = fs.readFileSync(marker, "utf8").trim();
    if (!path.isAbsolute(value)) throw new Error("Doctrine root marker must name an absolute repository path.");
    return checkedRoot(value, "Doctrine root marker");
  }
  const discovered = findRepoRoot(location) || findRepoRoot(process.cwd());
  if (!discovered) throw new Error("Could not locate the doctrine repository. Use --doctrine-root or reinstall the skill.");
  return fs.realpathSync(discovered);
}

function countSpecificMatches(text, keywords) {
  return keywords.reduce((score, keyword) => {
    const needle = String(keyword).toLowerCase();
    return score + (!GENERIC_ROUTE_KEYWORDS.has(needle) && keywordMatches(text.toLowerCase(), needle) ? 1 : 0);
  }, 0);
}

function keywordMatches(text, keyword) {
  if (!keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (DEFINITION_KEYWORDS.includes(keyword)) return new RegExp(`(^|[^a-z0-9])${escaped}s?([^a-z0-9]|$)`).test(text);
  if (!/^[a-z0-9]+$/.test(keyword)) return text.includes(keyword);
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}

function isDocumentAuthoringRequest(query) {
  const text = String(query || "");
  const verb = "(?:draft|write|revise|edit|update)";
  const determiner = "(?:(?:a|an|the|this|that|these|those|my|our|your)\\s+)?" +
    "(?:(?:incoming|outgoing|current|proposed|revised|existing)\\s+)*";
  const report = /\b(?:(?:research|progress|status|work|review)\s+reports?|(?:progress\s+and\s+)?decision\s+(?:summar(?:y|ies)|briefs?))\b/i;
  const draftReview = new RegExp("\\b(?:review|check|compare|appraise|assess)\\s+" + determiner +
    "(?:(?:s[1-9]|cos|commander|author|writer)(?:'s)?\\s+)?(?:drafts?|documents?|reports?)" +
    "(?:\\s*\\([a-z][a-z0-9._-]*\\))?\\s+(?:against|with|to)\\s+" +
    "(?:(?:the|its|their)\\s+)?(?:(?:original|initial)\\s+(?:requests?|requirements?)|" +
    "(?:supplied|actual|source|original|assigned)\\s+(?:policy|policies|sources?|records?|evidence))\\b", "i");
  // Recognize document review work, not review/appraisal as a generic domain.
  const findings = /\b(?:appraise|assess|review|check)\s+(?:(?:the|each|every|all)\s+)?(?:(?:inherited|supplied|previous)\s+)?(?:src-[a-z0-9_-]+\s+)?findings?\b[^.;\n]*\b(?:source[- ](?:grounded|bound)|(?:supplied|actual|assigned)\s+(?:policy|policies|sources?|records?))\b/i;
  const selfReview = new RegExp("\\bself[- ]reviews?\\s+(?:of\\s+)?" + determiner +
    "(?:(?:actual|own)\\s+)?(?:drafts?|documents?|v[0-9]+(?:\\.[0-9]+)*\\s+and\\s+findings?)" +
    "(?=$|[.,;:!?]|\\s+(?:and|before|after|against|with|for|without|using)\\b)", "i");
  // Preparing an unsent proposal is a document task, not approval or domain coverage.
  const approvalProposal = /^(?:please\s+)?(?:prepare|draft|write|revise|edit|update)\s+(?:(?:a|an|the|our|bounded|internal|unsent)\s+)*approval[- ]proposals?(?=$|[.;!?]|\s+(?:and|then|without)\b)/i;
  return new RegExp(`\\b${verb}\\s+(?:(?:or|and)\\s+${verb}\\s+)?${determiner}(?:documents?|documentation)\\b`, "i")
    .test(text) || isOrderDocumentRequest(text) || report.test(text) || draftReview.test(text) || findings.test(text) || selfReview.test(text) ||
    approvalProposal.test(taskHeadingView(text).trim()) || documentReadinessView(text) !== text;
}

function isOrderDocumentRequest(query) {
  return /\b(?:draft|write|revise|edit|update)\s+(?:(?:or|and)\s+(?:draft|write|revise|edit|update)\s+)?(?:(?:a|an|the|this|these|those|our|current|proposed|revised|support|mission|project)\s+)*(?:warno|opord|frago|sitrep|aar)s?\b/i.test(String(query || ""));
}

function isDocumentHandoffRequest(query) {
  return /\b(?:successor|follow[- ]on|next[- ]recipient)\s+(?:document\s+)?review\s+(?:unit|packet|bundle)s?\b/i.test(String(query || ""));
}

function isCorpusOrientationRequest(query) {
  const text = String(query || "").toLowerCase().replace(/\s+/g, " ").trim();
  const corpus = "(?:cannae(?: os)?|controls (?:doctrine|framework)|(?:this|the) (?:doctrine|framework|repository|corpus)|(?:the )?operator skill)";
  return [
    new RegExp(`\\b(?:give|provide|show)(?: me)? (?:an? )?overview of ${corpus}\\b`),
    new RegExp(`\\b(?:explain|describe|introduce|summarize) ${corpus}\\b`),
    new RegExp(`\\bwhat is ${corpus}\\b`),
    new RegExp(`\\bhow (?:does|do) ${corpus} work\\b`),
    new RegExp(`\\bhow (?:can|should|do) i (?:start|begin|use) (?:with )?${corpus}\\b`),
    /\bwhere (?:can|should|do) i (?:start|begin)(?: with (?:cannae(?: os)?|controls (?:doctrine|framework)|(?:this|the) (?:doctrine|framework|repository|corpus)))?\b/,
    /\b(?:read|review|summarize) (?:the )?readme\b/
  ].some(pattern => pattern.test(text));
}

function isOwnSkillMaintenanceRequest(query) {
  const text = taskHeadingView(query).trim();
  const action = "(?:maintain|update|revise|edit|fix|repair|review|audit|improve|optimize|optimise|validate|test)";
  const modifiers = "(?:(?:the|our|both|installed|existing|current)\\s+)*";
  // Match an operation on this product, not any occurrence of a client or skill.
  return new RegExp("^(?:please\\s+)?" + action + "\\s+" + modifiers +
    "(?:controls|cannae(?:\\s+os)?)\\s+(?:skills?|skill instructions|skill entrypoints?|document router|document routing)" +
    "(?=$|[.;!?]|\\s+(?:and|then|without|while)\\b)", "i").test(text);
}

function isSkillContextEvaluationRequest(query) {
  const text = taskHeadingView(query).trim();
  return /^(?:please\s+)?(?:prepare|design|freeze|review|verify|compare|measure|evaluate)\s+(?:(?:a|an|the|our|paired|native|bounded|fixed|skill)\s+)*context[- ](?:reading|delivery)\s+(?:evaluation|comparison|measurement)s?(?:\s+for\s+(?:(?:six|6|fixed|ordinary)\s+)*document tasks?)?(?=$|[.;!?]|\s+(?:and|then|without)\b)/i.test(text);
}

function isSkillMethodRequest(query) {
  // A client/skill used to perform another task does not establish its domain.
  return /^(?:please\s+)?(?:use|create|write|build|design)\s+(?:(?:a|an|the|this|our|controls|cannae|os|codex|claude|code|cli|operator)\s+)*skills?\s+(?:for|to)\s+\S/i
    .test(taskHeadingView(query).trim());
}

function capabilityRouting(query, scoredRules, scopeIdentity) {
  const capabilityRules = scoredRules.filter(rule =>
    rule.id !== "orientation" && rule.specific_score > 0);
  const orientationRule = scoredRules.find(rule => rule.id === "orientation");
  if (capabilityRules.length === 0 && orientationRule && isCorpusOrientationRequest(query)) {
    capabilityRules.push(orientationRule);
  }

  if (capabilityRules.length > 0) {
    return {
      status: "covered",
      reason_code: capabilityRules[0].id === "orientation"
        ? "CORPUS_ORIENTATION_REQUEST"
        : "MATCHED_DOCTRINE_ROUTE",
      capability_scope: String(query),
      matched_capability_routes: capabilityRules.map(rule => rule.id),
      provisional_organization: {
        required: false,
        organization_type: "existing_doctrine_route",
        organization_id: "none",
        name: "Existing doctrine route",
        task_organization_status: "not_required",
        authority_scope: "Use the declared operator mode and existing role, department, and authority boundaries.",
        authority_expansion_authorized: false,
        standing_department_activation_authorized: false,
        disband_condition: "Not applicable; no provisional organization was created."
      },
      force_structure_review: {
        required: false,
        change_type: "none",
        target_kind: "none",
        status: "not_required",
        candidate_department_id: "none",
        candidate_department_name: "none",
        final_decision_authority: "USER",
        formal_approving_role: "COMMANDER"
      },
      operator_directive: "Use the matched doctrine routes and remain inside the declared authority boundary."
    };
  }

  const digest = crypto.createHash("sha256")
    .update(String(scopeIdentity || query || "unscoped-capability-gap"))
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return {
    status: "gap_detected",
    reason_code: "NO_CAPABILITY_ROUTE",
    capability_scope: String(query),
    matched_capability_routes: [],
    provisional_organization: {
      required: true,
      organization_type: "mission_scoped_capability_cell",
      organization_id: `CELL-${digest}`,
      name: "Mission-scoped capability cell",
      task_organization_status: "task_organized",
      authority_scope: "Perform analysis and reversible drafting for the original request under existing delegated authority only.",
      authority_expansion_authorized: false,
      standing_department_activation_authorized: false,
      disband_condition: "Disband at mission handoff unless the USER approves a validated force-structure change order."
    },
    force_structure_review: {
      required: true,
      change_type: "create",
      target_kind: "department",
      status: "analysis_required",
      candidate_department_id: `DEPT-${digest}`,
      candidate_department_name: "Mission capability department candidate",
      final_decision_authority: "USER",
      formal_approving_role: "COMMANDER"
    },
    operator_directive: "Do not stop as outside the corpus or continue as unowned general work. Use the provisional capability cell now, preserve all existing authority limits, and evaluate a standing department through the force-structure process."
  };
}

function unique(items) {
  return [...new Set(items)];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_./:-]+/g, " ");
}

function walkRoutableFiles(repoRoot) {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024
    }
  );
  if (!listed.error && listed.status === 0) {
    return listed.stdout
      .split("\0")
      .filter(Boolean)
      .map(file => file.split(path.sep).join("/"))
      .filter(file => fs.existsSync(path.join(repoRoot, file)))
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ROUTABLE_EXTENSIONS.has(ext);
      })
      .filter(file =>
        !file.startsWith(".claude/") ||
        file.startsWith(".claude/skills/"))
      .sort((left, right) => left.localeCompare(right));
  }

  if (!walkRoutableFiles.warnedFallback) {
    walkRoutableFiles.warnedFallback = true;
    process.stderr.write(
      "route_controls_docs: git file listing unavailable; falling back to a directory walk that only excludes known local-state directories.\n"
    );
  }

  const files = [];

  function walk(relativeDir) {
    const absoluteDir = path.join(repoRoot, relativeDir);
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      if (entry.name === ".DS_Store") continue;

      const relativePath = path.join(relativeDir, entry.name);
      const normalizedRelativePath = relativePath.split(path.sep).join("/");
      if (
        normalizedRelativePath.startsWith(".claude/") &&
        normalizedRelativePath !== ".claude/skills" &&
        !normalizedRelativePath.startsWith(".claude/skills/")
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(relativePath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (ROUTABLE_EXTENSIONS.has(ext)) {
        files.push(relativePath.split(path.sep).join("/"));
      }
    }
  }

  walk("");
  return files.sort((left, right) => left.localeCompare(right));
}

function artifactType(file) {
  if (file.endsWith(".svg")) return "image-asset";
  if (file.endsWith(".html")) return "html-document";
  if (file.endsWith(".md")) return "document";
  if (file.endsWith(".yaml") || file.endsWith(".yml")) return "skill-metadata";
  if (file.endsWith("README.md") || file.startsWith("docs/") || file.startsWith("codex-skills/")) {
    if (file.endsWith(".js")) return "skill-script";
    return "document";
  }
  if (file.startsWith("schema-files/")) return "schema";
  if (file.startsWith("sample-payloads/") || file.startsWith("runtime-demo-payloads/")) return "sample";
  if (file.includes("-fixtures/") || file.startsWith("event-fixtures/")) return "fixture";
  if (file.endsWith(".js") || file.endsWith(".go") || file.endsWith(".sh")) return "runner-or-tool";
  if (file.endsWith(".json")) return "projection-or-data";
  return "artifact";
}

function routeIdsForArtifact(file) {
  const normalized = normalizeText(file);
  const routeIds = [];

  for (const hint of ROUTE_HINTS) {
    if (hint.keywords.some(keyword => normalized.includes(normalizeText(keyword)))) {
      routeIds.push(hint.id);
    }
  }

  if (file.endsWith(".schema.json") || file.startsWith("schema-files/")) {
    routeIds.push("runtime-validation");
  }

  if (file.startsWith("sample-payloads/") || file.startsWith("runtime-demo-payloads/")) {
    routeIds.push("runtime-validation");
  }

  if (file.includes("-fixtures/") || file.startsWith("event-fixtures/")) {
    routeIds.push("runtime-validation");
  }

  if (file === "README.md") routeIds.push("orientation");
  if (file === "package.json" || file === "package-lock.json") routeIds.push("bounded-self-improvement", "runtime-validation");
  if (file === "source-map-linter.js" || file === "source-map-url-coverage-report.json") routeIds.push("sources-research");
  if (file === "orders-dissemination-runner.js") routeIds.push("orders");
  if (file === "order-replay-context.js") routeIds.push("orders");
  if (file === "handoff-generator.js") routeIds.push("continuity-handoff");
  if (file === "maintenance-readiness-runner.js") routeIds.push("runtime-architecture-dashboard");
  if (file === "maintenance-dashboard-runner.js") routeIds.push("runtime-architecture-dashboard");
  if (file === "decision-packet-linter.js") routeIds.push("authority-risk-release", "orders");
  if (file === "aar-to-readiness-update.js") routeIds.push("orders", "runtime-architecture-dashboard");
  if (file === "autonomous-improvement-controller.js" || file === "campaign-supervisor.js" || file === "verifier-trust-readiness.js" || file === "verifier-identity-evidence.js" || file === "verifier-identity-fixture-support.js" || file === "verifier-execution-evidence.js" || file === "verifier-execution-runner.js" || file === "run-verifier-execution-evidence-fixtures.js" || file === "verifier-challenge-set.js" || file === "run-verifier-challenge-fixtures.js" || file === "verifier-independence.js" || file === "run-verifier-independence-fixtures.js" || file === "sigstore-trusted-root.js" || file === "sigstore-trusted-root-runner.js" || file === "sigstore-verifier-identity-evidence.js" || file === "sigstore-verifier-identity-runner.js" || file === "run-sigstore-verifier-identity-fixtures.js" || file === "run-campaign-supervisor-fixtures.js" || file === "run-verifier-trust-readiness-fixtures.js" || file === "run-verifier-identity-evidence-fixtures.js" || file === "run-workload-identity-admission-fixtures.js" || file === "run-cycle-order-admission-fixtures.js" || file === "run-self-improvement-fixtures.js" || file === "run-signed-self-improvement-fixtures.js") routeIds.push("bounded-self-improvement", "runtime-validation");
  if (file === "transparency-operations.js" || file === "transparency-operations-runner.js" || file === "run-transparency-operations-fixtures.js" || file === "run-transparency-supervisor-fixtures.js") routeIds.push("bounded-self-improvement", "runtime-validation");
  if (file === "github-actions-oidc.js" || file === "github-actions-oidc-runner.js" || file === "run-github-actions-oidc-fixtures.js") routeIds.push("bounded-self-improvement", "runtime-validation");
  if (file === "gitlab-ci-oidc.js" || file === "gitlab-ci-oidc-runner.js" || file === "run-gitlab-ci-oidc-fixtures.js") routeIds.push("bounded-self-improvement", "runtime-validation");
  if (file === "verification-runner.js" || file === "verification-attestation.js" || file === "verification-attestation-runner.js" || file === "run-verification-attestation-fixtures.js") routeIds.push("bounded-self-improvement", "runtime-validation");
  if (file === "comparative-evaluation-runner.js" || file === "run-comparative-evaluation-fixtures.js" ||
      file === "comparative-evaluation-attestation.js" || file === "comparative-evaluation-attestation-runner.js" ||
      file === "run-comparative-evaluation-attestation-fixtures.js") routeIds.push("bounded-self-improvement", "runtime-validation");
  if (file === "repository-artifact-verify.js" || file === "repository-lease.js" || file === "run-repository-artifact-recovery-fixtures.js" || file === "run-repository-artifact-concurrency-fixtures.js") routeIds.push("repository-artifact-isolation", "runtime-validation");
  if (file === "dispatch-runtime-controller.js" || file === "dispatch-hook-adapter.js" || file === "install-dispatch-hooks.js" || file === "protected-tool-gateway.js" || file === "gateway-identity-adapter.js" || file === "gateway-identity-evidence.js" || file === "protected-process-executor.js" || file === "protected-execution-evidence.js" || file === "oci-linux-sandbox-provider.js" || file === "oci-linux-sandbox-evidence.js" || file === "oci-linux-sandbox-probe.go" || file === "run-dispatch-runtime-fixtures.js" || file === "run-protected-tool-gateway-fixtures.js" || file === "run-gateway-identity-adapter-fixtures.js" || file === "run-protected-process-executor-fixtures.js" || file === "run-oci-linux-sandbox-provider-fixtures.js") routeIds.push("enforced-dispatch", "runtime-validation");

  if (file === "protected-gateway-fixture-support.js") routeIds.push("enforced-dispatch", "runtime-validation");
  return unique(routeIds);
}

function buildArtifactInventory(repoRoot) {
  return walkRoutableFiles(repoRoot).filter(file => isCorpusFile(repoRoot, file)).map(file => ({
    path: file,
    type: artifactType(file),
    route_ids: routeIdsForArtifact(file)
  }));
}

function isCorpusFile(repoRoot, file) {
  const parts = file.split("/");
  if (path.isAbsolute(file) || file.includes("\\") ||
      parts.some(part => !part || part === "." || part === ".." || EXCLUDED_DIRS.has(part))) return false;
  try {
    let current = repoRoot;
    for (const part of parts) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) return false;
    }
    return fs.statSync(current).isFile();
  } catch {
    return false;
  }
}

function taskReferenceMentions(query) {
  const mentions = [];
  // Backticks and Markdown destinations keep paths containing spaces intact.
  const tokens = /`([^`\n]+)`|\[[^\]\n]*\]\(([^)\n]+)\)|([^\s`<>"'()[\]{},;]+)/g;
  for (const match of query.matchAll(tokens)) {
    let value = (match[1] || match[2] || match[3]).replace(/[.!?]+$/, "");
    value = value.split("#")[0].replace(/:\d+(?::\d+)?$/, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) continue;
    if (ROUTABLE_EXTENSIONS.has(path.posix.extname(value).toLowerCase())) mentions.push(value);
  }
  return unique(mentions);
}

function resolveInputReferences(options, doctrineRoot) {
  if (options.inputRepository === null) return null;
  let root;
  try {
    root = fs.realpathSync(path.resolve(options.inputRepository));
    if (!fs.statSync(root).isDirectory() || root === doctrineRoot) throw new Error();
  } catch {
    throw new Error("INPUT_REPOSITORY_INVALID: select a distinct existing project Git root; use --source for doctrine files.");
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const git = args => spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8", env, timeout: 5000, maxBuffer: 1024 * 1024
  });
  const top = git(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0 || !top.stdout.trim() || fs.realpathSync(top.stdout.trim()) !== root) {
    throw new Error("INPUT_REPOSITORY_INVALID: --input-repository must be the exact Git worktree root.");
  }
  const sources = [];
  for (const relative of unique(options.inputSources)) {
    if (!relative || /^[a-z][a-z0-9+.-]*:/i.test(relative) || relative.startsWith("~") ||
        !isCorpusFile(root, relative)) {
      throw new Error(`INPUT_SOURCE_UNRESOLVED: ${relative} must name an exact existing, non-symlinked project file.`);
    }
    const canonical = path.relative(root, fs.realpathSync(path.join(root, relative))).split(path.sep).join("/");
    if (canonical !== relative) throw new Error(`INPUT_SOURCE_UNRESOLVED: ${relative} is not a canonical project-relative path.`);
    const ignored = git(["check-ignore", "--no-index", "--quiet", "--", relative]);
    if (ignored.status === 0) throw new Error(`INPUT_SOURCE_EXCLUDED: ${relative} is ignored by the project.`);
    if (ignored.status !== 1) throw new Error("INPUT_SOURCE_CHECK_FAILED: project ignore rules could not be checked.");
    sources.push({ path: relative, exists: true });
  }
  return { repository_root: root, sources, delivery_mode: "reference_only",
    content_loaded: false, authorization_verified: false };
}

function directTaskContext(options, inputs) {
  if (options.taskId === null) return null;
  let root;
  try {
    if (!path.isAbsolute(options.taskRoot)) throw new Error();
    root = fs.realpathSync(options.taskRoot);
    if (!fs.statSync(root).isDirectory()) throw new Error();
  } catch {
    throw new Error("TASK_CONTEXT_ROOT_INVALID: select an existing absolute target project directory.");
  }
  if (inputs && inputs.repository_root !== root) {
    throw new Error("TASK_CONTEXT_ROOT_MISMATCH: task identity and project inputs must name the same root.");
  }
  return { id: options.taskId, root, basis: "caller_declared_project_task", authorization_verified: false };
}

function taskReferences(query, requiredSources, inventory, inputSources = null) {
  const paths = new Set(inventory.map(item => item.path));
  const basenames = new Map();
  for (const file of paths) {
    const basename = path.posix.basename(file);
    basenames.set(basename, [...(basenames.get(basename) || []), file]);
  }
  const resolved = [];
  const unresolved = [];
  const inputResolved = [];
  for (const reference of unique([...requiredSources, ...taskReferenceMentions(query)])) {
    const relative = reference.startsWith("./") ? reference.slice(2) : reference;
    if (inputSources !== null && !requiredSources.includes(reference)) {
      if (inputSources.includes(relative)) inputResolved.push({ reference, path: relative });
      else unresolved.push({ reference, reason: "input_source_not_declared" });
      continue;
    }
    const parts = relative.split("/");
    let reason = null;
    if (!relative || path.posix.isAbsolute(relative) || relative.includes("\\") ||
        /^[a-z][a-z0-9+.-]*:/i.test(relative) || relative.startsWith("~") ||
        parts.some(part => !part || part === "." || part === ".." || EXCLUDED_DIRS.has(part))) {
      reason = "outside_corpus_path";
    }
    const candidates = reason ? [] : paths.has(relative) ? [relative] :
      relative.includes("/") ? [] : basenames.get(relative) || [];
    if (!reason && candidates.length !== 1) {
      reason = candidates.length ? "ambiguous_basename" : "not_in_corpus";
    }
    if (reason) {
      if (requiredSources.includes(reference)) {
        throw new Error(`TASK_SOURCE_UNRESOLVED: ${reference} (${reason}). Use an exact existing corpus-relative input path.`);
      }
      unresolved.push({ reference, reason });
    } else {
      resolved.push({ reference, path: candidates[0] });
    }
  }
  return { resolved, unresolved, ...(inputSources !== null ? { input_resolved: inputResolved } : {}) };
}

function routeCounts(inventory) {
  const counts = {};
  for (const artifact of inventory) {
    for (const routeId of artifact.route_ids) {
      counts[routeId] = (counts[routeId] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function typeCounts(inventory) {
  const counts = {};
  for (const artifact of inventory) {
    counts[artifact.type] = (counts[artifact.type] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function coverageReport(repoRoot, inventory = buildArtifactInventory(repoRoot)) {
  const unrouted = inventory.filter(artifact => artifact.route_ids.length === 0);
  const inventoryPaths = new Set(inventory.map(artifact => artifact.path));
  const declared = unique([
    ...BASE_DOCUMENTS, ...DELEGATION_DOCUMENTS, ...CAPABILITY_GAP_DOCS,
    ...RULES.flatMap(rule => rule.docs), ...Object.values(ROLE_DOCS).flat(),
    ...DEPARTMENT_DOCS.flatMap(rule => rule.docs), ...AUTHORITY_DOCS.flatMap(rule => rule.docs)
  ]).sort();
  const unavailable = declared.filter(file => !inventoryPaths.has(file));

  return {
    valid: unrouted.length === 0 && unavailable.length === 0,
    repo_root: repoRoot,
    routable_artifact_count: inventory.length,
    routed_artifact_count: inventory.length - unrouted.length,
    unrouted_artifact_count: unrouted.length,
    declared_document_count: declared.length,
    unavailable_declared_document_count: unavailable.length,
    unavailable_declared_documents: unavailable,
    route_counts: routeCounts(inventory),
    type_counts: typeCounts(inventory),
    unrouted_artifacts: unrouted
  };
}

function collectKeywordDocs(value, rules) {
  const text = String(value || "").toLowerCase();
  if (!text) return [];

  const docs = [];
  for (const rule of rules) {
    if (rule.keywords.some(keyword => keywordMatches(text, String(keyword).toLowerCase()))) {
      docs.push(...rule.docs);
    }
  }
  return docs;
}

function parseArgs(argv) {
  const options = {
    actor: null,
    role: null,
    department: null,
    authority: null,
    capabilityQueries: [],
    taskId: null,
    taskRoot: null,
    doctrineRoot: null,
    sources: [],
    inputRepository: null,
    inputSources: [],
    receipt: false,
    explainReading: false,
    scope: null,
    mission: null,
    wave: null,
    agent: null,
    targetRepository: null,
    artifactRoot: null,
    writeArtifact: false,
    overwriteArtifact: false,
    coverage: false,
    all: false,
    limit: 40
  };
  const queryParts = [];
  const valueOptionNames = new Set(["actor", "role", "department", "authority", "capability-query", "task-id", "task-root", "doctrine-root", "source", "input-repository", "input-source", "scope", "mission", "wave", "agent", "limit", "target-repository", "artifact-root"]);
  const booleanOptionNames = new Set(["coverage", "all", "receipt", "write-artifact", "overwrite-artifact", "explain-reading"]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") { queryParts.push(...argv.slice(index + 1)); break; }
    const equalsMatch = arg.match(/^--([^=]+)=(.*)$/);

    if (equalsMatch && valueOptionNames.has(equalsMatch[1])) {
      const key = equalsMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!equalsMatch[2]) throw new Error(equalsMatch[1] === "source"
        ? "TASK_SOURCE_UNRESOLVED: empty required doctrine input."
        : `Missing value for --${equalsMatch[1]}.`);
      if (key === "inputRepository" && options.inputRepository !== null) throw new Error("Specify --input-repository exactly once.");
      if (["taskId", "taskRoot"].includes(key) && options[key] !== null) throw new Error("TASK_CONTEXT_DUPLICATE: specify each task identity option once.");
      if (key === "source") options.sources.push(equalsMatch[2]);
      else if (key === "inputSource") options.inputSources.push(equalsMatch[2]);
      else if (key === "capabilityQuery") options.capabilityQueries.push(equalsMatch[2]);
      else options[key] = equalsMatch[2];
      continue;
    }

    if (arg.startsWith("--") && valueOptionNames.has(arg.slice(2))) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      index += 1;
      if (index >= argv.length || !argv[index] || argv[index].startsWith("--")) throw new Error(`Missing value for ${arg}.`);
      if (key === "inputRepository" && options.inputRepository !== null) throw new Error("Specify --input-repository exactly once.");
      if (["taskId", "taskRoot"].includes(key) && options[key] !== null) throw new Error("TASK_CONTEXT_DUPLICATE: specify each task identity option once.");
      if (key === "source") options.sources.push(argv[index]);
      else if (key === "inputSource") options.inputSources.push(argv[index]);
      else if (key === "capabilityQuery") options.capabilityQueries.push(argv[index]);
      else options[key] = argv[index];
      continue;
    }

    if (arg.startsWith("--") && booleanOptionNames.has(arg.slice(2))) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = true;
      continue;
    }

    if (arg.startsWith("-")) throw new Error(`Unknown router option: ${arg.split("=")[0]}. Use -- before literal query text beginning with -.`);
    queryParts.push(arg);
  }

  if (options.explainReading && (options.receipt || options.writeArtifact || options.coverage ||
      options.targetRepository || options.artifactRoot || options.overwriteArtifact || options.scope ||
      options.mission || options.wave || options.agent)) {
    throw new Error("READING_EXPLANATION_MODE_UNSUPPORTED: reading provenance is direct analysis, not guarded receipt or artifact metadata.");
  }
  if ((options.taskId !== null) !== (options.taskRoot !== null)) {
    throw new Error("TASK_CONTEXT_INCOMPLETE: --task-id and --task-root are required together.");
  }
  if (options.taskId !== null) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(options.taskId)) {
      throw new Error("TASK_CONTEXT_ID_INVALID: use 1-100 ASCII letters, digits, dots, underscores or hyphens, starting with a letter or digit.");
    }
    if (options.receipt || options.writeArtifact || options.coverage || options.targetRepository ||
        options.artifactRoot || options.overwriteArtifact || options.scope || options.mission || options.wave || options.agent) {
      throw new Error("TASK_CONTEXT_MODE_UNSUPPORTED: direct task identity cannot replace guarded mission metadata, receipts or artifacts.");
    }
  }
  if (options.capabilityQueries.some(query => !query.trim())) {
    throw new Error("CAPABILITY_QUERY_EMPTY: every declared objective must contain text.");
  }
  if (new Set(options.capabilityQueries).size !== options.capabilityQueries.length) {
    throw new Error("CAPABILITY_QUERY_DUPLICATE: declare each objective once.");
  }
  if (options.capabilityQueries.length > 1 && (options.receipt || options.writeArtifact || options.coverage ||
      options.targetRepository || options.artifactRoot || options.overwriteArtifact || options.scope ||
      options.mission || options.wave || options.agent)) {
    throw new Error("MULTI_OBJECTIVE_MODE_UNSUPPORTED: multiple objectives are direct intake analysis only; do not omit objectives to create a guarded receipt or artifact.");
  }

  if ((options.inputRepository !== null) !== (options.inputSources.length > 0)) {
    throw new Error("Project inputs require both --input-repository and at least one --input-source.");
  }
  if (options.inputRepository !== null && (options.receipt || options.writeArtifact || options.coverage ||
      options.targetRepository || options.artifactRoot || options.overwriteArtifact)) {
    throw new Error("INPUT_REFERENCE_MODE_UNSUPPORTED: project input references cannot be omitted from a receipt, artifact or coverage report. Use direct routing only; guarded input delivery is not implemented.");
  }

  if (options.coverage && (options.receipt || options.writeArtifact || options.overwriteArtifact)) {
    throw new Error("ROUTING_MODE_CONFLICT: inventory coverage cannot be combined with receipt generation or persistence.");
  }
  const parsedLimit = Number.parseInt(options.limit, 10);
  options.limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 40;

  let repoRootArg = null;
  if (options.coverage || queryParts.length > 1) {
    const last = queryParts[queryParts.length - 1];
    const directory = last && fs.existsSync(last) && fs.statSync(last).isDirectory();
    const explicitPath = last && (path.isAbsolute(last) || last === "." || last === ".." ||
      last.startsWith("./") || last.startsWith("../"));
    if (directory || explicitPath) {
      repoRootArg = queryParts.pop();
    }
  }

  const query = queryParts.join(" ").trim();
  if (!query && !options.coverage) usage();

  return { query, repoRootArg, options };
}

function operatorMode(options, noteDocument = () => {}, query = "") {
  const hasDelegationFields = Boolean(options.role || options.department || options.authority);
  const actor = String(options.actor || (hasDelegationFields ? "ai" : "user")).toLowerCase();

  if (!["user", "ai"].includes(actor)) {
    console.error("--actor must be either user or ai");
    process.exit(2);
  }

  if (actor === "user") {
    return {
      actor,
      mode: "human_final_decision_authority",
      decision_authority: "human_user",
      routing_scope: "Route for efficiency and evidence. Do not restrict the user's corpus visibility by the AI assistant's role.",
      role: options.role || null,
      department: options.department || null,
      authority: options.authority || null,
      mode_documents: [],
      escalation_required_when: [
        "The user asks for high-risk, release, destructive, or irreversible action.",
        "The framework lacks source-map or validation coverage for the requested claim."
      ]
    };
  }

  const modeDocs = [...DELEGATION_DOCUMENTS];

  const roleKey = String(options.role || "").toUpperCase();
  for (const file of modeDocs) noteDocument(file, { kind: "delegation_boundary", selected: true });
  const addModeDocs = (files, kind, value) => {
    modeDocs.push(...files);
    for (const file of files) noteDocument(file, { kind, value, selected: true });
  };
  const roleDocs = ROLE_DOCS[roleKey] || [];
  const documentRole = ["S3", "S4"].includes(roleKey) && isReadOnlyDocumentRole(options, query);
  const storageContext = [query, ...options.capabilityQueries, options.department, ...options.sources, ...options.inputSources]
    .join("\n").replace(/[-_/]/g, " ");
  const storageDesign = /\b(?:sql|relational|storage schemas?|schema migrations?)\b/i.test(storageContext);
  for (const file of roleDocs) {
    const unrelatedDefault = (roleKey === "S3" && EXECUTION_SPECIALIST_DOCS.has(file)) ||
      (roleKey === "S4" && file === "docs/data-model.sql.md" && !storageDesign);
    if (documentRole && unrelatedDefault) {
      noteDocument(file, { kind: "role", value: roleKey, selected: false, excluded_by: ["read_only_document_role"] });
    } else addModeDocs([file], "role", roleKey);
  }
  addModeDocs(collectKeywordDocs(options.department, DEPARTMENT_DOCS), "department", options.department);
  addModeDocs(collectKeywordDocs(options.authority, AUTHORITY_DOCS), "authority", options.authority);

  const missingDelegationFields = ["role", "department", "authority"]
    .filter(field => !options[field]);
  const escalationRequiredWhen = [
    "Requested action exceeds delegated role, department, or authority.",
    "A provisional capability cell is proposed as a standing department or requests broader authority.",
    "Release target is external, final, or cross-boundary.",
    "Risk level requires acceptance authority above the AI delegate.",
    "Need-to-know cannot justify reading or sharing extra documents."
  ];

  if (missingDelegationFields.length > 0) {
    escalationRequiredWhen.unshift(
      `Delegation context is incomplete: missing ${missingDelegationFields.join(", ")}.`
    );
  }

  return {
    actor,
    mode: "delegated_ai_role_department_authority",
    decision_authority: "bounded_ai_delegate",
    routing_scope: "Route by declared role, department, authority, task, release target, risk, and need-to-know.",
    role: options.role || "unspecified",
    department: options.department || "unspecified",
    authority: options.authority || "unspecified",
    mode_documents: unique(modeDocs),
    escalation_required_when: escalationRequiredWhen
  };
}

function needsGithubReleaseReading(text) {
  const context = normalizeText(text);
  if (countMatches(context, [
    "dependency migration", "verifier dependency", "producer compatibility",
    "lockfile update", "ip address", "github release", "gh release",
    "release immutability", "release integrity", "release publisher",
    "release monitor", "immutability monitor", "independent release verification"
  ]) > 0) return true;
  return keywordMatches(context, "github") && countMatches(context, [
    "release", "releases", "asset", "assets", "immutability", "integrity", "publisher"
  ]) > 0;
}

function needsImprovementSpecialistReading(text, sources) {
  const rule = RULES.find(item => item.id === "bounded-self-improvement");
  const context = normalizeText(text);
  return sources.some(file => rule.docs.includes(file) && !IMPROVEMENT_GENERAL_DOCS.has(file)) ||
    rule.keywords.some(keyword => !COMPARISON_KEYWORDS.has(keyword) && keywordMatches(context, normalizeText(keyword))) ||
    countMatches(context, ["runtime control candidate", "runtime control baseline"]) > 0;
}

function taskHeadingView(text) {
  return String(text || "").replace(/^\s*(?:#{1,6}\s+)?(?:\*\*)?(?:task|request|assignment|objective|\uc694\uccad|\uc791\uc5c5|\uacfc\uc5c5|\ubaa9\ud45c)(?:\*\*)?\s*:\s*(?:\*\*)?\s*/i, "");
}

const KOREAN_ACTIONS = {
  "\uc791\uc131": "write", "\uac80\ud1a0": "review", "\ubd84\uc11d": "analyze", "\ube44\uad50": "compare",
  "\uc870\uc0ac": "research", "\uc5f0\uad6c": "research", "\uc218\uc815": "revise", "\uac31\uc2e0": "update",
  "\uc815\ub9ac": "summarize", "\uc124\uacc4": "design", "\uad6c\ud604": "implement", "\uac1c\ubc1c": "build",
  "\uc804\uc1a1": "transmit", "\uacf5\uac1c": "publish", "\uac8c\uc2dc": "publish",
  "\uc2e4\ud589": "execute", "\ubc30\ud3ec": "deploy", "\uc2dc\uc791": "start", "\uc6b4\uc601": "operate", "\ud638\ucd9c": "invoke", "\uc0ad\uc81c": "delete"
};
const KOREAN_TERMS = {
  "\ud45c\uc900 \uc6b4\uc601 \uc808\ucc28\uc11c": "SOP", "\uc808\ucc28\uc11c": "SOP", "\uc6b4\uc601 \uc808\ucc28": "SOP",
  "\uc778\uc218\uc778\uacc4 \ubb38\uc11c": "handoff document", "\uc778\uc218\uc778\uacc4": "handoff document",
  "\uc870\uc0ac \ubcf4\uace0\uc11c": "research report", "\uc5f0\uad6c \ubcf4\uace0\uc11c": "research report",
  "\uc9c4\ud589 \ubcf4\uace0\uc11c": "progress report", "\ud604\ud669 \ubcf4\uace0\uc11c": "status report",
  "\uc0c1\ud669 \ubcf4\uace0\uc11c": "SITREP", "\uc791\uc804 \uba85\ub839": "OPORD", "\ubcc0\uacbd \uba85\ub839": "FRAGO",
  "\uc0ac\ud6c4 \uac80\ud1a0": "AAR", "\uc6a9\uc5b4\uc9d1": "glossary", "\ubb38\uc11c": "document", "\ucd08\uc548": "draft",
  "\uc6d0\ubcf8 \uc815\ucc45": "source policy", "\uc815\ucc45": "policy", "\ucd9c\ucc98": "source", "\uadfc\uac70": "evidence",
  "\ub300\uc2dc\ubcf4\ub4dc": "dashboard", "\uc11c\ubc84": "server", "\ub370\uc774\ud130\ubca0\uc774\uc2a4": "database",
  "\uc544\ud0a4\ud14d\ucc98": "architecture", "\uc124\uacc4": "design", "\uc2b9\uc778": "approval", "\uad8c\ud55c": "authority",
  "\ud55c\uad6d\uc5b4": "in Korean language", "\ud55c\uad6d\uad70": "Korean military", "\ubbf8\uad70": "U.S. military", "\uad50\ub9ac": "doctrine",
  "\uadf8\uac83": "it", "\uc774\uac83": "this", "\ud574\ub2f9": "that", "\uadf8": "that"
};
const HAS_KOREAN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const KOREAN_TERM_PATTERN = new RegExp("(?<![\\p{L}\\p{N}_])(" +
  Object.keys(KOREAN_TERMS).sort((a, b) => b.length - a.length).join("|") +
  ")(\uc73c\ub85c|\uc5d0\uc11c|\uc5d0\uac8c|\ub85c|\uc744|\ub97c|\uc740|\ub294|\uc774|\uac00|\uc640|\uacfc|\uc758)?(?=$|[^\\p{L}\\p{N}_])", "gu");
const KOREAN_ACTION_END = "(?:\ud574(?:\\s*(?:\uc918|\uc8fc\uc138\uc694|\uc694))?|\ud558\ub77c|\ud558\uc138\uc694|\ud558\uc2ed\uc2dc\uc624|\ud558\uace0|\ud55c\\s+(?:\ub4a4|\ud6c4))";
const KOREAN_ACTION_PATTERN = new RegExp("^(.+?)\\s+(" + Object.keys(KOREAN_ACTIONS).join("|") + ")" + KOREAN_ACTION_END + "$", "u");
const KOREAN_CLAUSE_BREAK = new RegExp("(?<=(?:" + Object.keys(KOREAN_ACTIONS)
  .flatMap(action => ["\ud558\uace0", "\ud55c \ub4a4", "\ud55c \ud6c4"].flatMap(end => [action + end, (action + end).normalize("NFD")]))
  .join("|") + "))\\s+", "u");

function taskClauses(text) {
  return String(text).split(/[;\n]+|(?<=[.!?])\s+/).flatMap(clause => clause.split(KOREAN_CLAUSE_BREAK));
}

function koreanMatchingView(text) {
  const original = String(text || "");
  if (!HAS_KOREAN.test(original)) return original;
  // These bounded lexical hints are not a translation or a replacement assignment.
  return taskClauses(taskHeadingView(original.normalize("NFC"))).map(clause => {
    const raw = clause.trim().replace(/[.!?]+$/, "");
    const action = raw.match(KOREAN_ACTION_PATTERN);
    const aliased = raw.replace(KOREAN_TERM_PATTERN, (_, term, particle) =>
      KOREAN_TERMS[term] + (["\uc640", "\uacfc"].includes(particle) ? " and" : ""));
    const platform = "(?:dashboard|server|database|architecture)";
    const prohibited = "(?:\uacf5\uac1c\ud558|\uac8c\uc2dc\ud558|\uc804\uc1a1\ud558|" + platform + "\\s+(?:\ub9cc\ub4e4|\uad6c\ucd95\ud558|\uac1c\ubc1c\ud558|\uc2dc\uc791\ud558|\uc6b4\uc601\ud558))";
    if (new RegExp("^" + prohibited + "(?:\uac70\ub098\\s+" + prohibited + ")*\uc9c0\\s*\ub9c8(?:\uc138\uc694|\ub77c)?$").test(aliased)) {
      const actions = aliased.replace(/\uc9c0\s*\ub9c8(?:\uc138\uc694|\ub77c)?$/, "").split(/\uac70\ub098\s+/).map(part => {
        if (/^(?:\uacf5\uac1c\ud558|\uac8c\uc2dc\ud558)$/.test(part)) return "publish";
        if (part === "\uc804\uc1a1\ud558") return "transmit";
        const [noun, verb] = part.split(/\s+/);
        return (/\uc2dc\uc791\ud558/.test(verb) ? "start " : /\uc6b4\uc601\ud558/.test(verb) ? "operate " : "build ") + noun;
      });
      return "Do not " + actions.join(" or ");
    }
    const list = aliased.match(new RegExp("^(" + platform + "(?:\\s*(?:and|,)\\s*" + platform +
      ")*)\\s+(?:\ubcf4\ub958|\uc81c\uc678)(?:" + KOREAN_ACTION_END + ")?$"));
    if (list) return list[1] + " remain deferred";
    if (!action) return aliased;
    const body = action[1].replace(KOREAN_TERM_PATTERN, (_, term, particle) =>
      KOREAN_TERMS[term] + (["\uc640", "\uacfc"].includes(particle) ? " and" : ""));
    const verb = KOREAN_ACTIONS[action[2]];
    const authoring = ["write", "revise", "update"].includes(verb) && /\b(?:document|draft)\b/.test(body);
    return verb + " " + body + (authoring ? " (document authoring)" : "");
  }).join("\n");
}

function inferredObjectives(query) {
  const text = taskHeadingView(query);
  // Do not interpret quoted source text as top-level tasking.
  if (/["`\u201c\u201d]|(?:^|\s)'/.test(text)) return [];
  const action = "(?:compare|analyze|analyse|assess|research|draft|write|revise|edit|update|review|check|appraise|prepare|evaluate|maintain|fix|repair|improve|optimize|optimise|validate|test|freeze|measure|record|summarize|inspect|read|design|build|create|implement|audit|verify|execute|run|deploy|launch|start|operate|invoke|delete)";
  const start = new RegExp("^(?:please\\s+)?" + action + "\\s+\\S", "i");
  const coordination = new RegExp("\\s+(?:and(?:\\s+then)?|then|also)\\s+(?=" + action + "\\s+\\S)", "i");
  // A colon can introduce another explicit task, not permission from its prefix.
  const colonAction = new RegExp(":\\s+(?=(?:please\\s+)?" + action + "\\s+\\S)", "i");
  const clauses = taskClauses(text).flatMap(clause => clause.split(colonAction));
  const objectives = clauses.flatMap(clause => {
    const task = clause.trim().replace(/^(?:also|then)\s+/i, "");
    if (!start.test(koreanMatchingView(task))) return [];
    const parts = task.split(coordination).map(part => part.trim());
    return parts.every(part => start.test(koreanMatchingView(part))) ? parts : [task];
  });
  const dependent = new RegExp("^(?:please\\s+)?" + action + "\\s+(?:it|its|them|their|that|those|this)\\b", "i");
  if (objectives.some(task => dependent.test(koreanMatchingView(task)))) return [];
  return unique(objectives).length > 1 ? unique(objectives) : [];
}

function guardedRouting(options) {
  return Boolean(options.receipt || options.writeArtifact || options.coverage ||
    options.targetRepository || options.artifactRoot || options.overwriteArtifact || options.scope ||
    options.mission || options.wave || options.agent);
}

function documentReadinessView(text) {
  const document = "(?:documents?|drafts?|worksheets?|reports?|handoff documents?)";
  const readiness = "(?:readiness|preparedness)";
  const assessment = "(?:assess|check|clarify|compare|evaluate|review|verify)";
  const qualifier = "(?:(?:the|this|these|those|our|my|a|an)\\s+)?";
  const modifier = "(?:(?:incoming|outgoing|current|proposed|revised|existing)\\s+)*";
  const forward = new RegExp("(\\b" + assessment + "\\s+" + qualifier + modifier + document + "\\s+)" + readiness + "\\b", "gi");
  const reverse = new RegExp("(\\b" + assessment + "\\s+)(?:the\\s+)?" + readiness +
    "(\\s+of\\s+" + qualifier + modifier + document + "\\b)", "gi");
  return String(text).replace(forward, "$1").replace(reverse, "$1$2");
}

function runtimeWorkContext(text) {
  // This view affects relevance only; original tasks and selected controls remain intact.
  const noun = "(?:dashboard|control panel|database|event store|event replay|ui|architecture|(?:(?:standalone|separate)\\s+)?(?:service|server))s?";
  const subject = "(?:(?:a|an|the|any|new|operational|production)\\s+)*" + noun;
  const separator = "(?:\\s*,\\s*(?:(?:and|or)\\s+)?|\\s+(?:and|or)\\s+)";
  const platformItem = subject + "(?:\\s+(?:development|implementation|work))?";
  const platformList = platformItem + "(?:" + separator + platformItem + ")*";
  const prohibitedAction = "(?:(?:publish|transmit|release)(?:\\s+(?:it|them|the (?:draft|document|output)s?))?|" +
    "(?:build|create|implement|develop|deploy|launch|start|operate|modify|change)\\s+" + platformList + ")";
  const excluded = new RegExp("^(?:(?:please\\s+)?(?:do not|don't|never)\\s+" +
    prohibitedAction + "(?:" + separator + prohibitedAction + ")*" +
    "(?:\\s+(?:now|yet|for this task))?)$", "i");
  const clauses = koreanMatchingView(taskHeadingView(text)).split(/[;\n]+|(?<=[.!?])\s+/)
    .map(clause => clause.trim().replace(/[.!]+$/, ""));
  const listedItem = "(?:" + platformItem + "|publication|(?:model\\s+)?transmissions?|model\\s+transfers?|deployment|private-source exceptions?|external operations?)";
  const itemList = listedItem + "(?:" + separator + listedItem + ")*";
  const excludedList = new RegExp("^(?:no|exclude|omit|defer)\\s+" + itemList +
    "(?:\\s+(?:for|from) this task)?$", "i");
  const deferredList = new RegExp("^(?:(?:please\\s+)?(?:keep|leave)\\s+" + itemList +
    "|" + itemList + "\\s+(?:is|are|remain|remains))\\s+(?:deferred|out of scope)$", "i");
  const retained = clauses.filter(clause => !excluded.test(clause) && !excludedList.test(clause) && !deferredList.test(clause));
  const dependentReview = new RegExp("\\b(?:review|inspect|assess|compare|evaluate|audit|verify|check|validate|read)\\s+" +
    "(?:(?:it|its|their|them|that|those|this)\\b|" + subject + "\\b)", "i");
  if (retained.length !== clauses.length && retained.some(clause =>
    dependentReview.test(clause) || /^(?:but|however|unless|except|instead)\b/i.test(clause))) return String(text);
  // A noun-qualified draft check is not unit/tool readiness, even as its own objective.
  return documentReadinessView(retained.join("\n"));
}

function needsRuntimeSpecialistReading(text, sources) {
  const context = normalizeText(runtimeWorkContext(text));
  return sources.some(file => RUNTIME_SPECIALIST_DOCS.has(file)) || countMatches(context, [
    "architecture", "architectural", "dashboard", "dashboards", "control panel",
    "event", "events", "eventing", "replay", "projection", "projected view", "ui",
    "database", "databases", "runtime mission", "readiness", "preparedness", "server design", "service design"
  ]) > 0;
}

function isReadOnlyDocumentRole(options, query) {
  // The bound document session keeps its own descriptor; this selects reading, not authority.
  if (!["read-only", "document-only-verification"].includes(options.authority) || !options.department || options.receipt || options.scope ||
      options.mission || options.wave || options.agent || options.writeArtifact || options.overwriteArtifact ||
      options.targetRepository || options.artifactRoot) return false;
  const tasks = [query, ...options.capabilityQueries].map(text => koreanMatchingView(taskHeadingView(text)));
  const authoring = RULES.find(rule => rule.id === "document-authoring");
  const documentAction = /^\s*(?:please\s+)?(?:draft|write|revise|edit|update|review|check|compare|appraise|assess|self[- ]review)\b/i;
  if (!tasks.every(text => documentAction.test(text) && (isDocumentAuthoringRequest(text) ||
      isDocumentHandoffRequest(text) || countMatches(text, authoring.keywords) > 0))) return false;
  const actions = runtimeWorkContext(tasks.join("\n")).replace(/\b(?:do not|don't|never)\s+(?:execute|run|deploy|launch|invoke|operate)\b/gi, "");
  if (/\b(?:execute|run|deploy|launch|start|invoke|operate|delete)\b/i.test(actions)) return false;
  const sources = [...options.sources, ...options.inputSources];
  const context = [runtimeWorkContext(tasks.join("\n")), options.department, ...sources].join("\n").replace(/[-_/]/g, " ");
  if (needsRuntimeSpecialistReading(context, sources) ||
      collectKeywordDocs(options.department, DEPARTMENT_DOCS).some(file => RUNTIME_SPECIALIST_DOCS.has(file))) return false;
  // A document can itself concern execution. Preserve specialist context for that subject.
  const executionRoutes = RULES.filter(rule => rule.docs.some(file => EXECUTION_SPECIALIST_DOCS.has(file)));
  return !sources.some(file => EXECUTION_SPECIALIST_DOCS.has(file)) &&
    !executionRoutes.some(rule => countMatches(context, rule.keywords) > 0);
}

function sourceSpecialistReading(text, sources) {
  // Language of delivery is not a national subject. Keep all other wording,
  // including prohibitions and ambiguous clauses, as conservative relevance hints.
  const subject = String(text || "").toLowerCase().replace(/\b(?:(?:in|into)\s+korean(?=$|[.,;:!?]|\s+(?:and|but|without|using|with|for|from|only)\b)|korean(?:-|\s+)language|korean\s+(?:translation|wording))\b/g, " ");
  const context = normalizeText(subject).replace(/[-_/]/g, " ");
  const military = countMatches(context, ["military", "doctrine", "doctrinal", "armed forces", "army",
    "navy", "air force", "marine corps", "defense", "defence", "mission command", "warfighting"]) > 0;
  const organization = countMatches(context, ["organization", "organizations", "organizational",
    "organisation", "organisations", "organisational", "org culture", "culture", "hierarchy", "reporting"]) > 0;
  const korean = sources.some(file => KOREAN_SOURCE_DOCS.has(file)) ||
    (countMatches(context, ["korea", "korean", "rok"]) > 0 && (military || organization)) ||
    countMatches(context, ["all military", "all armed forces", "all source families", "all national doctrines",
      "worldwide military", "cross national", "multinational doctrine", "multinational military",
      "multinational consistency"]) > 0;
  const multinational = korean || military || sources.includes(MULTINATIONAL_SOURCE_DOC) ||
    countMatches(context, ["nato", "coalition", "allied", "multinational", "role alias", "jurisdiction",
      "source family", "source families"]) > 0;
  return { korean, multinational };
}

function needsSkillOperationsReading(text, sources, guarded) {
  if (guarded) return true;
  const rule = RULES.find(item => item.id === "skill-operations"), context = normalizeText(text);
  const client = "(?:codex|claude(?:\\s+code)?|controls|cannae(?:\\s+os)?)(?:\\s+cli)?";
  const edit = new RegExp(
    "\\b(?:author|create|write|edit|modify|change|update|upgrade|revise|fix|debug|repair|configure|maintain|extend|improve|optimize|optimise|validate|test|audit|review)\\s+" +
    "(?:(?:a|an|the|this|these|those|our|my|both|installed|new|existing)\\s+)*" +
    `(?:${client}(?:\\s+(?:and|or)\\s+${client})?\\s+)?` +
    "(?:skills?|skillset|skill instructions|skill entrypoints?|(?:document\\s+)?(?:router|routing(?: rules)?))\\b(?![-_])", "i");
  return sources.some(file => rule.docs.includes(file) && !SKILL_GENERAL_DOCS.has(file) &&
    !Object.keys(TOPICS).some(topic => instructionPaths(topic).includes(file))) ||
    isCorpusOrientationRequest(text) || isOwnSkillMaintenanceRequest(text) || edit.test(String(text)) ||
    rule.keywords.some(keyword => !SKILL_USE_KEYWORDS.has(keyword) && keywordMatches(context, normalizeText(keyword))) ||
    countMatches(context, ["skill maintenance", "skill development", "skill installation", "skill configuration", "skill discovery", "skill instructions", "skill entrypoint",
      "router implementation", "router bug", "routing bug", "routing coverage", "route coverage", "skill coverage",
      "coverage audit", "corpus inventory", "inventory the corpus", "documentation inventory", "inventory coverage",
      "route controls docs", "install ai cli skills", "skill operations"]) > 0;
}

function route(query, repoRoot, options) {
  const inferred = options.capabilityQueries.length ? [] : inferredObjectives(query);
  if (inferred.length > 1 && guardedRouting(options)) {
    throw new Error("MULTI_OBJECTIVE_MODE_UNSUPPORTED: inferred compound tasking needs explicit objective review; do not omit objectives to create a guarded receipt or artifact.");
  }
  const readingOrigins = new Map();
  const noteDocument = (file, reason) => {
    if (!options.explainReading) return;
    if (!readingOrigins.has(file)) readingOrigins.set(file, []);
    readingOrigins.get(file).push(reason);
  };
  const mode = operatorMode(inferred.length ? { ...options, capabilityQueries: inferred } : options, noteDocument, query);
  const inputs = resolveInputReferences(options, repoRoot);
  const taskContext = directTaskContext(options, inputs);
  const scopeIdentity = taskContext
    ? JSON.stringify(["controls-direct-task-v1", taskContext.root, taskContext.id]) : options.mission;
  const inventory = buildArtifactInventory(repoRoot);
  const references = taskReferences(query, options.sources, inventory, inputs ? inputs.sources.map(item => item.path) : null);
  for (const item of references.unresolved) {
    mode.escalation_required_when.push(
      `Resolve task reference "${item.reference}" (${item.reason}) before treating it as an input; identify proposed outputs separately.`
    );
  }
  const scoreRules = sourceText => {
    const text = koreanMatchingView(sourceText);
    return RULES.map(rule => {
    const authoring = rule.id === "document-authoring" && isDocumentAuthoringRequest(text) ? 1 : 0;
    const handoff = rule.id === "continuity-handoff" && isDocumentHandoffRequest(text) ? 1 : 0;
    const order = rule.id === "orders" && isOrderDocumentRequest(text) ? 1 : 0;
    const maintenance = rule.id === "skill-operations" && isOwnSkillMaintenanceRequest(text) ? 1 : 0;
    const contextEvaluation = rule.id === "skill-context-evaluation" && isSkillContextEvaluationRequest(text) ? 1 : 0;
    const capabilityKeywords = rule.id === "skill-operations" && isSkillMethodRequest(text)
      ? rule.keywords.filter(keyword => !SKILL_USE_KEYWORDS.has(keyword)) : rule.keywords;
    const sourceAppraisal = rule.id === "sources-research" &&
      /\b(?:review|check|read|appraise|assess)\s+(?:(?:the|all|supplied|assigned|original)\s+)*(?:source\s+(?:policy|policies|documents?)|source\s+quality)\b/i.test(text) ? 1 : 0;
    return {
      ...rule,
      score: countMatches(text, rule.keywords) || authoring || handoff || order || sourceAppraisal || maintenance || contextEvaluation ||
        (rule.id === "orientation" && isCorpusOrientationRequest(text) ? 1 : 0),
      specific_score: countSpecificMatches(rule.id === "runtime-architecture-dashboard" ? runtimeWorkContext(text) : text, capabilityKeywords) ||
        authoring || handoff || order || sourceAppraisal || maintenance || contextEvaluation
    };
  }).filter(rule => rule.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  };
  const scoredRules = scoreRules(query);
  const capabilityQueries = options.capabilityQueries.length ? options.capabilityQueries : inferred.length ? inferred : [query];
  const multipleObjectives = capabilityQueries.length > 1;
  const assessments = capabilityQueries.map(objective => {
    const rules = scoreRules(objective);
    return { query: objective, rules, decision: capabilityRouting(objective, rules, scopeIdentity) };
  });
  const capabilityQuery = multipleObjectives ? query : capabilityQueries[0];
  let capability = assessments[0].decision;
  if (multipleObjectives) {
    // A supporting objective cannot clear another objective's capability gap.
    const hasGap = assessments.some(item => item.decision.status === "gap_detected");
    const matchedRoutes = unique(assessments.flatMap(item => item.decision.matched_capability_routes)).sort();
    capability = hasGap ? capabilityRouting(query, [], scopeIdentity) : {
      ...capability,
      capability_scope: query,
      reason_code: matchedRoutes.every(id => id === "orientation") ? "CORPUS_ORIENTATION_REQUEST" : "MATCHED_DOCTRINE_ROUTE",
      matched_capability_routes: matchedRoutes
    };
  }
  const forceStructureRule = RULES.find(rule => rule.id === "force-structure");
  const selectedById = new Map(scoredRules.map(rule => [rule.id, rule]));
  const objectiveRules = new Map();
  for (const { rules, decision } of assessments) {
    for (const routeId of decision.matched_capability_routes) {
      const rule = rules.find(item => item.id === routeId);
      if (!objectiveRules.has(routeId) || rule.score > objectiveRules.get(routeId).score) objectiveRules.set(routeId, rule);
    }
  }
  for (const [routeId, rule] of objectiveRules) if (!selectedById.has(routeId)) selectedById.set(routeId, rule);
  const selectedRules = [...selectedById.values()].filter(Boolean)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const forceStructureFallback = capability.status === "gap_detected" &&
    !selectedRules.some(rule => rule.id === "force-structure");
  if (forceStructureFallback) {
    selectedRules.unshift({ ...forceStructureRule, score: 0 });
  }
  const docs = [...BASE_DOCUMENTS];
  for (const file of docs) noteDocument(file, { kind: "baseline_navigation", selected: true });
  docs.push(...references.resolved.map(item => item.path));
  for (const item of references.resolved) noteDocument(item.path, {
    kind: options.sources.includes(item.reference) ? "source_argument" : "task_reference",
    reference: item.reference, selected: true
  });
  const commands = [];

  if (capability.status === "gap_detected") {
    docs.push(...CAPABILITY_GAP_DOCS);
    for (const file of CAPABILITY_GAP_DOCS) noteDocument(file, { kind: "capability_gap", selected: true });
    commands.push(...CAPABILITY_GAP_COMMANDS);
  }
  docs.push(...mode.mode_documents);
  const sourcePaths = [...references.resolved.map(item => item.path), ...(inputs ? inputs.sources.map(item => item.path) : [])];
  const readingContext = koreanMatchingView([query, ...capabilityQueries, ...sourcePaths].join("\n"));
  const githubReleaseReading = needsGithubReleaseReading(readingContext);
  const improvementReading = needsImprovementSpecialistReading(readingContext, sourcePaths);
  const runtimeReading = needsRuntimeSpecialistReading(readingContext, sourcePaths);
  const sourceReading = sourceSpecialistReading([readingContext, mode.actor === "ai" ? mode.department : ""].join("\n"), sourcePaths);
  const skillOperationsReading = needsSkillOperationsReading(
    [readingContext, mode.actor === "ai" ? mode.department : ""].join("\n"), sourcePaths, options.receipt);
  for (const rule of selectedRules) {
    // Specialist reading is conditional; route/control selection is unchanged.
    for (const file of rule.docs) {
      const excludedBy = [];
      if (rule.id === "authority-risk-release" && file.startsWith("docs/github-release-") && !githubReleaseReading) excludedBy.push("github_release_specialist");
      if (rule.id === "bounded-self-improvement" && !IMPROVEMENT_GENERAL_DOCS.has(file) && !improvementReading) excludedBy.push("improvement_specialist");
      if (["runtime-architecture-dashboard", "continuity-handoff"].includes(rule.id) && RUNTIME_SPECIALIST_DOCS.has(file) && !runtimeReading) excludedBy.push("runtime_specialist");
      if (rule.id === "sources-research" && KOREAN_SOURCE_DOCS.has(file) && !sourceReading.korean) excludedBy.push("korean_subject");
      if (rule.id === "sources-research" && file === MULTINATIONAL_SOURCE_DOC && !sourceReading.multinational) excludedBy.push("multinational_subject");
      if (rule.id === "skill-operations" && !SKILL_GENERAL_DOCS.has(file) && !skillOperationsReading) excludedBy.push("skill_maintenance");
      if (!excludedBy.length) docs.push(file);
      noteDocument(file, { kind: "route", route_id: rule.id, selected: excludedBy.length === 0,
        task_match: scoredRules.some(item => item.id === rule.id),
        objective_indexes: assessments.flatMap((item, index) => item.decision.matched_capability_routes.includes(rule.id) ? [index] : []),
        gap_fallback: rule.id === "force-structure" && forceStructureFallback, excluded_by: excludedBy });
    }
    commands.push(...rule.commands);
  }

  // Moved entrypoint controls stay bound in guarded packs; direct reading is conditional.
  const routeIds = new Set(selectedRules.map(rule => rule.id));
  for (const topic of Object.keys(TOPICS)) {
    const triggers = [];
    if (guardedRouting(options)) triggers.push("guarded_context");
    if (skillOperationsReading) triggers.push("skill_maintenance");
    if (sourcePaths.some(file => instructionPaths(topic).includes(file))) triggers.push("explicit_input");
    if (topic === "project-terms" && routeIds.has("project-terminology")) triggers.push("project_terminology");
    if (topic === "project-content" && (inputs || routeIds.has("project-document-delivery") ||
        routeIds.has("document-access-context"))) triggers.push("project_content");
    if (topic === "client-operation" && countMatches(readingContext,
      ["client discovery", "native cli", "native client", "tool-channel", "tool channel", "tool failure", "cli diagnosis"])) {
      triggers.push("client_operation");
    }
    if (triggers.length) for (const file of instructionPaths(topic)) {
      docs.push(file);
      noteDocument(file, { kind: "conditional_instruction", topic, triggers, selected: true });
    }
  }

  // Bound scope by selected routes, not by dropping task docs behind role docs.
  const inventoryPaths = new Set(inventory.map(item => item.path));
  const unavailable = unique(docs).filter(file => !inventoryPaths.has(file));
  if (unavailable.length) {
    throw new Error(`ROUTING_DOCUMENT_UNAVAILABLE: restore or review the selected corpus references before rerouting: ${unavailable.join(", ")}`);
  }
  const recommended = unique(docs)
    .map(file => ({
      path: file,
      exists: true
    }));
  const recommendedPaths = new Set(recommended.map(item => item.path));
  const selectedRouteIds = selectedRules.map(rule => rule.id);
  const routePriority = new Map(selectedRouteIds.map((routeId, index) => [routeId, index]));
  const artifactRoutePriority = artifact => Math.min(
    ...artifact.route_ids
      .filter(routeId => routePriority.has(routeId))
      .map(routeId => routePriority.get(routeId))
  );
  const supportingArtifacts = inventory
    .filter(artifact => artifact.route_ids.some(routeId => selectedRouteIds.includes(routeId)))
    .filter(artifact => !recommendedPaths.has(artifact.path))
    .sort((left, right) => {
      const leftRoutePriority = artifactRoutePriority(left);
      const rightRoutePriority = artifactRoutePriority(right);
      if (leftRoutePriority !== rightRoutePriority) return leftRoutePriority - rightRoutePriority;

      const leftPrimary = left.type === "document" || left.type === "html-document" ? 0 : 1;
      const rightPrimary = right.type === "document" || right.type === "html-document" ? 0 : 1;
      return leftPrimary - rightPrimary || left.path.localeCompare(right.path);
    });
  const visibleSupportingArtifacts = options.all
    ? supportingArtifacts
    : supportingArtifacts.slice(0, options.limit);
  const coverage = coverageReport(repoRoot, inventory);
  const normalization = [query, ...capabilityQueries].some(text => HAS_KOREAN.test(text)) ? {
    kind: "bounded_korean_lexical_view_v1", matching_query: koreanMatchingView(query),
    complete_translation: false, source_language: "Korean or mixed task/objective text",
    original_text_in: "query", original_objectives_in: multipleObjectives ? "capability_queries" : "capability_query",
    objective_views: capabilityQueries.flatMap((objective, index) => HAS_KOREAN.test(objective)
      ? [{ objective_index: index, matching_query: koreanMatchingView(objective) }] : [])
  } : null;

  return {
    query,
    ...(!guardedRouting(options) && (normalization || taskHeadingView(query) !== query || runtimeWorkContext(query) !== query || inferred.length) ? {
      request_intake: {
        basis: "Bounded lexical task/exclusion views; not translation, semantic completeness or authorization.",
        task_query: taskHeadingView(query),
        runtime_relevance_query: runtimeWorkContext(query),
        objectives: multipleObjectives ? (inferred.length ? "inferred_task_clauses" : "caller_declared") : "single",
        ...(normalization ? { normalization } : {}),
        original_constraints_in: "query",
        semantic_completeness_verified: false,
        authority_changed: false
      }
    } : {}),
    capability_query: capabilityQuery,
    ...(multipleObjectives ? {
      capability_queries: capabilityQueries,
      capability_assessments: assessments.map(({ query, decision }) => ({
        query, status: decision.status, reason_code: decision.reason_code,
        matched_capability_routes: decision.matched_capability_routes
      })),
      capability_assessment_basis: (inferred.length ? "Inferred task clauses" : "Caller-declared objectives") +
        " with lexical matching; objective completeness and semantic correctness remain unverified."
    } : {}),
    repo_root: repoRoot,
    ...(taskContext ? { task_context: taskContext } : {}),
    operating_mode: mode,
    matched_routes: selectedRules.map(rule => ({ id: rule.id, score: rule.score })),
    capability_routing: capability,
    task_references: references,
    ...(inputs ? { task_inputs: inputs } : {}),
    recommended_documents: recommended,
    ...(options.explainReading ? { reading_selection: {
      basis: "Observed lexical selection paths, not semantic relevance, access approval or an assigned reading profile.",
      semantic_relevance_verified: false, access_authorized: false, required_reading_assessed: false, source_content_read: false,
      objective_queries: capabilityQueries,
      documents: [...readingOrigins].map(([file, reasons]) => ({
        path: file, in_inventory: inventoryPaths.has(file), recommended: recommendedPaths.has(file), reasons
      })),
      project_inputs: inputs ? inputs.sources.map(item => ({
        path: item.path, kind: "declared_project_input", delivery_mode: "reference_only", content_loaded: false
      })) : []
    } } : {}),
    supporting_artifacts: visibleSupportingArtifacts,
    supporting_artifact_count: supportingArtifacts.length,
    supporting_artifacts_truncated: !options.all && supportingArtifacts.length > visibleSupportingArtifacts.length,
    route_inventory: {
      routable_artifact_count: coverage.routable_artifact_count,
      routed_artifact_count: coverage.routed_artifact_count,
      unrouted_artifact_count: coverage.unrouted_artifact_count
    },
    validation_commands: unique(commands),
    always_consider: [
      "When actor=user, preserve the human user as final decision authority.",
      "When actor=ai, route by role, department, authority, task, and need-to-know.",
      "Run --coverage after adding, renaming, or deleting docs, schemas, samples, runners, or fixtures.",
      "Update docs/source-map.md when adding official-source claims.",
      "Update docs/research-compendium.md when adding durable research conclusions.",
      "Add or update schema/sample/runner/fixture when changing runtime contracts.",
      "Run git diff --check before committing."
    ]
  };
}

function sanitizeIdPart(value) {
  const sanitized = String(value || "unspecified").replace(/[^A-Za-z0-9_-]+/g, "_");
  return sanitized || "unspecified";
}

function commandString() {
  const rawArgs = process.argv.slice(1);
  const redactedArgs = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (["--target-repository", "--artifact-root"].includes(arg)) {
      redactedArgs.push(arg, "<local-path>");
      index += 1;
      continue;
    }
    if (/^--(?:target-repository|artifact-root)=/.test(arg)) {
      redactedArgs.push(arg.replace(/=.*/, "=<local-path>"));
      continue;
    }
    redactedArgs.push(arg);
  }
  const args = redactedArgs.map(arg => {
    if (/^[A-Za-z0-9_./:=@-]+$/.test(arg)) return arg;
    return `"${String(arg).replace(/(["\\$`])/g, "\\$1")}"`;
  });
  return `node ${args.join(" ")}`;
}

function routingReceipt(routeResult, options) {
  const scope = options.scope || (String(options.role || "").toUpperCase() === "COS" ? "wave" : "agent");
  if (!["wave", "agent"].includes(scope)) {
    console.error("--scope must be wave or agent when --receipt is used");
    process.exit(2);
  }
  if (!options.mission || !options.wave || !options.agent) {
    console.error("--receipt requires --mission, --wave, and --agent");
    process.exit(2);
  }
  if (routeResult.operating_mode.actor !== "ai") {
    console.error("--receipt requires --actor=ai");
    process.exit(2);
  }
  if (!options.role || !options.department || !options.authority) {
    console.error("--receipt requires --role, --department, and --authority");
    process.exit(2);
  }

  return {
    schema_version: "0.2",
    type: "RoutingReceipt",
    id: `RR-${sanitizeIdPart(options.wave)}-${sanitizeIdPart(options.agent)}`,
    mission_id: options.mission,
    wave_id: options.wave,
    agent_id: options.agent,
    wave_scope: scope,
    actor: "ai",
    agent_role: String(routeResult.operating_mode.role || options.role).toUpperCase(),
    department: String(routeResult.operating_mode.department || options.department).toLowerCase(),
    authority_scope: String(routeResult.operating_mode.authority || options.authority).toLowerCase(),
    routing_mode: routeResult.operating_mode.mode,
    router_query: routeResult.query,
    capability_query: routeResult.capability_query,
    router_command: commandString(),
    matched_routes: routeResult.matched_routes,
    capability_routing: routeResult.capability_routing,
    recommended_documents: routeResult.recommended_documents,
    supporting_artifacts: routeResult.supporting_artifacts,
    supporting_artifact_count: routeResult.supporting_artifact_count,
    route_inventory: routeResult.route_inventory,
    validation_commands: routeResult.validation_commands,
    escalation_required_when: routeResult.operating_mode.escalation_required_when,
    created_at: new Date().toISOString()
  };
}

let parsed, repoRoot;
try {
  parsed = parseArgs(process.argv.slice(2));
  repoRoot = resolveDoctrineRoot(parsed.options, parsed.repoRootArg);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

if (parsed.options.coverage) {
  const report = coverageReport(repoRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.valid ? 0 : 1);
}

let routed;
try {
  routed = route(parsed.query, repoRoot, parsed.options);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const output = parsed.options.receipt ? routingReceipt(routed, parsed.options) : routed;
if (parsed.options.receipt) {
  try {
    const { validatePayload } = require(path.join(repoRoot, "validator-cli-prototype/validate.js"));
    const validation = validatePayload(output, "routing-receipt");
    if (validation.valid !== true) {
      console.error(`ROUTING_RECEIPT_INVALID: ${unique(validation.issues.map(item => item.code)).join(", ")}`);
      process.exit(2);
    }
  } catch (error) {
    console.error(`ROUTING_RECEIPT_VALIDATION_FAILED (${error.code || error.name}): restore the bound doctrine validator and its dependencies before retrying.`);
    process.exit(2);
  }
}
if (parsed.options.writeArtifact) {
  if (!parsed.options.receipt || !parsed.options.targetRepository) {
    console.error("--write-artifact requires --receipt and --target-repository <path>.");
    process.exit(2);
  }
  try {
    const { writeRepositoryArtifact } = require(path.join(repoRoot, "repository-artifact-store.js"));
    const artifact = writeRepositoryArtifact({
      repositoryPath: parsed.options.targetRepository,
      artifactRoot: parsed.options.artifactRoot,
      missionId: output.mission_id,
      waveId: output.wave_id,
      kind: "routing-receipts",
      artifactId: output.id,
      payload: output,
      overwrite: parsed.options.overwriteArtifact
    });
    console.error(`Artifact written: ${artifact.artifact_path}`);
  } catch (error) {
    console.error(`Artifact persistence failed: ${error.message}`);
    process.exit(1);
  }
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
