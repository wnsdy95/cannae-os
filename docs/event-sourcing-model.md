# Event Sourcing Model

## 0. 목적

이 문서는 군대식 LLM 런타임을 event-sourcing 방식으로 구현할 때의 이벤트 모델을 정의한다.

기본 SQL 모델은 현재 상태를 조회하기 좋다. Event sourcing은 "어떤 명령이 언제 내려졌고, 어떤 보고와 승인으로 상태가 바뀌었는지"를 추적하기 좋다. 군대식 지휘통제에서는 이력과 결심 맥락이 중요하므로 event log가 핵심 감사 자료가 된다.

## 1. 핵심 원칙

| 원칙 | 설명 |
| --- | --- |
| Append-only | 이벤트는 수정하지 않고 추가한다 |
| Mission-scoped | 모든 이벤트는 mission_id를 가진다 |
| Decision-linked | 승인/거부/FRAGO는 decision point와 연결한다 |
| Replayable | 이벤트를 재생하면 현재 상태를 복원할 수 있다 |
| Auditable | 누가, 언제, 왜 실행했는지 추적 가능해야 한다 |

## 2. Event Envelope

```json
{
  "event_id": "EVT-001",
  "mission_id": "M-DEMO-001",
  "event_type": "ToolRequestCreated",
  "actor": "S3",
  "timestamp": "2026-06-18T11:20:00+09:00",
  "causation_id": "T-DEMO-001",
  "correlation_id": "OPORD-DEMO-001",
  "payload": {}
}
```

## 3. Event Types

| Event | 의미 |
| --- | --- |
| MissionCreated | mission intake 완료 |
| OPORDCreated | 작전명령 생성 |
| OPORDValidated | validator 결과 생성 |
| TaskOrderIssued | 하위 task 발행 |
| ToolRequestCreated | 도구 요청 생성 |
| PolicyDecisionMade | ROE 판정 |
| ApprovalRequested | 승인 요청 |
| ApprovalGranted | 승인 |
| ApprovalRejected | 거부 |
| ApprovalConsumed | scoped approval이 실제 실행으로 소비됨 |
| ApprovalRevoked | 승인 철회 |
| ApprovalRenewed | 승인 유효기간 연장 |
| ApprovalDelegated | 제한적 승인권 위임 |
| ApprovalDelegationTerminated | 승인권 위임 철회 또는 만료 |
| ReleaseGateDecided | 실행권한과 정보공개권한을 합성한 최종 release gate 판단 |
| ToolExecuted | 도구 실행 |
| ToolBlocked | 도구 차단 |
| SITREPIssued | 상황보고 |
| FRAGOIssued | 변경명령 |
| EvidenceRecorded | 출처/주장 기록 |
| RiskRaised | 위험 상승 |
| AARIssued | 사후검토 |
| ReadinessUpdated | readiness 갱신 |

## 4. Projection Tables

Event log에서 조회 성능을 위해 projection을 만든다.

| Projection | Source events |
| --- | --- |
| mission_current_state | MissionCreated, OPORDCreated, SITREPIssued, AARIssued |
| pending_approvals | ApprovalRequested, ApprovalGranted, ApprovalRejected, ApprovalConsumed, ApprovalRevoked, ApprovalRenewed |
| authority_delegations | ApprovalDelegated, ApprovalDelegationTerminated |
| authority_delegation_dashboard | ApprovalDelegated, ApprovalDelegationTerminated |
| release_gate_decisions | ReleaseGateDecided |
| release_gate_dashboard | ReleaseGateDecided |
| active_risks | RiskRaised, AARIssued |
| tool_audit | ToolRequestCreated, PolicyDecisionMade, ToolExecuted, ToolBlocked |
| evidence_index | EvidenceRecorded |
| readiness_current | ReadinessUpdated |

## 5. Command vs Event

Command:

```text
RequestToolExecution
```

Event:

```text
ToolRequestCreated
PolicyDecisionMade
ToolBlocked
```

명령은 거부될 수 있다. 이벤트는 이미 발생한 사실이다.

## 6. Red Action Flow

```text
RequestToolExecution
-> ToolRequestCreated
-> PolicyDecisionMade(Red)
-> ApprovalRequested
-> ToolBlocked(pending approval)
```

승인 후:

