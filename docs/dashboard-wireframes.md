# Dashboard Wireframes

## 0. 목적

이 문서는 command post dashboard를 실제 화면으로 설계하기 위한 wireframe 문서다.

Dashboard의 목적은 모든 정보를 보여주는 것이 아니라, 지휘관이 다음 결심을 내리는 데 필요한 정보를 먼저 보여주는 것이다.

## 1. Layout 원칙

| 원칙 | 설명 |
| --- | --- |
| Intent pinned | mission과 commander's intent는 항상 상단 고정 |
| Decision first | 승인 필요, CCIR, blocked task를 우선 |
| Logs second | 상세 로그는 drill-down |
| Evidence nearby | 주장의 근거를 바로 확인 가능 |
| Risk visible | high/critical risk는 숨기지 않음 |
| AAR connected | 완료 후 학습 반영 상태 표시 |

## 2. Main Command Post

```text
+--------------------------------------------------------------------------------+
| Mission: M-20260618-001                                                        |
| Intent: Preserve user intent through OPORD, ROE, evidence, assessment.          |
| Status: IN PROGRESS       Risk: MEDIUM       Next Decision: 2 pending approvals |
+----------------------------+----------------------------+----------------------+
| CCIR Alerts                | Approval Queue             | Active Risks         |
| - Red tool approval needed | - DB dry-run request       | - R-003 Authority    |
| - Evidence conflict        | - Preview deploy           | - R-012 Context loss |
+----------------------------+----------------------------+----------------------+
| Active Tasks                                                                    |
| [S2] Source review        complete                                              |
| [S3] Runtime doc update   in progress                                           |
| [S6] README/source map    pending                                               |
+--------------------------------------------------------------------------------+
| Latest SITREP                                                                   |
| Completed: schemas, fixtures, validator prototype                               |
| In Progress: dashboard/data model/demo docs                                     |
| Risk: executable validator is prototype only                                    |
+--------------------------------------------------------------------------------+
```

## 3. Approval Queue

```text
+--------------------------------------------------------------+
| Approval Required                                             |
| ROE: RED                                                      |
| Actor: S3 Operations Agent                                    |
| Tool: database                                                |
| Action: update_production                                     |
| Target: prod.customers                                        |
| Why: Apply cleanup script                                     |
| Risk: data corruption, irreversible update                    |
| Rollback: backup restore required                             |
| Alternatives: staging run, dry-run SELECT                     |
+--------------------------------------------------------------+
| [Dry-run only] [Approve once] [Revise request] [Reject]       |
+--------------------------------------------------------------+
```

표시 규칙:

- Black action은 approve 버튼을 표시하지 않는다.
- Red action은 dry-run을 가장 왼쪽 기본 선택으로 둔다.
- Approval scope와 만료 시간을 반드시 표시한다.

## 4. Evidence Viewer

```text
+------------------------------------------------------------------------------+
| Claim                                                                        |
| Mission command requires commander's intent and disciplined initiative.       |
+------------------------------------------------------------------------------+
| Source                                                                       |
| ADP 6-0 Mission Command                                                       |
| Reliability: A       Checked: 2026-06-18                                      |
+------------------------------------------------------------------------------+
| Interpretation                                                                |
| LLM agents need explicit intent and authority boundaries before autonomy.     |
+------------------------------------------------------------------------------+
| Linked Docs                                                                   |
| agent-roles-and-authority.md, prompt-dsl.md                                   |
+------------------------------------------------------------------------------+
| [Open Source] [Flag unsupported] [Request Red Team Review]                    |
+------------------------------------------------------------------------------+
```

## 5. Risk Board

```text
+----------------------+----------+----------------------+----------------------+
| Risk                 | Level    | Control              | Status               |
+----------------------+----------+----------------------+----------------------+
| R-003 Unauthorized   | Critical | Tool gateway approval| Active               |
| R-004 Secret output  | Critical | EEFI suppression     | No current event     |
| R-012 Context loss   | Medium   | SITREP checkpoint    | Watch                |
+----------------------+----------+----------------------+----------------------+
```

## 6. Readiness Board

```text
+----------+--------------------------+--------+-----------------------------+
| Agent    | Task                     | Rating | Next Training               |
+----------+--------------------------+--------+-----------------------------+
| S2       | Public source research   | T      | Korean defense papers       |
| S3       | Markdown implementation  | T      | Prompt compiler prototype   |
| Red Team | Independent review       | U      | Blind hallucination review  |
+----------+--------------------------+--------+-----------------------------+
```

## 7. Mission Timeline

```text
09:00 Mission intake
09:04 OPORD generated
09:07 Validator warning: MOP_ONLY
09:10 FRAGO: add runtime schemas
09:22 Tool request Green: create schema files
09:35 SITREP: schema files complete
09:40 AAR pending
```

## 8. Mobile / Narrow View

우선순위:

1. Mission and intent.
2. Decision required.
3. CCIR alerts.
4. Active task status.
5. Evidence/risk drill-down.

좁은 화면에서는 로그 테이블을 숨기고 alert card 중심으로 전환한다.

## 9. 관련 문서

- `command-post-dashboard.md`
- `approval-ui-patterns.md`
- `policy-engine-rules.md`
- `sample-runtime-state.md`
- `data-model.sql.md`
