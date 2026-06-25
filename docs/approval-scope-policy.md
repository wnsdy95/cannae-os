# Approval Scope Policy

## 0. 목적

Red 또는 중요한 Amber action은 "승인"이라는 한 단어로 처리하면 안 된다. 군대식 권한 위임에서는 누가, 무엇을, 언제까지, 어떤 조건에서, 어떤 범위로 승인했는지가 중요하다.

LLM runtime에서도 approval은 blanket permission이 아니라 scoped release다.

이 문서는 approval once, constraints, expiry, rollback, evidence requirement를 표준화한다.

## 1. Approval 원칙

| 원칙 | 의미 | LLM 적용 |
| --- | --- | --- |
| Specificity | 승인 대상이 명확해야 함 | action, tool, target, mission/task id 필수 |
| Time bound | 승인 유효 시간이 있어야 함 | expires_at 또는 single-use |
| Conditioned | 조건이 붙을 수 있음 | dry-run, backup, rollback, verification |
| Non-transferable | 다른 action으로 확장 불가 | 같은 role이라도 다른 target은 재승인 |
| Auditable | 증거가 남아야 함 | approval event, post-action evidence |
| Revocable | 필요 시 철회 가능 | FRAGO or approval cancellation |

## 2. 승인 종류

| Type | 의미 | 사용 |
| --- | --- | --- |
| `approve_once` | 단일 action 1회 허용 | Red tool action 1회 |
| `approve_with_constraints` | 조건부 허용 | dry-run first, rollback required |
| `revise` | 계획 수정 후 재상신 | risk/fallback/evidence 부족 |
| `reject` | 실행 금지 | mission scope 밖 또는 위험 과다 |
| `issue_frago` | 임무/우선순위/권한 자체 변경 | 기존 OPORD 변경 필요 |

## 3. Approval object 필드

```json
{
  "approval_id": "AR-DEMO-001",
  "mission_id": "M-DEMO-001",
  "tool_request_id": "TR-DEMO-002",
  "approved_by": "COMMANDER",
  "decision": "approve_with_constraints",
  "scope": {
    "action": "deploy_production",
    "tool": "deploy",
    "target": "prod.command-post-dashboard",
    "max_executions": 1,
    "valid_from": "2026-06-18T12:00:00+09:00",
    "expires_at": "2026-06-18T13:00:00+09:00"
  },
  "conditions": [
    "Rollback plan attached.",
    "Post-action verification required."
  ],
  "rollback": "Restore previous deployment artifact.",
  "evidence_required": [
    "Approval event.",
    "Execution log.",
    "Verification result."
  ]
}
```

## 4. Approval boundary

승인이 포함하지 않는 것:

- 다른 target.
- 다른 tool.
- 다른 시간대.
- credential release.
- sensitive/restricted context release.
- 반복 실행.
- mission scope 변경.

scope가 바뀌면 새 approval 또는 FRAGO가 필요하다.

## 5. Red action approval flow

1. Tool request 생성.
2. Policy engine이 Red로 분류.
3. Execution block.
4. Approval request 생성.
5. Decision packet 작성.
6. Commander decision.
7. Approval object 생성 또는 rejection 기록.
8. Tool gateway가 scope/expiry/target/action 일치 확인.
9. 실행 후 evidence 기록.
10. AAR/readiness update.

## 6. Expiry와 재사용

기본:

- Red approval은 single-use.
- expiry가 없으면 invalid.
- 실행 후 approval status는 consumed.
- consumed approval은 재사용 불가.

예외:

- 반복 작업은 FRAGO 또는 authority matrix update로 처리한다.
- approval object를 복제해 재사용하지 않는다.

## 7. Rollback requirement

Red action은 rollback 또는 compensation plan이 없으면 승인하지 않는다.

Rollback 필수 항목:

- 이전 상태.
- 복구 명령 또는 절차.
- 복구 가능 시간.
- 실패 시 commander decision point.
- 검증 방법.

Rollback이 불가능한 action:

- 더 높은 risk acceptance authority 필요.
- 경우에 따라 Black으로 분류.

## 8. Approval과 release review의 분리

