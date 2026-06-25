# Source Map

## 0. 목적

이 문서는 군사 교리, 지휘통제 문서, 훈련/지속지원/타게팅/평가 자료를 LLM 운용 프레임워크의 개념으로 연결하는 근거 지도다.

`research-compendium.md`가 리서치 메모의 저장소라면, 이 문서는 각 출처가 어떤 프레임워크 구성요소를 뒷받침하는지 빠르게 찾기 위한 색인이다.

사용법:

- 특정 개념의 근거를 찾을 때 이 문서를 먼저 본다.
- 새 문서를 만들 때 관련 출처를 이 표에 연결한다.
- 출처가 바뀌면 여기에 먼저 반영하고 관련 문서를 갱신한다.

## 1. Source Map 표준

| 필드 | 의미 |
| --- | --- |
| Source | 원문 또는 공식 페이지 |
| Military concept | 군사 개념 |
| Extracted principle | 뽑아낸 운용 원리 |
| LLM application | LLM 운용 적용 |
| Local documents | 연결된 로컬 문서 |

## 2. Command, Planning, Orders

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf | Operations process | Plan, prepare, execute, assess는 순환 구조다 | LLM 작업도 계획, 준비, 실행, 평가 루프를 가져야 한다 | `military-operating-system.md`, `decision-risk-assessment.md` |
| FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf | MDMP, orders production | 분석과 명령 생산을 분리하되 연결한다 | 프롬프트 생성 전 mission analysis를 수행한다 | `prompt-templates.md`, `sop-library.md`, `orders-production-pipeline.md` |
| STANAG 2014, Formats for Orders: https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf | OPORD/WARNO/FRAGO format | 표준 양식은 하달 중 왜곡을 줄인다 | 사용자 요청을 OPORD형 프롬프트로 변환한다 | `prompt-templates.md`, `opord-annex-model.md` |
| NATO Allied Joint Doctrine AJP-01 official GOV.UK page: https://www.gov.uk/government/publications/ajp-01-d-allied-joint-doctrine, PDF: https://assets.publishing.service.gov.uk/media/659ea238e96df5000df843f3/AJP_01_EdF_with_UK_elements.pdf | Allied joint doctrine, interoperability | 다국적 작전은 공통 원리와 용어를 요구하지만 national supplement를 허용한다 | OPORD와 staff role을 미군 전용 양식이 아니라 normalized runtime contract와 alias map으로 취급한다 | `multinational-doctrine-consistency-review.md`, `prompt-templates.md`, `glossary.md` |
| UK Defence Doctrine JDP 0-01: https://www.gov.uk/government/publications/uk-defence-doctrine-jdp-0-01, PDF: https://assets.publishing.service.gov.uk/media/63776f4de90e0728553b568b/UK_Defence_Doctrine_Ed6.pdf | UK defence doctrine | national doctrine은 공통 command/control 원리를 현지 용어와 구조로 보정한다 | 미군식 role/staff 용어는 내부 ID로 유지하고 UK/local terminology alias를 요구한다 | `multinational-doctrine-consistency-review.md`, `agent-roles-and-authority.md` |
| UK Joint Operations Doctrine JDP 01: https://www.gov.uk/government/publications/campaigning-a-joint-doctrine-publication, PDF: https://assets.publishing.service.gov.uk/media/5a7ea59e40f0b62305b82465/20141209-JDP_01_UK_Joint_Operations_Doctrine.pdf | Joint operations doctrine | joint operations는 command, information, sustainment, assessment를 통합한다 | multi-agent departments를 supported/supporting 관계와 liaison으로 연결한다 | `multinational-doctrine-consistency-review.md`, `interdepartment-collaboration-policy.md` |
| DoD Terminology Program: https://www.jcs.mil/doctrine/dod-terminology-program/ | Common terminology | 공통 용어는 조직 간 오해를 줄인다 | 프레임워크 용어집과 역할명을 고정한다 | `research-compendium.md` |
| JP 5-0, Joint Planning: https://www.esd.whs.mil/Portals/54/Documents/FOID/Reading%20Room/Joint_Staff/18-F-1152_JP_5-0_Joint_Planning_2020.pdf | Joint planning, assessment | planning과 assessment는 분리되지 않는다 | 산출물 완료와 효과 달성을 따로 평가한다 | `decision-risk-assessment.md` |

## 3. Mission Command and Authority

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf | Mission command | 명령은 세부 통제보다 의도와 권한 경계가 중요하다 | 에이전트에 intent, constraints, CCIR를 주고 방법은 위임한다 | `agent-roles-and-authority.md` |
| FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf | Staff roles, running estimates | 참모 기능은 판단을 분업하고 통합한다 | S2/S3/S4/S6/Red Team 에이전트를 분리한다 | `agent-roles-and-authority.md`, `agent-battle-rhythm.md` |
| JCS Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf | Authorities | 권한은 명시적으로 위임되고 제한된다 | 에이전트별 승인 범위와 금지선을 문서화한다 | `agent-roles-and-authority.md` |
| JCS Joint Task Force and Command and Control Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf | Command and control | 복잡한 조직은 command relationship을 명확히 해야 한다 | 멀티에이전트는 누가 최종 통합권을 갖는지 정해야 한다 | `military-operating-system.md` |
| Federal Continuity Directive planning framework: https://www.fema.gov/sites/default/files/documents/fema_federal-continuity-directive-planning-framework.pdf | Continuity, succession, delegation, vital records | 조직은 핵심 기능, 승계선, 권한 위임, 필수기록, 훈련을 사전에 정해야 중단되지 않는다 | role loss/rotation을 continuity plan, handoff, degraded mode, readiness gate로 처리한다 | `personnel-continuity-model.md`, `schema-files/continuity-plan.schema.json`, `continuity-drill-runner.js` |
| Liaison appendix, FM 6-0 excerpt: https://www.globalsecurity.org/military/library/policy/army/fm/6-0/appe.htm | Liaison | 연결 장교는 조직 간 정보 흐름을 안정화한다 | 에이전트 간 인터페이스 담당자를 둔다 | `agent-battle-rhythm.md` |

