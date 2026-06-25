#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const RULES = [
  {
    id: "orientation",
    keywords: ["overview", "framework", "start", "read", "use", "설명", "전체", "개념", "시작", "사용"],
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
    keywords: ["opord", "warno", "frago", "sitrep", "aar", "backbrief", "rehearsal", "prompt", "orders", "명령", "하달", "프롬프트", "리허설"],
    docs: [
      "docs/prompt-templates.md",
      "docs/orders-production-pipeline.md",
      "docs/opord-annex-model.md",
      "docs/backbrief-and-rehearsal-sop.md",
      "docs/information-to-operations-cycle.md"
    ],
    commands: [
      "node runtime-demo-runner.js",
      "node orders-dissemination-runner.js runtime-demo-payloads/opord.json runtime-demo-payloads/task-order.json sample-payloads/valid-backbrief.json sample-payloads/valid-rehearsal.json"
    ]
  },
  {
    id: "authority-risk-release",
    keywords: ["authority", "approval", "risk", "roe", "release", "scope", "delegation", "승인", "권한", "위험", "공개", "릴리즈", "위임"],
    docs: [
      "docs/agent-roles-and-authority.md",
      "docs/tool-use-roe.md",
      "docs/approval-scope-policy.md",
      "docs/risk-acceptance-authority.md",
      "docs/context-releasability-policy.md",
      "docs/policy-engine-rules.md"
    ],
    commands: [
      "node run-authority-integration-fixtures.js",
      "node run-release-integration-fixtures.js"
    ]
  },
  {
    id: "multi-agent-organization",
    keywords: ["agent", "multi-agent", "role", "staff", "department", "collaboration", "b2c2wg", "liaison", "에이전트", "보직", "참모", "부서", "협업", "병과"],
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
    keywords: ["force", "structure", "unit", "role creation", "disband", "expand", "reduce", "dotmlpf", "부대", "증축", "감축", "신설", "폐지"],
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
    id: "sof-tf",
    keywords: ["sof", "special", "task force", "tf", "incident", "high-risk", "특수부대", "특수", "고위험"],
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
    keywords: ["source", "research", "citation", "doctrine", "nato", "uk", "canada", "korea", "multinational", "출처", "리서치", "논문", "교리", "미군", "한국군", "다국적"],
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
    keywords: ["document access", "need-to-know", "context", "classification", "opsec", "eefi", "문서", "접근", "컨텍스트", "기밀", "보안"],
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
    id: "runtime-validation",
    keywords: ["schema", "validator", "runner", "fixture", "test", "json", "runtime", "검증", "스키마", "러너", "테스트"],
    docs: [
      "schema-files/README.md",
      "sample-payloads/README.md",
      "docs/evaluation-fixtures.md",
      "docs/validator-prototype.md",
      "validator-cli-prototype/README.md"
    ],
    commands: [
      "node validator-cli-prototype/run-fixtures.js",
      "for f in $(ls run-*.js | sort); do node \"$f\" || exit 1; done"
    ]
  },
  {
    id: "runtime-architecture-dashboard",
    keywords: ["architecture", "dashboard", "event", "projection", "ui", "database", "maintenance", "readiness", "아키텍처", "대시보드", "이벤트", "프로젝션", "정비", "준비태세"],
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
    keywords: ["continuity", "handoff", "rotation", "succession", "knowledge", "km", "인수인계", "승계", "교체", "로테이션", "지식관리"],
    docs: [
      "docs/personnel-continuity-model.md",
      "docs/knowledge-management-sop.md",
      "docs/event-sourcing-model.md"
    ],
    commands: [
      "node run-continuity-drill-fixtures.js"
    ]
  },
  {
    id: "skill-operations",
    keywords: ["skill", "routing", "operator", "inventory", "coverage", "install", "installer", "cli", "codex", "claude", "스킬", "라우팅", "문서체계", "문서 체계", "커버리지", "설치", "자동설치"],
    docs: [
      ".claude/skills/controls-doctrine-operator/SKILL.md",
      "install-ai-cli-skills.sh",
      "codex-skills/controls-doctrine-operator/SKILL.md",
      "codex-skills/controls-doctrine-operator/references/document-routing.md",
      "codex-skills/controls-doctrine-operator/references/self-improvement-loop.md",
      "docs/controls-doctrine-operator-skill.html"
    ],
    commands: [
      "node .claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .",
      "python3 /Users/work/.codex/skills/.system/skill-creator/scripts/quick_validate.py codex-skills/controls-doctrine-operator"
    ]
  }
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
    "docs/policy-engine-rules.md"
  ],
  S4: [
    "docs/maintenance-readiness-model.md",
    "docs/agent-readiness-ledger.md",
    "docs/data-model.sql.md"
  ],
  S6: [
    "docs/reference-architecture.md",
    "docs/event-sourcing-model.md",
    "docs/command-post-dashboard.md"
  ]
};