```text
ApprovalGranted
-> ApprovalConsumed
-> ToolExecuted
-> SITREPIssued
```

거부 후:

```text
ApprovalRejected
-> FRAGOIssued(alternative path)
```

## 7. AAR and Learning Flow

```text
AARIssued
-> RiskRaised or RiskClosed
-> ReadinessUpdated
-> SOPUpdateRecommended
```

## 8. Replay 규칙

상태 복원:

1. mission_id로 이벤트를 시간순 정렬.
2. MissionCreated로 초기 상태 생성.
3. OPORDCreated로 current_order 설정.
4. TaskOrderIssued로 task 목록 갱신.
5. PolicyDecisionMade와 Approval 이벤트로 tool 상태 갱신.
6. ApprovalConsumed로 approval reuse를 차단.
7. ApprovalRenewed로 approval expiry를 갱신하되 scope 확장은 차단.
8. ApprovalDelegated로 제한적 approval authority projection을 갱신.
9. ApprovalDelegationTerminated로 delegated authority를 revoked 또는 expired 처리.
10. ReleaseGateDecided로 final/external output allow/block 판단을 기록.
11. SITREP/FRAGO/AAR로 mission timeline 갱신.

## 9. Approval Consumption 규칙

`ApprovalGranted`는 아직 실행이 아니다. 실제 tool action이 승인 범위 안에서 실행될 때 `ApprovalConsumed` 이벤트가 남는다.

규칙:

- `approval_scope_id`와 `approval_request_id`를 연결한다.
- mission, actor, action, tool, target이 approval scope와 일치해야 한다.
- `consumed_at`은 approval window 안에 있어야 한다.
- `approve_once`는 `execution_count_after`가 정확히 1이어야 한다.
- 실행이 발생했다면 `approval_status_after`는 `consumed`여야 한다.
- evidence가 없으면 AAR와 audit가 불가능하므로 실행 event로 인정하지 않는다.

구현 연결:

- `schema-files/approval-consumption-event.schema.json`
- `approval-consumption-runner.js`
- `approval-consumption-fixtures/`

## 10. Approval Revocation 규칙

`ApprovalRevoked`는 아직 실행되지 않은 active approval을 취소하는 이벤트다. 이미 `ApprovalConsumed`가 발생한 뒤의 취소 시도는 철회가 아니라 AAR, rollback, 또는 FRAGO로 처리해야 한다.

규칙:

- `approval_scope_id`와 `approval_request_id`를 연결한다.
- `approval_status_before`와 `scope_snapshot.status_before`는 `active`여야 한다.
- `revocation_authority`는 approval을 부여한 권한자와 일치해야 한다.
- action, tool, target이 approval scope와 일치해야 한다.
- `revoked_at`은 approval window 안에 있어야 한다.
- `approval_status_after`는 `revoked`여야 한다.
- 통지가 필요한 철회는 `notified_roles`를 남긴다.
- reason과 evidence가 없으면 audit event로 인정하지 않는다.

구현 연결:

- `schema-files/approval-revocation-event.schema.json`
- `approval-revocation-runner.js`
- `approval-revocation-fixtures/`

## 11. Approval Renewal 규칙

`ApprovalRenewed`는 active approval의 유효기간만 연장하는 이벤트다. action, tool, target, granted_to, max execution을 바꾸면 renewal이 아니라 새 approval 또는 FRAGO가 필요하다.

규칙:

- `approval_scope_id`와 `approval_request_id`를 연결한다.
- `approval_status_before`와 `scope_snapshot.status_before`는 `active`여야 한다.
- `renewal_authority`는 approval을 부여한 권한자와 일치해야 한다.
- action, tool, target이 approval scope와 일치해야 한다.
- `renewed_at`은 기존 approval window 안에 있어야 한다.
- `new_expires_at`은 기존 `previous_expires_at`보다 뒤여야 한다.
- `max_executions_after`는 기존 max execution을 늘릴 수 없다.
- `approve_once` renewal은 아직 실행되지 않은 approval에만 가능하다.
- 통지가 필요한 renewal은 `notified_roles`를 남긴다.
- reason과 evidence가 없으면 audit event로 인정하지 않는다.

구현 연결:

- `schema-files/approval-renewal-event.schema.json`
- `approval-renewal-runner.js`
- `approval-renewal-fixtures/`