## 4. Information Requirements and Reporting

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf | CCIR, PIR, FFIR | 모든 정보가 보고 대상은 아니고 결심에 필요한 정보가 보고 대상이다 | 에이전트 보고 기준을 CCIR로 제한한다 | `decision-risk-assessment.md`, `agent-battle-rhythm.md` |
| JP 2-0, Joint Intelligence: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/2-0-Intelligence-Series/ | Intelligence process | 수집 정보는 평가, 분석, 전파를 거쳐 작전에 반영된다 | raw information과 assessment를 분리하고 CCIR/decision/SITREP/FRAGO 출력으로 routing한다 | `information-to-operations-cycle.md`, `schema-files/information-report.schema.json`, `schema-files/intelligence-assessment.schema.json` |
| ADP 2-0, Intelligence: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1007507 | Intelligence support to operations | 정보는 지휘관 결심과 작전 이해를 지원해야 한다 | LLM 정보처리는 source note가 아니라 commander-facing decision support로 끝나야 한다 | `information-to-operations-cycle.md`, `information-to-operations-router.js` |
| ATP 2-01.3, Intelligence Preparation of the Operational Environment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1023498 | Intelligence preparation | 환경/위협/가정 변화는 running estimate와 decision point를 갱신한다 | 새 정보가 기존 명령 가정을 바꾸면 FRAGO scope-change 후보로 격상한다 | `information-to-operations-cycle.md`, `information-to-operations-fixtures/README.md` |
| ADP 6-0 | Shared understanding | 공통 상황 이해가 하위 판단의 품질을 좌우한다 | 컨텍스트 패킷과 backbrief를 강제한다 | `prompt-templates.md` |
| FM 6-0 | Running estimates | 참모는 계속 업데이트되는 판단 자료를 유지한다 | long-running task는 status, risk, source estimate를 유지한다 | `agent-battle-rhythm.md` |
| Knowledge Management Primer: https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf | Knowledge management | 정보는 찾을 수 있고 공유 가능해야 가치가 있다 | 모든 리서치와 판단을 문서 세트에 축적한다 | `research-compendium.md`, `source-map.md` |
| USFKI 5780.01 Knowledge Management Program: https://www.usfk.mil/Portals/105/Documents/Publications/Instructions/USFKI_5780-01_Knowledge-Management-Program.pdf | KM governance | 지식관리에는 책임자, 절차, 저장소가 필요하다 | S6 Knowledge 역할과 문서 저장 규칙을 둔다 | `sop-library.md` |

## 5. Rehearsal, Backbrief, and Verification

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf | Rehearsal | 실행 전 주요 행동과 전환점을 검증한다 | 에이전트가 실행 전 plan/backbrief를 제출한다 | `prompt-templates.md`, `agent-battle-rhythm.md`, `backbrief-and-rehearsal-sop.md` |
| FM 5-0: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf | Backbrief, confirmation brief | 하급자는 이해한 임무를 재진술한다 | LLM에게 "내가 이해한 임무"를 먼저 출력하게 한다 | `prompt-templates.md`, `backbrief-and-rehearsal-sop.md` |
| STANAG 2014 | Orders format | 표준 순서는 누락을 줄인다 | 프롬프트 템플릿에 Situation, Mission, Execution, Sustainment, Command/Signal을 넣는다 | `prompt-templates.md` |
| ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf | Risk controls | 위험 통제는 실행 전 결정되고 실행 중 감독된다 | high-risk 작업은 승인과 검증 gate를 갖는다 | `decision-risk-assessment.md` |

## 6. Risk, Assessment, and Learning

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| ATP 5-19, Risk Management | Risk management process | 식별, 평가, 통제, 감독을 반복한다 | risk register와 approval gate를 둔다 | `decision-risk-assessment.md` |
| Operation Assessment MTTP: https://www.alssa.mil/mttps/assessment/ | Operation assessment | 수행 여부와 효과를 구분한다 | MOP/MOE/indicator를 분리한다 | `decision-risk-assessment.md` |
| ATP 5-0.3, Operation Assessment: https://www.bits.de/NRANEU/others/amd-us-archive/ATP5-0x3%2815%29.pdf | Indicators | 관찰 가능한 지표가 있어야 평가 가능하다 | "문서 존재"와 "다음 작업자가 실행 가능"을 구분한다 | `decision-risk-assessment.md` |
| AAR practice from Army doctrine and training culture | After action review | 실행 후 차이를 학습으로 전환한다 | 프롬프트와 SOP를 AAR 후 갱신한다 | `sop-library.md` |

## 7. Training and Readiness

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716 | Training management | 임무 수행 능력은 계획된 훈련과 평가로 만든다 | 에이전트도 SOP별 숙련도와 readiness를 관리한다 | `sop-library.md`, `functional-domains.md` |
| FM 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335 | Unit training management | METL 중심으로 훈련 과제를 정한다 | LLM 운영의 mission-essential task list를 만든다 | `functional-domains.md` |
| Army training management concepts | Crawl-walk-run | 낮은 복잡도에서 높은 자율성으로 단계 상승 | 처음에는 체크리스트, 이후 supervised autonomy, 마지막에 mission command | `sop-library.md` |
| METL concept | Mission essential task list | 모든 일을 잘하려 하지 말고 핵심 임무를 정한다 | 에이전트 역할별 필수 과업과 검증 기준을 둔다 | `agent-roles-and-authority.md` |

## 8. Sustainment and Logistics

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| ADP 4-0, Sustainment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796 | Sustainment | 작전은 자원, 정비, 보급 없이는 지속되지 않는다 | 토큰, 시간, 도구, API, 파일 접근을 S4가 관리한다 | `functional-domains.md`, `agent-battle-rhythm.md` |
| JP 4-0, Joint Logistics: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/ | Joint logistics | 여러 조직의 지속지원은 통합과 우선순위가 필요하다 | 멀티에이전트 작업의 자원 병목과 우선순위를 관리한다 | `agent-battle-rhythm.md` |
| Sustainment principles | Anticipation, responsiveness, simplicity, economy, survivability, continuity, improvisation | 지속성은 사전 예측과 단순한 흐름에서 나온다 | 장기 작업에는 도구 대체, 캐시, 기록, 체크포인트가 필요하다 | `functional-domains.md` |
| FM 4-0, Sustainment Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN41683-FM_4-0-000-WEB-2.pdf | Sustainment operations | 지속지원은 작전 지속성과 준비태세를 좌우한다 | tool/resource/context/fallback readiness 모델로 변환 | `maintenance-readiness-model.md` |
| Army Publishing Directorate ATP maintenance publications: https://armypubs.army.mil/ProductMaps/PubForm/ATP.aspx | Maintenance publications | 정비/유지관리 절차는 장비 가용성과 임무지속성을 관리한다 | runtime critical tool check와 fallback planning | `maintenance-readiness-model.md` |
| Army maintenance readiness article: https://home.army.mil/wood/contact/publications/engr_mag/Maintenance-Moving-Forward | Maintenance readiness update | maintenance doctrine evolves with operational needs | runner 기반 tool readiness check의 참고 근거 | `maintenance-readiness-model.md` |

