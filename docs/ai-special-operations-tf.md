# AI Special Operations Task Force

## 0. 목적

이 문서는 미군 SOF 자료를 참조해 "AI 특수부대 TF" 운영 모델을 정의한다.

여기서 SOF는 실제 군사작전 전술을 모사하는 뜻이 아니다. LLM/agent 운용에서 다음과 같은 작업을 수행할 때 쓰는 소규모, 고숙련, 고검증, 고지원 task force 모델이다.

- 시간 민감도가 높고 실패 비용이 큰 작업
- 민감한 context, release review, approval boundary가 얽힌 작업
- 일반 agent workflow로는 coordination cost가 커지는 작업
- 강한 source discipline, tool discipline, AAR가 필요한 작업

핵심 전환:

```text
SOF = small, selected, trained, enabled, mission-commanded force
AI SOF TF = small, selected, tested, tool-enabled, commander-bounded agent team
```

다국적 적용 주의:

- 이 문서의 SOF Truths와 core activities는 USSOCOM 공식 자료에서 온 US-derived heuristic이다.
- 다른 군의 특수작전 교리를 대표한다고 쓰지 않는다.
- 다국적/민간 적용에서는 `AI SOF TF`를 `high-risk task force` 또는 `protected incident cell`로 alias할 수 있으며, 실제 명칭은 local doctrine review 후 정한다.

## 1. 공식 출처 앵커

- JP 3-05, Special Operations: https://www.jcs.mil/Doctrine/DOCNET/JP-3-05-Special-Operations/
- FM 3-05, Army Special Operations, June 2025: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44116-FM_3-05-000-WEB-1.pdf
- USSOCOM SOF Truths: https://www.socom.mil/about/sof-truths
- USSOCOM Core Activities: https://www.socom.mil/about/core-activities
- USSOCOM Army Special Operations Command page: https://www.socom.mil/ussocom-enterprise/components/army-special-operations-command

## 2. SOF Truths를 AI 운용 원리로 변환

| SOF Truth | AI SOF TF 원리 | Runtime 적용 |
| --- | --- | --- |
| Humans are more important than hardware | 모델보다 사람의 intent, 승인, review가 중요하다 | Commander/user retained authority를 둔다 |
| Quality is better than quantity | 많은 agent보다 검증된 소수 agent가 낫다 | task별 readiness T/P 이상 agent만 투입 |
| SOF cannot be mass produced | 고숙련 agent workflow는 즉석 생성할 수 없다 | SOP, fixture, rehearsal, AAR로 축적 |
| Competent SOF cannot be created after emergencies occur | 긴급상황 전에 roster와 gate가 있어야 한다 | standing TF template와 preflight checks 유지 |
| Most special operations require non-SOF support | elite executor도 enabler 없이는 실패한다 | S2/S4/S6/Red Team/release reviewer를 붙인다 |

## 3. AI SOF TF가 필요한 조건

일반 agent workflow가 아니라 AI SOF TF를 쓴다:

- Red/Black에 가까운 tool risk가 있다.
- 외부 release, credential, production, legal/compliance risk가 있다.
- source conflict, hallucination risk, adversarial prompt risk가 높다.
- 임무가 짧지만 여러 기능을 동시에 통합해야 한다.
- 실패 시 rollback, incident SITREP, commander decision이 필요하다.

쓰지 않는다:

- 단순 Green file edit.
- 단일 문서 요약.
- 검증 없이 빠르게 많이 생성하는 작업.
- authority boundary가 불명확한 상태의 자율 실행.

## 4. AI SOF TF 조직

| 보직 | 역할 | 권한 | 산출물 |
| --- | --- | --- | --- |
| Commander/User | intent, end state, retained authority | approve/reject/FRAGO/risk acceptance | Commander intent, decision packet |
| TF Lead / CoS | 임무 통합, battle rhythm, CCIR | tasking, pause, escalate | TF charter, SITREP |
| S2 Recon Cell | source discovery, claim verification, threat/context analysis | source confidence 판단, unsupported claim 차단 | source annex, evidence packet |
| S3 Execution Cell | tool sequence, implementation, dry run | Green execution, Amber report | task order, execution log |
| S4/S6 Enabler Cell | tool/resource/context readiness, fallback, environment | degraded mode, repair task | maintenance report, PACE |
| OPSEC/Release Reviewer | EEFI, releasability, final output review | release block/review pass | release review |
| Red Team | failure mode, hallucination, abuse-case review | critical finding, no-go recommendation | red-team findings |
| Recorder/KM | source of truth, event log, handoff | audit integrity | event log, handoff packet, AAR |

