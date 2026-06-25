# Runtime Demo Scenario

## 0. 목적

이 문서는 하나의 mission이 intake부터 AAR까지 흐르는 end-to-end 데모 시나리오다.

목적은 프레임워크가 문서 묶음이 아니라 실제 런타임으로 어떻게 작동해야 하는지 보여주는 것이다.

## 1. Demo Mission

사용자 요청:

```text
군대식 LLM 프레임워크를 실제 앱으로 만들 수 있게 validator와 dashboard 구조까지 정리해줘.
```

Mission:

```text
군대식 LLM 프레임워크를 tool-gated runtime으로 구현하기 위한 validator, policy, dashboard, data model 산출물을 만든다.
```

Intent:

```text
문서화된 군대식 운용 원칙이 실제 시스템 계약, 검증 규칙, 승인 흐름, 대시보드 설계로 전환되어야 한다.
```

## 2. Timeline

```text
T+00 Intake
T+02 Mission analysis
T+05 OPORD draft
T+07 Validator precheck
T+10 Task orders issued
T+15 S3 creates schema and CLI prototype
T+25 Tool request Green logged
T+30 S6 updates source map and README
T+35 Red Team reviews authority gaps
T+40 SITREP issued
T+45 FRAGO adds dashboard wireframes
T+60 Verification
T+70 AAR and readiness update
```

## 3. OPORD Summary

```yaml
mission:
  statement: "Create validator, policy, dashboard, and data model runtime artifacts."
intent:
  purpose: "Turn doctrine into executable runtime controls."
authority:
  allowed:
    - "create local markdown files"
    - "create JSON fixtures"
    - "run local validator smoke tests"
  approval_required:
    - "install dependencies"
    - "publish package"
    - "deploy dashboard"
  prohibited:
    - "fabricate sources"
    - "execute production changes"
ccir:
  ffir:
    - "validator smoke test fails"
  eefi:
    - "secret appears in fixture"
assessment:
  mop:
    - "files created"
    - "validator runs"
  moe:
    - "invalid Red request is blocked"
    - "README links all artifacts"
```

## 4. Task Orders

| Task | Agent | Purpose | Deliverable |
| --- | --- | --- | --- |
| Build validator CLI prototype | S3 | Make DSL validation executable | `validator-cli-prototype/` |
| Create dashboard wireframes | S3/S6 | Show command post UI | `dashboard-wireframes.md` |
| Create SQL data model | S3 | Translate state to DB | `data-model.sql.md` |
| Review policy gaps | Red Team | Find unsafe execution paths | findings |
| Update indexes | S6 | Preserve knowledge flow | README/source map/compendium |

## 5. Tool Requests

Green:

```yaml
tool: filesystem
action: create_file
target: validator-cli-prototype/validate.js
roe_class: Green
approval_required: false
```

Amber:

```yaml
tool: package_manager
action: install
target: ajv
roe_class: Amber
approval_required: true
```

Decision:

```text
Use no-dependency prototype first. Defer package install.
```

## 6. SITREP

```text
Completed:
- schema files exist.
- validator CLI prototype runs valid/invalid smoke tests.
- dashboard and data model docs created.

In progress:
- source map and README updates.

Risk:
- schema validation is subset-only, not full JSON Schema.

Next:
- create real validator package or wireframes.
```

## 7. Verification

Commands:

```bash
node validator-cli-prototype/validate.js sample-payloads/valid-mission.json mission
node validator-cli-prototype/validate.js sample-payloads/invalid-mission-missing-intent.json mission
node validator-cli-prototype/validate.js sample-payloads/invalid-tool-request-red-without-approval.json tool-request
```

Expected:

- valid mission passes.
- missing intent fails.
- Red without approval fails.

## 8. AAR

Expected:

- Runtime artifacts become executable enough to validate sample payloads.

Actual:

- No-dependency CLI prototype validates schema subset and semantic rules.
- Dashboard and SQL design are documented.

Delta:

- Full JSON Schema support is not implemented.
- No browser UI exists yet.

Sustain:

- Every new runtime object should have schema and fixture.
- Every new artifact should update README, source map, compendium.

Improve:

- Add proper JSON Schema validator dependency later.
- Add automated fixture runner.
- Build dashboard wireframe UI.

## 9. 관련 문서

- `validator-cli-prototype/README.md`
- `dashboard-wireframes.md`
- `data-model.sql.md`
- `policy-engine-rules.md`
- `agent-runtime-playbook.md`