## 9. Targeting and Effects

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| JP 3-60, Joint Targeting: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/ | Targeting cycle | 목표, 효과, 수단, 평가가 연결되어야 한다 | LLM 작업도 어떤 대상에 어떤 변화가 필요한지 명확히 한다 | `functional-domains.md` |
| FM 3-60, Army Targeting: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1030750 | Decide, detect, deliver, assess | 타게팅은 결정, 탐지, 실행, 평가 순환이다 | 코드/문서 변경도 target, desired effect, verification을 기록한다 | `decision-risk-assessment.md` |
| Joint fires/targeting doctrine | Effects-based planning | 행동 자체보다 원하는 효과가 중요하다 | "문서를 만든다"보다 "다음 에이전트가 실행 가능하게 한다"를 목표로 둔다 | `military-llm-framework-v0.1.md` |

## 10. Rules of Engagement and Legal Controls

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| CJCSI 3121.01B, Standing Rules of Engagement / Standing Rules for the Use of Force: public references exist, verify current official release before operational use | ROE/SRUF | 허용되는 행동과 금지되는 행동을 사전에 정한다 | 에이전트의 tool-use, data-use, irreversible-action 금지선을 둔다 | `agent-roles-and-authority.md` |
| JP 3-84, Legal Support: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/ | Legal support | 지휘관의 결심에는 법적 제한과 자문이 포함된다 | 고위험 도메인은 법률 조언이 아니라 승인/검토 경로로 처리한다 | `decision-risk-assessment.md` |
| ATP 5-19 | Risk decision authority | 위험 수용 권한은 수준별로 다르다 | 에이전트는 위험 수용자가 아니라 위험 보고자다 | `agent-roles-and-authority.md` |

## 11. Warfighting Functions

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282 | Warfighting functions | 전투력은 기능별 통합으로 발생한다 | LLM 운영도 기능별 에이전트와 통합 루프가 필요하다 | `functional-domains.md`, `interdepartment-collaboration-policy.md` |
| ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715 | Operations, multidomain context | 작전은 여러 기능과 영역의 동시 조정이다 | 멀티에이전트는 research, execution, sustainment, protection, information을 통합해야 한다 | `functional-domains.md`, `interdepartment-collaboration-policy.md` |
| JP 3-0, Joint Campaigns and Operations: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/ | Joint functions and integration | 합동작전은 기능별 능력을 공동 목적 아래 통합한다 | 부서 간 supported/supporting 관계와 liaison contract를 둔다 | `interdepartment-collaboration-policy.md`, `schema-files/department-collaboration-charter.schema.json`, `department-collaboration-runner.js` |
| FM 6-0 | Command and control function | 지휘통제는 모든 기능을 통합한다 | Chief/Commander 에이전트가 최종 통합권을 갖는다 | `agent-battle-rhythm.md` |

## 12. AI / LLM 연구 연결

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| LLM hallucination research | Verification and uncertainty | 모델 출력은 사실과 추론을 구분해야 한다 | 출처 없는 주장은 가설로 표시하고 검증 절차를 둔다 | `research-compendium.md` |
| Multi-agent LLM research | Role specialization | 전문 역할 분화는 성능을 높일 수 있으나 조정 비용이 생긴다 | S-staff 구조를 쓰되 CoS 통합을 둔다 | `agent-roles-and-authority.md` |
| Prompt engineering research | Structured prompting | 명확한 역할, 제약, 출력 형식은 품질을 높인다 | OPORD, SITREP, AAR 템플릿을 사용한다 | `prompt-templates.md` |

## 13. Korean Public Sources

| Source | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| 국방부 공개자료/국방백서: https://www.mnd.go.kr/ | 국방정책, 군 구조, 국방혁신 | 한국군 맥락은 공식 정책자료에서 확인한다 | 한국형 프레임워크의 전략/조직 배경으로 사용 | `korean-military-sources.md` |
| 국가법령정보센터: https://www.law.go.kr/ | 군인 복무, 명령, 권한, 훈령 | 정당한 권한과 법규 안에서 명령이 작동한다 | 에이전트 authority와 ROE의 법적/조직적 비유 근거 | `korean-military-sources.md`, `tool-use-roe.md` |
| 한국국방연구원: https://www.kida.re.kr/ | 국방정책, AI, 지휘통제, 군수 연구 | 공개 연구자료는 한국적 제도와 정책 맥락을 제공한다 | implementation guide와 한국형 보정 자료로 사용 | `korean-military-sources.md`, `implementation-guide.md` |
| Canadian Armed Forces public page: https://www.canada.ca/en/services/defence/caf.html | Canadian Armed Forces organization | force structure and role terminology must be treated as local organization context, not US defaults | role alias map and local authority mapping for Canadian adaptation | `multinational-doctrine-consistency-review.md` |
| DND reports and publications: https://www.canada.ca/en/department-national-defence/corporate/reports-publications.html | DND/CAF publications and governance | public reports, ethos, data governance, and policy documents provide local source context | multinational consistency review must cite local public source families before adaptation | `multinational-doctrine-consistency-review.md`, `source-map.md` |
| CAF Ethos, Trusted to Serve: https://www.canada.ca/en/department-national-defence/corporate/reports-publications/canadian-armed-forces-ethos-trusted-to-serve.html | Canadian military ethos | culture, profession, and values affect authority, reporting, and judgement norms | do not assume US mission-command culture maps one-to-one into other forces | `multinational-doctrine-consistency-review.md`, `korean-org-culture.md` |
| 군사용어 공개자료 | 용어 통일 | 공통 용어는 하달 왜곡을 줄인다 | glossary와 prompt DSL 필드명 안정화 | `glossary.md`, `prompt-dsl.md` |

## 14. Supplemental Official Source Hosts

