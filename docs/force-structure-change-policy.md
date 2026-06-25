# Force Structure Change Policy

## 0. 목적

이 문서는 군대의 force management, force development, force documentation 원리를 LLM/agent 조직의 병과 신설/폐지, 부대 증축/감축 방침으로 변환한다.

조직 변경은 좋은 아이디어를 조직표에 추가하는 작업이 아니다. 군대식 관점에서 조직 변경은 capability gap, 임무, doctrine/procedure, 인력, 훈련, 장비/도구, 지속지원, 시설/환경, 정책, 예산, readiness, 문서화가 함께 움직이는 결정이다.

LLM runtime에서도 같다. 새 agent role, 부서, TF, runner, dashboard panel, approval board를 만들 때는 다음 질문을 먼저 답해야 한다.

```text
이 능력은 기존 조직으로 수행 불가능한가?
새 조직을 만들면 누가 지휘하고 누가 지원하는가?
인력/도구/문맥/검증/문서 유지 비용은 감당 가능한가?
언제 없애거나 줄일 것인가?
폐지 후 기능과 기록은 어디로 이관되는가?
```

다국적 적용 주의:

- DOTMLPF-P와 force management 용어는 US-derived vocabulary다.
- 이 프레임워크에서는 기존 schema 호환을 위해 `dotmlpf_p` 필드를 유지하지만, 다국적/민간 적용 문서에서는 `capability lifecycle review`로 병기한다.
- 다른 군의 편제/병과/부대 변경에 적용할 때는 현지 doctrine, 법령, 승인권, readiness 체계를 별도로 확인한다.

## 1. 공식 출처 앵커

- AR 71-32, Force Development and Documentation: https://history.army.mil/Portals/143/Images/Covid/PDF/r71_32.pdf
- DA PAM 71-32, Force Development and Documentation Consolidated Procedures: https://www.afms.edu/digitallibrary.html
- How the Army Runs, U.S. Army War College / Army Force Management School: https://warroom.armywarcollege.edu/reference-materials/
- Force Management Functional Area, DA PAM 600-3 excerpt: https://api.army.mil/e2/c/downloads/2024/04/03/1074fa08/force-management-fa-50-da-pam-600-3.pdf
- Army Force Management School digital library: https://www.afms.edu/digitallibrary.html

## 2. 군대식 force management에서 가져올 원리

| 군대식 원리 | 의미 | AI 조직 적용 |
| --- | --- | --- |
| Capability requirement | 조직은 능력 요구 때문에 생긴다 | 새 agent/부서는 명확한 mission gap이 있어야 한다 |
| DOTMLPF-P 검토 | 조직 변경 전에 doctrine, organization, training, materiel, leadership, personnel, facilities, policy 대안을 본다 | prompt/SOP/schema/training/tool 권한 조정으로 해결 가능한지 먼저 확인한다 |
| Force development | 능력 요구를 조직 설계와 문서화로 변환한다 | role, authority, outputs, readiness gate, source of truth를 contract로 만든다 |
| Force documentation | 승인된 조직 요구와 authorization은 문서로 남는다 | schema, sample payload, runner, README/source-map이 조직 변경의 공식 기록이다 |
| Life cycle | 조직은 생성, 운용, 평가, 전환, 폐지의 주기를 갖는다 | standing role/TF는 activation, sustain, resize, deactivate, transfer, AAR를 가져야 한다 |
| Affordability/supportability | 좋은 조직도 지속지원이 안 되면 실패한다 | 토큰, context, tool, maintainer, dashboard, test 비용을 평가한다 |
| Readiness | 조직은 존재가 아니라 수행준비 상태로 평가된다 | T/P/U/X readiness와 권한을 연결한다 |

## 3. AI 조직 변경 대상

변경 대상은 다음 네 종류로 나눈다.

| 대상 | 예시 | 변경 판단 기준 |
| --- | --- | --- |
| Role / 보직 | S2 source reviewer, release authority, recorder | 반복 임무와 권한 경계가 분명한가 |
| Department / 병과형 기능 | Research, Operations, Sustainment, Protection | 기능 산출물이 다른 기능의 실행 조건인가 |
| Unit / 부대형 팀 | standing release cell, dashboard cell, AAR WG | 지속 임무와 battle rhythm이 필요한가 |
| TF / 임시조직 | SOF TF, incident response TF | 특정 고위험/고불확실성 임무 후 해산 가능한가 |

## 4. 조직 신설 기준

새 role/department/unit/TF는 아래 조건을 모두 만족해야 한다.

1. 명확한 capability gap이 있다.
2. 기존 조직/SOP/schema/training/tool 조정으로 해결 불가능하거나 비효율적이다.
3. mission-essential task와 산출물이 정의된다.
4. authority boundary와 commander-retained decision이 정의된다.
5. supported/supporting 관계와 liaison이 정의된다.
6. source of truth와 documentation owner가 있다.
7. readiness gate와 검증 fixture가 있다.
8. sustainment cost와 fallback이 있다.
9. activation/deactivation 또는 review trigger가 있다.
10. AAR 후 유지/축소/폐지 판단 기준이 있다.

신설 금지:

- 단발 작업인데 permanent department를 만드는 경우.
- 이름만 다른 기존 role을 추가하는 경우.
- 승인권/보고선/source of truth가 불명확한 경우.
- runner/test/fixture 없이 사람이 기억으로만 운용해야 하는 경우.
- maintainer와 폐지 조건이 없는 경우.

## 5. 조직 폐지 기준

조직을 없애는 것은 파일 삭제가 아니다. 기능과 기록을 이관하는 작업이다.

폐지 조건:

- mission gap이 사라졌다.
- 기능이 다른 부서에 흡수됐다.
- 반복 사용되지 않는다.
- 유지 비용이 효과보다 크다.
- readiness가 반복적으로 U/X이고 회복 계획이 없다.
- 권한 경계가 위험하거나 중복되어 사고 가능성이 높다.

폐지 전 필수 작업:

```text
1. capability still required? 확인
2. 후속 담당 role/department 지정
3. authority와 approval scope 이관 또는 철회
4. source-of-truth 파일 보존
5. dashboard/runner/schema/sample 참조 제거 또는 대체
6. handoff packet 작성
7. AAR/readiness update 기록
```

## 6. 증축 기준

증축은 agent 수를 늘리는 것이 아니라 capability, coverage, readiness, throughput을 늘리는 것이다.

증축 조건:

- backlog나 alert queue가 지속적으로 임계치를 넘는다.
- mission-critical output이 병목이다.
- 단일 보직이 continuity 위험이 된다.
- 같은 기능의 scope가 분리되어 독립 cell이 필요하다.
- 더 높은 readiness나 2-deep succession이 필요하다.

증축 금지:

- root cause가 SOP 불명확성인데 인원만 늘리는 경우.
- 품질 gate 없이 executor만 늘리는 경우.
- Red Team/release/Recorder 같은 control function 없이 execution만 확장하는 경우.
- source of truth가 나뉘어 common operating picture가 깨지는 경우.

## 7. 감축 기준

감축은 비용 절감만이 아니라 복잡도와 조정 비용을 줄이는 것이다.

감축 조건:

- workload가 줄었다.
- 중복 기능이 발견됐다.
- 자동화 또는 schema/runner가 반복 업무를 대체했다.
- mission priority가 내려갔다.
- 부서 간 handoff가 너무 많아 coordination cost가 산출물 가치를 초과한다.

감축 전 확인:

- 남는 조직이 essential function을 감당할 수 있는가.
- continuity plan이 여전히 2-deep인가.
- release/risk/authority retained decision이 약화되지 않는가.
- source-map, README, validator fixture가 orphan을 만들지 않는가.

## 8. 조직 변경 절차

```text
1. Identify
   - capability gap, overload, redundancy, risk, mission change 식별

2. Analyze alternatives
   - DOTMLPF-P 대안: SOP, schema, training, tool, authority, policy 조정 검토

3. Design
   - role/department/unit/TF 구조, authority, outputs, support relationship 설계

4. Validate
   - readiness, sustainment, source of truth, fixture, runner, release/risk guard 확인

5. Approve
   - CoS 또는 Commander decision packet으로 승인

6. Document
   - schema/sample/README/source-map/compendium 갱신

7. Transition
   - activation, resizing, deactivation, transfer, handoff 실행

8. Assess
   - AAR와 readiness update로 유지/증축/감축/폐지 판단
```

## 9. Force structure change order

현재 저장소의 실행 계약은 `schema-files/force-structure-change-order.schema.json`이다.

필수 요소:

- `change_type`: create, activate, expand, reduce, merge, split, deactivate, disband.
- `target`: 변경 대상의 kind, id, current/proposed state.
- `capability_gap`: 어떤 능력 공백, 중복, 위험, overload를 해결하는가.
- `alternatives_considered`: 조직 변경이 아닌 대안을 검토했는가.
- `dotmlpf_p`: doctrine, organization, training, materiel/tooling, leadership, personnel/agent, facilities/context, policy 영향.
- `authority`: 승인권자, commander-retained decision, 금지선.
- `resources`: maintainer, tool, context, token/time, dashboard/test cost.
- `readiness`: readiness evidence, METL, successor/backup, validation fixture.
- `transition_plan`: activation/deactivation, handoff, data migration, rollback.
- `documentation_updates`: schema, sample, runner, source-map, README, compendium.
- `assessment`: MOP/MOE, AAR trigger, review date, sunset/disband condition.

## 10. AI 적용 예시

| 상황 | 잘못된 반응 | force-structure 방식 |
| --- | --- | --- |
| release review가 자주 막힘 | release agent 추가 | gap 분석, release cell 신설 여부 검토, source-map/release runner 강화 |
| 리서치가 느림 | S2 agent 5개 투입 | source intake와 source reliability를 분리할지 검토 |
| 문서가 계속 누락됨 | Recorder를 매번 수동 호출 | standing KM bureau 또는 dashboard cue 신설 |
| TF가 한 번 쓰이고 방치됨 | 계속 유지 | sunset condition, AAR, disband order |
| 여러 runner가 느림 | 검증 생략 | maintenance/sustainment cell 증축 또는 runner grouping |

## 11. Anti-patterns

- 문제를 보자마자 새 부서나 agent를 만든다.
- 권한과 책임이 없는 이름뿐인 role을 만든다.
- 폐지 조건이 없는 standing TF를 만든다.
- 감축할 때 기능 이관 없이 파일만 지운다.
- 증축할 때 executor만 늘리고 protection/recorder/release gate를 늘리지 않는다.
- 조직 변경을 README 링크 추가로 끝낸다.
- 조직 변경 후 AAR/readiness update를 남기지 않는다.

## 12. 결론

AI 조직의 force structure는 "얼마나 많은 agent가 있는가"가 아니라 "어떤 능력 요구를 어떤 조직 구조와 문서 계약으로 감당하는가"다.

조직은 필요할 때 만들고, 증거로 키우고, 효과가 없으면 줄이고, 임무가 끝나면 없애야 한다. 그 모든 과정은 승인, 문서화, 이관, 검증, AAR로 남아야 한다.