원칙: AI SOF TF는 "강한 실행자"가 아니라 "강한 통합과 통제 아래 놓인 작은 팀"이다.

## 5. Core Activities의 안전한 AI 매핑

| USSOCOM core activity | AI SOF TF 매핑 | 금지선 |
| --- | --- | --- |
| Direct Action | 좁은 범위의 고위험 code/tool action | 승인 없는 production/credential action 금지 |
| Special Reconnaissance | 민감하거나 불확실한 source/context 검증 | 출처 없는 확정 표현 금지 |
| Foreign Internal Defense / Security Force Assistance | 사용자의 팀/agent workflow 훈련과 SOP 구축 | 사용자를 우회한 자율 의사결정 금지 |
| Civil Affairs | stakeholder, dependency, human impact 분석 | 사람/조직 영향 숨기기 금지 |
| Military Information Support Operations | 정직한 user-facing communication, change adoption support | 기만, 조작, 은폐 목적의 persuasion 금지 |
| Counterterrorism / Counter-proliferation analogy | abuse-case, exploit, secret leakage, harmful-output 차단 | 실제 위해 전술/대상화로 전환 금지 |
| Foreign Humanitarian Assistance analogy | incident recovery, user support, service restoration | 권한 없는 데이터 접근 금지 |

## 6. TF lifecycle

```text
1. Activate
   - commander intent, trigger, urgency, retained authority 확인

2. Select
   - agent readiness, tool readiness, source access, release risk 확인

3. Isolate
   - need-to-know context packet, EEFI, allowed roles 설정

4. Plan
   - OPORD + annex + approval scope + PACE + CCIR

5. Backbrief / rehearse
   - task owner가 intent, stop condition, approval boundary 재진술
   - friction point를 CCIR/decision packet으로 route

6. Execute
   - Green은 실행, Amber는 보고, Red는 승인, Black은 금지

7. Extract / handoff
   - result, evidence, unresolved risk, rollback state 기록

8. AAR / reset
   - readiness update, SOP update, TF disband or standing watch
```

## 7. Activation charter

AI SOF TF는 다음 charter 없이 시작하지 않는다.

```yaml
ai_sof_tf:
  id: SOF-TF-001
  mission_id: M-...
  trigger: "왜 일반 workflow가 아닌 TF가 필요한가"
  commander_intent:
    purpose:
    end_state:
    failure_to_avoid:
  authority:
    allowed:
    approval_required:
    prohibited:
    retained_by_commander:
  cells:
    lead:
    s2_recon:
    s3_execution:
    s4_s6_enabler:
    opsec_release:
    red_team:
    recorder:
  ccir:
    pir:
    ffir:
    eefi:
    decision_points:
  exit_criteria:
    success:
    abort:
    handoff:
```

현재 저장소에는 이 charter를 기계 검증하는 `schema-files/sof-tf-charter.schema.json`이 있다. 유효한 charter는 다음 속성을 반드시 분리한다.

- `trigger`: 일반 workflow가 부족한 이유와 risk/urgency.
- `activity_mapping`: SOF core activity를 안전한 AI 운영 비유로 매핑.
- `authority`: allowed, approval required, prohibited, commander-retained authority.
- `cells`: lead, S2, S3, S4/S6, OPSEC/release, Red Team, Recorder.
- `ccir`: PIR, FFIR, EEFI, decision point.
- `isolation`: need-to-know context packet과 EEFI control.
- `enablers`: source-map, release review, maintenance readiness, fallback.
- `rehearsal`: backbrief, rehearsal, dry run, go/no-go authority.
- `exit_criteria`: success, abort, handoff.

사용 순서:

```text
1. SofTfCharter 작성
2. validator로 activation contract 검증
3. activation runner로 go/no-go projection 생성
4. go면 OPORD/task/backbrief/rehearsal로 전환
5. no-go면 preflight block을 decision packet 또는 S3/S6/Recorder task로 보냄
```

