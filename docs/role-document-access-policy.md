# Role Document Access Policy

## 0. 목적

이 문서는 각 에이전트가 어떤 문서를 읽어야 하는지, 역할, 직무, 권한에 따라 제한하는 방침이다.

기존 `context-releasability-policy.md`가 context item의 전달 방식을 다룬다면, 이 문서는 그보다 앞단에서 "어떤 파일을 열 수 있는가"를 정한다.

핵심 원칙:

```text
문서는 모두에게 열려 있는 지식창고가 아니다.
각 agent는 자기 임무에 필요한 문서만 읽고,
나머지는 summary, reference, 또는 Commander/CoS 승인 요청으로 처리한다.
```

## 1. 기본 규칙

1. 기본값은 deny다.
2. 문서 접근은 role, duty, authority level이 모두 맞아야 한다.
3. 역할이 맞아도 현재 duty에 필요 없으면 읽지 않는다.
4. 낮은 권한의 role은 높은 권한의 문서를 원문으로 읽지 않는다.
5. `restricted` 또는 EEFI 관련 문서는 reference only 또는 redacted summary가 기본이다.
6. 문서 접근 예외는 Commander 또는 CoS approval event로 남긴다.
7. 읽은 문서 목록은 handoff와 AAR에서 재현 가능해야 한다.

## 2. 접근 판단 모델

```text
CAN_READ(role, duty, authority, document):
  if manifest.default_decision != deny: block
  if role not in document.allowed_roles: deny
  if duty not in document.duties and mission_common not in document.duties: deny
  if authority < document.minimum_authority_level: deny
  if document.classification == restricted and delivery_mode == raw: block
  else allow with delivery_mode
```

## 3. Authority level

| Level | 읽기 권한 의미 |
| --- | --- |
| L0 | 공개/내부 문서 관찰, 요약, 근거 확인 |
| L1 | 할당 임무 수행에 필요한 절차 문서와 schema 확인 |
| L2 | 범위 내 문서 수정과 runner/schema 영향 확인 |
| L3 | 외부 영향, release, 비용, 권한 변경 관련 문서 확인 |
| L4 | 비가역 변경, 배포, 삭제, 공개 발행 관련 문서 확인 |
| L5 | 고위험 판단, 정책 변경, retained authority 문서 확인 |

## 4. Role별 기본 문서 묶음

아래 표는 standing role의 기본 읽기 묶음이다. 실제 실행 시에는 `schema-files/document-access-manifest.schema.json`으로 mission별 access manifest를 만든다.

| Role | Duty | Required documents | Optional documents | Default denied |
| --- | --- | --- | --- | --- |
| COMMANDER | command_decision | `docs/commander-handbook.md`, `docs/agent-roles-and-authority.md`, `docs/decision-risk-assessment.md`, `docs/risk-acceptance-authority.md` | `docs/military-llm-framework-v0.1.md`, `docs/approval-scope-policy.md`, `docs/force-structure-change-policy.md` | raw credentials, implementation scratch files |
| COS | orchestration | `docs/military-operating-system.md`, `docs/llm-agent-org-chart.md`, `docs/agent-battle-rhythm.md`, `docs/orders-production-pipeline.md` | `docs/b2c2wg-operating-model.md`, `docs/interdepartment-collaboration-policy.md`, `docs/force-structure-change-policy.md` | restricted raw source values |
| S2 | source_verification | `docs/source-map.md`, `docs/source-reliability-rubric.md`, `docs/information-to-operations-cycle.md`, `docs/research-compendium.md` | `docs/korean-military-sources.md`, `docs/decision-risk-assessment.md` | credentials, release authority documents unless tasked |
| S3 | operations_planning | `docs/orders-production-pipeline.md`, `docs/prompt-templates.md`, `docs/backbrief-and-rehearsal-sop.md`, `docs/ccir-alerting-model.md` | `docs/agent-metl.md`, `docs/tool-use-roe.md`, `docs/opord-annex-model.md` | raw source archive, private evidence |
| S4 | sustainment | `docs/maintenance-readiness-model.md`, `docs/tool-use-roe.md`, `docs/runtime-automation-roadmap.md` | `docs/data-model.sql.md`, `docs/force-structure-change-policy.md` | sensitive user content unrelated to resources |
| S6 | knowledge_management | `README.md`, `docs/knowledge-management-sop.md`, `docs/source-map.md`, `docs/context-releasability-policy.md`, `docs/opsec-classification-model.md` | `docs/event-sourcing-model.md`, `docs/data-model.sql.md`, `docs/research-compendium.md` | restricted raw values without approval |
| RED_TEAM | independent_review | `docs/military-ai-risk-register.md`, `docs/decision-risk-assessment.md`, `docs/source-reliability-rubric.md`, `docs/context-releasability-policy.md` | `docs/opsec-classification-model.md`, `docs/evaluation-fixtures.md` | exploit detail, credentials, private raw data |
| EVALUATOR | evaluation | `docs/evaluation-metrics.md`, `docs/evaluation-fixtures.md`, `docs/agent-readiness-ledger.md`, `docs/validator-prototype.md` | `validator-cli-prototype/fixtures.md`, `docs/maintenance-readiness-model.md` | raw sensitive mission notes |
| EXECUTOR | assigned_execution | `docs/implementation-guide.md`, `docs/tool-use-roe.md`, `docs/prompt-dsl.md`, `schema-files/README.md` | assigned OPORD, assigned annex, task-specific runner README | Commander-only decision notes, unrelated research archive |
| RECORDER | audit_and_aar | `docs/knowledge-management-sop.md`, `docs/sop-library.md`, `docs/source-map.md`, `docs/research-compendium.md` | `docs/evaluation-fixtures.md`, `docs/agent-readiness-ledger.md` | restricted raw evidence without approval |