도구 실행 승인은 정보 공개 승인이 아니다.

예:

- production deploy approval은 credential raw value release를 허용하지 않는다.
- external API call approval은 private data release review를 포함해야 한다.
- final output approval은 sensitive context release review가 필요하다.

따라서 `approval-request`와 `release-review`는 별도 객체다.

## 9. Validator/runner 구현

Implemented artifacts:

- `schema-files/approval-scope.schema.json`
- `schema-files/approval-consumption-event.schema.json`
- `schema-files/approval-revocation-event.schema.json`
- `schema-files/approval-renewal-event.schema.json`
- `schema-files/approval-delegation-event.schema.json`
- `schema-files/approval-delegation-revocation-event.schema.json`
- `sample-payloads/valid-approval-scope.json`
- `sample-payloads/invalid-approval-scope-no-expiry.json`
- `sample-payloads/valid-approval-consumption-event.json`
- `sample-payloads/invalid-approval-consumption-event-mismatch.json`
- `sample-payloads/valid-approval-revocation-event.json`
- `sample-payloads/invalid-approval-revocation-event-consumed.json`
- `sample-payloads/valid-approval-renewal-event.json`
- `sample-payloads/invalid-approval-renewal-event-expired.json`
- `sample-payloads/valid-approval-delegation-event.json`
- `sample-payloads/invalid-approval-delegation-event-retained.json`
- `sample-payloads/valid-approval-delegation-revocation-event.json`
- `sample-payloads/invalid-approval-delegation-revocation-event-staff.json`
- `sample-payloads/valid-release-gate-decision-event.json`
- `sample-payloads/invalid-release-gate-decision-event-missing-review.json`
- `policy-engine-authority-integration.js`
- `run-authority-integration-fixtures.js`
- `approval-consumption-runner.js`
- `run-approval-consumption-fixtures.js`
- `approval-revocation-runner.js`
- `run-approval-revocation-fixtures.js`
- `approval-renewal-runner.js`
- `run-approval-renewal-fixtures.js`
- `approval-delegation-runner.js`
- `run-approval-delegation-fixtures.js`
- `approval-delegation-revocation-runner.js`
- `run-approval-delegation-revocation-fixtures.js`
- `policy-engine-release-integration.js`
- `run-release-integration-fixtures.js`
- `release-gate-decision-runner.js`
- `run-release-gate-decision-fixtures.js`

Implemented semantic checks:

- Red approval without expiry -> fail.
- `approve_once` with `max_executions` other than 1 -> fail.
- consumed approval without consumption event -> fail.
- consumed approval reuse in integration gate -> blocked.
- consumption event must match mission, action, tool, target, actor, time window, and evidence.
- revocation event must target an active approval and match granting authority, scope, time window, notification, and evidence.
- renewal event must target an active approval, preserve action/tool/target/max executions, extend only expiry, and include authority/evidence/notification.
- delegation event must map to an existing approval-required authority rule and cannot delegate Red/Black, high/critical risk, restricted release, or subdelegation.
- delegation termination event must target an active delegation, preserve the source snapshot, distinguish Commander revocation from expiry projection, and notify affected roles.
- release-required execution must pass authority integration and release review independently.
- release gate decision event must preserve authority snapshot, release review snapshot, final decision, reasons, and evidence.
- Approval missing rollback for irreversible action -> fail.
- Tool approval attempts to release restricted context -> fail unless release review exists.

Next integration candidate:

- user-defined next queue after current SOF TF model

## 10. Prompt guard

```text
Red/Amber approval을 요청할 때 다음을 포함하라.
1. 정확한 action/tool/target
2. single-use인지 반복 권한인지
3. expiry
4. conditions
5. rollback
6. post-action evidence
7. 별도 release review 필요 여부
```

## 11. 출처 앵커

- Joint Staff Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf

## 12. 현 단계 결론

승인은 "해도 된다"가 아니다. 승인은 action, tool, target, time, condition, rollback, evidence가 결합된 제한적 권한이다.

LLM runtime에서 approval scope를 엄격히 해야 무단 확장과 blanket permission을 막을 수 있다.