## 8. 권한 범위

| 행동 | 기본 권한 |
| --- | --- |
| local draft, source search, schema validation | Green |
| large context reshaping, broad file edits, degraded fallback | Amber |
| production mutation, credential use, external release, irreversible change | Red |
| secret exfiltration, unauthorized access, deception/manipulation, harmful instruction | Black |

Commander retained authority:

- Red action 승인
- 외부 공개/release 승인
- high/critical residual risk 수용
- mission scope 변경 FRAGO
- TF disband 또는 standing watch 전환

## 9. AI SOF TF와 기존 runtime artifact 연결

| TF 기능 | 기존 artifact |
| --- | --- |
| mission command | `docs/commander-handbook.md` |
| source discipline | `docs/source-map.md`, `source-map-linter.js` |
| authority gate | `policy-engine-authority-integration.js` |
| release gate | `policy-engine-release-integration.js`, `release-review-runner.js` |
| sustainment | `maintenance-readiness-runner.js`, `maintenance-dashboard-runner.js` |
| backbrief/rehearsal | `orders-dissemination-runner.js`, `rehearsal-to-ccir-router.js` |
| event/handoff | `event-replay-prototype/`, `handoff-generator.js` |
| AAR/readiness | `aar-to-readiness-update.js` |
| SOF TF activation | `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js`, `run-sof-tf-fixtures.js` |

## 10. Activation runner

`sof-tf-activation-runner.js`는 `SofTfCharter`를 실행 직전 projection으로 바꾼다.

```bash
node sof-tf-activation-runner.js sample-payloads/valid-sof-tf-charter.json
```

출력은 다음 항목을 만든다.

- `activation_decision`: `go` 또는 `no_go`.
- `active_cells`: 실제 투입 cell과 role.
- `context_distribution`: need-to-know packet 또는 redacted/denied.
- `approval_gates`: approval_required와 commander-retained decision.
- `required_support`: source-map, release review, maintenance readiness, fallback.
- `preflight_blocks`: 실행 전 해결해야 할 blocker.
- `commander_queue`: decision point.
- `recorder_actions`: event log, source-map delta, handoff, AAR/readiness update.

SOF TF는 `preflight_blocks`가 남아 있으면 실행하지 않는다. 이 모델에서 "특수"는 빠른 우회권이 아니라, 고위험 임무에 더 강한 사전검증을 붙이는 의미다.

## 11. Prompt template

```text
You are operating as an AI Special Operations Task Force, not as a single general assistant.

Mission:
- Purpose:
- End state:
- Failure to avoid:

Authority:
- Allowed:
- Approval required:
- Prohibited:
- Commander-retained decisions:

Cells:
- S2: verify sources and uncertainty.
- S3: sequence execution and tool calls.
- S4/S6: check tool/resource/context readiness and fallback.
- OPSEC/Release: filter EEFI and release risk.
- Red Team: identify failure modes and abuse cases.
- Recorder: preserve evidence, event log, handoff, AAR.

Rules:
1. Do not execute Red actions without approval.
2. Do not release restricted/sensitive context without release review.
3. Convert friction points into CCIR alerts or decision packets.
4. Stop on Black actions.
5. End with evidence, unresolved risk, AAR, and readiness update.
```

## 12. Anti-patterns

- "특수부대"라는 이름으로 통제를 줄임.
- 많은 agent를 띄우고 조율을 운에 맡김.
- source/release/authority reviewer 없이 executor만 강화함.
- 긴급상황이 생긴 뒤 즉석으로 elite workflow를 만들려 함.
- 고위험 작업을 "작은 팀이니까 빠르게" 처리함.
- AAR 없이 disband해서 같은 실패를 반복함.

## 13. 결론

AI SOF TF의 핵심은 비밀스럽거나 공격적인 행동이 아니다. 핵심은 작은 팀, 엄격한 선발, 충분한 훈련, 강한 enabler, 명확한 권한, 빠른 보고, 그리고 사후 readiness 갱신이다.

LLM 운용에서 이 모델은 다음 한 문장으로 요약된다.

> 고위험/고불확실성 임무는 더 많은 자율성이 아니라, 더 작은 팀과 더 강한 통제, 더 좋은 지원, 더 빠른 결심 루프가 필요하다.