## 5. Delivery modes

| Mode | 의미 |
| --- | --- |
| raw | 원문 읽기 가능 |
| summary | 요약 또는 redacted excerpt만 전달 |
| reference_only | 파일 경로/id만 전달하고 원문 읽기는 별도 승인 |
| denied | 읽기 금지 |

## 6. Mission별 manifest

실제 실행에서는 role별 정적 표만 사용하지 않는다. mission마다 `DocumentAccessManifest`를 만든다.

필수 요소:

- `default_decision`: 반드시 `deny`.
- `role_profiles`: role, duty, authority level, required/optional/denied docs.
- `documents`: path, classification, owner, allowed roles, duties, minimum authority, delivery mode.
- `controls`: need-to-know, no bulk read, audit, exception approval, source of truth.

## 7. Runner 사용 방식

`document-access-runner.js`는 manifest를 받아 특정 role이 읽을 수 있는 문서만 projection한다.

```bash
node document-access-runner.js sample-payloads/valid-document-access-manifest.json S2 source_verification L0
```

출력:

- `allowed_documents`: 읽을 수 있는 문서와 delivery mode.
- `required_documents`: 해당 duty 수행 전 반드시 읽어야 하는 문서.
- `denied_documents`: 왜 거부됐는지.
- `preflight_blocks`: manifest 자체가 안전하지 않은 경우.
- `audit_requirements`: 읽기 event에 남겨야 할 항목.

## 8. Anti-patterns

- 모든 agent에게 `README.md`와 전체 `docs/`를 읽게 한다.
- Executor에게 Commander decision, risk acceptance 원문, source archive 전체를 준다.
- Red Team에게 restricted raw exploit detail을 준다.
- S2가 확인한 출처 원문을 release review 없이 final output으로 넘긴다.
- S6가 문서 관리 권한을 이유로 모든 restricted raw value를 읽는다.
- manifest 없이 "필요하면 알아서 찾아 읽어"라고 지시한다.

## 9. 기존 정책과의 관계

- `agent-roles-and-authority.md`: role이 무엇을 할 수 있는가.
- `context-releasability-policy.md`: context item을 어떤 방식으로 전달하는가.
- `opsec-classification-model.md`: 문서와 context의 민감도 분류.
- `knowledge-management-sop.md`: access manifest와 audit log를 어디에 남길 것인가.
- `source-map.md`: 어떤 문서가 어떤 근거와 연결되는가.

## 10. 결론

멀티에이전트의 정확도는 더 많은 context가 아니라 정확한 context distribution에서 나온다.

각 agent가 읽는 문서가 정해지면 hallucination도 줄고, 권한 초과도 줄고, handoff와 AAR도 재현 가능해진다.
