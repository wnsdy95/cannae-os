# Multinational Doctrine Consistency Review

## 0. 목적

이 문서는 현재 군대식 LLM 운용 프레임워크가 미군 자료에 과하게 종속되어 다른 군 체계에 적용할 때 깨질 수 있는 지점을 검토한다.

결론:

```text
미군 교리는 현재 프레임워크의 1차 scaffolding이다.
하지만 framework contract는 미군 전용 교리가 아니라 다국적 교리에도 이식 가능한 command/control contract여야 한다.
따라서 S2/S3/S4/S6, OPORD, ROE, DOTMLPF-P, SOF Truths 같은 용어는 그대로 수입하지 않고
role alias, jurisdiction gate, local doctrine supplement, commander-retained decision으로 중립화한다.
```

## 1. 공식 출처군

| Source family | Official sources | 비교에 사용한 범위 |
| --- | --- | --- |
| US | ADP 6-0 Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf, JCS Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf | 현재 framework baseline. Mission command, authority, staff function, force management 용어의 원출처로 취급한다. |
| NATO / Allied | Allied Joint Doctrine AJP-01 official GOV.UK publication page: https://www.gov.uk/government/publications/ajp-01-d-allied-joint-doctrine, PDF: https://assets.publishing.service.gov.uk/media/659ea238e96df5000df843f3/AJP_01_EdF_with_UK_elements.pdf | allied joint doctrine, interoperability, common terminology. OPORD/terminology를 다국적 계약으로 유지할 수 있는지 확인한다. |
| UK | UK Defence Doctrine JDP 0-01: https://www.gov.uk/government/publications/uk-defence-doctrine-jdp-0-01, PDF: https://assets.publishing.service.gov.uk/media/63776f4de90e0728553b568b/UK_Defence_Doctrine_Ed6.pdf, UK Joint Operations Doctrine JDP 01: https://www.gov.uk/government/publications/campaigning-a-joint-doctrine-publication | UK command, joint operations, understanding/decision-making, terminology supplement 관점으로 미군식 명칭의 일반화 가능성을 본다. |
| Canada | Canadian Armed Forces public page: https://www.canada.ca/en/services/defence/caf.html, DND reports/publications: https://www.canada.ca/en/department-national-defence/corporate/reports-publications.html, CAF Ethos: Trusted to Serve: https://www.canada.ca/en/department-national-defence/corporate/reports-publications/canadian-armed-forces-ethos-trusted-to-serve.html | CAF organization, ethos, DND/CAF publication and governance context. 지휘/권한/문화/데이터 거버넌스는 현지화해야 함을 확인한다. |
| Korea | 국방부: https://www.mnd.go.kr/, 국가법령정보센터: https://www.law.go.kr/, 한국국방연구원: https://www.kida.re.kr/ | 한국군/한국 법제 맥락. 명령, 권한, 복무, 정책, 공개 연구 맥락은 jurisdiction gate가 필요하다. |

호주 ADF 공식 사이트는 이번 실행 환경에서 안정적으로 본문을 확인하지 못했다. 따라서 이번 감사의 판정 근거에는 넣지 않았다. 나중에 접근성이 확보되면 별도 source family로 추가한다.

## 2. 정합성 원칙

| 원칙 | 적용 |
| --- | --- |
| US is not default | 미군 자료는 baseline일 뿐, 다른 군 적용 시 자동 기본값이 아니다. |
| Internal IDs are not ranks | `COMMANDER`, `COS`, `S2`, `S3`, `S4`, `S6`는 내부 기능 ID다. 실제 계급, 직책, 참모부 명칭으로 해석하지 않는다. |
| Alias before adoption | 다른 군/조직에 적용할 때는 role alias map을 먼저 만든다. |
| Authority beats terminology | 용어가 달라도 승인권, 보고권, 자율권, 금지선이 더 중요하다. |
| Jurisdiction gate | ROE, 법무, 개인정보, 공개발행, 실제 조직 영향은 현지 법/정책 검토를 요구한다. |
| Runtime contract stays stable | OPORD, SITREP, AAR, release review 같은 runtime contract는 유지하되, 외부 명칭과 annex 이름은 매핑 가능해야 한다. |
| Conflict is commander-retained | scope, release, risk, legal, irreversible action 충돌은 하위 agent가 임의 해결하지 않는다. |