const DEPARTMENT_DOCS = [
  {
    keywords: ["operations", "ops", "s3", "작전"],
    docs: ["docs/orders-production-pipeline.md", "docs/information-to-operations-cycle.md"]
  },
  {
    keywords: ["intelligence", "intel", "s2", "정보"],
    docs: ["docs/source-reliability-rubric.md", "docs/opsec-classification-model.md"]
  },
  {
    keywords: ["logistics", "readiness", "maintenance", "s4", "군수", "정비", "준비태세"],
    docs: ["docs/maintenance-readiness-model.md", "docs/agent-readiness-ledger.md"]
  },
  {
    keywords: ["systems", "platform", "architecture", "s6", "시스템", "플랫폼"],
    docs: ["docs/reference-architecture.md", "docs/event-sourcing-model.md"]
  },
  {
    keywords: ["collaboration", "cross-functional", "liaison", "협업", "연락"],
    docs: ["docs/interdepartment-collaboration-policy.md", "docs/b2c2wg-operating-model.md"]
  }
];

const AUTHORITY_DOCS = [
  {
    keywords: ["approval", "approve", "승인"],
    docs: ["docs/approval-scope-policy.md"]
  },
  {
    keywords: ["release", "external", "final", "공개", "릴리즈", "최종"],
    docs: ["docs/context-releasability-policy.md", "docs/opsec-classification-model.md"]
  },
  {
    keywords: ["risk", "acceptance", "high-risk", "위험"],
    docs: ["docs/risk-acceptance-authority.md", "docs/tool-use-roe.md"]
  },
  {
    keywords: ["execution", "tool", "scoped-execution", "실행", "도구"],
    docs: ["docs/tool-use-roe.md", "docs/policy-engine-rules.md"]
  }
];

const ROUTABLE_EXTENSIONS = new Set([".md", ".html", ".json", ".js", ".sh", ".yaml", ".yml"]);
const EXCLUDED_DIRS = new Set([".git", "node_modules"]);

