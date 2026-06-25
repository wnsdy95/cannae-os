# Data Model SQL

## 0. 목적

이 문서는 군대식 LLM 런타임의 mission, orders, evidence, audit, readiness 저장소를 SQL 모델로 설계한다.

목표는 완전한 production schema가 아니라, reference architecture를 실제 DB로 구현할 때 필요한 기본 테이블과 관계를 제시하는 것이다.

## 1. 설계 원칙

- mission은 모든 상태의 기준 id다.
- orders와 task orders는 mission에 속한다.
- tool request와 approval은 audit 대상이다.
- evidence는 claim과 interpretation을 분리한다.
- AAR는 readiness와 SOP 업데이트로 연결된다.
- 원문 payload는 JSON으로 보존하되 주요 query 필드는 별도 컬럼으로 둔다.

## 2. Core Tables

```sql
CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  mission_statement TEXT NOT NULL,
  intent_purpose TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'internal',
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
);

CREATE TABLE mission_constraints (
  mission_id TEXT NOT NULL REFERENCES missions(id),
  constraint_text TEXT NOT NULL,
  PRIMARY KEY (mission_id, constraint_text)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  order_type TEXT NOT NULL,
  parent_order_id TEXT REFERENCES orders(id),
  created_by TEXT NOT NULL,
  classification TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE task_orders (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  order_id TEXT REFERENCES orders(id),
  assigned_to TEXT NOT NULL,
  task TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
);
```

## 3. Tool / Approval / Audit

```sql
CREATE TABLE tool_requests (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  task_id TEXT REFERENCES task_orders(id),
  actor TEXT NOT NULL,
  tool TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  risk_level TEXT,
  roe_class TEXT NOT NULL,
  approval_required BOOLEAN NOT NULL,
  reason TEXT NOT NULL,
  result TEXT,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE approval_requests (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  tool_request_id TEXT REFERENCES tool_requests(id),
  actor TEXT NOT NULL,
  requested_action TEXT NOT NULL,
  tool TEXT NOT NULL,
  target TEXT NOT NULL,
  roe_class TEXT NOT NULL,
  why_needed TEXT NOT NULL,
  status TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMP,
  expires_at TIMESTAMP,
  payload_json TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  event_type TEXT NOT NULL,
  actor TEXT,
  severity TEXT,
  summary TEXT NOT NULL,
  payload_json TEXT,
  created_at TIMESTAMP NOT NULL
);
```

## 4. Evidence

```sql
CREATE TABLE evidence_records (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  source_title TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  reliability TEXT NOT NULL,
  claim TEXT NOT NULL,
  interpretation TEXT NOT NULL,
  checked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE evidence_links (
  evidence_id TEXT NOT NULL REFERENCES evidence_records(id),
  document_path TEXT NOT NULL,
  PRIMARY KEY (evidence_id, document_path)
);
```

## 5. SITREP / FRAGO / AAR

```sql
CREATE TABLE sitreps (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE fragos (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  parent_order_id TEXT REFERENCES orders(id),
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE aars (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  expected_summary TEXT NOT NULL,
  actual_summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

## 6. Risk / Readiness

```sql
CREATE TABLE risks (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  level TEXT NOT NULL,
  owner TEXT,
  ccir BOOLEAN NOT NULL DEFAULT FALSE,
  residual_risk TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMP
);

CREATE TABLE readiness_ledger (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task TEXT NOT NULL,
  rating TEXT NOT NULL,
  evidence_summary TEXT NOT NULL,
  limitations TEXT,
  next_training TEXT,
  updated_at TIMESTAMP NOT NULL
);
```

## 7. Recommended Indexes

```sql
CREATE INDEX idx_orders_mission ON orders(mission_id);
CREATE INDEX idx_tasks_mission_status ON task_orders(mission_id, status);
CREATE INDEX idx_tool_requests_mission_roe ON tool_requests(mission_id, roe_class);
CREATE INDEX idx_approvals_status ON approval_requests(status);
CREATE INDEX idx_evidence_mission_reliability ON evidence_records(mission_id, reliability);
CREATE INDEX idx_audit_mission_created ON audit_events(mission_id, created_at);
CREATE INDEX idx_readiness_agent_task ON readiness_ledger(agent_id, task);
```

## 8. 관련 문서

- `reference-architecture.md`
- `sample-runtime-state.md`
- `schema-files/README.md`
- `policy-engine-rules.md`
- `agent-readiness-ledger.md`
