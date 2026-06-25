# Policy Engine Rules

## 0. 목적

이 문서는 tool-use ROE를 실제 policy engine 규칙으로 바꾸는 방법을 정의한다.

Policy engine은 에이전트의 도구 요청을 받아 Green, Amber, Red, Black 중 하나로 판정한다. 핵심은 빠른 실행이 아니라 실행 전 권한과 위험을 일관되게 판단하는 것이다.

## 1. 입력

```yaml
policy_input:
  actor: S3
  mission_id: M-001
  tool: database
  action: update
  target: prod.customers
  data_sensitivity: sensitive
  reversibility: partial
  external_effect: true
  cost_risk: low
  user_requested: true
  existing_approval: null
```

## 2. 출력

```yaml
policy_decision:
  roe_class: Red
  allowed: false
  approval_required: true
  reason:
    - "Production database write."
    - "Sensitive data target."
  required_controls:
    - "dry_run"
    - "backup"
    - "rollback_plan"
    - "explicit_user_approval"
  alternatives:
    - "Run SELECT preview."
    - "Execute against staging."
```

## 3. Priority Order

정책 충돌이 있으면 더 높은 위험 등급이 이긴다.

```text
Black > Red > Amber > Green
```

예:

- action은 문서 작성이라 Green이지만 target에 비밀키 출력이 포함되면 Black.
- user가 요청했더라도 production DB write는 Red.
- agent readiness가 낮으면 Green 작업도 Amber로 상승 가능.

## 4. Rule Groups

| Group | 설명 |
| --- | --- |
| Actor rules | 역할과 readiness 기반 |
| Tool rules | 도구 종류 기반 |
| Action rules | read/write/delete/deploy/send 기반 |
| Target rules | local/prod/external/sensitive 기반 |
| Data rules | public/internal/sensitive/secret 기반 |
| Mission rules | mission constraints 기반 |
| Approval rules | 기존 승인 범위 기반 |
| Incident rules | 과거 AAR/risk register 기반 |

## 5. Core Rules

### 5.1 Black Rules

| Rule | 조건 |
| --- | --- |
| NO_SECRET_OUTPUT | 비밀키, 토큰, 개인키 출력 |
| NO_FABRICATED_SOURCE | 허위 출처 생성 |
| NO_UNAUTHORIZED_BYPASS | tool gateway 우회 |
| NO_PRIVATE_ACCESS_BYPASS | 비공개 자료 우회 접근 |
| NO_USER_CHANGE_DISCARD | 승인 없는 사용자 변경 discard |

### 5.2 Red Rules

| Rule | 조건 |
| --- | --- |
| PRODUCTION_WRITE | production 시스템 write |
| DATABASE_MUTATION | DB insert/update/delete/migration |
| EXTERNAL_PUBLISH | 외부 공개/발송 |
| DEPLOY_PRODUCTION | production 배포 |
| BULK_PAID_API | 비용 발생 대량 호출 |
| SECURITY_CONFIG_CHANGE | 권한/보안 설정 변경 |

### 5.3 Amber Rules

| Rule | 조건 |
| --- | --- |
| PACKAGE_INSTALL | dependency 설치/변경 |
| AUTHENTICATED_READ | 로그인 필요한 페이지 읽기 |
| API_WRITE_NON_PROD | non-prod API write |
| PREVIEW_DEPLOY | preview 배포 |
| LARGE_FILE_REWRITE | 대규모 파일 재작성 |
| LOW_READINESS_AGENT | readiness U/X agent action |

### 5.4 Green Rules

| Rule | 조건 |
| --- | --- |
| LOCAL_READ | 로컬 파일 읽기 |
| PUBLIC_WEB_READ | 공개 웹 검색 |
| MARKDOWN_CREATE | 요청 범위 내 문서 생성 |
| LOCAL_TEST | 로컬 테스트 실행 |
| SOURCE_SUMMARY | 공개 출처 요약 |

## 6. Escalation Rules

등급 상향:

| 조건 | 상향 |
| --- | --- |
| sensitive data involved | +1 level |
| irreversible action | +1 level |
| production target | Red minimum |
| no rollback available | Red minimum |
| agent readiness U/X | Amber minimum |
| prior incident same category | +1 level |

등급 하향은 제한적으로만 허용한다.

| 조건 | 하향 가능 |
| --- | --- |
| dry-run only | Red -> Amber |
| staging target | Red -> Amber |
| read-only with masked output | Amber -> Green |

Black은 하향하지 않는다.

## 7. Approval Matching

기존 approval이 있어도 다음이 모두 일치해야 한다.

- mission_id.
- actor or role scope.
- tool.
- action.
- target.
- time window.
- risk class.

불일치하면 새 approval request를 만든다.

## 8. Policy Pseudocode

```text
decide(input):
  decisions = []

  decisions += runBlackRules(input)
  if decisions contains Black:
    return block(Black)

  decisions += runRedRules(input)
  decisions += runAmberRules(input)
  decisions += runGreenRules(input)

  decision = maxRisk(decisions)
  decision = applyEscalation(decision, input)

  if decision.class == Green:
    return allow()

  approval = findMatchingApproval(input)
  if approval valid:
    return allowWithAudit(decision)

  return requireApproval(decision)
```

## 9. Policy Test Cases

| Case | Expected |
| --- | --- |
| local markdown create | Green allow |
| public web search | Green allow |
| package install | Amber approval |
| preview deploy | Amber approval |
| production deploy | Red approval |
| DB delete production | Red approval + backup + rollback |
| output API key | Black block |
| fabricate citation | Black block |

## 10. 관련 문서

- `tool-use-roe.md`
- `approval-ui-patterns.md`
- `military-ai-risk-register.md`
- `schema-files/tool-request.schema.json`
- `sample-payloads/`
- `policy-engine-authority-integration.js`
- `policy-engine-release-integration.js`