## 3. 충돌 taxonomy

| Conflict type | 위험 | 해결 방식 |
| --- | --- | --- |
| Terminology mismatch | 같은 기능을 다른 명칭으로 부르거나 같은 명칭이 다른 의미를 가진다 | glossary + role alias map |
| Authority model variance | 임무형 지휘, 위임, 승인권 범위가 군/법제별로 다르다 | authority matrix + commander-retained decisions |
| Orders format variance | OPORD/FRAGO/annex 형식과 명칭이 다를 수 있다 | normalized runtime contract + doctrine-specific aliases |
| Legal/ROE variance | ROE, 법무, 개인정보, 공개 승인 기준이 국가별로 다르다 | jurisdiction gate + expert/user approval |
| Information security variance | OPSEC, classification, releaseability 분류가 다를 수 있다 | context releasability policy + local labels |
| Force management vocabulary | DOTMLPF-P, force development 같은 미군식 용어가 보편 용어가 아니다 | capability lifecycle review로 일반화 |
| Culture/reporting variance | 보고 방식, 토론 문화, 자율 판단 범위가 다르다 | backbrief/rehearsal + CCIR reporting criteria |

## 4. 정책별 감사 결과

| Local policy | Risk | 판정 | 필요한 조치 |
| --- | --- | --- | --- |
| `docs/agent-roles-and-authority.md` | Medium | S2/S3/S4/S6는 유용하지만 미군/미 육군식 staff label로 오해될 수 있다 | 내부 ID로 유지. 다른 군 적용 시 `role_alias_map` 필수. |
| `docs/commander-handbook.md` | High | mission command가 blanket autonomy로 읽히면 위험하다 | intent-based autonomy는 authority matrix 안에서만 허용. scope/release/risk/legal은 commander-retained. |
| `docs/prompt-templates.md` | Medium | OPORD five-paragraph format을 유일한 군 문서 형식으로 보면 과잉 일반화다 | five-paragraph order는 runtime normalization contract로 유지하고, NATO/UK/local annex alias를 허용. |
| `docs/tool-use-roe.md` | Critical | ROE/legal support 비유는 국가별 법률 차이를 덮을 수 있다 | tool-use control analogy로만 사용. 법률/실세계/개인정보/공개발행은 local jurisdiction gate. |
| `docs/context-releasability-policy.md` | Medium | classification 이름은 국가/조직마다 다르다 | raw/summary/redacted/reference/denied delivery mode는 유지하고 local label mapping을 둔다. |
| `docs/role-document-access-policy.md` | Medium | need-to-know 원칙은 넓게 적용 가능하지만 문서 분류명과 승인권은 다르다 | role, duty, authority 기반 access contract는 유지. source family별 classification alias 필요. |
| `docs/force-structure-change-policy.md` | High | DOTMLPF-P는 US-derived vocabulary다 | DOTMLPF-P는 checklist로 유지하되 다국적 적용명은 capability lifecycle review로 둔다. |
| `docs/ai-special-operations-tf.md` | Medium | SOF Truths는 USSOCOM 출처이므로 universal SOF doctrine으로 쓰면 안 된다 | US-derived high-risk TF heuristic으로 표시. 타국 특수작전 체계 적용 전 local doctrine review. |
| `docs/interdepartment-collaboration-policy.md` | Medium | warfighting function/combined arms 용어는 국가별 doctrine 차이가 있다 | supported/supporting, liaison, output contract는 유지하고 기능명은 alias 처리. |
| `docs/knowledge-management-sop.md` | Low | KM 원리는 폭넓게 적용 가능하지만 저장소/기록 보존 규정은 조직별이다 | source of truth, event log, handoff는 유지. retention/legal hold는 local policy gate. |
| `docs/risk-acceptance-authority.md` | High | 위험 수용 권한은 조직/법제별로 다르다 | high/critical residual risk는 user/Commander retained로 유지. 전문가/현지 권한자 gate 필요. |

## 4.1 나머지 운영 문서 정합성 판정