| Source host | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| Marine Corps publications, www.marines.mil | warfighting and planning references | 서비스별 교리와 작전철학은 공통 원리의 보조 근거가 된다 | glossary, doctrine comparison, operating model 보조 | `research-compendium.md` |
| FEMA official site, www.fema.gov | continuity planning | continuity에는 succession, delegation, essential records, test/training/exercise가 포함된다 | role continuity and turnover model 보조 | `personnel-continuity-model.md` |
| USSOCOM official site, www.socom.mil | special operations, SOF truths, core activities | SOF는 quality, readiness, enablers, mission command를 중시한다 | AI special operations task force model | `ai-special-operations-tf.md`, `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js` |
| Army Center of Military History public archive, history.army.mil | force development and documentation | 조직 변경은 승인된 capability requirement와 documentation으로 남아야 한다 | agent/role/unit creation, resize, deactivation을 order와 schema로 통제 | `force-structure-change-policy.md`, `schema-files/force-structure-change-order.schema.json`, `force-structure-change-runner.js` |
| Army Force Management School, www.afms.edu | force management education and digital library | force management는 capability requirement, resourcing, documentation, readiness를 연결한다 | 새 AI 부서/보직은 DOTMLPF-P 대안 검토와 sustainment check를 통과해야 한다 | `force-structure-change-policy.md` |
| U.S. Army War College War Room, warroom.armywarcollege.edu | How the Army Runs reference material | 대규모 조직은 요구 식별, 프로그래밍, 문서화, 평가 루프로 유지된다 | AI 조직도 creation, growth, reduction, disband lifecycle을 가져야 한다 | `force-structure-change-policy.md`, `run-force-structure-change-fixtures.js` |
| Army Safety, safety.army.mil | risk and safety cards | 위험관리 도구는 현장 실행 전 점검을 돕는다 | risk prompt guard와 checklist 보조 | `research-compendium.md` |
| Army University Press, www.armyupress.army.mil | professional military analysis | 교리 적용과 사례 분석은 framework 해석의 보조 근거가 된다 | case studies and research questions | `research-compendium.md` |
| Army public site, www.army.mil | official news and CALL references | 공개 기사와 기관 안내는 현행 조직/자료 위치 확인에 유용하다 | source discovery and source map coverage | `research-compendium.md` |
| UK official publications, www.gov.uk | UK and NATO doctrine publications | official national/allied doctrine pages provide non-US terminology and doctrine comparison anchors | multinational doctrine consistency review and alias map | `multinational-doctrine-consistency-review.md` |
| UK official assets, assets.publishing.service.gov.uk | doctrine PDFs | PDF source documents carry the underlying doctrine text and supplements | source verification and source-map URL coverage | `multinational-doctrine-consistency-review.md`, `source-map-linter.js` |
| Government of Canada, www.canada.ca | CAF/DND official public pages | non-US military organization, ethos, and governance context must be checked before adaptation | role authority, culture, and information governance localization | `multinational-doctrine-consistency-review.md` |

## 15. Implementation Sources and Artifacts

