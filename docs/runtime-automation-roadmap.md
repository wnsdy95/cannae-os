# Runtime Automation Roadmap

## 0. 목적

이 문서는 현재 문서 기반 프레임워크를 실제 tool-gated LLM runtime으로 발전시키는 로드맵이다.

목표 상태:

```text
Manual doctrine docs
-> Structured prompt workflow
-> JSON Schema validated orders
-> Policy-gated tool execution
-> Dashboard and approval UI
-> AAR-driven learning runtime
```

## 1. Phase 0: Documentation Base

현재 상태.

완료 조건:

- doctrine documents.
- SOP library.
- prompt templates.
- source map.
- evaluation metrics.
- risk register.
- runtime schemas.

남은 위험:

- 실제 runtime enforcement 없음.
- validator 코드 없음.
- dashboard 없음.

## 2. Phase 1: Local Validator CLI

목표:

- OPORD, tool request, SITREP, AAR JSON을 로컬에서 검증.

기능:

- JSON Schema validation.
- semantic rule validation.
- valid/invalid fixture tests.
- report output.

완료 조건:

- `validate opord.json` 명령.
- critical/error/warning 출력.
- fixtures 통과.

## 3. Phase 2: Prompt Compiler

목표:

- user request를 OPORD draft로 변환.
- OPORD를 에이전트별 task order로 분해.

기능:

- mission extraction.
- intent extraction.
- authority suggestion.
- CCIR suggestion.
- assessment suggestion.

완료 조건:

- 사용자가 OPORD 초안을 승인/수정 가능.
- missing fields validator가 잡음.

## 4. Phase 3: Tool Gateway

목표:

- 모든 도구 요청이 policy engine을 통과.

기능:

- tool request object.
- ROE decision.
- approval request generation.
- tool-use log.

완료 조건:

- Red without approval 차단.
- Black action 차단.
- Green action audit log.

## 5. Phase 4: Approval UI

목표:

- 사용자가 위험을 이해하고 action-level approval을 부여.

기능:

- approval queue.
- dry-run button.
- risk/rollback/alternatives display.
- approval log.

완료 조건:

- production-like action은 승인 전 실행 불가.
- 승인 범위와 만료가 기록됨.

## 6. Phase 5: Evidence Store

목표:

- 출처와 주장을 구조화해 저장.

기능:

- source metadata.
- claim/interpretation split.
- reliability.
- linked documents.
- source map export.

완료 조건:

- unsupported claim 탐지 가능.
- evidence viewer로 주장 추적 가능.

## 7. Phase 6: Command Post Dashboard

목표:

- mission, approval, CCIR, risk, readiness를 한 화면에서 지휘.

기능:

- mission board.
- CCIR alerts.
- approval queue.
- risk board.
- readiness board.
- AAR library.

완료 조건:

- blocked mission과 decision required가 즉시 보임.

## 8. Phase 7: Learning Runtime

목표:

- AAR가 SOP, policy, readiness를 갱신.

기능:

- AAR parser.
- SOP update suggestion.
- readiness ledger update.
- recurring risk detection.

완료 조건:

- 같은 failure가 반복되면 risk/register/policy update 제안.

## 9. Release Gates

| Gate | 조건 |
| --- | --- |
| G1 | Schema fixtures pass |
| G2 | Critical validator rules pass |
| G3 | Policy engine blocks Red without approval |
| G4 | Approval UI logs action-level scope |
| G5 | Evidence records link claims to sources |
| G6 | Dashboard shows decision required |
| G7 | AAR updates readiness ledger |

## 10. 관련 문서

- `schema-files/README.md`
- `validator-prototype.md`
- `policy-engine-rules.md`
- `command-post-dashboard.md`
- `agent-runtime-playbook.md`