아래 문서들은 미군식 명칭을 직접 강제하기보다 runtime mechanism을 정의하므로 구조는 유지한다. 다만 외부 군/조직에 적용할 때는 alias와 jurisdiction gate를 앞단에서 적용한다.

| Local document | Verdict | Reason |
| --- | --- | --- |
| `docs/approval-scope-policy.md` | Keep with jurisdiction gate | single-use approval, expiry, rollback은 보편 통제지만 승인권자는 조직별이다. |
| `docs/backbrief-and-rehearsal-sop.md` | Keep | backbrief/rehearsal은 명령 왜곡 방지 장치로 다국적 적용 가능하다. 용어만 local briefing 용어로 alias한다. |
| `docs/b2c2wg-operating-model.md` | Keep with alias | board/cell/working group 구조는 유지하되 B2C2WG 명칭은 US-derived staff shorthand로 취급한다. |
| `docs/ccir-alerting-model.md` | Keep | PIR/FFIR/EEFI/decision point는 정보요구 routing contract로 유지한다. 실제 보고명칭은 local alias. |
| `docs/command-post-dashboard.md` | Keep | dashboard는 decision queue, CCIR, approval, readiness projection이므로 특정 군 교리에 종속되지 않는다. |
| `docs/data-model.sql.md` | Keep | persistence schema는 군 용어보다 audit/event/source-of-truth contract를 저장한다. |
| `docs/event-sourcing-model.md` | Keep | command/event 분리는 하달 왜곡과 감사 문제를 해결하는 일반 runtime pattern이다. |
| `docs/implementation-guide.md` | Keep with source family check | 구현 가이드는 새 source family를 적용할 때 source-map과 doctrine review를 먼저 갱신해야 한다. |
| `docs/information-to-operations-cycle.md` | Keep | raw information이 곧바로 order change가 되지 않게 하는 흐름은 다국적 정합성이 높다. |
| `docs/maintenance-readiness-model.md` | Keep | sustainment/readiness 개념은 보편 적용 가능하다. rating label만 local readiness 체계와 매핑한다. |
| `docs/military-operating-system.md` | Keep with alias | operating loop는 유지하되 command/staff labels는 role alias map을 거친다. |
| `docs/opord-annex-model.md` | Keep with alias | annex separation은 유지한다. annex 이름과 numbering은 NATO/UK/local format에 맞게 alias한다. |
| `docs/opsec-classification-model.md` | Keep with local labels | raw/summary/redacted/reference/denied delivery는 유지. classification label은 local policy에 맞춘다. |
| `docs/personnel-continuity-model.md` | Keep | succession, vital records, degraded mode는 continuity 원리로 유지한다. 실제 직위승계 권한은 local authority gate. |
| `docs/policy-engine-rules.md` | Keep | Green/Amber/Red/Black은 runtime risk class다. 실제 법적 ROE가 아니라 tool gateway class로만 쓴다. |
| `docs/reference-architecture.md` | Keep | orchestrator, policy engine, tool gateway, evidence store는 implementation architecture다. |
| `docs/sop-library.md` | Keep | SOP 구조는 유지하되 각 SOP의 authority와 reporting label은 local alias map을 따른다. |
| `docs/source-reliability-rubric.md` | Keep | authority/directness/currency/scope/interpretive risk 평가는 출처군이 달라도 필요하다. |
| `docs/dashboard-wireframes.md` | Keep | UI wireframe은 군 교리보다 queue/projection 표시 방식이므로 직접 충돌은 없다. |

## 5. Role alias map 표준

다른 군이나 민간 조직에 적용할 때는 아래 mapping을 먼저 작성한다.

```json
{
  "source_family": "UK",
  "role_aliases": {
    "COMMANDER": ["final decision authority", "accountable owner"],
    "COS": ["orchestrator", "chief integrator"],
    "S2": ["intelligence/source verification function"],
    "S3": ["operations/execution planning function"],
    "S4": ["sustainment/resource function"],
    "S6": ["knowledge/information systems function"],
    "RED_TEAM": ["independent challenge function"],
    "RECORDER": ["knowledge management/audit function"]
  },
  "non_aliasable": [
    "legal authority",
    "public release authority",
    "risk acceptance authority"
  ]
}
```

규칙:

- alias는 명칭만 바꾼다. 승인권을 낮추지 않는다.
- `COMMANDER`는 실제 장군/지휘관 계급이 아니라 최종 의사결정권자다.
- `S2/S3/S4/S6`는 기능 ID다. 실제 조직의 참모부 이름과 1:1 대응한다고 가정하지 않는다.
- alias가 안 되는 항목은 local authority 또는 user approval로 남긴다.

## 6. 문서 하달 체계에 대한 적용

다국적 비교 후에도 유지할 수 있는 핵심은 문서명 자체가 아니라 왜곡 방지 구조다.

```text
Intent
Mission
Authority boundary
Information requirement
Task ownership
Backbrief
Execution evidence
SITREP / FRAGO route
AAR / readiness update
```

이 구조는 미군 OPORD를 그대로 베끼는 것이 아니라, 상위 의도가 하위 실행으로 내려갈 때 왜곡을 줄이는 통제 흐름이다. NATO/UK 자료의 common terminology와 joint doctrine도 같은 방향의 필요를 뒷받침한다. 한국/캐나다 맥락에서는 법적 권한, 조직문화, 공개 정책이 다르므로 local gate가 필요하다.

## 7. Force structure 보정

`DOTMLPF-P`는 그대로 사용하면 미군식 force management로 고정된다. 다국적 적용에서는 아래 중립 용어를 병행한다.

| US-derived term | Neutral framework term |
| --- | --- |
| Force development | Capability design |
| Force documentation | Organization contract record |
| DOTMLPF-P | Capability lifecycle review |
| Unit activation | Capability activation |
| Unit deactivation/disbandment | Capability sunset/transfer |
| Readiness gate | Execution readiness gate |

정책 결론:

- schema 필드명 `dotmlpf_p`는 기존 fixture 호환을 위해 유지한다.
- 문서에서는 `DOTMLPF-P / capability lifecycle review`로 병기한다.
- 새 부대/병과/role을 만들 때는 어느 군의 명칭을 쓰든 capability gap, authority, readiness, sustainment, handoff, sunset을 반드시 검증한다.

## 8. SOF TF 보정

AI SOF TF 모델은 USSOCOM 자료에서 온다. 따라서 다른 군의 특수작전 체계를 대표한다고 쓰면 안 된다.

유지할 수 있는 부분:

- 작은 팀
- 검증된 인원/agent
- 강한 enabler
- need-to-know isolation
- commander-retained authority
- rehearsal, dry run, AAR

중립화해야 하는 부분:

- SOF Truths를 universal doctrine으로 쓰지 않는다.
- direct action, special reconnaissance 등 실제 군사 활동명은 AI 안전 비유로만 쓴다.
- 외부 조직에 적용할 때는 high-risk task force 또는 protected incident cell 같은 중립 이름을 허용한다.

## 9. 검증 contract

새 검증 contract:

- `schema-files/doctrine-consistency-review.schema.json`
- `sample-payloads/valid-doctrine-consistency-review.json`
- `sample-payloads/invalid-doctrine-consistency-review-us-only.json`
- `doctrine-consistency-runner.js`
- `run-doctrine-consistency-fixtures.js`
- `doctrine-consistency-fixtures/README.md`

semantic gate:

- source family가 4개 미만이면 실패.
- non-US source family가 3개 미만이면 실패.
- `adopt_us_only` disposition이면 실패.
- role/staff terminology finding에 alias handling이 없으면 실패.
- ROE/legal finding에 jurisdiction gate가 없으면 실패.
- source-map/compendium/schema/sample/runner documentation update가 없으면 실패.

## 10. 결론

현재 프레임워크는 다음 방식으로 다국적 정합성을 유지한다.

1. 미군 자료는 baseline으로 쓰되 default로 만들지 않는다.
2. 내부 role ID와 외부 직책명을 분리한다.
3. OPORD형 문서 구조는 runtime contract로 유지하고, 현지 문서명과 annex 구조는 alias 처리한다.
4. legal/ROE/release/risk는 반드시 현지 권한과 Commander/user 승인으로 올린다.
5. force structure와 SOF TF는 US-derived vocabulary임을 표시하고 capability lifecycle/high-risk TF로 일반화한다.