| Source / artifact | Military concept | Extracted principle | LLM application | Local documents |
| --- | --- | --- | --- | --- |
| OPORD/WARNO/FRAGO doctrine | 표준 명령 양식 | 명령은 구조화되어야 검증 가능하다 | 기계 판독형 prompt DSL로 변환 | `prompt-dsl.md` |
| Authorities and ROE concepts | 권한과 행동 제한 | 실행 전에 허용/승인/금지 행동을 구분한다 | tool gateway와 approval UI 구현 | `tool-use-roe.md`, `implementation-guide.md` |
| Staff organization doctrine | 참모조직 | 기능별 역할 분담과 통합권이 필요하다 | agent registry와 org chart 구현 | `llm-agent-org-chart.md`, `implementation-guide.md` |
| Operation assessment doctrine | MOP/MOE | 수행과 효과를 분리 평가한다 | evaluator와 readiness rating 구현 | `evaluation-metrics.md`, `implementation-guide.md` |
| 한국 조직문화 보정 | 보고/결재/이견 제시 문화 | backbrief, Red Team, risk reporting을 명시해야 한다 | 한국형 프롬프트와 승인 UX 보정 | `korean-org-culture.md` |
| Runtime architecture artifact | 지휘통제 체계 구현 | Orchestrator, policy engine, tool gateway, evidence store가 필요하다 | 실제 시스템 참조 구조 | `reference-architecture.md`, `sample-runtime-state.md` |
| Prompt DSL validation artifact | 명령 검증 | 실행 전 intent, authority, CCIR, assessment 누락을 잡는다 | validator와 approval UI로 연결 | `prompt-dsl-validator.md`, `approval-ui-patterns.md` |
| Runtime schema artifacts | 상태 계약 | mission, OPORD, task, tool, approval, AAR 객체를 표준화한다 | JSON Schema와 validator prototype으로 구현 | `schema-files/README.md`, `validator-prototype.md` |
| Runtime operations artifact | 작전 운영 절차 | startup, intake, tasking, execution, incident, AAR 루프가 필요하다 | 실제 에이전트 런타임 playbook | `agent-runtime-playbook.md` |
| Risk and readiness artifacts | 위험관리와 훈련관리 | 위험 register와 readiness ledger가 권한을 조정한다 | agent 권한을 증거 기반으로 갱신 | `military-ai-risk-register.md`, `agent-readiness-ledger.md` |
| Fixture and test artifacts | 검증 훈련자료 | valid/invalid payload와 expected result가 validator 품질을 만든다 | 회귀 테스트와 policy engine 검증 | `sample-payloads/README.md`, `evaluation-fixtures.md` |
| Policy engine artifact | ROE 판정 | Black > Red > Amber > Green 우선순위로 도구 권한을 판정한다 | tool gateway의 핵심 decision logic | `policy-engine-rules.md` |
| Command post artifact | 지휘소 화면 | 지휘관에게 필요한 것은 로그 전체가 아니라 결심 요구, CCIR, 위험, 승인 큐다 | mission dashboard와 approval queue 설계 | `command-post-dashboard.md` |
| Automation roadmap artifact | 단계적 구현 | 문서, validator, compiler, tool gateway, dashboard, learning runtime 순서로 발전한다 | 실제 제품화 계획 | `runtime-automation-roadmap.md` |
| Validator CLI artifact | 실행 가능한 검증 | schema subset과 semantic rule을 실제로 실행한다 | fixture 기반 regression gate 초안 | `validator-cli-prototype/README.md` |
| Wireframe artifact | 지휘소 UX | dashboard를 mission, approvals, CCIR, risk, evidence 중심으로 설계한다 | UI prototype의 기준 | `dashboard-wireframes.md` |
| Data model artifact | 상태 저장 | mission/evidence/audit/readiness를 DB 테이블로 분리한다 | runtime persistence 설계 | `data-model.sql.md` |
| Demo scenario artifact | end-to-end 작동 | intake, OPORD, tasking, tool request, SITREP, FRAGO, AAR 흐름을 검증한다 | 제품 데모와 테스트 케이스 | `runtime-demo-scenario.md` |
| Source reliability artifact | 출처 평가 | authority, directness, currency, scope, interpretive risk를 평가한다 | evidence store와 Red Team source check | `source-reliability-rubric.md` |
| Fixture runner artifact | 자동 검증 | validator fixture expectations를 실행해 regression을 잡는다 | CLI 기반 테스트 gate | `validator-cli-prototype/run-fixtures.js` |
| Policy prototype artifact | ROE 실행 | 도구 요청을 실제 Green/Amber/Red/Black으로 판정한다 | tool gateway prototype | `policy-engine-prototype/README.md` |
| Demo payload artifact | 상태 예시 | mission, task, tool, approval, SITREP, evidence, AAR payload를 연결한다 | end-to-end runtime demo | `runtime-demo-payloads/README.md` |
| Dashboard UI artifact | 지휘소 prototype | 정적 HTML로 approval, CCIR, risk, evidence, readiness를 표시한다 | command post UI 검증 | `dashboard-ui-prototype/README.md` |
| Event sourcing artifact | 감사와 replay | command/event를 분리하고 projection을 정의한다 | 장기 audit/log architecture | `event-sourcing-model.md` |
| Policy fixture runner | 정책 회귀검증 | Green allow와 Red block 기대값을 자동 확인한다 | policy regression gate | `policy-engine-prototype/run-policy-fixtures.js` |
| Runtime demo runner | end-to-end 검증 | payload validation과 policy check를 한 번에 실행한다 | demo mission regression gate | `runtime-demo-runner.js` |
| Dashboard state artifact | UI state 분리 | dashboard HTML을 JSON state로 구동한다 | projection 기반 UI로 확장 가능 | `dashboard-ui-prototype/dashboard-state.json` |
| Event fixtures and replay | 이벤트 재생 | event log에서 mission projection을 계산한다 | audit replay prototype | `event-fixtures/README.md`, `event-replay-prototype/README.md` |
| Dashboard state renderer | projection 변환 | event replay 결과를 지휘소 화면 state로 변환한다 | dashboard를 event log source of truth에 연결 | `dashboard-ui-prototype/render-state.js` |
| Event replay fixture runner | projection 회귀검증 | OPORD, task, Red block, approval, readiness가 replay 후 보존되는지 확인한다 | audit/event sourcing regression gate | `event-replay-prototype/run-event-fixtures.js` |
| Runtime demo OPORD payload | 명령 문서 검증 | demo mission을 OPORD와 task order로 엄격히 연결한다 | mission -> OPORD -> task chain validation | `runtime-demo-payloads/opord.json` |
| Orders production pipeline artifact | 명령 생산 | request -> analysis -> OPORD -> task -> backbrief -> rehearsal -> execution 흐름을 고정한다 | long-running LLM work를 document-command loop로 운영 | `orders-production-pipeline.md` |
| OPORD annex model artifact | annex 분리 | 본문은 intent/authority, annex는 전문 세부계획을 담당한다 | source/tool/risk/verification/context plan을 role별로 분리 | `opord-annex-model.md` |
| Backbrief and rehearsal artifact | confirmation/rehearsal | 하급자가 이해와 실행순서를 재진술해야 왜곡을 잡는다 | `BACKBRIEF`/`REHEARSAL` schema와 runner로 실행 전 검증 | `backbrief-and-rehearsal-sop.md`, `schema-files/backbrief.schema.json`, `schema-files/rehearsal.schema.json`, `orders-dissemination-runner.js` |
| OPORD annex and FRAGO scope-change schemas | 명령 본문/부록/파편명령 분리 | 전문 세부계획 갱신과 mission scope/authority 변경은 같은 문서가 아니다 | annex는 detail만 바꾸고, intent/authority 변경은 FRAGO scope-change와 backbrief/rehearsal로 처리한다 | `schema-files/annex.schema.json`, `schema-files/frago-scope-change.schema.json`, `docs/opord-annex-model.md` |
| Rehearsal to CCIR router | rehearsal와 decision point | 예행 중 발견한 friction은 실행 전에 보고/결심 채널로 올라가야 한다 | rehearsal friction point와 decision point를 CCIR alert와 decision packet으로 변환한다 | `rehearsal-to-ccir-router.js`, `rehearsal-to-ccir-fixtures/README.md`, `backbrief-and-rehearsal-sop.md` |
| Information to operations cycle artifact | 정보처리와 작전변경 | raw information은 그대로 명령을 바꾸지 않고 assessment, CCIR, running estimate, decision support를 거친다 | 정보보고/평가를 CCIR alert, decision packet, SITREP, FRAGO scope-change draft로 변환한다 | `information-to-operations-cycle.md`, `schema-files/information-report.schema.json`, `schema-files/intelligence-assessment.schema.json`, `information-to-operations-router.js`, `information-to-operations-fixtures/README.md` |
| Personnel continuity artifact | 인원 손실/교체/로테이션 | 사람은 사라져도 보직, 승계선, 권한 제한, vital records, training pipeline은 남아야 한다 | role loss/rotation을 successor activation, handoff, paused functions, commander-retained decisions로 변환한다 | `personnel-continuity-model.md`, `schema-files/continuity-plan.schema.json`, `continuity-drill-runner.js`, `continuity-drill-fixtures/README.md` |
| AI special operations task force model | special operations task organization | 고위험/고불확실성 임무에는 작은 팀, 검증된 인원, enabler, 명확한 권한, 빠른 결심 루프가 필요하다 | AI agent TF를 selected/trained/enabled/mission-commanded team으로 운용한다 | `ai-special-operations-tf.md`, `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js`, `sof-tf-fixtures/README.md` |
| Interdepartment collaboration artifact | combined arms and joint function integration | 서로 다른 기능부서는 supported/supporting 관계, liaison, output contract, conflict route로 통합되어야 한다 | 부서 간 협력을 relationship edge, missing liaison, commander queue, preflight block으로 projection한다 | `interdepartment-collaboration-policy.md`, `schema-files/department-collaboration-charter.schema.json`, `department-collaboration-runner.js`, `department-collaboration-fixtures/README.md` |
| Force structure change artifact | force management and documentation | 조직은 capability gap, DOTMLPF-P, authority, readiness, transition, documentation update가 맞을 때만 만들거나 줄인다 | AI 병과/보직/부대/TF 신설, 폐지, 증축, 감축을 validator와 runner gate로 통제한다 | `force-structure-change-policy.md`, `schema-files/force-structure-change-order.schema.json`, `force-structure-change-runner.js`, `force-structure-change-fixtures/README.md` |
| Deep research queue artifact | 연구작전 관리 | 누락된 군 작동영역을 backlog와 source plan으로 관리한다 | 프레임워크 확장 우선순위와 출처 관리 | `military-operating-deep-research-queue.md` |
| Commander handbook artifact | 지휘관 운용지침 | intent, authority, CCIR, approval, AAR를 사람의 명령 절차로 정리한다 | AI 지휘관 프롬프트와 승인 판단 guide | `commander-handbook.md` |
| B2C2WG operating artifact | 참모 통합과 battle rhythm | board/WG/cell/center를 결심 packet 흐름으로 분리한다 | multi-agent scheduling과 decision packet workflow | `b2c2wg-operating-model.md` |
| CCIR alerting artifact | 지휘관 정보요구 | PIR/FFIR/EEFI/decision point를 alert routing으로 바꾼다 | dashboard와 approval/SITREP/FRAGO 분기 | `ccir-alerting-model.md` |
| OPSEC classification artifact | 작전보안과 정보공개 통제 | EEFI, classification, releasability로 정보흐름을 제한한다 | context sharing과 tool-output redaction | `opsec-classification-model.md` |
| Role document access artifact | need-to-know document distribution | role, duty, authority가 모두 맞는 문서만 읽게 해야 정보 과잉과 권한 초과가 줄어든다 | document access manifest와 runner로 per-agent reading list를 projection한다 | `role-document-access-policy.md`, `schema-files/document-access-manifest.schema.json`, `document-access-runner.js`, `document-access-fixtures/README.md` |
| Multinational doctrine consistency artifact | doctrine comparison and policy reconciliation | 미군 자료는 baseline일 뿐이며 다른 군 적용 전 source family coverage, alias, jurisdiction gate를 검증해야 한다 | US-only assumptions, staff terminology, ROE/legal variance, force structure vocabulary, SOF TF scope를 review object와 runner로 통제한다 | `multinational-doctrine-consistency-review.md`, `schema-files/doctrine-consistency-review.schema.json`, `doctrine-consistency-runner.js`, `doctrine-consistency-fixtures/README.md` |
| Controls doctrine operator skill | corpus navigation and self-improvement | 방대한 문서 체계는 task routing, source discipline, validation surface, AAR 기반 갱신 루프가 있어야 효율적으로 사용된다 | Codex skill과 Claude Code project skill이 사용자 직접 사용 시 최종결정권자 모드로 briefing하고, AI 위임 사용 시 role/department/authority/need-to-know 기준으로 문서를 라우팅한다. 라우터는 문서/스키마/샘플/러너/fixture inventory를 스캔하고 `--coverage`로 unrouted artifact 0개를 검증한다. 설치 스크립트는 Codex/Claude skill 폴더를 확인하고 symlink 설치한다 | `codex-skills/controls-doctrine-operator/SKILL.md`, `.claude/skills/controls-doctrine-operator/SKILL.md`, `install-ai-cli-skills.sh`, `codex-skills/controls-doctrine-operator/references/document-routing.md`, `codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js`, `docs/controls-doctrine-operator-skill.html` |
| Agent routing receipt preflight artifact | staff routing and execution discipline | 하급 agent가 문서를 읽었다고 말하는 것만으로는 실행권이 생기지 않고, 표준 receipt와 preflight gate가 필요하다 | CoS는 매 wave 시작 때 `--receipt --scope=wave`로 라우팅 증거를 남기고, 각 AI agent는 작업 전 `--receipt --scope=agent --role=S3 --department=operations --authority=scoped-execution`으로 라우팅 증거를 남긴다. `agent-routing-preflight-runner.js`는 expected agent 목록과 receipt bundle을 대조해 누락, stale wave, wrong role/department/authority를 차단한다 | `schema-files/routing-receipt.schema.json`, `sample-payloads/valid-routing-receipt-agent-s3.json`, `agent-routing-preflight-runner.js`, `agent-routing-preflight-fixtures/README.md`, `run-agent-routing-preflight-fixtures.js` |
| Knowledge management artifact | 지식관리 | decision, evidence, event, handoff, AAR를 source of truth로 연결한다 | 대화 기억 의존을 줄이고 이어받기 가능하게 함 | `knowledge-management-sop.md` |
| Agent METL artifact | 훈련과 readiness | role별 핵심과업과 숙련도를 권한 위임에 연결한다 | readiness-to-authority policy | `agent-metl.md` |
| Authority matrix schema artifact | 승인권 matrix | role/task/tool/target/risk/readiness/expiry로 권한을 판정한다 | validator semantic gate와 future policy engine input | `schema-files/authority-matrix.schema.json`, `sample-payloads/valid-authority-matrix.json` |
| Decision packet schema artifact | 결심준비 | option, risk, authority, evidence, fallback을 packet으로 고정한다 | commander board input validation | `schema-files/decision-packet.schema.json`, `sample-payloads/valid-decision-packet.json` |
| Working group schema artifact | B2C2WG charter | 문제, chair, participants, deliverables, disband condition을 명시한다 | unbounded agent discussion 방지 | `schema-files/working-group.schema.json`, `sample-payloads/valid-working-group.json` |
| CCIR alert schema artifact | 정보요구 routing | PIR/FFIR/EEFI/decision point alert를 표준 객체로 만든다 | dashboard and alert router contract | `schema-files/ccir-alert.schema.json`, `sample-payloads/valid-ccir-alert.json` |
| Handoff packet schema artifact | 지휘/작전 인수인계 | current order, intent, blocked, pending decision, source-of-truth를 묶는다 | context transition safety | `schema-files/handoff-packet.schema.json`, `sample-payloads/valid-handoff-packet.json` |
| Alert router prototype | CCIR 자동분류 | event log에서 Red decision, PIR, FFIR alert를 계산한다 | commander-facing alert projection | `alert-router-prototype/README.md` |
| Readiness gate prototype | 권한과 훈련 결합 | authority matrix와 readiness rating을 결합해 allow/approval/prohibit를 판정한다 | runtime tool gateway precursor | `readiness-gate-prototype/README.md` |
| Context releasability policy | OPSEC/need-to-know | role별 raw/summary/redacted/reference/denied delivery를 정의한다 | multi-agent context filtering | `context-releasability-policy.md` |
| Context item schema | OPSEC metadata | classification, EEFI, allowed roles, release_to_final을 표준화한다 | context filter input contract | `schema-files/context-item.schema.json`, `sample-payloads/valid-context-item.json` |
| Document access manifest schema | 문서 배포 통제 | 문서 접근은 role, duty, authority, classification, delivery mode로 제한된다 | agent별 allowed/denied reading list와 audit requirements를 계산한다 | `schema-files/document-access-manifest.schema.json`, `sample-payloads/valid-document-access-manifest.json`, `document-access-runner.js` |
| Release review schema | 공개/외부전달 검토 | final output/external tool release decision을 기록한다 | sensitive/restricted release gate | `schema-files/release-review.schema.json`, `sample-payloads/valid-release-review.json` |
| Release gate decision schema | release gate audit | 실행권한과 공개권한을 합성한 최종 판단도 event log에 남아야 한다 | release gate allow/block fact와 snapshot/evidence를 보존한다 | `schema-files/release-gate-decision-event.schema.json`, `sample-payloads/valid-release-gate-decision-event.json` |
| Context filter prototype | need-to-know 실행 | context item을 role별 raw/summary/redacted/reference/denied packet으로 변환한다 | multi-agent context distribution control | `context-filter-prototype/README.md` |
| Document access runner | need-to-know 문서 접근 | context filter보다 앞에서 role이 열 수 있는 문서 자체를 제한해야 한다 | manifest를 role/duty/authority와 대조해 allowed/denied document projection 생성 | `document-access-runner.js`, `document-access-fixtures/README.md` |
| Handoff generator artifact | 인수인계 자동화 | event replay와 alert projection에서 handoff packet을 생성한다 | context transition safety automation | `handoff-generator.js` |
| Decision packet linter | 결심 packet 품질 | option/risk/evidence/deadline 누락을 자동 점검한다 | commander board packet quality gate | `decision-packet-linter.js` |
| Working group event fixtures | B2C2WG lifecycle | WG opened/prepared/decided/closed를 event log로 표현한다 | staff integration replay fixture | `event-fixtures/working-group-event-fixtures.json` |
| Maintenance readiness model | 지속지원/정비 | tool/resource/context/fallback readiness를 작전 지속성으로 평가한다 | S4/S6 runtime sustainment | `maintenance-readiness-model.md` |
| Maintenance readiness runner | 정비 점검 자동화 | critical runner 결과를 readiness report로 변환한다 | S4/S6 maintenance readiness automation | `maintenance-readiness-runner.js`, `schema-files/maintenance-readiness.schema.json` |
| Maintenance readiness dashboard projection | sustainment dashboard | readiness report를 ready/degraded/down dashboard queue로 보여야 한다 | tool/resource/context 고장과 commander decision flag를 projection으로 표시한다 | `maintenance-dashboard-runner.js`, `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`, `maintenance-dashboard-fixtures/README.md` |
| Release review runner | 정보공개 검토 자동화 | context filter output과 release review를 비교한다 | final output release gate | `release-review-runner.js` |
| Source-map linter | 지식관리 점검 | 공식 출처 도메인이 source-map에 등록되어 있는지 확인한다 | source coverage regression gate | `source-map-linter.js` |
| Working group dashboard projection | 지휘소 projection | WG lifecycle projection을 dashboard state로 저장한다 | B2C2WG status panel input | `dashboard-ui-prototype/working-group-projection-dashboard-state.json` |
| Approval scope policy | 승인 범위 | 승인권은 action/tool/target/time/condition/evidence로 제한된다 | approval object와 tool gateway scope check | `approval-scope-policy.md` |
| Risk acceptance authority | 위험수용권한 | 위험 수용은 실행 승인과 별도의 commander retained authority다 | risk packet, approval, AAR, readiness 연결 | `risk-acceptance-authority.md` |
| Approval scope schema artifact | single-use approval | 승인은 expiry, max execution, rollback, evidence, consumption metadata를 가져야 한다 | approval reuse and scope mismatch prevention | `schema-files/approval-scope.schema.json`, `sample-payloads/valid-approval-scope.json` |
| Approval consumption event artifact | approval audit | approval granted와 실제 execution을 분리해 재사용을 막는다 | consumed approval event를 남기고 approval scope와 대조한다 | `schema-files/approval-consumption-event.schema.json`, `approval-consumption-runner.js`, `approval-consumption-fixtures/README.md` |
| Approval revocation event artifact | approval cancellation audit | 실행 전 active approval만 granting authority가 철회할 수 있다 | revoked approval event를 남기고 consumed approval의 사후 철회를 차단한다 | `schema-files/approval-revocation-event.schema.json`, `approval-revocation-runner.js`, `approval-revocation-fixtures/README.md` |
| Approval renewal event artifact | approval extension audit | active approval의 유효기간만 연장할 수 있고 권한 범위 확장은 새 승인이다 | renewal event로 expiry 갱신과 scope expansion 차단을 검증한다 | `schema-files/approval-renewal-event.schema.json`, `approval-renewal-runner.js`, `approval-renewal-fixtures/README.md` |
| Approval delegation event artifact | approval authority delegation | 승인권 위임은 기존 authority rule 안에서만 가능하고 commander-retained 권한은 남겨야 한다 | delegation event와 authority matrix를 대조해 대리승인 남용을 차단한다 | `schema-files/approval-delegation-event.schema.json`, `approval-delegation-runner.js`, `approval-delegation-fixtures/README.md` |
| Approval delegation termination artifact | delegated authority lifecycle | 위임권한은 생성뿐 아니라 철회/만료도 event로 닫아야 한다 | termination event와 원본 delegation snapshot을 대조해 expired/revoked 권한 재사용을 막는다 | `schema-files/approval-delegation-revocation-event.schema.json`, `approval-delegation-revocation-runner.js`, `approval-delegation-revocation-fixtures/README.md` |
| Authority delegation projection artifact | delegated authority dashboard | active/revoked/expired 위임권한을 projection으로 보여야 만료 권한 재사용을 막는다 | delegation lifecycle event를 dashboard state로 변환한다 | `authority-delegation-projection-runner.js`, `dashboard-ui-prototype/authority-delegation-projection-state.json`, `authority-delegation-projection-fixtures/README.md` |
| Risk acceptance schema artifact | residual risk acceptance | high/critical/irreversible residual risk는 commander retained authority다 | risk acceptance gate with supervision and AAR trigger | `schema-files/risk-acceptance.schema.json`, `sample-payloads/valid-risk-acceptance.json` |
| Policy authority integration artifact | authority gate 합성 | policy, authority matrix, scoped approval, risk acceptance가 모두 맞아야 Red action이 풀린다 | tool gateway precursor for scoped execution | `policy-engine-authority-integration.js`, `run-authority-integration-fixtures.js` |
| Policy release integration artifact | release authority 합성 | 실행 승인과 정보 공개 승인은 별개다 | authority gate가 허용해도 release review가 없거나 실패하면 final/external output을 차단한다 | `policy-engine-release-integration.js`, `release-integration-fixtures/README.md` |
| Release gate decision artifact | release gate event | release integration의 최종 allow/block을 event로 기록한다 | final decision, authority snapshot, release snapshot, reasons, evidence를 대조한다 | `release-gate-decision-runner.js`, `release-gate-decision-fixtures/README.md` |
| Release gate dashboard projection | release gate dashboard | release gate decision을 release/authority/review queue로 보여야 한다 | allowed release, missing release review, authority block을 dashboard state로 분리한다 | `release-gate-dashboard-runner.js`, `dashboard-ui-prototype/release-gate-dashboard-state.json`, `release-gate-dashboard-fixtures/README.md` |
| Source-map URL coverage report | 지식관리 점검 | linter 결과는 실행 로그로 사라지지 않고 coverage snapshot으로 남아야 한다 | 공식 출처 host별 연결 문서를 보고 누락된 source-map coverage를 추적한다 | `source-map-url-coverage-report.json`, `source-map-linter.js` |
| AAR readiness update artifact | 사후학습과 readiness 갱신 | AAR learning은 문서 메모로 끝나지 않고 훈련/정비/권한 갱신 queue로 전환되어야 한다 | AAR finding을 readiness recommendation, maintenance action, SOP update, CCIR trigger로 변환한다 | `aar-to-readiness-update.js`, `schema-files/aar-readiness-update.schema.json`, `aar-readiness-update-fixtures/README.md` |