const ROUTE_HINTS = [
  {
    id: "skill-operations",
    keywords: ["codex-skills", ".claude", "claude", "controls-doctrine-operator", "skill", "skills", "install-ai-cli-skills", "route_controls_docs", "operator-skill", "openai.yaml"]
  },
  {
    id: "orientation",
    keywords: ["readme", "military-llm-framework", "military-operating-system", "glossary", "commander-handbook", "sop-library", "case-studies", "functional-domains", "experiments", "implementation-guide"]
  },
  {
    id: "orders",
    keywords: ["opord", "warno", "frago", "sitrep", "aar", "backbrief", "rehearsal", "orders", "task-order", "runtime-demo", "information-to-operations", "decision-packet", "ccir-alert", "alert-router", "prompt", "prompt-dsl", "prompt-templates"]
  },
  {
    id: "authority-risk-release",
    keywords: ["authority", "approval", "risk", "roe", "release", "policy-engine", "decision-risk", "tool-use", "approval-", "risk-acceptance", "release-gate", "release-review", "decision-packet"]
  },
  {
    id: "multi-agent-organization",
    keywords: ["agent", "department", "collaboration", "b2c2wg", "working-group", "liaison", "metl", "battle-rhythm", "llm-agent-org-chart", "functional-domains"]
  },
  {
    id: "force-structure",
    keywords: ["force-structure", "force", "structure-change", "unit", "dotmlpf"]
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
    keywords: ["document-access", "context", "classification", "opsec", "eefi", "releasability", "context-filter", "handoff-packet"]
  },
  {
    id: "runtime-validation",
    keywords: ["schema-files", "sample-payloads", "fixture", "fixtures", "validator", "validate", "linter", "runner", "run-", "prototype", "payloads", "evaluation-metrics"]
  },
  {
    id: "runtime-architecture-dashboard",
    keywords: ["architecture", "dashboard", "event", "projection", "ui", "database", "maintenance", "readiness", "data-model", "runtime", "event-replay"]
  },
  {
    id: "continuity-handoff",
    keywords: ["continuity", "handoff", "rotation", "succession", "knowledge-management", "personnel-continuity"]
  }
];

function usage() {
  console.error("Usage: node scripts/route_controls_docs.js [--actor=user|ai] [--role=ROLE] [--department=DEPT] [--authority=SCOPE] [--all] [--limit=N] <query> [repo-root]");
  console.error("       node scripts/route_controls_docs.js --receipt --scope=wave|agent --mission=MISSION_ID --wave=WAVE_ID --agent=AGENT_ID --actor=ai --role=ROLE --department=DEPT --authority=SCOPE <query> [repo-root]");
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
    return score + (lower.includes(needle) ? 1 : 0);
  }, 0);
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
  if (file.endsWith(".js") || file.endsWith(".sh")) return "runner-or-tool";
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
  if (file === "source-map-linter.js" || file === "source-map-url-coverage-report.json") routeIds.push("sources-research");
  if (file === "orders-dissemination-runner.js") routeIds.push("orders");
  if (file === "handoff-generator.js") routeIds.push("continuity-handoff");
  if (file === "maintenance-readiness-runner.js") routeIds.push("runtime-architecture-dashboard");
  if (file === "maintenance-dashboard-runner.js") routeIds.push("runtime-architecture-dashboard");
  if (file === "decision-packet-linter.js") routeIds.push("authority-risk-release", "orders");
  if (file === "aar-to-readiness-update.js") routeIds.push("orders", "runtime-architecture-dashboard");

  return unique(routeIds);
}

