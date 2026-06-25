# Approval UI Patterns

## 0. 목적

이 문서는 LLM 에이전트가 Amber/Red 등급 도구 행동을 수행하기 전 사용자 승인을 받는 UI 패턴을 정의한다.

승인 UI의 목적은 사용자를 귀찮게 하는 것이 아니라, 위험 수용권자가 실제로 무엇을 승인하는지 이해하게 하는 것이다.

## 1. 기본 원칙

| 원칙 | 설명 |
| --- | --- |
| Specific | 승인 대상 action, tool, target을 구체적으로 표시 |
| Risk-visible | 위험과 실패 결과를 숨기지 않음 |
| Reversible-first | 가능하면 dry-run과 rollback 제시 |
| Least privilege | 필요한 최소 범위만 승인 |
| Time-bound | 승인은 특정 action과 시간에 한정 |
| Auditable | 승인자, 시간, 범위, 결과를 기록 |

## 2. Approval Card

```text
Approval required

Action:
Tool:
Target:
Why this is needed:
Risk:
Data affected:
Cost:
Rollback:
Alternatives:

[Approve once] [Dry-run only] [Reject]
```

## 3. Decision Levels

| Level | UI 동작 | 예 |
| --- | --- | --- |
| Amber | 간단 승인 카드 | 패키지 설치, API write 초안 |
| Red | 상세 decision memo | DB migration, 배포 |
| Black | 승인 버튼 없음 | 비밀키 출력, 허위 출처 |

## 4. 좋은 승인 요청

```text
Action: docs/source-map.md 파일을 수정합니다.
Why: 새 한국 공개자료 출처를 source map에 연결하기 위해 필요합니다.
Risk: 낮음. 로컬 markdown 파일만 변경합니다.
Rollback: 이전 내용을 다시 적용할 수 있습니다.
Alternatives: 변경 없이 최종 답변에만 요약할 수 있습니다.
```

## 5. 나쁜 승인 요청

```text
작업을 계속하려면 승인해주세요.
```

문제:

- 무엇을 실행하는지 모름.
- 대상이 없음.
- 위험이 없음.
- 대안이 없음.

## 6. 승인 범위

승인은 넓게 받지 않는다.

나쁜 승인:

```text
앞으로 모든 파일 수정 승인.
```

좋은 승인:

```text
이번 mission에서 docs/*.md 문서 파일 생성과 수정만 승인.
삭제, 외부 배포, API write는 별도 승인.
```

## 7. Dry-run UI

Red 작업은 기본 버튼을 "Approve"가 아니라 "Dry-run"으로 둔다.

예:

```text
[Run dry-run] [Show affected rows] [Reject]
```

Dry-run 결과 후:

```text
Dry-run result:
- Affected rows: 42
- Estimated cost: $0
- Rollback available: yes

[Approve execution] [Revise] [Reject]
```

## 8. Approval Log

```yaml
approval_log:
  id: AP-001
  mission_id: M-001
  requested_by: S3
  approved_by: user
  action: "deploy.preview"
  scope: "preview environment only"
  expires_at: "2026-06-18T12:00:00+09:00"
  result: "success"
```

## 9. UX Anti-Patterns

| Anti-pattern | 문제 | 교정 |
| --- | --- | --- |
| 승인 피로 | 너무 많은 사소한 승인 | Green/Amber 기준 조정 |
| 포괄 승인 | 위험 범위가 넓어짐 | action-level approval |
| 위험 숨김 | 사용자가 실제 위험을 모름 | risk and rollback 필드 |
| 거부 대안 없음 | 사용자가 approve/reject만 선택 | dry-run, revise, skip |
| 승인 후 로그 없음 | 감사 불가 | approval log |

## 10. 관련 문서

- `tool-use-roe.md`
- `reference-architecture.md`
- `sample-runtime-state.md`
- `implementation-guide.md`