## 12. Approval Delegation 규칙

`ApprovalDelegated`는 Commander의 approval authority 일부를 제한적으로 위임하는 이벤트다. 위임은 authority matrix의 기존 approval-required rule 안에서만 유효하며, Red/Black, high/critical residual risk, restricted release, subdelegation은 Commander-retained로 남긴다.

규칙:

- `authority_matrix_id`와 mission이 일치해야 한다.
- `delegator`와 `actor`는 Commander여야 한다.
- delegatee는 자기 role을 승인할 수 없다.
- 위임 scope는 기존 approval-required authority rule과 task/tool/target/role이 맞아야 한다.
- `max_roe_class`는 Amber 이하만 허용한다.
- `max_residual_risk`는 medium 이하만 허용한다.
- duration과 approval count limit가 있어야 한다.
- retained authorities와 restricted context guard를 명시해야 한다.
- sensitive context는 release review를 유지해야 한다.
- backbrief, post-action evidence, notification, reason, evidence가 있어야 한다.

구현 연결:

- `schema-files/approval-delegation-event.schema.json`
- `approval-delegation-runner.js`
- `approval-delegation-fixtures/`

## 13. Approval Delegation Termination 규칙

`ApprovalDelegationTerminated`는 위임된 approval authority를 종료하는 이벤트다. 군대식 권한 위임은 생성보다 종료가 더 중요하다. 종료 event가 없으면 하급 참모나 하위 에이전트가 만료된 권한을 계속 가진 것으로 오해할 수 있다.

규칙:

- `delegation_event_id`는 원본 `ApprovalDelegated` event를 가리켜야 한다.
- 원본 delegation과 termination event의 mission, authority matrix, delegator, delegatee가 일치해야 한다.
- termination 전 delegation 상태는 `active`여야 한다.
- `termination_kind=revoked`는 Commander가 active window 안에서 수행해야 한다.
- `termination_kind=expired`는 expiry 이후에 `RECORDER` 또는 termination authority가 projection으로 기록할 수 있다.
- `delegation_status_after`는 `termination_kind`와 일치해야 한다.
- delegation snapshot은 task/action/tool/target/risk/time limit/retained authority/context guardrail/control flag를 원본과 동일하게 보존해야 한다.
- reason, evidence, notification이 없으면 audit event로 인정하지 않는다.

구현 연결:

- `schema-files/approval-delegation-revocation-event.schema.json`
- `approval-delegation-revocation-runner.js`
- `approval-delegation-revocation-fixtures/`
- `authority-delegation-projection-runner.js`
- `dashboard-ui-prototype/authority-delegation-projection-state.json`

## 14. Release Gate Decision 규칙

`ReleaseGateDecided`는 실행 승인과 정보 공개 승인을 합성한 최종 판단 이벤트다. production deploy 같은 Red action은 scoped approval과 risk acceptance로 실행될 수 있어도, final output이나 external tool payload에 민감정보가 포함되면 별도 release review 없이는 나갈 수 없다.

규칙:

- event는 tool request와 mission을 명시해야 한다.
- authority snapshot은 approval/risk acceptance required/valid 상태를 보존해야 한다.
- release snapshot은 review required/valid, target, review id, finding count를 보존해야 한다.
- authority gate가 blocked이면 release review가 valid여도 final decision은 `blocked_pending_authority` 또는 `prohibit`이어야 한다.
- authority gate가 allowed이고 release review가 required인데 invalid/missing이면 final decision은 `blocked_pending_release_review`여야 한다.
- authority gate와 release review가 모두 valid일 때만 `allow_scoped_execution_and_release`가 가능하다.
- blocked decision은 reasons를 남기고, 모든 release gate decision은 evidence를 남겨야 한다.

구현 연결:

- `schema-files/release-gate-decision-event.schema.json`
- `release-gate-decision-runner.js`
- `release-gate-decision-fixtures/`
- `release-gate-dashboard-runner.js`
- `dashboard-ui-prototype/release-gate-dashboard-state.json`

## 15. 관련 문서

- `data-model.sql.md`
- `reference-architecture.md`
- `runtime-demo-payloads/README.md`
- `policy-engine-rules.md`
- `agent-runtime-playbook.md`