function buildArtifactInventory(repoRoot) {
  return walkRoutableFiles(repoRoot).map(file => ({
    path: file,
    type: artifactType(file),
    route_ids: routeIdsForArtifact(file)
  }));
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

function coverageReport(repoRoot) {
  const inventory = buildArtifactInventory(repoRoot);
  const unrouted = inventory.filter(artifact => artifact.route_ids.length === 0);

  return {
    valid: unrouted.length === 0,
    repo_root: repoRoot,
    routable_artifact_count: inventory.length,
    routed_artifact_count: inventory.length - unrouted.length,
    unrouted_artifact_count: unrouted.length,
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
    if (rule.keywords.some(keyword => text.includes(String(keyword).toLowerCase()))) {
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
    receipt: false,
    scope: null,
    mission: null,
    wave: null,
    agent: null,
    coverage: false,
    all: false,
    limit: 40
  };
  const queryParts = [];
  const valueOptionNames = new Set(["actor", "role", "department", "authority", "scope", "mission", "wave", "agent", "limit"]);
  const booleanOptionNames = new Set(["coverage", "all", "receipt"]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const equalsMatch = arg.match(/^--([^=]+)=(.*)$/);

    if (equalsMatch && valueOptionNames.has(equalsMatch[1])) {
      options[equalsMatch[1]] = equalsMatch[2];
      continue;
    }

    if (arg.startsWith("--") && valueOptionNames.has(arg.slice(2))) {
      const key = arg.slice(2);
      index += 1;
      if (index >= argv.length) usage();
      options[key] = argv[index];
      continue;
    }

    if (arg.startsWith("--") && booleanOptionNames.has(arg.slice(2))) {
      options[arg.slice(2)] = true;
      continue;
    }

    queryParts.push(arg);
  }

  const parsedLimit = Number.parseInt(options.limit, 10);
  options.limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 40;

  let repoRootArg = null;
  if (queryParts.length > 0) {
    const last = queryParts[queryParts.length - 1];
    if (fs.existsSync(last) && findRepoRoot(last)) {
      repoRootArg = queryParts.pop();
    }
  }

  const query = queryParts.join(" ").trim();
  if (!query && !options.coverage) usage();

  return { query, repoRootArg, options };
}

function operatorMode(options) {
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

  const modeDocs = [
    "docs/role-document-access-policy.md",
    "docs/agent-roles-and-authority.md",
    "docs/approval-scope-policy.md",
    "docs/tool-use-roe.md"
  ];

  const roleKey = String(options.role || "").toUpperCase();
  if (ROLE_DOCS[roleKey]) modeDocs.push(...ROLE_DOCS[roleKey]);
  modeDocs.push(...collectKeywordDocs(options.department, DEPARTMENT_DOCS));
  modeDocs.push(...collectKeywordDocs(options.authority, AUTHORITY_DOCS));

  const missingDelegationFields = ["role", "department", "authority"]
    .filter(field => !options[field]);
  const escalationRequiredWhen = [
    "Requested action exceeds delegated role, department, or authority.",
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

function route(query, repoRoot, options) {
  const mode = operatorMode(options);
  const scoringText = [query, mode.role, mode.department, mode.authority].filter(Boolean).join(" ");
  const inventory = buildArtifactInventory(repoRoot);
  const scoredRules = RULES.map(rule => ({
    ...rule,
    score: countMatches(scoringText, rule.keywords)
  })).filter(rule => rule.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const selectedRules = scoredRules.length > 0 ? scoredRules : [RULES[0]];
  const docs = ["README.md", "docs/source-map.md"];
  const commands = [];

  docs.push(...mode.mode_documents);
  for (const rule of selectedRules.slice(0, 4)) {
    docs.push(...rule.docs);
    commands.push(...rule.commands);
  }

  const recommended = unique(docs)
    .filter(file => fs.existsSync(path.join(repoRoot, file)))
    .slice(0, 16)
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
  const coverage = coverageReport(repoRoot);

  return {
    query,
    repo_root: repoRoot,
    operating_mode: mode,
    matched_routes: selectedRules.map(rule => ({ id: rule.id, score: rule.score })),
    recommended_documents: recommended,
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
  const args = process.argv.slice(1).map(arg => {
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
    schema_version: "0.1",
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
    router_command: commandString(),
    matched_routes: routeResult.matched_routes,
    recommended_documents: routeResult.recommended_documents,
    supporting_artifacts: routeResult.supporting_artifacts,
    supporting_artifact_count: routeResult.supporting_artifact_count,
    route_inventory: routeResult.route_inventory,
    validation_commands: routeResult.validation_commands,
    escalation_required_when: routeResult.operating_mode.escalation_required_when,
    created_at: new Date().toISOString()
  };
}

const parsed = parseArgs(process.argv.slice(2));
const possibleRoot = parsed.repoRootArg ? findRepoRoot(parsed.repoRootArg) : null;
const repoRoot = possibleRoot || findRepoRoot(process.cwd());

if (!repoRoot) {
  console.error("Could not find controls repo root. Pass it as the last argument.");
  process.exit(2);
}

if (parsed.options.coverage) {
  const report = coverageReport(repoRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.valid ? 0 : 1);
}

const routed = route(parsed.query, repoRoot, parsed.options);
const output = parsed.options.receipt ? routingReceipt(routed, parsed.options) : routed;
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