## 16. 현재 취약한 근거

아래 항목은 추가 리서치가 필요하다.

| 항목 | 이유 | 다음 조치 |
| --- | --- | --- |
| 한국군 문서 하달 체계 | 공개 자료 접근성이 낮음 | 국내 논문과 공개 교육자료 추가 조사 |
| ROE 최신 원문 | 일부 문서는 공개 버전 확인이 까다로움 | 공식 배포 페이지 재확인 |
| LLM multi-agent 군대식 조직 실험 | 직접 비교 연구 부족 | 실험 설계 또는 case study 작성 |

## 17. 관련 문서

- `research-compendium.md`
- `military-llm-framework-v0.1.md`
- `military-operating-system.md`
- `agent-roles-and-authority.md`
- `decision-risk-assessment.md`
- `prompt-templates.md`
- `sop-library.md`
- `agent-battle-rhythm.md`
- `functional-domains.md`
- `interdepartment-collaboration-policy.md`
- `force-structure-change-policy.md`
- `case-studies.md`
- `glossary.md`
- `evaluation-metrics.md`
- `experiments.md`
- `korean-military-sources.md`
- `implementation-guide.md`
- `prompt-dsl.md`
- `tool-use-roe.md`
- `llm-agent-org-chart.md`
- `korean-org-culture.md`
- `reference-architecture.md`
- `sample-runtime-state.md`
- `prompt-dsl-validator.md`
- `approval-ui-patterns.md`
- `schema-files/README.md`
- `validator-prototype.md`
- `agent-runtime-playbook.md`
- `military-ai-risk-register.md`
- `agent-readiness-ledger.md`
- `sample-payloads/README.md`
- `policy-engine-rules.md`
- `command-post-dashboard.md`
- `runtime-automation-roadmap.md`
- `evaluation-fixtures.md`
- `validator-cli-prototype/README.md`
- `dashboard-wireframes.md`
- `data-model.sql.md`
- `runtime-demo-scenario.md`
- `source-reliability-rubric.md`
- `validator-cli-prototype/run-fixtures.js`
- `policy-engine-prototype/README.md`
- `runtime-demo-payloads/README.md`
- `dashboard-ui-prototype/README.md`
- `event-sourcing-model.md`
- `policy-engine-prototype/run-policy-fixtures.js`
- `runtime-demo-runner.js`
- `dashboard-ui-prototype/dashboard-state.json`
- `event-fixtures/README.md`
- `event-replay-prototype/README.md`
- `dashboard-ui-prototype/render-state.js`
- `event-replay-prototype/run-event-fixtures.js`
- `runtime-demo-payloads/opord.json`
- `military-operating-deep-research-queue.md`
- `commander-handbook.md`
- `b2c2wg-operating-model.md`
- `ccir-alerting-model.md`
- `opsec-classification-model.md`
- `role-document-access-policy.md`
- `knowledge-management-sop.md`
- `agent-metl.md`
- `schema-files/authority-matrix.schema.json`
- `sample-payloads/valid-authority-matrix.json`
- `sample-payloads/invalid-authority-matrix-red-without-approver.json`
- `schema-files/decision-packet.schema.json`
- `schema-files/working-group.schema.json`
- `schema-files/ccir-alert.schema.json`
- `schema-files/handoff-packet.schema.json`
- `sample-payloads/valid-decision-packet.json`
- `sample-payloads/valid-working-group.json`
- `sample-payloads/valid-ccir-alert.json`
- `sample-payloads/valid-handoff-packet.json`
- `alert-router-prototype/README.md`
- `readiness-gate-prototype/README.md`
- `context-releasability-policy.md`
- `schema-files/context-item.schema.json`
- `schema-files/document-access-manifest.schema.json`
- `schema-files/release-review.schema.json`
- `sample-payloads/valid-context-item.json`
- `sample-payloads/valid-document-access-manifest.json`
- `sample-payloads/valid-release-review.json`
- `context-filter-prototype/README.md`
- `document-access-runner.js`
- `document-access-fixtures/README.md`
- `handoff-generator.js`
- `decision-packet-linter.js`
- `event-fixtures/working-group-event-fixtures.json`
- `maintenance-readiness-model.md`
- `schema-files/maintenance-readiness.schema.json`
- `maintenance-readiness-runner.js`
- `release-review-runner.js`
- `dashboard-ui-prototype/working-group-projection-dashboard-state.json`
- `approval-scope-policy.md`
- `risk-acceptance-authority.md`
- `source-map-linter.js`
- `information-to-operations-cycle.md`
- `schema-files/information-report.schema.json`
- `schema-files/intelligence-assessment.schema.json`
- `information-to-operations-router.js`
- `information-to-operations-fixtures/README.md`
- `personnel-continuity-model.md`
- `schema-files/continuity-plan.schema.json`
- `continuity-drill-runner.js`
- `continuity-drill-fixtures/README.md`
