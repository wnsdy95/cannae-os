# Research Compendium

## 0. 목적

이 문서는 지금까지 조사한 군대식 지휘통제, 문서 하달, 권한 위임, 보고, 검증, 사후관리 자료와 그에 대한 해석을 한곳에 모은다.

목표는 단순 참고문헌 목록이 아니다. 각 군사 개념이 LLM 사용법, 단일 에이전트 운용, 멀티에이전트 오케스트레이션, 환각 방지 프롬프트 체계로 어떻게 전환될 수 있는지까지 기록한다.

범위:

- 공개/비분류 문서 중심.
- 미군, NATO, 일부 한국군 관련 공개 연구 포함.
- 교리 문서, 연구 논문, 핸드북, 포커스 페이퍼, LLM 환각/멀티에이전트 연구 포함.
- 직접 원문 전체를 복제하지 않고 요약과 적용 의견을 남긴다.

## 1. 전체 결론

군대의 강점은 "상명하복" 자체가 아니다. 진짜 강점은 아래 구조다.

```text
상위 의도 보존
-> 표준 문서 형식
-> 역할별 참모 분석
-> 권한과 보고 기준 명시
-> 하위 단위의 재작성
-> 확인 브리핑/백브리핑/리허설
-> 실행 중 FRAGO
-> 사후 AAR
```

LLM 프레임워크의 핵심도 같다.

```text
사용자 의도 보존
-> OPORD형 프롬프트
-> 에이전트 역할 분화
-> 승인권/보고권/자율권 정의
-> 하위 에이전트의 실행계획 재작성
-> 실행 전 이해 확인과 검증
-> 실행 중 변경명령
-> 사후 회고와 프롬프트 개선
```

핵심 설계 문장:

```text
LLM에게 명령을 내릴 때, 어떤 정보는 절대 변형되면 안 되고,
어떤 정보는 하위 에이전트가 자유롭게 재작성해도 되는지를 구분해야 한다.
```

## 2. 군 문서 체계에서 배울 점

### 2.1 문서 하달은 복사가 아니라 의도 보존형 재작성이다

상급부대 명령은 하급부대가 그대로 복사하지 않는다. 하급부대는 자기 지형, 병력, 시간, 자원, 위험에 맞게 새 OPORD를 만든다. 단, 상위 1-2개 제대의 mission, commander's intent, concept of operations는 보존한다.

LLM 적용:

- 상위 사용자 의도는 변형 금지.
- 하위 에이전트는 실행 방법을 재작성 가능.
- 실행 방법이 바뀌어도 성공 조건과 금지선은 유지.
- 각 하위 에이전트는 먼저 backbrief로 자기 이해를 보고.

### 2.2 OPORD 구조는 프롬프트 구조로 바로 전환 가능하다

OPORD의 5개 문단:

1. Situation: 배경, 환경, 상대, 제약, 정보 공백.
2. Mission: 누가, 무엇을, 언제, 어디서, 왜.
3. Execution: 지휘관 의도, 실행 개념, 단계, 과업, 조정사항.
4. Sustainment: 자원, 도구, 비용, 지원.
5. Command and Signal: 보고선, 승인권, 통신, 변경 방식.

LLM 적용:

- 프롬프트를 "요청문"이 아니라 "작전명령"으로 작성.
- 모델이 할 일, 하지 말 일, 보고할 일, 중단할 일을 함께 지정.
- 세부 자료는 annex처럼 분리.

### 2.3 Annex, Appendix, Tab, Exhibit는 컨텍스트 분리 장치다

군 문서는 본문에 모든 정보를 넣지 않는다. 본문은 핵심 의도와 작전 개념을 유지하고, 세부 영역은 annex로 분리한다.

LLM 적용:

- 본 프롬프트에는 목적, 의도, 성공 조건, 승인 기준만 둔다.
- 데이터, 정책, 스타일 가이드, 용어집, 테스트 기준은 별도 annex로 둔다.
- RAG 또는 멀티에이전트 시스템에서는 각 annex를 별도 context pack으로 관리한다.

### 2.4 WARNO, OPORD, FRAGO는 시간에 따른 명령 갱신 체계다

- WARNO: 아직 전체 명령이 완성되지 않았지만 준비할 수 있게 사전 하달.
- OPORD: 본 실행 명령.
- FRAGO: 상황 변화에 따라 기존 명령 일부 변경.

LLM 적용:

- 긴 작업 전에는 "사전 준비 프롬프트"를 먼저 보낸다.
- 본 작업은 OPORD로 실행한다.
- 중간 변경은 전체 프롬프트 재작성보다 FRAGO로 명확히 기록한다.

## 3. 권한 체계에서 배울 점

군은 계급만으로 승인권을 정하지 않는다. 보직, 지휘관계, 임무, 위임 범위, ROE, SOP, CCIR이 함께 권한을 결정한다.

LLM 적용 원칙:

```text
권한은 계급이 아니라 임무, 위험, 가역성, 정보 확실성, 상위 의도와의 정렬로 정한다.
```

### 3.1 자율 실행 가능 조건

에이전트가 승인 없이 실행 가능한 조건:

1. 상위 의도와 일치한다.
2. 명령 범위 안에 있다.
3. 되돌릴 수 있다.
4. 비용, 보안, 법적 위험이 낮다.
5. CCIR 보고 조건을 건드리지 않는다.
6. 근거 수준이 충분하다.
7. 실패해도 전체 목적을 크게 훼손하지 않는다.

### 3.2 승인 등급

| 등급 | 이름 | 설명 |
|---|---|---|
| L0 | 관찰 | 읽기, 요약, 조사, 초안 |
| L1 | 가역 작업 | 로컬 임시 변경, 테스트 |
| L2 | 제한 실행 | 범위 내 파일 수정, 문서 생성 |
| L3 | 외부 영향 | 네트워크, 비용, 외부 시스템 변경 |
| L4 | 비가역 작업 | 삭제, 배포, 결제, 공개 발행 |
| L5 | 고위험 판단 | 법률, 의료, 재무, 보안, 인사상 중대 결정 |

### 3.3 보고는 모든 정보를 올리는 것이 아니다

군의 CCIR는 지휘관 결심에 필요한 핵심 정보다. 모든 정보가 보고 대상이 아니다.

LLM 적용:

- 모델은 모든 중간 생각을 보고하지 않는다.
- 사용자의 판단이 필요한 정보만 즉시 보고한다.
- 나머지는 SITREP, Completion Report, AAR로 정리한다.

## 4. 보고와 검증 체계에서 배울 점

### 4.1 확인 브리핑

명령 수령 직후 하급자가 "내가 이해한 임무는 이것"이라고 되말한다.

LLM 적용:

```text
내가 이해한 목표:
변형하면 안 되는 조건:
내가 자율적으로 정할 수 있는 것:
승인받아야 하는 것:
즉시 보고할 조건:
```

### 4.2 백브리핑

하급자가 자기 계획을 완성한 뒤 상급자에게 설명한다.

LLM 적용:

- 실행 전 계획 보고.
- 단계별 산출물, 실패 조건, 검증 방법 제시.
- 사용자가 중요한 방향 오류를 조기에 잡을 수 있게 한다.

### 4.3 리허설

문서가 실제 실행으로 바뀌는 과정에서 발생할 오류를 찾는다.

LLM 적용:

- 실행 전 dry run.
- 레드팀 검토.
- 입력, 출력, 실패 조건, 승인 조건 확인.
- 위험 높은 작업은 실제 실행 전에 중단.

### 4.4 AAR

사후 회고는 "비난"이 아니라 학습 체계다.

LLM 적용:

1. 원래 의도는 무엇이었나?
2. 실제 결과는 무엇이었나?
3. 차이는 왜 생겼나?
4. 유지할 절차는 무엇인가?
5. 개선할 절차는 무엇인가?
6. 다음 프롬프트/SOP에 무엇을 반영할 것인가?

## 5. 멀티에이전트 구조 해석

| 군 참모 | LLM 에이전트 | 역할 |
|---|---|---|
| Commander | User / Final Approver | 목적, 의도, 금지선, 최종 승인 |
| Chief of Staff | Orchestrator | 작업 분해, 역할 배치, 충돌 조정 |
| S2 | Research / Intelligence | 자료 수집, 출처 검증, 정보 공백 |
| S3 | Operations | 실행계획, 단계, 우선순위 |
| S4 | Sustainment | 자원, 도구, 비용, 실행 가능성 |
| S6 | Signal | 보고, 로그, 문서 링크, 상태 공유 |
| Red Team | Critic / Validator | 오류, 환각, 반례, 위험 검토 |
| Executor | Worker | 코드, 문서, 분석 실행 |
| Recorder | Knowledge Manager | 결정 로그, 변경 이력, AAR |

핵심 의견:

- 멀티에이전트의 목적은 "AI를 많이 돌리는 것"이 아니다.
- 역할을 분리해서 환각, 과잉 확신, 권한 초과, 책임 불명확성을 줄이는 것이다.
- 특히 S2와 Red Team은 반드시 분리해야 한다. 조사한 사람이 자기 결론을 검증하면 오류를 놓치기 쉽다.

## 6. 환각 방지에 대한 해석

군사 체계의 환각 방지 장치는 다음과 유사하다.

| 군사 장치 | LLM 환각 방지 기능 |
|---|---|
| 표준 용어 | 모호한 단어 감소 |
| OPORD | 목적, 제약, 보고 기준 명확화 |
| CCIR | 불확실한 핵심 정보 즉시 보고 |
| IPB/JIPOE | 환경과 상대에 대한 체계적 분석 |
| Red Team | 가정과 결론 공격 |
| Rehearsal | 실행 전 오류 발견 |
| AAR | 반복 오류 수정 |
| FRAGO | 변경 사항을 명시적으로 반영 |

환각 방지 프롬프트 원칙:

1. 사실, 추론, 가정을 분리하게 한다.
2. 출처가 필요한 주장은 반드시 출처를 붙인다.
3. 근거가 부족하면 "모름" 또는 "검증 필요"로 표시한다.
4. 핵심 주장은 독립 검증을 거친다.
5. 모델 자신이 만든 답을 다시 검증하게 할 때는 독립 질문을 먼저 만들게 한다.
6. 외부 자료가 필요한 최신 정보는 검색 또는 RAG를 사용한다.

## 7. 지금까지의 핵심 의견

### 7.1 군대식 LLM 운용의 중심축

LLM 운용에서 가장 중요한 것은 프롬프트 문장력이 아니다. 중요한 것은 명령 체계다.

좋은 LLM 시스템은 다음 질문에 답해야 한다.

- 누가 최종 의도를 정하는가?
- 어떤 정보는 변형 금지인가?
- 어떤 정보는 하위 에이전트가 재해석 가능한가?
- 어떤 행동은 자율 실행 가능한가?
- 어떤 행동은 승인 필요한가?
- 어떤 상황은 즉시 보고해야 하는가?
- 실행 후 어떻게 학습할 것인가?

### 7.2 군대는 정보량을 줄여서 정확도를 높인다

군 문서는 방대한 정보를 모두 본문에 넣지 않는다. 본문은 명령과 의도 중심이고, 세부는 annex로 분리한다.

LLM에서도 긴 컨텍스트에 모든 것을 밀어 넣는 방식보다:

- 기본 명령
- 근거 annex
- 정책 annex
- 데이터 annex
- 보고 annex
- 검증 annex

로 분리하는 것이 더 안정적이다.

### 7.3 상위 의도와 하위 자율성은 동시에 필요하다

상위가 모든 세부를 통제하면 느리고 취약하다. 반대로 하위가 완전히 자유로우면 의도가 깨진다.

따라서 필요한 것은:

```text
목적은 중앙집중
방법은 분권
보고 기준은 명확
위험 기준은 사전 정의
```

### 7.4 AI 에이전트는 참모이지 지휘관이 아니다

LLM 에이전트는 정보를 수집하고, 대안을 만들고, 계획을 세우고, 위험을 검토할 수 있다. 그러나 최종 목적, 가치판단, 위험 수용, 공개 실행은 Commander가 승인해야 한다.

## 8. 주요 자료 목록

### 8.1 Mission Command / 지휘통제

1. ADP 6-0, Mission Command: Command and Control of Army Forces  
   https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf

   핵심 내용:
   - 지휘관 의도.
   - 임무형 명령.
   - 상호 신뢰.
   - 공유 이해.
   - 절제된 주도권.
   - 불확실한 상황에서 하급자가 의도 안에서 판단.

   LLM 적용:
   - 사용자 의도를 commander's intent로 정의.
   - 에이전트에게 방법은 맡기되 경계와 성공 조건은 명확히 지정.

2. FM 6-0, Commander and Staff Organization and Operations  
   https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf

   핵심 내용:
   - 지휘소 조직.
   - 참모 역할.
   - 지식관리와 정보관리.
   - 회의체와 battle rhythm.
   - C2 시스템 운용.

   LLM 적용:
   - 오케스트레이터와 역할별 에이전트 설계 근거.
   - 회의체는 에이전트 간 synchronization loop로 전환 가능.

3. NATO AJP-3, Allied Joint Doctrine for the Conduct of Operations  
   https://assets.publishing.service.gov.uk/media/6964e72799fbdc498faecce2/AJP_3_Ed_D_V1-O.pdf

   핵심 내용:
   - NATO mission command 철학.
   - 의사결정은 가장 잘 판단할 위치에 있는 사람에게 맡기는 원칙.
   - initiative와 opportunity exploitation 강조.

   LLM 적용:
   - 특정 하위 문제는 해당 전문 에이전트가 판단.
   - 중앙은 목적과 위험만 통제.

4. MCDP 6, Command and Control  
   https://www.marines.mil/Portals/1/Publications/MCDP%206.pdf

   핵심 내용:
   - OODA loop.
   - 의사결정 속도.
   - 명령과 통제의 철학.

   LLM 적용:
   - 에이전트 루프를 observe, orient, decide, act로 설계.

### 8.2 Operations Process / 작전 프로세스

1. ADP 5-0, The Operations Process  
   https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf

   핵심 내용:
   - planning, preparing, executing, assessing.
   - 지휘관은 이해, 시각화, 설명, 지시, 지휘, 평가를 수행.
   - 상황 이해와 평가가 계속 반복된다.

   LLM 적용:
   - 단발 답변이 아니라 plan, prepare, execute, assess loop로 작업.
   - 긴 작업은 각 단계마다 보고와 검증을 넣는다.

2. FM 5-0, Planning and Orders Production  
   https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf

   핵심 내용:
   - 계획과 명령 생산의 종합 매뉴얼.
   - 문제 해결, MDMP, TLP, assessment planning, plans and orders format.
   - 2024년판은 planning and orders production을 통합.

   LLM 적용:
   - 프롬프트와 작업 문서의 표준 형식 근거.
   - 에이전트 작업도 계획 문서와 실행 문서로 구분.

### 8.3 Planning Process / MDMP, JPP, MCPP, TLP

1. Military Decision-Making Process Handbook  
   https://api.army.mil/e2/c/downloads/2023/11/17/f7177a3c/23-07-594-military-decision-making-process-nov-23-public.pdf

   핵심 내용:
   - 임무 수령.
   - 임무 분석.
   - COA 개발.
   - COA 분석/워게임.
   - COA 비교.
   - 승인.
   - 명령 생산.

   LLM 적용:
   - 복잡한 질문은 바로 답하지 말고 COA 방식으로 대안 생성.
   - 각 대안을 Red Team과 비교.

2. JP 5-0, Joint Planning  
   https://www.esd.whs.mil/Portals/54/Documents/FOID/Reading%20Room/Joint_Staff/18-F-1152_JP_5-0_Joint_Planning_2020.pdf

   핵심 내용:
   - joint planning.
   - objectives, ways, means, risks.
   - commander intent와 operational approach.

   LLM 적용:
   - 사용자의 목표를 ways, means, risks로 분해.

3. MCWP 5-10, Marine Corps Planning Process  
   https://www.usmcu.edu/Portals/218/CDET/content/other/MCWP%205-10.pdf

   핵심 내용:
   - Marine Corps Planning Process.
   - problem framing, COA development, wargaming, transition.
   - BAMCIS와 MCPP 구분.

   LLM 적용:
   - 작은 작업은 TLP/BAMCIS처럼 빠르게.
   - 큰 작업은 MCPP/MDMP처럼 체계적으로.

4. Troop Leading Procedures card  
   https://safety.army.mil/Portals/0/Documents/MEDIA/SMALLUNITLEADERCARDS/Standard/Troop-Leading-Procedures.pdf

   핵심 내용:
   - 소부대장이 임무를 받고 빠르게 계획, 준비, 실행하는 절차.

   LLM 적용:
   - 단일 에이전트가 작은 작업을 수행할 때의 기본 절차로 사용.

### 8.4 Orders / 문서 포맷

1. STANAG 2014, Formats for Orders  
   https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf

   핵심 내용:
   - Warning Order 형식.
   - Operations Order 형식.
   - timings, locations, boundaries 표준화.
   - annex 형식.

   LLM 적용:
   - 프롬프트 포맷을 국제 표준 명령 양식처럼 설계.
   - 변경과 위치, 시점, 경계 조건을 명확히 한다.

2. Marine Corps Five Paragraph Order training material  
   https://www.trngcmd.marines.mil/Portals/207/Docs/FMTBE/Student%20Materials/FMST/209.pdf

   핵심 내용:
   - Mission은 who, what, when, where, why를 포함.
   - Execution은 how를 다룬다.

   LLM 적용:
   - 프롬프트 mission section에는 5W를 강제.
   - how는 실행 섹션에서 분리.

3. Air Force Five-Paragraph Order Training Tool Guide  
   https://www.doctrine.af.mil/Portals/61/documents/NonDoctrine/Five-Paragraph%20Order%20Training%20Tool%20Guide.pdf

   핵심 내용:
   - 기본 5단락 명령 교육 도구.
   - 정식 planning process를 대체하지 않고 final product 작성 보조.

   LLM 적용:
   - OPORD형 프롬프트는 사고 과정을 대체하는 것이 아니라 결과 지시서를 표준화하는 도구.

### 8.5 Commander's Intent / 상위 의도

1. Commanders Intent and Concept of Operations  
   https://www.armyupress.army.mil/Portals/7/military-review/Archives/English/MilitaryReview_20131231_art011.pdf

   핵심 내용:
   - commander intent와 concept of operations의 차이.
   - 효과적인 mission orders 생산.

   LLM 적용:
   - intent와 execution plan을 분리해야 한다.
   - 목적과 방법이 섞이면 하위 에이전트가 잘못 재해석한다.

2. Evolution of Commander's Intent in the United States Military  
   https://www.files.ethz.ch/isn/30757/Intent_USMilitary_v4.pdf

   핵심 내용:
   - combat orders에는 상위 2개 제대 의도가 포함된다.
   - 의도는 전투 명령에서 상대적으로 변형에 강한 지식 계층이다.

   LLM 적용:
   - 각 하위 에이전트 프롬프트에 상위 목표와 직접 목표를 모두 포함.
   - "이 작업이 전체 목표에 어떻게 기여하는지"를 명시.

3. Mission Command Focus Paper  
   https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/missioncommand_fp_2nd_ed.pdf

   핵심 내용:
   - mission command는 commander intent, mission type orders, decentralized execution으로 빠른 문제 해결을 가능하게 한다.

   LLM 적용:
   - 중앙 오케스트레이터는 모든 세부를 통제하지 않는다.
   - 대신 의도, 경계, 보고 조건을 명확히 한다.

### 8.6 Command Relationships / 지휘관계와 승인권

1. JCS Authorities Focus Paper  
   https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf

   핵심 내용:
   - COCOM, OPCON, TACON, support 등 권한 관계.
   - TACON은 OPCON보다 제한적.
   - OPCON은 임무 수행에 필요한 조직/운용/과업 부여 권한.

   LLM 적용:
   - 에이전트 권한도 "전체 통제", "전술 실행", "지원"으로 나눠야 한다.

2. JTF and Command and Control Focus Paper  
   https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf

   핵심 내용:
   - JTF task organization.
   - command relationships.
   - 지원 관계와 권한 명확화 필요.

   LLM 적용:
   - 멀티에이전트 팀을 만들 때 누가 누구를 지휘하고 누가 지원하는지 명확히 한다.

3. Command Relationships article  
   https://ndupress.ndu.edu/Portals/68/Documents/jfq/jfq-63/jfq-63_153-155_Katsos.pdf

   핵심 내용:
   - command, unity of command, unity of effort.
   - joint operations에서 권한 관계 이해가 필수.

   LLM 적용:
   - 하나의 작업에 최종 승인자는 하나여야 한다.
   - 여러 에이전트가 있어도 unity of effort가 유지되어야 한다.

### 8.7 CCIR / 보고 기준

1. JCS CCIR Focus Paper  
   https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf

   핵심 내용:
   - CCIR은 지휘관의 timely decision making에 중요한 정보 요구.
   - mission, priorities, operating environment 변화에 따라 CCIR도 변경.
   - tactical detail이 너무 많이 올라오면 지휘관 초점을 흐릴 수 있음.

   LLM 적용:
   - 사용자에게 모든 세부를 보고하지 않는다.
   - 결정이 필요한 정보만 즉시 보고.
   - CCIR은 작업 시작 전에 정의.

2. NDU CCIR article  
   https://ndupress.ndu.edu/Media/News/News-Article-View/Article/3843920/commanders-critical-information-requirements-crucial-for-decisionmaking-and-joi/

   핵심 내용:
   - CCIR은 decision point와 연결되어야 한다.
   - 단순 목록보다 "어떤 결정을 지원하는 정보인가"가 중요.

   LLM 적용:
   - "보고할 정보"는 "사용자가 내려야 하는 결정"과 연결한다.

3. Staff Facilitation of Commander Decision-Making in LSCO  
   https://api.army.mil/e2/c/downloads/2023/04/19/c0bb3dd8/23-758-staff-facilitation-of-commander-decision-making-in-lsco-apr-23-public.pdf

   핵심 내용:
   - CCIR 개발과 실제 실행 사이에 gap이 있을 수 있음.
   - 참모가 commander decision-making을 더 잘 지원해야 함.

   LLM 적용:
   - 보고 기준은 문서에만 있으면 안 되고, 실제 에이전트 루프에서 작동해야 한다.

### 8.8 Intelligence / 정보분석

1. ATP 2-01.3, Intelligence Preparation of the Battlefield  
   https://home.army.mil/wood/application/files/8915/5751/8365/ATP_2-01.3_Intelligence_Preparation_of_the_Battlefield.pdf

   핵심 내용:
   - 작전환경 정의.
   - 환경 영향 분석.
   - 상대 평가.
   - 상대 COA 판단.
   - IPB는 MDMP와 결심 지원에 핵심.

   LLM 적용:
   - 답변 전 problem environment를 정의.
   - 정보 공백과 가정을 명시.
   - 가능한 상대/상황 시나리오를 만든다.

2. JP 2-01.3, Joint Intelligence Preparation of the Operational Environment  
   https://www.bits.de/NRANEU/others/jp-doctrine/jp2_01_3%2809%29.pdf

   핵심 내용:
   - operational environment를 holistic view로 분석.
   - adversary COA와 center of gravity를 평가.
   - wargaming과 decision making 지원.

   LLM 적용:
   - 단순 검색 결과 요약보다 환경, 행위자, 제약, 의도, 대안 분석이 필요.

### 8.9 Rehearsal / 리허설

1. Commander and Staff Guide to Rehearsals  
   https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf

   핵심 내용:
   - confirmation brief.
   - backbrief.
   - rehearsal로 이해와 실행 가능성 확인.

   LLM 적용:
   - 긴 작업 전 backbrief를 의무화.
   - 실행 전 dry run으로 오류와 누락 확인.

### 8.10 AAR / 사후학습

1. FM 7-0 Appendix K, After Action Reviews  
   https://www.first.army.mil/Portals/102/FM%207-0%20Appendix%20K.pdf

   핵심 내용:
   - AAR은 성과를 분석해 미래 성과를 개선하는 guided analysis.
   - 모든 제대에서 수행.

   LLM 적용:
   - 모든 중요한 에이전트 작업 후 AAR 작성.

2. Leader's Guide to After-Action Reviews  
   https://pinnacle-leaders.com/wp-content/uploads/2018/02/Leaders_Guide_to_AAR.pdf

   핵심 내용:
   - AAR은 critique가 아니라 professional discussion.
   - 참여자가 스스로 what happened와 why를 발견하게 한다.

   LLM 적용:
   - 실패를 단순 오류로만 보지 않고 SOP 개선으로 연결.

3. Center for Army Lessons Learned  
   https://www.army.mil/CALL

   핵심 내용:
   - CALL은 tactical to strategic 수준에서 lessons learned를 수집, 분석, 배포, 통합, 보관.

   LLM 적용:
   - AAR 결과는 개별 작업 로그가 아니라 조직 지식으로 축적.

### 8.11 Red Team / 비판적 사고

1. U.S. Army Red Team Handbook  
   https://home.army.mil/wood/6115/8222/0759/RedTeamHB.pdf

   핵심 내용:
   - critical thinking.
   - alternative analysis.
   - decision-making bias 완화.

   LLM 적용:
   - Red Team 에이전트를 독립 역할로 둔다.
   - 계획 작성자와 검증자를 분리.

2. UK Guide to Red Teaming  
   https://cmapspublic3.ihmc.us/rid%3D1M8NDWNQ5-9HYH9B-1D7R/A%20Guide%20to%20Red%20Teaming%20-%20DCDC%20Guidance%20Note.pdf

   핵심 내용:
   - campaign planning과 mission rehearsal에서 취약점, 위협, 대안, branch/sequel 식별.

   LLM 적용:
   - 레드팀은 최종 답변 직전뿐 아니라 planning 단계부터 투입.

### 8.12 C2 Agility / 네트워크형 지휘통제

1. Understanding Command and Control  
   https://www.dodccrp.org/files/Alberts_UC2.pdf

   핵심 내용:
   - C2 개념적 기초.
   - resource allocation, shared awareness, decision-making.

   LLM 적용:
   - 에이전트 시스템의 품질은 답변 품질만이 아니라 resource allocation과 coordination 품질로 평가.

2. Power to the Edge  
   https://www.dodccrp.org/files/Alberts_Power.pdf

   핵심 내용:
   - information age command and control.
   - edge organization, empowerment, shared awareness.

   LLM 적용:
   - 하위 에이전트에게 충분한 context와 권한을 제공해야 빠르게 작동.

3. NATO SAS-085 Final Report on C2 Agility  
   https://dodccrp.org/sas-085/sas-085_report_final.pdf

   핵심 내용:
   - C2 agility는 변화에 성공적으로 대응, 활용하는 능력.
   - responsiveness, versatility, flexibility, resilience, adaptability, innovativeness.

   LLM 적용:
   - 고정 프롬프트보다 상황 변화에 따라 FRAGO와 authority adjustment가 가능한 구조 필요.

### 8.13 OODA / 기동전

1. John Boyd, Patterns of Conflict  
   https://www.projectwhitehorse.com/pdfs/boyd/patterns%20of%20conflict.pdf

   핵심 내용:
   - Observe, Orient, Decide, Act.
   - 상대보다 빠르고 불규칙하게 의사결정 루프를 돌리는 개념.

   LLM 적용:
   - 단일 답변보다 관찰-해석-결정-실행 루프를 빠르게 반복.

2. MCDP 1, Warfighting  
   https://www.marines.mil/portals/1/publications/mcdp%201%20warfighting.pdf

   핵심 내용:
   - 전쟁의 불확실성, 마찰, 유동성.
   - commander's intent, main effort, critical vulnerability.

   LLM 적용:
   - "마찰"을 도구 실패, 정보 부족, 모호한 요청, 환각으로 번역.
   - main effort를 작업 우선순위로 사용.

### 8.14 Mission Command 비판과 주의점

1. The Trouble with Mission Command  
   https://ndupress.ndu.edu/Portals/68/Documents/jfq/jfq-86/jfq-86_94-100_Hill-Niemi.pdf

   핵심 내용:
   - mission command가 분권을 전제하지만, 언제 통제가 어디에 있어야 하는지 판단 도구가 부족할 수 있음.

   LLM 적용:
   - 모든 에이전트에 자율성을 주는 것은 위험.
   - 위험, 가역성, 정보 확실성에 따라 중앙 통제와 분권을 조절.

2. Beyond Auftragstaktik  
   https://ndupress.ndu.edu/Portals/68/Documents/jfq/jfq-96/JFQ-96_29-36_Lythgoe.pdf

   핵심 내용:
   - 과도한 분권화의 위험.

   LLM 적용:
   - 고위험 작업은 인간 승인 유지.
   - autonomy boundary가 반드시 필요.

3. History, Mission Command, and the Auftragstaktik Infatuation  
   https://www.armyupress.army.mil/Journals/Military-Review/English-Edition-Archives/July-August-2022/Herrera/

   핵심 내용:
   - Auftragstaktik를 단순한 원형으로 숭배하는 서사를 비판.
   - 역사와 문화적 맥락 중요.

   LLM 적용:
   - 군대 개념을 단순 은유로 가져오면 안 된다.
   - 실제 작동 원리와 제한을 함께 가져와야 한다.

### 8.15 Staff Organization / 참모 체계

1. The General Staff System: Basic Structure  
   https://arsof-history.org/articles/v7n2_general_staff_system_page_1.html

   핵심 내용:
   - S1/G1 Personnel.
   - S2/G2 Intelligence.
   - S3/G3 Operations.
   - S4/G4 Logistics.
   - S5/G5 Civil-military/plans.
   - S6/G6 Signal.

   LLM 적용:
   - 에이전트 역할 분화의 기본 틀.

2. FM 101-5, Staff Organization and Operations  
   https://www.aiai.ed.ac.uk/~arpi/SUO/DOC/fm101-5.pdf

   핵심 내용:
   - 참모 역할, 관계, 책임.

   LLM 적용:
   - 오케스트레이터와 전문 에이전트 사이의 관계 설계.

3. JP 3-33, Joint Task Force Headquarters  
   https://www.dodig.mil/Portals/48/JP%203-33%20Joint%20Task%20Force%20Headquarters.pdf

   핵심 내용:
   - JTF HQ 형성과 운용.
   - planning, preparing, executing, assessing.

   LLM 적용:
   - 대규모 멀티에이전트 팀을 임시 task force처럼 구성.

### 8.16 PACE / 통신 대체 계획

1. CISA, Leveraging PACE Plan into Emergency Communications Ecosystems  
   https://www.cisa.gov/sites/default/files/2024-10/2024_NCSWICPTE_Leveraging_PACE_Plan_Emergency_Comms_Ecosystems.pdf

   핵심 내용:
   - Primary, Alternate, Contingency, Emergency.
   - 통신 장애 대비.

   LLM 적용:
   - 기본 모델 실패 시 대체 모델.
   - 검색 실패 시 대체 자료.
   - 자동 실행 실패 시 수동 절차.
   - 불확실성 높으면 인간 승인.

### 8.17 한국군 관련 자료

1. 임무형지휘 측정을 위한 척도 개발 연구  
   https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART002861979

   핵심 내용:
   - 한국 육군은 2018년 임무형지휘를 지휘철학으로 채택.
   - 측정 구성개념: 전술관 공유, 권한위임, 상호신뢰, 의사소통, 역량 강화.

   LLM 적용:
   - 에이전트 시스템의 성숙도도 이 다섯 요소로 평가 가능.
   - shared doctrine, delegation, trust, communication, capability building.

2. 임무형지휘 적용 사례연구: 러시아-우크라이나 전쟁과 KCTC 훈련  
   https://m.riss.kr/search/detail/DetailView.do?control_no=1b5922e48fc3e9997f7a54760bb41745&p_mat_type=1a0202e37d52c72d

   핵심 내용:
   - 러시아군의 통제형 지휘와 우크라이나군의 임무형 지휘 비교.
   - KCTC 훈련 사례.

   LLM 적용:
   - 중앙 통제형 AI 운용과 임무형 AI 운용의 비교 연구 가능.

3. 미 공군 지휘통제 원칙 개선 배경 분석  
   https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART003133605

   핵심 내용:
   - JADO, ACE, Lead Wing, MCA, AFFORGEN 등과 mission command 관련.

   LLM 적용:
   - 분산 실행과 다기능 에이전트 개념 연결 가능.

### 8.18 LLM 환각과 멀티에이전트 연구

1. Chain-of-Verification Reduces Hallucination in Large Language Models  
   https://arxiv.org/abs/2309.11495

   핵심 내용:
   - 초안 생성.
   - 검증 질문 생성.
   - 독립적으로 질문 답변.
   - 최종 답변 수정.

   LLM 적용:
   - backbrief/rehearsal/red-team과 직접 연결.

2. SelfCheckGPT  
   https://arxiv.org/abs/2303.08896

   핵심 내용:
   - 동일 프롬프트에 여러 샘플을 생성해 일관성 확인.
   - 외부 DB 없이 black-box hallucination detection 가능성.

   LLM 적용:
   - 핵심 사실은 다중 샘플 또는 독립 에이전트 검증.

3. Hallucination Mitigation for Retrieval-Augmented Large Language Models  
   https://www.mdpi.com/2227-7390/13/5/856

   핵심 내용:
   - RAG에서도 retrieval, generation 단계에서 환각 발생 가능.
   - detection, correction, mitigation 필요.

   LLM 적용:
   - RAG는 환각을 없애는 장치가 아니라 줄이는 장치.
   - 출처 충돌과 검색 품질을 별도 관리.

4. Multi-Agent Collaboration Mechanisms: A Survey of LLMs  
   https://arxiv.org/abs/2501.06322

   핵심 내용:
   - actor, collaboration type, structure, strategy, coordination protocol.

   LLM 적용:
   - 군 참모 체계와 multi-agent coordination 연구를 연결.

5. LLM-based Agents Suffer from Hallucinations: A Survey  
   https://arxiv.org/html/2509.18970v1

   핵심 내용:
   - 에이전트 워크플로우 단계별 환각 유형과 원인.
   - mitigation, detection taxonomy.

   LLM 적용:
   - 에이전트 환각은 답변 생성뿐 아니라 planning, tool use, memory, collaboration에서도 발생.

### 8.19 SOP / 반복 실행 표준화

1. ATP 3-90.90, Army Tactical Standard Operating Procedures  
   https://www.scribd.com/document/78673750/ATP-3-90-90

   핵심 내용:
   - tactical SOP 개발을 촉진하기 위한 자료.
   - SOP는 반복 절차를 표준화해 효율성과 적응성을 높인다.
   - collaborative portal을 통해 SOP 사례를 공유하고 개선.

   LLM 적용:
   - 반복 작업은 매번 새로 설계하지 않고 SOP 템플릿으로 처리.
   - 조사, 요약, 코드 변경, 검증, 보고, AAR 각각에 SOP가 필요.
   - SOP는 에이전트 자율성을 막는 장치가 아니라, 기본 실행을 안정화하고 예외 판단에 집중하게 하는 장치.

2. Building a Unit Planning Standard Operating Procedure  
   https://www.army.mil/article/277041/building_a_unit_planning_standard_operating_procedure_psop

   핵심 내용:
   - effective PSOP는 staff planning을 명확하고 간결하게 지원.
   - 워파이팅 기능 간 비생산적 시간을 줄이고 효율적인 계획 절차를 만든다.

   LLM 적용:
   - 멀티에이전트가 매번 다른 방식으로 계획하면 품질이 흔들린다.
   - Planning SOP를 만들어 에이전트별 입력/출력/보고 주기를 고정해야 한다.

### 8.20 Battle Rhythm / 회의와 결심 주기

1. Executing Knowledge Management in Support of Mission Command  
   https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf

   핵심 내용:
   - battle rhythm은 현재/미래 작전을 동기화하는 활동.
   - battle rhythm이 commander decision을 위한 critical path와 연결되지 않으면 비효율 발생.

   LLM 적용:
   - 에이전트 상태보고는 단순 진행률 보고가 아니라 다음 결정을 위한 입력이어야 한다.
   - 각 에이전트 산출물의 output이 다음 에이전트 input이 되도록 주기를 맞춘다.

2. Improving the Battle Rhythm to Operate at the Speed of Relevance  
   https://ndupress.ndu.edu/Media/News/News-Article-View/Article/2679728/improving-the-battle-rhythm-to-operate-at-the-speed-of-relevance/

   핵심 내용:
   - battle rhythm은 command, staff, unit activities의 deliberate cycle.
   - 회의, working group, board, briefing 등이 시간과 목적에 따라 동기화된다.
   - 각 headquarters의 battle rhythm은 서로 nested되어야 한다.

   LLM 적용:
   - 장기 작업에서는 정기 SITREP, Red Team review, Commander approval gate를 rhythm으로 둔다.
   - 보고 주기가 서로 맞지 않으면 정보가 늦게 올라와 잘못된 결정을 만든다.

3. Staff Processes in Large-scale Combat Operations, Rhythm of the Battle  
   https://api.army.mil/e2/c/downloads/2024/06/07/b62f30eb/24-852-staff-processes-in-large-scale-combat-operations-part-1-rhythm-of-the-battle.pdf

   핵심 내용:
   - rigid한 battle rhythm은 정적인 환경에는 유용하지만, LSCO에서는 상황 변화에 맞춰 조정되어야 한다.
   - battle rhythm은 작전 진행에 따라 바뀐다.

   LLM 적용:
   - 프레임워크도 고정 workflow만 쓰면 안 된다.
   - 긴급/단순/복잡/고위험 작업별 rhythm을 다르게 둬야 한다.

### 8.21 Knowledge Management / 정보 흐름 관리

1. FM 6-01.1, Knowledge Management Operations  
   https://www.bits.de/NRANEU/others/amd-us-archive/fm6-01-1%2812%29.pdf

   핵심 내용:
   - knowledge management는 정보가 필요한 사람에게 필요한 시간과 형식으로 전달되게 하는 활동.
   - working groups와 boards는 battle rhythm의 일부.
   - 정보 silo를 깨고 staff integration을 돕는다.

   LLM 적용:
   - 모든 정보를 하나의 context에 넣는 방식은 나쁘다.
   - Source Map, Evidence Map, Decision Log, Change Log, AAR Library로 정보 흐름을 분리해야 한다.

2. USFKI 5780.01 Knowledge Management Program  
   https://www.usfk.mil/Portals/105/Documents/Publications/Instructions/USFKI_5780-01_Knowledge-Management-Program.pdf

   핵심 내용:
   - battle rhythm은 leader decision cycle을 지원하기 위해 사람, 프로세스, 도구가 동기화되는 전체 활동.
   - shared understanding과 timely commander decision making을 지원.

   LLM 적용:
   - 에이전트 간 공유 이해를 만들려면 문서, 로그, 보고 양식이 같은 구조를 써야 한다.

### 8.22 Liaison / 수평 연결

1. FM 6-0 Appendix E, Liaison  
   https://www.globalsecurity.org/military/library/policy/army/fm/6-0/appe.htm

   핵심 내용:
   - liaison은 조직 간 communication을 촉진하고 freedom of action과 flexibility를 유지한다.
   - senior commanders에게 relevant information과 operational questions에 대한 답을 제공.

   LLM 적용:
   - 멀티에이전트에서 liaison은 "에이전트 간 인터페이스"다.
   - S2의 근거가 S3 계획으로 들어갔는지, Red Team 지적이 Executor 수정으로 이어졌는지 추적해야 한다.

### 8.23 Risk Management / 위험 관리

1. ATP 5-19, Risk Management  
   https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf

   핵심 내용:
   - 작전 수행 중 risk management에 대한 교리 지침.
   - 위험은 식별, 평가, 통제, 결심, 실행, 감독/평가되어야 한다.

   LLM 적용:
   - 에이전트 권한은 위험 수준에 따라 달라져야 한다.
   - 낮은 위험/가역 작업은 자율, 높은 위험/비가역 작업은 승인.
   - risk register를 유지해야 한다.

2. Risk Management Quick Reference Booklet  
   https://asktop.net/wp/download/GTA/GTAx21-08-001xv2014.pdf

   핵심 내용:
   - ATP 5-19 기반 quick reference.
   - 위험관리 절차를 빠르게 확인하는 용도.

   LLM 적용:
   - 긴 risk doctrine 전체를 매번 적용하기보다 간단한 risk gate를 프롬프트에 넣는다.

### 8.24 Operation Assessment / 성과 평가

1. Operation Assessment MTTP  
   https://www.alssa.mil/mttps/assessment/

   핵심 내용:
   - planning과 operations process에 assessment를 통합하기 위한 commander and staff guide.
   - joint/service doctrine을 보완하는 how-to techniques and procedures.

   LLM 적용:
   - 산출물이 만들어졌는지와 목적이 달성됐는지를 분리해 평가.
   - MOP, MOE, indicator를 문서화.

2. ATP 5-0.3 / Operation Assessment PDF  
   https://www.bits.de/NRANEU/others/amd-us-archive/ATP5-0x3%2815%29.pdf

   핵심 내용:
   - assessment를 planning and operations process에 통합.
   - indicators와 assessment products를 사용.

   LLM 적용:
   - 테스트 통과는 MOP에 가깝고, 실제 사용자 목표 달성은 MOE에 가깝다.
   - 문서화 프로젝트라면 "문서가 존재함"보다 "다음 작업자가 그대로 실행 가능함"이 MOE다.

3. JP 5-0, Joint Planning  
   https://www.esd.whs.mil/Portals/54/Documents/FOID/Reading%20Room/Joint_Staff/18-F-1152_JP_5-0_Joint_Planning_2020.pdf

   핵심 내용:
   - operation assessment는 observable key indicators를 측정해 planning과 execution의 효과를 높인다.

   LLM 적용:
   - 프레임워크도 measurable indicator가 있어야 개선 가능하다.

### 8.25 Training / Readiness / METL

1. ADP 7-0, Training  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716

   핵심 내용:
   - 훈련은 readiness를 만들기 위한 지휘관의 핵심 책임이다.
   - 부대는 실제 수행해야 할 임무에 맞춰 훈련 과제를 선정하고 평가한다.
   - 훈련은 단발 이벤트가 아니라 계획, 준비, 실행, 평가의 반복이다.

   LLM 적용:
   - 에이전트도 "잘한다"가 아니라 어떤 mission-essential task를 수행할 수 있는지 평가해야 한다.
   - 프롬프트 작성, 출처 검증, 코드 수정, Red Team review, AAR 반영을 AI METL로 관리한다.
   - readiness가 낮은 에이전트에는 체크리스트와 승인 gate를 더 많이 둔다.

2. FM 7-0, Training  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335

   핵심 내용:
   - training management는 부대 임무와 훈련 자원을 연결한다.
   - 지휘관은 훈련 우선순위와 평가 방식을 정한다.
   - collective task와 individual task가 연결되어야 한다.

   LLM 적용:
   - 단일 에이전트 역량과 멀티에이전트 집단 역량을 분리해 평가한다.
   - 예: S2는 출처 검증을 잘하지만 S3 통합이 약하면 전체 작전 readiness는 낮다.
   - training record처럼 작업별 성공/실패 기록을 남기면 에이전트 권한을 점진적으로 늘릴 수 있다.

3. Crawl-Walk-Run 방식

   핵심 내용:
   - 복잡한 임무를 바로 완전 자율로 수행하지 않고 단계적으로 숙달한다.
   - 처음에는 단순 절차, 다음은 감독 아래 복합 절차, 마지막은 임무형 수행으로 발전한다.

   LLM 적용:
   - Crawl: 에이전트가 SOP 체크리스트를 그대로 따른다.
   - Walk: 에이전트가 일부 판단을 하되 backbrief와 승인을 받는다.
   - Run: 에이전트가 commander's intent와 CCIR만 받고 자율 실행한다.

### 8.26 Sustainment / Logistics

1. ADP 4-0, Sustainment  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796

   핵심 내용:
   - 작전은 지속지원 없이는 유지되지 않는다.
   - sustainment는 보급, 정비, 수송, 인사, 의료 등 전투 지속 능력을 다룬다.
   - 지휘관은 작전계획과 지속지원계획을 함께 고려해야 한다.

   LLM 적용:
   - LLM 작업의 sustainment는 토큰, 컨텍스트, 도구, API, 파일 접근, 시간, 테스트 환경이다.
   - 장기 리서치나 멀티에이전트 작업에서는 S4 역할이 필요하다.
   - "할 수 있는가"뿐 아니라 "끝까지 지속 가능한가"를 봐야 한다.

2. JP 4-0, Joint Logistics  
   https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/

   핵심 내용:
   - joint logistics는 여러 조직과 기능을 통합해 작전을 지원한다.
   - 우선순위, 배분, 조정이 핵심이다.

   LLM 적용:
   - 여러 에이전트가 동시에 작업하면 같은 컨텍스트, 같은 출처, 같은 도구를 두고 경쟁한다.
   - Chief of Staff 또는 S4 에이전트가 자원 배분과 병목을 관리해야 한다.
   - 긴 작업은 checkpoint와 문서화를 통해 컨텍스트 손실에 대비해야 한다.

3. Sustainment principles

   핵심 내용:
   - anticipation, responsiveness, simplicity, economy, survivability, continuity, improvisation 같은 원칙이 반복적으로 강조된다.

   LLM 적용:
   - Anticipation: 작업 전 필요한 출처와 도구를 예상한다.
   - Responsiveness: 사용자 변경 요구나 실패에 빠르게 FRAGO를 낸다.
   - Simplicity: 문서 구조와 프롬프트 체인을 단순하게 유지한다.
   - Economy: 고비용 모델과 도구는 필요한 곳에만 쓴다.
   - Survivability: 컨텍스트 손실에 대비해 문서와 summary를 남긴다.
   - Continuity: 중간 산출물을 계속 저장한다.
   - Improvisation: 도구 실패 시 대체 절차를 둔다.

### 8.27 Targeting / Effects

1. JP 3-60, Joint Targeting  
   https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/

   핵심 내용:
   - targeting은 단순히 표적을 정하는 것이 아니라 원하는 효과, 수단, 평가를 연결하는 과정이다.
   - joint targeting cycle은 결심, 실행, 평가가 연결된 체계다.

   LLM 적용:
   - LLM 작업도 "무엇을 할 것인가"보다 "어떤 효과를 낼 것인가"를 먼저 정해야 한다.
   - 예: "문서 작성"은 활동이고, "다음 에이전트가 근거를 추적할 수 있게 함"이 효과다.
   - 모든 변경에는 target, desired effect, assessment method를 붙인다.

2. FM 3-60, Army Targeting  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1030750

   핵심 내용:
   - Army targeting은 decide, detect, deliver, assess(D3A) 흐름으로 설명된다.
   - 결정한 대상이 실제로 어디에 있고 어떤 상태인지 확인한 뒤 수단을 적용하고 효과를 평가한다.

   LLM 적용:
   - Decide: 어떤 문서, 코드, 주장, 리스크를 바꿀지 결정한다.
   - Detect: 현재 파일과 출처 상태를 확인한다.
   - Deliver: 수정, 생성, 도구 호출을 수행한다.
   - Assess: 테스트, 리뷰, source map, 사용자 목표 달성 여부를 확인한다.

3. Effects-based thinking

   핵심 내용:
   - 작전에서는 행동 자체보다 행동이 낳는 효과가 중요하다.

   LLM 적용:
   - "코드를 고쳤다"가 아니라 "사용자 문제를 재현하고 테스트로 방지했다"가 효과다.
   - "출처를 붙였다"가 아니라 "핵심 주장과 공식 출처가 추적 가능하다"가 효과다.

### 8.28 Rules of Engagement / Legal and Ethical Control

1. CJCSI 3121.01B, Standing Rules of Engagement / Standing Rules for the Use of Force  
   공개 참조는 존재하나 실제 운용 기준으로 사용하려면 최신 공식 배포본 확인 필요.

   핵심 내용:
   - ROE는 특정 상황에서 허용되는 행동과 제한되는 행동을 사전에 정한다.
   - 지휘관은 임무 수행과 법적/정책적 제한을 동시에 고려한다.

   LLM 적용:
   - 에이전트용 ROE는 allowed, approval required, prohibited로 나눈다.
   - 파일 읽기와 요약은 allowed, 외부 배포와 비용 발생은 approval required, 비밀키 노출과 허위 출처 생성은 prohibited다.
   - ROE는 모델 안전성 문구가 아니라 실제 tool-use 권한표여야 한다.

2. JP 3-84, Legal Support  
   https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/

   핵심 내용:
   - 작전 지휘에는 법률 지원과 제한 검토가 결합된다.
   - 법적 판단은 작전계획과 분리된 사후 단계가 아니라 계획과 실행에 포함된다.

   LLM 적용:
   - 법률, 의료, 금융, 보안 같은 고위험 도메인은 에이전트가 독자 결론을 내리는 영역이 아니다.
   - 에이전트는 위험을 식별하고, 승인/전문가 검토 경로로 올려야 한다.

3. Risk decision authority와 ROE의 결합

   핵심 내용:
   - 위험을 감수할 수 있는 권한은 계층별로 다르다.

   LLM 적용:
   - 에이전트는 위험 수용자가 아니라 위험 보고자다.
   - 높은 위험의 판단을 "내가 처리했다"가 아니라 "승인 필요"로 분류해야 한다.

### 8.29 Warfighting Functions / 기능별 통합

1. FM 3-0, Operations  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282

   핵심 내용:
   - 전투력은 여러 warfighting functions의 통합으로 발생한다.
   - 지휘통제, 정보, 기동, 화력, 지속지원, 방호 등이 따로가 아니라 함께 작동해야 한다.

   LLM 적용:
   - LLM 프레임워크도 프롬프트만으로는 부족하다.
   - command and control, intelligence, execution, sustainment, protection, information, assessment가 모두 있어야 한다.
   - 이 관점은 `functional-domains.md`의 기본 구조가 된다.

2. ADP 3-0, Operations  
   https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715

   핵심 내용:
   - 현대 작전은 여러 영역과 기능이 동시에 영향을 주고받는 환경에서 수행된다.

   LLM 적용:
   - 멀티에이전트 작업도 리서치, 코드, 문서, 테스트, 사용자 커뮤니케이션이 동시에 상호작용한다.
   - 한 기능의 성공이 전체 성공을 보장하지 않는다.

3. LLM 기능영역 번역

   핵심 매핑:
   - Command and Control -> 사용자 의도, 승인, 보고, 권한.
   - Intelligence -> 출처, 사실, 불확실성, 환각 방지.
   - Movement and Maneuver -> 작업 순서, 파일 탐색, 실행 경로.
   - Fires -> 특정 대상에 대한 변경과 효과.
   - Sustainment -> 토큰, 시간, 도구, 문맥, 의존성.
   - Protection -> 보안, 민감정보, rollback, 승인 gate.
   - Information -> 문서화, 지식관리, SITREP, AAR.

### 8.30 Korean Public Military Sources / 한국군 공개자료

1. 국방부 공개자료와 국방백서  
   https://www.mnd.go.kr/

   핵심 내용:
   - 한국 국방정책, 군 구조, 국방혁신, 과학기술군 전환 방향을 확인할 수 있다.
   - 세부 작전교리보다 전략, 조직, 정책 맥락 파악에 유용하다.

   LLM 적용:
   - 한국형 LLM 군대 프레임워크의 배경 자료로 사용한다.
   - AI를 단순 생산성 도구가 아니라 지휘통제, 정보화, 교육훈련, 군수 전환과 연결한다.
   - 공개자료의 한계를 명시하고 미군 공개교리로 구조적 빈틈을 보완한다.

2. 국가법령정보센터  
   https://www.law.go.kr/

   핵심 내용:
   - 군인의 지위 및 복무에 관한 기본법, 국방부 훈령, 부대관리 관련 규정을 확인할 수 있다.
   - 명령, 복무, 지휘책임, 보안, 관리체계 같은 법적/제도적 근거를 제공한다.

   LLM 적용:
   - 에이전트용 authority와 ROE의 비유 근거로 쓴다.
   - "사용자가 명령했다"와 "정당한 권한 안에서 실행 가능하다"를 구분한다.
   - 정직한 보고, 위험 보고, 민감정보 보호를 환각 방지와 tool-use 통제로 번역한다.

3. 한국국방연구원(KIDA)  
   https://www.kida.re.kr/

   핵심 내용:
   - 국방정책, 국방AI, 지휘통제, 군수, 정보화, 조직운영 관련 공개 연구자료를 제공한다.
   - 한국군과 한국 국방정책의 제도적 맥락을 이해하는 데 유용하다.

   LLM 적용:
   - 한국 조직문화에 맞춘 mission command 보정에 사용한다.
   - 국방AI와 정보화 연구를 implementation guide의 근거로 연결한다.
   - KIDA 자료는 공식 법령/교리와 구분해 연구자료 등급으로 사용한다.

4. 한국 공개 군사용어 자료

   핵심 내용:
   - 군사용어 통일은 지휘와 보고 왜곡을 줄이는 핵심 장치다.
   - 한국어 군사용어와 영어 교리 용어는 완전히 1:1로 대응하지 않을 수 있다.

   LLM 적용:
   - `glossary.md`에서 한국어/영어 용어를 함께 관리한다.
   - prompt DSL의 필드명을 안정화한다.
   - 모델이 군사용어를 임의 번역하거나 새로 만들지 않도록 한다.

5. 한국 자료 사용 한계

   핵심 내용:
   - 세부 작전교리, 명령서 양식, 실제 지휘통제 절차는 공개 접근성이 낮다.
   - 공개자료는 법령, 정책, 연구, 용어 자료 중심이다.

   LLM 적용:
   - 한국군 자료로 한국적 맥락을 잡고, 공개 미군 교리로 절차 구조를 보완한다.
   - 공개자료가 없는 부분은 "추정" 또는 "추가 연구 필요"로 남긴다.

### 8.31 Implementation / Runtime Translation

1. 군대식 체계를 런타임 구조로 변환

   핵심 내용:
   - 군대식 운용은 개념만으로 작동하지 않는다.
   - 실제 시스템에서는 mission state, authority gate, tool log, evidence store, AAR store가 필요하다.

   LLM 적용:
   - 사용자 요청은 mission object로 저장한다.
   - OPORD는 task order로 컴파일된다.
   - 도구 호출은 tool gateway에서 ROE 판정을 받는다.
   - 출처 기반 주장은 evidence store에 연결된다.
   - 완료 후 AAR가 SOP와 readiness rating에 반영된다.

2. Prompt DSL

   핵심 내용:
   - OPORD, WARNO, FRAGO, SITREP, AAR를 사람이 읽고 기계가 검증 가능한 스키마로 표현한다.
   - mission, intent, authority, CCIR, assessment는 필수 필드로 둔다.

   LLM 적용:
   - 프롬프트를 자연어 덩어리로 두지 않고 구조화한다.
   - validation rule로 누락된 intent, authority, MOP/MOE를 탐지한다.
   - prompt compiler가 DSL을 system/developer/user prompt로 변환할 수 있다.

3. Tool-use ROE

   핵심 내용:
   - 군 ROE를 LLM 도구 사용 권한체계로 번역한다.
   - 행동을 Green, Amber, Red, Black으로 나누고 각 등급에 실행/승인/거부 규칙을 둔다.

   LLM 적용:
   - 파일 읽기, 문서 생성은 Green일 수 있다.
   - API write, 패키지 변경, 외부 폼 제출은 Amber 이상이다.
   - 데이터 삭제, production DB 변경, 배포는 Red다.
   - 비밀키 출력, 허위 출처 생성, 비공개 자료 우회 접근은 Black이다.

4. Agent org chart

   핵심 내용:
   - 멀티에이전트는 역할 수보다 command relationship이 중요하다.
   - Commander, Chief of Staff, S2, S3, S4, S6, Red Team, Evaluator의 책임과 보고선을 분리한다.

   LLM 적용:
   - 모든 에이전트가 commander가 되면 산출물이 분산된다.
   - Red Team은 독립 검토자이지 최종 작성자가 아니다.
   - S2는 출처와 불확실성을 만들고, S3는 실행계획을 만들며, CoS가 통합한다.

### 8.32 Reference Architecture / Productization

1. 한국 조직문화 보정

   핵심 내용:
   - 한국 조직에서는 상명하복, 결재, 보고 낙관화, 이견 억제가 프레임워크 작동에 영향을 준다.
   - 군대식 체계를 도입할 때는 상급자 명령 자동화가 아니라 backbrief, 위험 보고, Red Team 독립성, 권한 위임을 강화해야 한다.

   LLM 적용:
   - "알아서 해" 요청도 ROE를 우회하지 않는다.
   - 모호한 명령은 backbrief와 assumption list로 보정한다.
   - Red Team finding은 비판이 아니라 지휘판단 자료로 취급한다.

2. Reference architecture

   핵심 내용:
   - 실제 시스템은 Orchestrator, OPORD compiler, Agent registry, Policy/ROE engine, Tool gateway, Evidence store, State store, Audit store로 나뉜다.
   - Tool gateway는 모든 외부 행동의 단일 관문이어야 한다.

   LLM 적용:
   - 에이전트가 직접 도구를 실행하지 않고 policy engine을 통과하게 한다.
   - mission state와 evidence store를 분리해 의도와 근거를 추적한다.
   - audit store를 통해 승인, 거부, 실행 결과를 남긴다.

3. Sample runtime state

   핵심 내용:
   - mission, OPORD, task order, agent registry, tool request, approval request, SITREP, FRAGO, evidence, AAR 상태 예시를 정의했다.

   LLM 적용:
   - 장기 작업의 컨텍스트 손실을 상태 저장으로 줄인다.
   - AAR를 learning store에 남겨 readiness와 SOP 업데이트에 연결한다.

4. Prompt DSL validator

   핵심 내용:
   - Validator는 문법 검사보다 실행 전 위험 탐지가 중요하다.
   - mission, intent, authority, CCIR, assessment 누락을 error 또는 critical로 잡는다.

   LLM 적용:
   - MISSING_AUTHORITY, HIGH_RISK_NO_APPROVAL, MOP_ONLY 같은 규칙을 둔다.
   - 모호한 mission과 authority를 실행 전 수정하게 한다.

5. Approval UI patterns

   핵심 내용:
   - 승인은 "계속할까요?"가 아니라 action, tool, target, risk, rollback, alternatives를 보여줘야 한다.
   - Red 작업은 기본값을 approve가 아니라 dry-run으로 둔다.

   LLM 적용:
   - approval request는 decision memo가 되어야 한다.
   - 포괄 승인보다 action-level, time-bound approval이 안전하다.

### 8.33 Runtime Contracts / Schema and Operations

1. JSON Schema contracts

   핵심 내용:
   - mission, agent, OPORD, task order, tool request, approval request, SITREP, FRAGO, evidence, AAR, readiness ledger 스키마를 분리했다.
   - 스키마는 런타임의 "명령서 양식" 역할을 한다.

   LLM 적용:
   - 에이전트가 문서처럼 보이는 자유 텍스트가 아니라 검증 가능한 상태 객체를 만든다.
   - OPORD와 tool request가 같은 mission id로 연결되어 audit 가능해진다.

2. Validator prototype

   핵심 내용:
   - JSON Schema validation과 semantic military-control validation을 분리했다.
   - intent, authority, CCIR, MOP/MOE, high-risk tool action 누락을 실행 전 차단한다.

   LLM 적용:
   - "형식은 맞지만 지휘통제가 안 되는 프롬프트"를 막는다.
   - critical issue가 있으면 tasking과 tool execution을 중단한다.

3. Agent runtime playbook

   핵심 내용:
   - startup, mission intake, OPORD approval, tasking, execution, SITREP, FRAGO, approval, evidence, verification, incident, AAR, shutdown 절차를 정의했다.

   LLM 적용:
   - 런타임 운영자는 모델 출력만 보는 것이 아니라 active mission, pending decision, failed tool request, unresolved AAR를 관리한다.

4. Military AI risk register

   핵심 내용:
   - intent distortion, hallucination, unauthorized action, secret exposure, gateway bypass, MOP-only evaluation 등 반복 위험을 register로 만들었다.

   LLM 적용:
   - 위험별 CCIR와 control을 연결해 보고와 승인 기준으로 사용한다.

5. Agent readiness ledger

   핵심 내용:
   - 에이전트별 task readiness를 T/P/U/X로 기록한다.
   - readiness는 모델에 대한 일반 평가가 아니라 특정 mission-essential task에 대한 증거 기반 평가다.

   LLM 적용:
   - 높은 readiness task는 자율 수행, 낮은 readiness task는 backbrief와 supervision을 요구한다.

### 8.34 Runtime Fixtures / Policy / Dashboard

1. Sample payloads

   핵심 내용:
   - mission, tool request, approval, SITREP, evidence, AAR의 valid/invalid JSON 예시를 만들었다.
   - invalid 예시는 missing intent와 Red without approval처럼 validator가 반드시 잡아야 하는 실패를 표현한다.

   LLM 적용:
   - 프레임워크가 문서에 머무르지 않고 테스트 가능한 runtime contract가 된다.

2. Policy engine rules

   핵심 내용:
   - ROE 판정은 Black > Red > Amber > Green 우선순위를 따른다.
   - actor, tool, action, target, data sensitivity, mission constraint, approval scope를 함께 본다.

   LLM 적용:
   - 에이전트 도구 요청은 policy engine을 통과해야 하며, 승인이 있더라도 mission/tool/action/target/time이 일치해야 한다.

3. Command post dashboard

   핵심 내용:
   - dashboard는 completion percentage보다 decision required, CCIR, approval queue, risk, evidence를 우선 표시해야 한다.

   LLM 적용:
   - 사용자에게 모든 로그를 보여주는 대신 지휘 판단에 필요한 정보만 올린다.

4. Runtime automation roadmap

   핵심 내용:
   - 문서 기반 프레임워크는 validator CLI, prompt compiler, tool gateway, approval UI, evidence store, command post dashboard, learning runtime 순서로 제품화한다.

   LLM 적용:
   - 한 번에 완전 자동화를 만들기보다 gate별로 구현한다.

5. Evaluation fixtures

   핵심 내용:
   - schema, semantic, policy, evidence, runtime fixture를 정의했다.
   - critical rule downgrade, Red without approval 허용, Black action 허용은 regression failure다.

   LLM 적용:
   - validator와 policy engine은 문서 설명이 아니라 fixture 기반 회귀 테스트로 관리해야 한다.

### 8.35 Executable Prototype / Data Model / Demo

1. Validator CLI prototype

   핵심 내용:
   - 외부 의존성 없이 Node.js로 JSON Schema subset과 semantic rule을 실행하는 CLI 초안을 만들었다.
   - valid mission, invalid missing intent, valid Green tool request, invalid Red without approval smoke test를 통과했다.

   LLM 적용:
   - 군대식 문서 체계가 실제 runtime gate로 전환되는 첫 실행 산출물이다.

2. Dashboard wireframes

   핵심 내용:
   - command post dashboard를 mission board, approval queue, CCIR alerts, evidence viewer, risk board, readiness board로 나눴다.

   LLM 적용:
   - 사용자는 전체 로그가 아니라 결심해야 할 정보, 위험, 승인 요청, 근거를 먼저 본다.

3. SQL data model

   핵심 내용:
   - missions, orders, task_orders, tool_requests, approvals, audit_events, evidence, sitreps, fragos, aars, risks, readiness_ledger 테이블을 설계했다.

   LLM 적용:
   - mission id를 중심으로 command, evidence, audit, learning을 추적한다.

4. Runtime demo scenario

   핵심 내용:
   - 사용자의 구현 요청이 intake, OPORD, task order, tool request, SITREP, FRAGO, verification, AAR로 흐르는 예시를 작성했다.

   LLM 적용:
   - 프레임워크가 실제 작전처럼 시간과 사건의 흐름을 가진다는 점을 보여준다.

5. Source reliability rubric

   핵심 내용:
   - 출처를 A/B/C/D/X로 평가하고 authority, directness, currency, scope, interpretive risk를 본다.

   LLM 적용:
   - 출처 claim과 LLM interpretation을 분리해 "출처가 말한 것"과 "우리가 적용한 해석"을 혼동하지 않는다.

### 8.36 Runtime Prototype / Event Model

1. Validator fixture runner

   핵심 내용:
   - `run-fixtures.js`가 valid/invalid payload를 실행하고 expected issue code를 확인한다.
   - missing intent와 Red without approval은 critical로 실패해야 한다.

   LLM 적용:
   - validator rule이 문서상 약속이 아니라 회귀 테스트가 된다.

2. Policy engine prototype

   핵심 내용:
   - 도구 요청 텍스트와 declared ROE class를 바탕으로 Black, Red, Amber, Green을 판정한다.
   - Black은 승인으로도 우회하지 않는다.

   LLM 적용:
   - tool gateway의 첫 구현 단위가 생겼다.

3. Runtime demo payloads

   핵심 내용:
   - mission, task order, Green tool request, Red tool request, approval request, SITREP, evidence, AAR payload를 작성했다.

   LLM 적용:
   - 하나의 mission이 런타임 상태 객체로 어떻게 흘러가는지 검증 가능하다.

4. Dashboard UI prototype

   핵심 내용:
   - 정적 HTML로 command post dashboard를 만들었다.
   - Mission intent, CCIR, approval queue, risks, active tasks, evidence, readiness, SITREP을 한 화면에 배치했다.

   LLM 적용:
   - 사용자에게 "무엇을 결심해야 하는가"를 먼저 보여주는 UI 방향을 검증한다.

5. Event sourcing model

   핵심 내용:
   - MissionCreated, OPORDCreated, ToolRequestCreated, PolicyDecisionMade, ApprovalRequested, ToolBlocked, SITREPIssued, AARIssued, ReadinessUpdated 같은 이벤트를 정의했다.

   LLM 적용:
   - 장기 운용에서는 현재 상태뿐 아니라 지휘 판단의 이력이 중요하다.

### 8.37 Automation Runners / Dashboard State / Event Replay

1. Policy fixture runner

   핵심 내용:
   - Green local action, Red without approval, demo Green, demo Red deploy의 expected decision을 자동 테스트한다.

   LLM 적용:
   - policy engine이 Red action을 허용하는 regression을 즉시 잡는다.

2. Runtime demo runner

   핵심 내용:
   - demo mission payload 전체를 validator로 검증하고, Green/Red tool request를 policy engine으로 확인한다.

   LLM 적용:
   - 하나의 mission flow가 schema와 policy gate를 모두 통과하는지 확인한다.

3. Dashboard state

   핵심 내용:
   - dashboard prototype의 데이터를 `dashboard-state.json`으로 분리했다.
   - HTML은 JSON fetch에 성공하면 state를 렌더링하고, 실패하면 fallback state를 사용한다.

   LLM 적용:
   - 나중에 event replay projection을 dashboard state로 변환할 수 있다.

4. Event fixtures and replay prototype

   핵심 내용:
   - demo event log를 만들고, replay script가 mission, tasks, tool requests, approvals, SITREP, evidence, AAR, readiness projection을 계산한다.

   LLM 적용:
   - 지휘 판단의 이력과 현재 상태를 분리해 audit와 dashboard projection을 동시에 지원한다.

### 8.38 Projection Automation / OPORD Payload / Commander Handbook

1. Dashboard state renderer

   핵심 내용:
   - `dashboard-ui-prototype/render-state.js`를 추가했다.
   - event replay projection을 dashboard prototype이 읽는 JSON state 형식으로 변환한다.
   - blocked Red request, pending approval, evidence count, latest SITREP, readiness를 commander-facing 화면 상태로 접는다.

   LLM 적용:
   - 지휘소 화면이 대화 기억이 아니라 event log projection에서 만들어진다.
   - "현재 상태"와 "감사 가능한 이력" 사이의 연결이 생긴다.

2. Event replay fixture runner

   핵심 내용:
   - `event-replay-prototype/run-event-fixtures.js`를 추가했다.
   - mission complete, OPORD retention, task projection, Green executed, Red blocked, pending approval, SITREP, evidence/AAR count, readiness, dashboard approval queue를 자동 검증한다.

   LLM 적용:
   - 이벤트 재생 로직이 Red action block이나 approval queue를 잃어버리면 즉시 실패한다.
   - audit architecture가 문서 아이디어가 아니라 regression gate가 된다.

3. Runtime demo OPORD

   핵심 내용:
   - `runtime-demo-payloads/opord.json`을 추가했다.
   - mission -> OPORD -> task order chain을 실제 schema 검증 대상에 넣었다.
   - authority, CCIR, sustainment, assessment가 OPORD payload 안에 들어간다.

   LLM 적용:
   - 사용자 요청을 곧바로 실행하지 않고 명령 문서로 구조화한 뒤 validator에 통과시킨다.
   - 승인권과 금지선을 prompt text가 아니라 payload contract로 만든다.

4. Military operating deep research queue

   핵심 내용:
   - `military-operating-deep-research-queue.md`를 추가했다.
   - B2C2WG, staff integration, OPSEC/classification, knowledge management, training/METL, sustainment, liaison 같은 누락 영역을 research backlog로 정리했다.

   LLM 적용:
   - 프레임워크 확장이 임의 주제가 아니라 군 작동영역별 backlog로 관리된다.
   - 출처 등급, research question, output artifact를 함께 관리한다.

5. Commander handbook

   핵심 내용:
   - `commander-handbook.md`를 추가했다.
   - 사람이 AI 지휘관으로서 intent, priority, risk, authority, CCIR, approval, AAR를 어떻게 운용할지 실전 절차로 정리했다.

   LLM 적용:
   - 단일 에이전트와 멀티에이전트 모두에서 "무엇을 자율 실행하고 어디서 멈출지"를 지휘관이 명확히 줄 수 있다.
   - 승인 request, backbrief, SITREP, hallucination control prompt가 바로 사용 가능해졌다.

### 8.39 B2C2WG / CCIR Alerting / OPSEC / KM / METL / Authority Matrix

1. B2C2WG operating model

   핵심 내용:
   - `b2c2wg-operating-model.md`를 추가했다.
   - boards, bureaus, centers, cells, working groups를 LLM runtime의 board, bureau, center, cell, working group으로 변환했다.
   - working group은 decision packet을 만들고, board는 approval, priority, risk acceptance, FRAGO를 결심한다.

   LLM 적용:
   - 멀티에이전트가 각자 장황하게 보고하는 구조를 CoS integration과 decision packet 흐름으로 통제한다.
   - event sourcing과 연결해 `WorkingGroupOpened`, `DecisionPacketPrepared`, `BoardDecisionMade` 같은 event 후보를 정의했다.

2. CCIR alerting model

   핵심 내용:
   - `ccir-alerting-model.md`를 추가했다.
   - PIR, FFIR, EEFI, Decision Point를 alert severity와 routing matrix로 변환했다.
   - Red action은 approval request, scope change는 FRAGO, source uncertainty는 evidence review로 분기한다.

   LLM 적용:
   - dashboard가 로그 전체가 아니라 commander decision에 영향을 주는 정보만 보여주게 된다.
   - "보고할 것"과 "기록만 할 것"을 분리한다.

3. OPSEC classification model

   핵심 내용:
   - `opsec-classification-model.md`를 추가했다.
   - public/internal/sensitive/restricted classification과 EEFI, context releasability matrix를 정의했다.
   - tool-use OPSEC, evidence store OPSEC, downgrade review, dashboard OPSEC panel을 정리했다.

   LLM 적용:
   - context sharing과 final output이 need-to-know와 releasability 기준을 갖는다.
   - secret/token/private key 같은 restricted 정보는 output, query, log, tool target에서 모두 차단 대상으로 본다.

4. Knowledge management SOP

   핵심 내용:
   - `knowledge-management-sop.md`를 추가했다.
   - README, source-map, compendium, evidence, decision log, event log, runtime payload, AAR/readiness ledger를 source of truth hierarchy로 정리했다.
   - handoff packet과 decision log 형식을 정의했다.

   LLM 적용:
   - 장기 작업이 chat history가 아니라 저장된 문서와 event projection으로 이어진다.
   - S6 Knowledge 역할이 단순 문서작성자가 아니라 지식흐름 운영자가 된다.

5. Agent METL

   핵심 내용:
   - `agent-metl.md`를 추가했다.
   - Commander, CoS, S2, S3, S4, S6, Red Team, Evaluator의 mission essential tasks와 평가 기준을 정의했다.
   - T/P/U/X readiness rating을 Green/Amber/Red/Black authority와 연결했다.

   LLM 적용:
   - 에이전트 자율권은 모델 성능이 아니라 role/task/tool/target/risk/readiness 조합으로 결정된다.
   - AAR 결과가 readiness 상승/하락과 훈련 task로 이어질 수 있다.

6. Authority matrix schema and fixtures

   핵심 내용:
   - `schema-files/authority-matrix.schema.json`을 추가했다.
   - `sample-payloads/valid-authority-matrix.json`과 `sample-payloads/invalid-authority-matrix-red-without-approver.json`을 추가했다.
   - validator에 `authority-matrix` 타입과 semantic rule을 연결했다.

   LLM 적용:
   - Red rule은 반드시 `approval_required`와 `approval_authority`를 가져야 한다.
   - Black rule은 반드시 `prohibit`이어야 하고 approval로 우회할 수 없다.
   - default allow는 broad authority risk로 실패한다.

### 8.40 Decision Packet / Working Group / CCIR Alert / Handoff / Alert Router / Readiness Gate

1. Decision packet schema

   핵심 내용:
   - `schema-files/decision-packet.schema.json`을 추가했다.
   - commander board에 올라갈 option, recommended option, risk, authority, evidence, deadline, fallback을 schema로 고정했다.
   - valid/invalid fixtures와 semantic rule을 연결했다.

   LLM 적용:
   - 에이전트가 사용자에게 "승인해주세요"만 올리지 않고 결심 가능한 packet을 만든다.
   - option이 없거나 evidence가 없는 decision packet은 validator에서 실패한다.

2. Working group schema

   핵심 내용:
   - `schema-files/working-group.schema.json`을 추가했다.
   - chair, participants, inputs, deliverables, decision board, trigger, disband condition을 명시한다.

   LLM 적용:
   - 멀티에이전트 discussion이 끝없이 지속되는 것을 막고, deliverable과 해산 조건을 강제한다.

3. CCIR alert and alert router

   핵심 내용:
   - `schema-files/ccir-alert.schema.json`을 추가했다.
   - `alert-router-prototype/`를 추가해 event log에서 Red decision point, Amber FFIR, Amber PIR alert를 생성한다.

   LLM 적용:
   - event log가 commander dashboard alert로 변환된다.
   - Red/Black alert는 required decision과 execution block을 가져야 한다.

4. Handoff packet schema

   핵심 내용:
   - `schema-files/handoff-packet.schema.json`을 추가했다.
   - current order, commander intent, completed/in-progress/blocked, pending decisions, active risks, source-of-truth files, verification status, next actions, do-not-do를 필수화했다.

   LLM 적용:
   - context transition 때 chat history 없이도 이어받을 수 있는 minimum packet이 생겼다.
   - blocked item이 있는데 pending decision이 없으면 validator에서 실패한다.

5. Readiness gate prototype

   핵심 내용:
   - `readiness-gate-prototype/`를 추가했다.
   - authority matrix와 role/task readiness를 결합해 allow, report_required, approval_required, prohibit를 판정한다.

   LLM 적용:
   - 같은 S3라도 local validation은 readiness P에서 허용되고, production deploy는 commander approval이 필요하다.
   - readiness가 부족하면 원래 Green인 action도 approval_required로 상승한다.

6. Context releasability policy

   핵심 내용:
   - `context-releasability-policy.md`를 추가했다.
   - role별 raw/summary/redacted/reference_only/denied delivery mode를 정의했다.

   LLM 적용:
   - 멀티에이전트 context 공유를 need-to-know와 EEFI 기준으로 제한한다.
   - final output은 release_to_final이 허용된 정보만 포함해야 한다.
   - 이후 `role-document-access-policy.md`와 `document-access-runner.js`가 context item 이전 단계에서 문서 파일 자체의 접근을 제한한다.

### 8.41 Context Filter / Release Review / Handoff Generator / Maintenance Readiness

1. Context item and release review schema

   핵심 내용:
   - `schema-files/context-item.schema.json`과 `schema-files/release-review.schema.json`을 추가했다.
   - context item은 classification, EEFI, allowed roles, release_to_final, retention을 가진다.
   - release review는 final output/external release 시 item별 delivery mode와 redaction을 기록한다.

   LLM 적용:
   - restricted/EEFI context가 final output으로 직접 나가면 validator가 실패한다.
   - final answer도 작전상 release review 대상이 된다.

2. Context filter prototype

   핵심 내용:
   - `context-filter-prototype/`를 추가했다.
   - role 또는 `FINAL_OUTPUT`을 기준으로 raw, summary, redacted, reference_only, denied delivery mode를 계산한다.

   LLM 적용:
   - S3는 내부 blocked deployment context를 raw로 받을 수 있지만 EEFI credential context는 denied된다.
   - Red Team은 sensitive architecture를 summary로만 받는다.

3. Handoff generator

   핵심 내용:
   - `handoff-generator.js`를 추가했다.
   - event replay projection과 alert projection을 결합해 schema-valid handoff packet을 만든다.

   LLM 적용:
   - context transition 시 current order, commander intent, blocked items, pending decisions, active risks, source-of-truth files가 자동 구성된다.

4. Decision packet linter

   핵심 내용:
   - `decision-packet-linter.js`와 `run-decision-packet-linter-fixtures.js`를 추가했다.
   - validator schema/semantic check에 더해 option 수, option별 benefit/risk/tradeoff, default action을 점검한다.

   LLM 적용:
   - commander에게 올라가는 packet이 결심 가능한 최소 품질을 갖는지 별도 gate로 확인한다.

5. Working group event fixtures

   핵심 내용:
   - `event-fixtures/working-group-event-fixtures.json`과 `event-replay-prototype/run-working-group-fixtures.js`를 추가했다.
   - WG opened -> decision packet prepared -> board decision made -> WG closed lifecycle을 검증한다.

   LLM 적용:
   - B2C2WG가 문서 개념을 넘어 event-sourced workflow로 내려간다.

6. Maintenance readiness model

   핵심 내용:
   - `maintenance-readiness-model.md`를 추가했다.
   - sustainment/maintenance를 tool readiness, resource readiness, context freshness, verification, fallback으로 변환했다.

   LLM 적용:
   - agent가 capable해도 tool/resource/context/fallback이 부족하면 실행권이 제한된다.
   - S4/S6가 runtime sustainment와 maintenance report를 담당한다.

### 8.42 Maintenance Runner / Release Runner / Approval Scope / Risk Acceptance / Source Coverage

1. Maintenance readiness schema and runner

   핵심 내용:
   - `schema-files/maintenance-readiness.schema.json`을 추가했다.
   - `maintenance-readiness-runner.js`가 validator, policy, runtime, event replay, alert router, context filter runner를 실행해 readiness report를 만든다.

   LLM 적용:
   - tool/resource/context/fallback readiness가 실행 전 gate로 올라왔다.
   - critical runner failure는 S4/S6 maintenance issue이면서 FFIR/CCIR 후보가 된다.

2. Release review runner

   핵심 내용:
   - `release-review-runner.js`와 `run-release-review-fixtures.js`를 추가했다.
   - context filter output과 release review 문서를 비교해, review가 filter보다 더 permissive하면 실패한다.

   LLM 적용:
   - final output도 release gate를 통과해야 한다.
   - EEFI/restricted context는 filter와 review 양쪽에서 차단된다.

3. Working group dashboard projection

   핵심 내용:
   - `dashboard-ui-prototype/working-group-projection-dashboard-state.json`을 추가했다.
   - working group event fixture projection과 dashboard state가 일치하는지 검증했다.

   LLM 적용:
   - B2C2WG lifecycle이 지휘소 UI state로 전환될 수 있다.

4. Approval scope and risk acceptance documents

   핵심 내용:
   - `approval-scope-policy.md`와 `risk-acceptance-authority.md`를 추가했다.
   - approval once, expiry, rollback, evidence, release review 분리, residual risk, commander retained authority를 정리했다.

   LLM 적용:
   - "승인"과 "위험수용"을 분리했다.
   - Red action approval은 blanket permission이 아니라 scoped release다.

5. Approval scope and risk acceptance schemas

   핵심 내용:
   - `schema-files/approval-scope.schema.json`을 추가했다.
   - `schema-files/risk-acceptance.schema.json`을 추가했다.
   - valid/invalid fixtures를 추가하고 validator semantic rule로 expiry, rollback, evidence, commander retained authority를 검증한다.

   LLM 적용:
   - Red action은 "승인 요청"만으로 풀리지 않는다.
   - scoped approval이 active이고, single-use이며, target/action/tool/time이 맞아야 한다.
   - high/critical/irreversible residual risk는 Commander가 수용해야 한다.

6. Policy authority integration prototype

   핵심 내용:
   - `policy-engine-authority-integration.js`를 추가했다.
   - policy engine, authority matrix/readiness, scoped approval, risk acceptance를 합성한다.
   - `run-authority-integration-fixtures.js`가 승인된 Red deployment, consumed approval 재사용, missing risk acceptance를 검증한다.

   LLM 적용:
   - Red action은 policy상 blocked지만, 정확한 approval scope와 risk acceptance가 둘 다 유효할 때만 `allow_scoped_execution`으로 바뀐다.
   - consumed approval은 재사용할 수 없다.
   - high-risk action은 approval만 있고 risk acceptance가 없으면 계속 blocked다.

7. Approval consumption event

   핵심 내용:
   - `schema-files/approval-consumption-event.schema.json`을 추가했다.
   - `approval-consumption-runner.js`와 `run-approval-consumption-fixtures.js`를 추가했다.
   - approval granted와 실제 execution을 분리하고, 실행 순간에 approval을 consumed로 전환하는 audit event를 정의했다.

   LLM 적용:
   - approval scope가 active인지만 보는 것이 아니라, 실제 실행 event가 mission/action/tool/target/time/evidence와 일치하는지 검증한다.
   - target mismatch는 approval consumption으로 인정하지 않는다.
   - 이미 consumed된 approval은 두 번째 execution event로 소비할 수 없다.
   - approval reuse 방지는 단일 policy check가 아니라 event-sourcing audit trail의 일부다.

8. Approval revocation event

   핵심 내용:
   - `schema-files/approval-revocation-event.schema.json`을 추가했다.
   - `approval-revocation-runner.js`와 `run-approval-revocation-fixtures.js`를 추가했다.
   - active approval만 철회할 수 있고, consumed approval은 사후 철회로 처리할 수 없게 했다.

   LLM 적용:
   - 승인 철회도 action/tool/target/time/authority/evidence가 맞아야 한다.
   - 철회 권한은 approval을 부여한 authority와 일치해야 한다.
   - 통지가 필요한 철회는 notified role을 남겨 하달 왜곡을 줄인다.
   - 이미 실행된 action은 revocation이 아니라 rollback, FRAGO, AAR로 처리해야 한다.

9. Approval renewal event

   핵심 내용:
   - `schema-files/approval-renewal-event.schema.json`을 추가했다.
   - `approval-renewal-runner.js`와 `run-approval-renewal-fixtures.js`를 추가했다.
   - active approval의 유효기간만 연장하고, target/action/tool/max execution 확장은 새 approval로 요구한다.

   LLM 적용:
   - "시간만 조금 더"라는 요청도 기존 approval object를 직접 수정하지 않고 append-only event로 남긴다.
   - renewal은 기존 expiry 전에만 가능하다.
   - 이미 만료되었거나 이미 사용된 `approve_once`는 renewal이 아니라 새 승인 또는 FRAGO가 필요하다.
   - renewal은 권한 범위를 넓히는 수단이 아니다.

10. Approval delegation event

   핵심 내용:
   - `schema-files/approval-delegation-event.schema.json`을 추가했다.
   - `approval-delegation-runner.js`와 `run-approval-delegation-fixtures.js`를 추가했다.
   - approval authority 위임은 authority matrix의 기존 approval-required rule 안에서만 유효하게 했다.

   LLM 적용:
   - 모든 approval을 사용자나 Commander에게 묻지 않고, Amber 수준의 반복 sustainment approval은 CoS 등에게 제한 위임할 수 있다.
   - 위임은 Red/Black, high/critical residual risk, restricted release, subdelegation을 포함할 수 없다.
   - delegatee가 자기 role을 승인하는 self-approval도 금지한다.
   - delegation도 reason, evidence, notification, backbrief, post-action evidence를 남겨야 한다.

11. Approval delegation revocation/expiry event

   핵심 내용:
   - `schema-files/approval-delegation-revocation-event.schema.json`을 추가했다.
   - `approval-delegation-revocation-runner.js`와 `run-approval-delegation-revocation-fixtures.js`를 추가했다.
   - 위임된 approval authority는 `revoked` 또는 `expired` event로 닫아야 하며, 원본 delegation snapshot을 보존해야 한다.

   LLM 적용:
   - 권한 위임은 생성 event만으로 충분하지 않다. 종료 event가 없으면 하위 에이전트가 과거 위임을 계속 유효한 권한으로 오해할 수 있다.
   - Commander revocation은 active window 안에서 Commander가 수행해야 한다.
   - expiry projection은 expiry 이후 `RECORDER` 또는 termination authority가 기록할 수 있다.
   - termination event는 task/action/tool/target/risk/time limit/retained authority/context guardrail을 원본 delegation과 대조한다.
   - staff role이 임의로 위임권한을 철회하거나 만료 전 expired 처리하는 것을 막는다.

12. Policy release integration

   핵심 내용:
   - `policy-engine-release-integration.js`를 추가했다.
   - `run-release-integration-fixtures.js`와 `release-integration-fixtures/`를 추가했다.
   - authority gate가 execution을 허용해도 release review가 없거나 실패하면 final/external output을 차단한다.

   LLM 적용:
   - "도구 실행 승인"은 "정보 공개 승인"이 아니다.
   - Red execution은 scoped approval과 risk acceptance가 있어야 하고, release-required output은 별도 release review가 있어야 한다.
   - valid release review는 missing risk acceptance를 우회할 수 없다.
   - invalid release review는 approval이 이미 있어도 final output을 `blocked_pending_release_review`로 멈춘다.

13. Authority delegation dashboard projection

   핵심 내용:
   - `authority-delegation-projection-runner.js`를 추가했다.
   - `run-authority-delegation-projection-fixtures.js`와 `authority-delegation-projection-fixtures/`를 추가했다.
   - `dashboard-ui-prototype/authority-delegation-projection-state.json`에 active/revoked/expired delegation projection을 저장했다.

   LLM 적용:
   - 권한 위임은 event log에만 있으면 운영자가 놓칠 수 있으므로 dashboard projection으로 올라와야 한다.
   - active, revoked, expired 상태를 분리해 expired/revoked 권한 재사용을 막는다.
   - termination actor와 reason을 dashboard row에 남겨 사후 추적과 AAR가 가능하게 한다.

14. Release gate decision event

   핵심 내용:
   - `schema-files/release-gate-decision-event.schema.json`을 추가했다.
   - `release-gate-decision-runner.js`와 `run-release-gate-decision-fixtures.js`를 추가했다.
   - release integration 결과가 event log에 남는 final decision/snapshot/evidence와 일치하는지 검증한다.

   LLM 적용:
   - gate 계산 결과는 대화 메모리에만 있으면 안 되고 append-only event로 남아야 한다.
   - release review가 없거나 실패했는데 event가 `allow_scoped_execution_and_release`를 주장하면 차단한다.
   - valid release review도 missing risk acceptance를 우회하지 못한다.
   - final decision, authority snapshot, release review snapshot, reasons, evidence를 함께 남긴다.

15. Release gate dashboard projection

   핵심 내용:
   - `release-gate-dashboard-runner.js`를 추가했다.
   - `run-release-gate-dashboard-fixtures.js`와 `release-gate-dashboard-fixtures/`를 추가했다.
   - `dashboard-ui-prototype/release-gate-dashboard-state.json`에 released, release-review-blocked, authority-blocked projection을 저장했다.

   LLM 적용:
   - final/external output gate는 event log뿐 아니라 operator dashboard에 올라와야 한다.
   - authority가 허용했지만 release review가 없는 상태와 release review는 통과했지만 authority가 막은 상태를 분리한다.
   - "왜 막혔는가"를 reasons/evidence와 함께 보여줘 다음 결정자가 즉시 조치할 수 있게 한다.

16. Maintenance readiness dashboard projection

   핵심 내용:
   - `maintenance-dashboard-runner.js`를 추가했다.
   - `run-maintenance-dashboard-fixtures.js`와 `maintenance-dashboard-fixtures/`를 추가했다.
   - `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`에 ready/degraded/down sustainment projection을 저장했다.

   LLM 적용:
   - tool/resource/context readiness는 문서나 report에만 있으면 실행자가 놓칠 수 있으므로 dashboard queue로 올라와야 한다.
   - degraded asset과 unavailable asset을 분리해 제한 운용과 차단 상태를 다르게 처리한다.
   - commander decision flag를 projection에 보존해 resource Red, fallback 없음, blocked execution 같은 상태를 즉시 결심점으로 연결한다.

17. Source-map linter

   핵심 내용:
   - `source-map-linter.js`를 추가했다.
   - docs의 공식 출처 도메인이 source-map에 coverage를 갖는지 확인한다.
   - `source-map-url-coverage-report.json`에 host별 coverage snapshot을 저장했다.

   LLM 적용:
   - 새 공식 출처가 compendium에 들어오고 source-map에서 누락되는 문제를 자동 감시한다.
   - source coverage가 실행 로그에만 남지 않고 artifact로 남아 다음 작업자가 감사할 수 있다.

18. AAR readiness update

   핵심 내용:
   - `aar-to-readiness-update.js`를 추가했다.
   - `schema-files/aar-readiness-update.schema.json`을 추가했다.
   - `run-aar-readiness-update-fixtures.js`와 `aar-readiness-update-fixtures/`를 추가했다.
   - AAR의 delta, cause, improve, SOP update를 readiness recommendation, maintenance action, CCIR trigger로 변환한다.

   LLM 적용:
   - AAR는 회고 문서가 아니라 다음 권한/훈련/정비 상태를 바꾸는 event input이다.
   - critical source failure나 hallucination signal은 Red Team downgrade/hold와 commander review로 연결한다.
   - sustain-only AAR는 자율권 상승 후보가 되고, improvement가 남은 AAR는 hold/train으로 남긴다.

19. OPORD annex and FRAGO scope-change schemas

   핵심 내용:
   - `schema-files/annex.schema.json`을 추가했다.
   - `schema-files/frago-scope-change.schema.json`을 추가했다.
   - annex가 OPORD intent나 authority boundary를 조용히 바꾸는 것을 semantic validation으로 차단한다.
   - mission scope나 authority boundary 변경은 affected roles, backbrief, rehearsal, annex boundary reason을 포함한 FRAGO scope-change로 표현한다.

   LLM 적용:
   - 전문 계획의 세부사항과 commander intent 변경을 분리해야 하달 왜곡을 막을 수 있다.
   - "annex를 업데이트했다"는 말로 mission purpose, task priority, approval boundary를 바꾸지 못하게 한다.
   - scope-changing FRAGO는 affected role에게 다시 하달되고, backbrief와 rehearsal을 거쳐야 실행 가능하다.

20. Rehearsal to CCIR router

   핵심 내용:
   - `rehearsal-to-ccir-router.js`를 추가했다.
   - `run-rehearsal-to-ccir-fixtures.js`와 `rehearsal-to-ccir-fixtures/`를 추가했다.
   - rehearsal friction point와 decision point를 CCIR alert와 decision packet으로 변환한다.

   LLM 적용:
   - rehearsal에서 발견한 friction은 실행 전 commander-facing queue로 올라와야 한다.
   - medium friction은 FFIR/Amber alert로 추적하고, high/critical friction은 blocked decision alert와 decision packet으로 승격한다.
   - credential/restricted 관련 friction은 EEFI/Black alert로 처리해 실행과 release를 차단한다.

21. AI special operations task force

   핵심 내용:
   - `ai-special-operations-tf.md`를 추가했다.
   - `schema-files/sof-tf-charter.schema.json`을 추가했다.
   - `sof-tf-activation-runner.js`, `run-sof-tf-fixtures.js`, `sof-tf-fixtures/`를 추가했다.
   - JP 3-05, FM 3-05, USSOCOM SOF Truths, USSOCOM core activities, USASOC 공식 페이지를 참조했다.
   - SOF Truths를 AI 운용 원리로 변환했다: 모델보다 사람/의도/승인이 중요하고, 많은 agent보다 검증된 소수 agent가 낫고, 고숙련 workflow는 긴급상황 뒤 즉석 생성할 수 없다.
   - AI SOF TF를 Commander, TF Lead/CoS, S2 Recon, S3 Execution, S4/S6 Enabler, OPSEC/Release, Red Team, Recorder/KM 구조로 정의했다.
   - charter validator가 trigger, commander-retained authority, independent Red Team/release review, source-map, release review, fallback, backbrief, rehearsal, dry run, abort/handoff 기준을 검증한다.

   LLM 적용:
   - 고위험/고불확실성 임무는 더 많은 자율성이 아니라 더 작은 팀, 더 강한 통제, 더 좋은 enabler, 더 빠른 결심 루프가 필요하다.
   - 실제 군사작전 전술이 아니라 agent selection, readiness, need-to-know context, OPORD/annex, rehearsal, CCIR, AAR/readiness update로 변환한다.
   - SOF core activity 명칭은 안전한 AI 운영 비유로만 사용하고, deception/unauthorized access/harmful instruction은 Black 금지선으로 둔다.
   - activation runner는 SOF TF charter를 `go/no_go`, approval gates, context distribution, required support, preflight blocks, commander queue로 projection한다.

22. Information to operations cycle

   핵심 내용:
   - `information-to-operations-cycle.md`를 추가했다.
   - JP 2-0, ADP 2-0, ATP 2-01.3, ADP 5-0, FM 5-0, JCS CCIR Focus Paper를 정보 처리/작전 변경 근거로 연결했다.
   - raw information, information report, intelligence assessment, running estimate, CCIR, decision packet, SITREP, FRAGO scope-change를 분리했다.
   - `schema-files/information-report.schema.json`과 `schema-files/intelligence-assessment.schema.json`을 추가했다.
   - `information-to-operations-router.js`와 `run-information-to-operations-fixtures.js`를 추가했다.

   LLM 적용:
   - 새 정보는 곧바로 프롬프트/명령을 바꾸지 않는다. 먼저 source reliability, confidence, CCIR relevance, EEFI risk, operational impact를 평가한다.
   - order-changing information은 CCIR alert와 commander decision packet 없이 FRAGO로 가지 못한다.
   - low-confidence 정보는 FRAGO scope-change가 아니라 PIR/running estimate 또는 source review로 남긴다.
   - EEFI나 credential-like raw value는 release-block routing 후에도 출력에 반복하지 않는다.

23. Personnel continuity and succession

   핵심 내용:
   - `personnel-continuity-model.md`를 추가했다.
   - FM 6-0, ADP 6-0, Federal Continuity Directive planning framework, KM primer, ADP 7-0을 연결했다.
   - 군대가 인원 손실과 로테이션을 견디는 이유를 보직 우선, 2-deep succession, bounded authority, vital records, battle handover, readiness gate, degraded mode로 정리했다.
   - `schema-files/continuity-plan.schema.json`을 추가했다.
   - `continuity-drill-runner.js`, `run-continuity-drill-fixtures.js`, `continuity-drill-fixtures/`를 추가했다.

   LLM 적용:
   - agent instance는 expendable하다. source of truth는 role, order, authority, event log, handoff, readiness ledger에 둔다.
   - Commander나 S6가 사라져도 successor chain은 발동하지만 Red approval, risk acceptance, release target expansion, FRAGO scope change는 자동 승계하지 않는다.
   - role rotation은 overlap, handoff packet, incoming backbrief, focused rehearsal을 요구한다.
   - continuity drill은 단일 장애점 successor, handoff 없는 essential function, vital records 누락, degraded mode 부재를 실패로 잡는다.

24. Interdepartment collaboration and branch integration

   핵심 내용:
   - `interdepartment-collaboration-policy.md`를 추가했다.
   - ADP 3-0, FM 3-0, JP 3-0, FM 6-0, JTF HQ organization focus paper, JTF command and control focus paper를 병과/기능 통합 근거로 연결했다.
   - 군대의 combined arms, warfighting functions, joint functions, supported/supporting relationship, liaison, battle rhythm, deconfliction을 AI 부서 협력 방침으로 변환했다.
   - `schema-files/department-collaboration-charter.schema.json`을 추가했다.
   - `department-collaboration-runner.js`, `run-department-collaboration-fixtures.js`, `department-collaboration-fixtures/`를 추가했다.

   LLM 적용:
   - 부서 협력은 병렬 작업이 아니다. 각 관계는 supported department, supporting department, required output, quality gate, handoff interface, escalation trigger를 가져야 한다.
   - 모든 blocking dependency에는 liaison rule이 있어야 하며, liaison은 결정자가 아니라 의미 변환과 conflict route 담당이다.
   - cross-department conflict가 source validity, release target, authority boundary, high risk, scope에 닿으면 decision packet과 Commander/CoS route가 필요하다.
   - collaboration runner는 charter를 relationship edge, missing liaison, unknown dependency, commander queue, preflight block으로 projection한다.

25. Force structure change and force management

   핵심 내용:
   - `force-structure-change-policy.md`를 추가했다.
   - AR 71-32, DA PAM 71-32, Army Force Management School digital library, How the Army Runs reference material, Force Management Functional Area 자료를 병과/부대 신설, 폐지, 증축, 감축 근거로 연결했다.
   - 군대의 force management를 capability requirement, DOTMLPF-P alternatives, force development, force documentation, affordability/supportability, readiness, lifecycle review로 정리했다.
   - `schema-files/force-structure-change-order.schema.json`을 추가했다.
   - `force-structure-change-runner.js`, `run-force-structure-change-fixtures.js`, `force-structure-change-fixtures/`를 추가했다.

   LLM 적용:
   - 새 agent, 부서, unit, TF, runner, dashboard panel은 이름이나 편의로 만들지 않는다. capability gap과 기존 SOP/schema/training/tool 조정으로 해결 불가능하다는 증거가 필요하다.
   - 조직 신설/증축은 Commander approval, retained release/risk/scope authority, maintainer, validation fixture, readiness evidence, source-of-truth, sunset condition을 요구한다.
   - 조직 폐지/감축은 기능 이관, handoff, data migration, authority withdrawal, documentation update, AAR/readiness update 없이는 완료되지 않는다.
   - force structure runner는 order를 preflight block, commander queue, transition task, documentation queue, readiness requirement, sunset watch로 projection한다.

26. Role document access and reading discipline

   핵심 내용:
   - `role-document-access-policy.md`를 추가했다.
   - 각 agent가 읽을 수 있는 문서를 role, duty, authority level로 제한하는 need-to-know matrix를 정의했다.
   - `schema-files/document-access-manifest.schema.json`을 추가했다.
   - `document-access-runner.js`, `run-document-access-fixtures.js`, `document-access-fixtures/`를 추가했다.
   - valid fixture는 S2, Executor, S6가 각자의 duty에 필요한 문서만 받는지 검증한다.
   - invalid fixture는 bulk read, wildcard path, missing allowed role/duty, restricted raw, required-but-denied, self escalation을 차단한다.

   LLM 적용:
   - 모든 agent에게 전체 repository context를 주는 대신 mission별 `DocumentAccessManifest`를 먼저 생성한다.
   - S2는 source/evidence 문서를 읽고, Executor는 implementation/tool/schema 문서만 읽으며, Commander-only risk 문서는 summary 또는 denied로 남는다.
   - document access runner는 role/duty/authority를 manifest와 대조해 allowed documents, denied documents, required documents, audit requirements를 projection한다.
   - 이 gate는 `context-filter-prototype`보다 앞단에 위치한다. 파일을 열 수 없는 agent는 그 파일에서 context item도 만들 수 없다.

### 8.47 Orders Production / Backbrief / Rehearsal Gate

1. Orders production pipeline

   핵심 내용:
   - 사용자 요청을 바로 실행 프롬프트로 쓰지 않고 mission analysis, OPORD, task order, backbrief, rehearsal, execution, SITREP, FRAGO, AAR 순서로 변환한다.
   - 하달 왜곡은 "명령을 자세히 쓰는 것"만으로 줄어들지 않는다. 하위 실행자가 의도, 과업, stop condition, approval boundary를 재진술해야 줄어든다.
   - 실행 순서와 friction point는 rehearsal에서 잡아야 한다.

   LLM 적용:
   - 장기 작업은 `orders-production-pipeline.md`의 state machine을 따른다.
   - `ordered -> acknowledged -> rehearsed -> executing` 전환을 runtime gate로 만든다.
   - `orders-dissemination-runner.js`가 OPORD, task order, backbrief, rehearsal의 연결성을 검증한다.

2. OPORD annex model

   핵심 내용:
   - OPORD 본문은 command contract이고 annex는 전문 세부계획이다.
   - source/tool/risk/verification/context/sustainment 같은 세부계획을 본문에 모두 넣으면 intent가 흐려진다.
   - annex는 parent order와 owner를 가져야 하며, intent 변경은 annex가 아니라 FRAGO로 처리한다.

   LLM 적용:
   - Source Plan, Tool/ROE Plan, Sustainment Plan, OPSEC/Releasability, Risk/Red Team, Assessment, Handoff/Audit annex를 정의했다.
   - context releasability policy와 연결해 모든 에이전트가 모든 annex를 raw로 받지 않게 한다.

3. Backbrief schema

   핵심 내용:
   - task owner는 commander intent, assigned task, purpose, end state, constraints, planned actions, risk controls, stop conditions, approval/prohibited actions를 재진술한다.
   - stop condition 없는 backbrief는 실행을 허용하면 안 된다.

   LLM 적용:
   - `schema-files/backbrief.schema.json`을 추가했다.
   - `sample-payloads/valid-backbrief.json`, `sample-payloads/invalid-backbrief-no-stop-conditions.json`을 추가했다.
   - validator semantic rule이 `BACKBRIEF_WITHOUT_ACTIONS`, `BACKBRIEF_WITHOUT_STOP_CONDITIONS`, `LOW_CONFIDENCE_WITHOUT_CLARIFICATION`을 잡는다.

4. Rehearsal schema

   핵심 내용:
   - rehearsal은 실행 순서, expected result, evidence, friction point, decision point, required changes, disposition을 기록한다.
   - required change가 남았는데 execute disposition을 내면 하달 왜곡이 실행 오류로 전환된다.

   LLM 적용:
   - `schema-files/rehearsal.schema.json`을 추가했다.
   - `sample-payloads/valid-rehearsal.json`, `sample-payloads/invalid-rehearsal-execute-with-unresolved-change.json`을 추가했다.
   - validator semantic rule이 `REHEARSAL_WITHOUT_SEQUENCE`, `EXECUTE_WITH_UNRESOLVED_CHANGES`, `HIGH_FRICTION_WITHOUT_DECISION_POINT`를 잡는다.

5. Runtime demo integration

   핵심 내용:
   - demo OPORD의 task `T-DEMO-001`가 `runtime-demo-payloads/backbrief.json`과 `runtime-demo-payloads/rehearsal.json`로 이어진다.
   - 이제 runtime demo는 mission -> OPORD -> task order -> backbrief -> rehearsal -> tool/policy -> SITREP/evidence/AAR 흐름을 가진다.

   LLM 적용:
   - `runtime-demo-runner.js`가 backbrief와 rehearsal validation을 포함한다.
   - `orders-dissemination-runner.js`가 intent/task/actor/approval boundary 연결을 검증한다.

## 9. 앞으로 더 파야 할 연구 질문

1. 군 문서 계층을 LLM context hierarchy로 어떻게 구현할 것인가?
2. OPORD, Annex, FRAGO를 실제 프롬프트 DSL로 만들 수 있는가?
3. 에이전트별 권한 등급을 시스템 프롬프트에 어떻게 강제할 것인가?
4. CCIR를 자동 감지하는 규칙 기반/모델 기반 방식을 어떻게 설계할 것인가?
5. AAR 결과를 다음 프롬프트와 SOP에 자동 반영하는 방법은 무엇인가?
6. Red Team 에이전트는 어떤 독립성을 가져야 하는가?
7. 멀티에이전트 구조에서 unity of command와 unity of effort를 어떻게 유지할 것인가?
8. 인간 승인이 필요한 경계 조건을 어떻게 표준화할 것인가?
9. 군대식 "임무형 지휘"가 창의적 작업, 코딩 작업, 리서치 작업에서 각각 어떻게 달라지는가?
10. 한국 조직문화에 맞는 임무형 AI 운용 체계는 무엇인가?
11. Prompt DSL validator를 실제 코드로 구현하면 어떤 필드 누락을 가장 먼저 잡아야 하는가?
12. Tool gateway가 approval required를 사용자 UX로 어떻게 제시해야 하는가?
13. 한국어 군사용어와 영어 군사용어의 불일치를 어떻게 자동 감지할 수 있는가?
14. Mission state와 evidence store를 어떤 DB schema로 분리할 것인가?
15. 에이전트 readiness rating을 자동 업데이트할 수 있는가?
16. 한국 조직에서 Red Team finding을 의사결정 자료로 수용하게 만드는 UI는 무엇인가?
17. JSON Schema valid/invalid fixture를 얼마나 촘촘히 만들어야 validator가 의미 있는 gate가 되는가?
18. Policy engine에서 Green/Amber/Red/Black 충돌 시 어떤 우선순위를 적용할 것인가?
19. Command post dashboard는 무엇을 숨기고 무엇을 먼저 보여줘야 하는가?
20. validator CLI prototype을 어느 언어로 만들고 어떤 fixture부터 자동화할 것인가?
21. runtime demo scenario는 어떤 대표 mission을 기준으로 할 것인가?
22. validator fixture runner가 semantic issue code까지 자동 검증할 수 있는가?
23. command post dashboard를 정적 HTML로 만들 때 어떤 정보 밀도가 적절한가?
24. SQL 모델을 event-sourcing 방식으로 바꿀 필요가 있는가?
25. policy engine fixture runner에서 승인 scope와 expiry까지 검증할 수 있는가?
26. dashboard prototype을 실제 JSON state 기반으로 렌더링할 수 있는가?
27. event log replay로 mission_current_state projection을 만들 수 있는가?
28. event replay projection을 dashboard-state.json으로 자동 변환할 수 있는가?
29. demo OPORD payload를 추가해 mission -> OPORD -> task order 흐름을 더 엄격히 검증할 수 있는가?
30. 아직 누락된 군 작동영역을 별도 deep research queue로 관리해야 하는가?
31. B2C2WG를 multi-agent scheduling과 decision packet workflow로 어떻게 구현할 것인가?
32. authority matrix를 role, task, tool, target, risk, readiness, expiry의 조합으로 schema화할 수 있는가?
33. CCIR alerting은 어떤 조건에서 dashboard notification, SITREP, approval request로 분기해야 하는가?
34. OPSEC/classification과 EEFI를 LLM context sharing 정책으로 어떻게 바꿀 것인가?
35. knowledge management SOP는 decision log, evidence store, handoff packet을 어떤 순서로 갱신해야 하는가?
36. agent METL과 readiness rating이 자동 실행권 확대/축소에 어떻게 연결되는가?
37. decision packet schema는 option/risk/evidence/authority/deadline을 어떻게 강제할 것인가?
38. working group charter는 언제 열리고 언제 해산되어야 하는가?
39. CCIR alert router는 event log에서 어떤 rule로 Red/Amber/Watch를 계산할 것인가?
40. context releasability filter는 role별로 어떤 정보를 제거하거나 요약해야 하는가?
41. readiness gate는 authority matrix와 agent readiness ledger를 어떻게 결합할 것인가?
42. handoff packet schema는 context transition에서 어떤 current state를 필수로 요구해야 하는가?
43. context item schema는 classification, EEFI, allowed_roles, release_to_final을 어떻게 표준화할 것인가?
44. context filter prototype은 raw/summary/redacted/reference_only/denied delivery를 어떻게 결정할 것인가?
45. release review는 final answer에서 어떤 정보가 나갈 수 있는지 어떻게 판정할 것인가?
46. handoff generator는 event replay projection과 README queue를 어떻게 결합할 것인가?
47. working group opened/prepared/closed event를 replay projection에 어떻게 넣을 것인가?
48. maintenance readiness는 tool availability, quota, context budget, fallback을 어떻게 평가할 것인가?
49. maintenance-readiness schema는 tool/resource/context/fallback state를 어떻게 표준화할 것인가?
50. release-review runner는 context filter output과 final output constraints를 어떻게 비교할 것인가?
51. working group projection을 dashboard state에 어떻게 표시할 것인가?
52. approval scope policy는 approval once, constraints, expiry, rollback을 어떻게 강제할 것인가?
53. risk acceptance authority는 role/risk/severity/readiness별로 어떻게 retained authority를 나눌 것인가?
54. source-map linter는 새 URL이 source-map에 없을 때 어떻게 실패시킬 것인가?
55. approval scope schema는 consumed approval 재사용을 어떻게 막을 것인가?
56. risk acceptance schema는 residual risk와 supervision plan을 어떻게 강제할 것인가?
57. maintenance readiness dashboard는 unavailable/degraded tool을 어떻게 commander-facing panel로 보여줄 것인가?
58. policy engine은 authority matrix, readiness gate, release review를 어떤 순서로 합성해야 하는가?
59. AAR finding을 readiness update recommendation으로 자동 변환할 수 있는가?
60. FRAGO scope change schema는 OPORD authority boundary를 어떻게 변경해야 하는가?
61. Annex schema를 만들 때 OPORD body와 FRAGO boundary를 어떻게 구분할 것인가?
62. Backbrief 품질을 LLM judge 없이 deterministic rule로 어디까지 평가할 수 있는가?
63. Rehearsal friction point가 CCIR alert와 decision packet으로 자동 전환될 수 있는가?
64. 수집된 정보가 어떤 조건에서 running estimate, SITREP, decision packet, FRAGO scope-change로 분기되어야 하는가?
65. 지휘관/참모/에이전트가 손실되거나 교체될 때 어떤 승계선, handoff, authority pause가 필요한가?
66. 고위험/고불확실성 작업을 SOF TF로 전환할 때 어떤 cell separation, enabler, rehearsal, release gate가 activation go/no-go를 결정해야 하는가?
67. 서로 다른 병과/부서가 협력할 때 supported/supporting 관계, liaison, handoff interface, conflict decision route를 어떻게 runtime contract로 강제할 것인가?
68. 병과/보직/부대/TF를 신설, 증축, 감축, 폐지할 때 capability gap, DOTMLPF-P, readiness, transition, documentation gate를 어떻게 runtime contract로 강제할 것인가?
69. 각 agent가 role, duty, authority에 맞는 정해진 문서만 읽도록 document access manifest를 어떻게 runtime gate로 강제할 것인가?

## 10. 현재 문서 세트와 관계

- `military-llm-framework-v0.1.md`: 전체 개념 교리.
- `military-operating-system.md`: 군대 작동방식을 LLM 운영체계로 모델링.
- `agent-roles-and-authority.md`: 지위별 승인, 보고, 자율 판단, 사후관리.
- `decision-risk-assessment.md`: CCIR, risk, decision support, operation assessment.
- `information-to-operations-cycle.md`: 정보 수집/평가가 running estimate, CCIR, SITREP, decision packet, FRAGO로 전환되는 절차.
- `personnel-continuity-model.md`: 인원 손실/교체/로테이션에도 보직과 권한이 이어지는 continuity model.
- `interdepartment-collaboration-policy.md`: 병과/기능 통합 원리를 부서 간 supported/supporting, liaison, handoff, conflict route 방침으로 변환.
- `force-structure-change-policy.md`: 병과/보직/부대/TF 신설, 폐지, 증축, 감축을 capability gap, DOTMLPF-P, readiness, transition order로 통제하는 방침.
- `prompt-templates.md`: OPORD, WARNO, FRAGO, SITREP, AAR 프롬프트 양식.
- `orders-production-pipeline.md`: request부터 AAR까지 이어지는 명령 생산 pipeline.
- `opord-annex-model.md`: OPORD 본문과 annex의 책임 분리 모델.
- `backbrief-and-rehearsal-sop.md`: 실행 전 이해 확인과 dry-run SOP.
- `sop-library.md`: 반복 작업 표준절차.
- `agent-battle-rhythm.md`: 보고, 회의, 결심, AAR 주기.
- `functional-domains.md`: warfighting functions, training, sustainment, targeting, ROE의 LLM 매핑.
- `source-map.md`: 출처별 군 개념과 LLM 적용점의 근거 지도.
- `case-studies.md`: 실제 적용 사례.
- `glossary.md`: 공통 용어 사전.
- `evaluation-metrics.md`: AI METL, MOP/MOE, readiness rating 평가 체계.
- `experiments.md`: 프레임워크 효과 검증 실험 설계.
- `korean-military-sources.md`: 한국 공개 군사자료와 LLM 적용 노트.
- `implementation-guide.md`: 실제 LLM 앱/에이전트 런타임 구현 가이드.
- `prompt-dsl.md`: OPORD, WARNO, FRAGO, SITREP, AAR 기계 판독형 스키마.
- `tool-use-roe.md`: 도구 사용 권한과 승인 gate.
- `llm-agent-org-chart.md`: 에이전트 조직도, 지휘관계, RACI, 보고선.
- `korean-org-culture.md`: 한국 조직문화에서 backbrief, 보고, Red Team, 결재를 보정하는 방법.
- `reference-architecture.md`: Orchestrator, policy engine, tool gateway, evidence store 참조 구조.
- `sample-runtime-state.md`: mission, OPORD, task order, tool request, SITREP, AAR 상태 예시.
- `prompt-dsl-validator.md`: OPORD/WARNO/FRAGO/SITREP/AAR 검증 규칙.
- `approval-ui-patterns.md`: Amber/Red 도구 실행 전 사용자 승인 UI 패턴.
- `schema-files/`: Prompt DSL과 runtime state의 JSON Schema 묶음.
- `validator-prototype.md`: DSL validator 의사코드와 테스트 케이스.
- `agent-runtime-playbook.md`: 런타임 운영 절차, SITREP/FRAGO/AAR, 장애 대응.
- `military-ai-risk-register.md`: 군대식 AI 운용 위험 목록과 통제책.
- `agent-readiness-ledger.md`: 에이전트별 readiness rating과 훈련 계획.
- `sample-payloads/`: schema와 validator 테스트용 valid/invalid JSON 예시.
- `policy-engine-rules.md`: Green/Amber/Red/Black ROE 판정 규칙.
- `command-post-dashboard.md`: mission board, approval queue, CCIR, evidence viewer 설계.
- `runtime-automation-roadmap.md`: 문서 프레임워크에서 tool-gated runtime까지 구현 로드맵.
- `evaluation-fixtures.md`: validator/policy/evidence/runtime 회귀 테스트 fixture 정의.
- `validator-cli-prototype/`: JSON Schema subset과 semantic rule을 실행하는 Node CLI 초안.
- `dashboard-wireframes.md`: command post dashboard 화면 wireframe.
- `data-model.sql.md`: mission/evidence/audit/readiness SQL 저장소 모델.
- `runtime-demo-scenario.md`: intake부터 AAR까지 흐르는 end-to-end 데모.
- `source-reliability-rubric.md`: 출처 신뢰도와 해석 위험 평가 기준.
- `validator-cli-prototype/run-fixtures.js`: validator fixture expectations 자동 실행기.
- `policy-engine-prototype/`: ROE 판정 함수를 실제 코드로 분리한 초안.
- `runtime-demo-payloads/`: demo mission의 실제 JSON payload 세트.
- `dashboard-ui-prototype/`: 정적 command post dashboard HTML prototype.
- `event-sourcing-model.md`: mission event log와 projection 설계.
- `policy-engine-prototype/run-policy-fixtures.js`: policy engine expected decision 자동 테스트.
- `runtime-demo-runner.js`: demo payloads와 policy checks end-to-end 실행기.
- `dashboard-ui-prototype/dashboard-state.json`: dashboard prototype 구동용 JSON state.
- `event-fixtures/`: event sourcing replay용 demo event log.
- `event-replay-prototype/`: event log를 mission projection으로 재생하는 Node prototype.
- `dashboard-ui-prototype/render-state.js`: event replay projection을 dashboard JSON state로 변환.
- `event-replay-prototype/run-event-fixtures.js`: replay projection과 dashboard 변환 기대값 자동 검증.
- `runtime-demo-payloads/opord.json`: demo mission의 OPORD payload.
- `military-operating-deep-research-queue.md`: 누락된 군 작동영역과 다음 리서치 산출물 큐.
- `commander-handbook.md`: 사람이 AI 지휘관으로서 intent, 권한, 승인, 보고를 운용하는 실전 지침.
- `b2c2wg-operating-model.md`: boards, bureaus, centers, cells, working groups의 멀티에이전트 운영 모델.
- `ccir-alerting-model.md`: PIR/FFIR/EEFI/decision point를 dashboard alert와 routing으로 변환.
- `opsec-classification-model.md`: context sharing, EEFI, releasability, sensitive output 통제 모델.
- `role-document-access-policy.md`: role, duty, authority별로 정해진 문서만 읽게 하는 document access policy.
- `knowledge-management-sop.md`: decision log, evidence store, event log, handoff packet 운영 절차.
- `agent-metl.md`: role별 mission essential task list와 readiness-to-authority 연결.
- `schema-files/authority-matrix.schema.json`: role/task/tool/target/risk/readiness 기반 권한 matrix schema.
- `sample-payloads/valid-authority-matrix.json`: authority matrix valid fixture.
- `sample-payloads/invalid-authority-matrix-red-without-approver.json`: Red authority semantic validation fixture.
- `schema-files/decision-packet.schema.json`: commander board에 올릴 option/risk/evidence/authority packet schema.
- `schema-files/working-group.schema.json`: B2C2WG charter와 disband condition schema.
- `schema-files/department-collaboration-charter.schema.json`: 부서 간 supported/supporting 관계, liaison, synchronization, conflict route contract.
- `schema-files/force-structure-change-order.schema.json`: 조직 신설/폐지/증감축을 capability gap, DOTMLPF-P, authority, readiness, transition, documentation update로 승인하는 order schema.
- `schema-files/ccir-alert.schema.json`: alert object와 routing contract schema.
- `schema-files/handoff-packet.schema.json`: context transition 전 current state 전달 packet schema.
- `alert-router-prototype/`: event log를 CCIR alert projection으로 변환하는 Node prototype.
- `readiness-gate-prototype/`: authority matrix와 readiness rating을 결합한 실행권 판정 prototype.
- `context-releasability-policy.md`: role별 context packet 필터링과 EEFI release policy.
- `schema-files/context-item.schema.json`: classification, EEFI, allowed roles, final release metadata schema.
- `schema-files/document-access-manifest.schema.json`: role, duty, authority 기반 문서 접근 manifest schema.
- `schema-files/release-review.schema.json`: final output/external release review schema.
- `context-filter-prototype/`: role별 raw/summary/redacted/reference/denied context packet 생성기.
- `document-access-runner.js`: role/duty/authority를 manifest와 대조해 allowed/denied document projection 생성.
- `run-document-access-fixtures.js`: S2/Executor/S6 문서 접근과 overbroad access 차단 fixture.
- `handoff-generator.js`: event replay와 alert projection에서 handoff packet 생성.
- `decision-packet-linter.js`: board packet option/risk/evidence/deadline 검증기.
- `event-fixtures/working-group-event-fixtures.json`: WG opened/prepared/decided/closed event log.
- `maintenance-readiness-model.md`: tool/resource availability와 sustainment readiness 모델.
- `schema-files/maintenance-readiness.schema.json`: critical asset readiness report schema.
- `schema-files/backbrief.schema.json`: task owner의 intent/task/stop condition/approval boundary 재진술 schema.
- `schema-files/rehearsal.schema.json`: 실행 sequence, friction, decision point, disposition schema.
- `schema-files/approval-scope.schema.json`: single-use approval, expiry, rollback, evidence, consumption metadata.
- `schema-files/approval-consumption-event.schema.json`: approval scope가 실제 execution으로 소비되는 audit event.
- `schema-files/approval-revocation-event.schema.json`: approval scope가 execution 전 철회되는 audit event.
- `schema-files/approval-renewal-event.schema.json`: approval scope가 execution 전 유효기간만 연장되는 audit event.
- `schema-files/approval-delegation-event.schema.json`: approval authority를 제한적으로 위임하는 audit event.
- `schema-files/approval-delegation-revocation-event.schema.json`: approval authority 위임 철회/만료 projection audit event.
- `schema-files/release-gate-decision-event.schema.json`: execution approval과 information release approval 합성 decision audit event.
- `schema-files/risk-acceptance.schema.json`: residual risk, authority, duration, supervision, AAR trigger.
- `maintenance-readiness-runner.js`: critical runner 결과를 readiness report로 변환.
- `orders-dissemination-runner.js`: OPORD, task order, backbrief, rehearsal 연결성 검증기.
- `approval-consumption-runner.js`: approval scope와 consumption event의 mission/action/tool/target/time/evidence 대조.
- `run-approval-consumption-fixtures.js`: active consumption, target mismatch, reused approval fixtures.
- `approval-revocation-runner.js`: approval scope와 revocation event의 active status/authority/time/notification/evidence 대조.
- `run-approval-revocation-fixtures.js`: active revocation, consumed revocation, wrong authority fixtures.
- `approval-renewal-runner.js`: approval scope와 renewal event의 active status/authority/window/execution-count/evidence 대조.
- `run-approval-renewal-fixtures.js`: active renewal, expired renewal, scope expansion fixtures.
- `approval-delegation-runner.js`: authority matrix와 delegation event의 base rule/ROE/risk/context/subdelegation 제한 대조.
- `run-approval-delegation-fixtures.js`: bounded delegation, staff retained authority attempt, Red base rule delegation fixtures.
- `approval-delegation-revocation-runner.js`: delegation event와 termination event의 status/authority/time/snapshot/evidence 대조.
- `run-approval-delegation-revocation-fixtures.js`: Commander revocation, recorder expiry projection, staff revocation attempt fixtures.
- `policy-engine-authority-integration.js`: policy, authority matrix, approval scope, risk acceptance 합성 gate.
- `run-authority-integration-fixtures.js`: consumed approval 재사용과 missing risk acceptance 차단 fixture.
- `policy-engine-release-integration.js`: authority gate와 release review 합성 gate.
- `run-release-integration-fixtures.js`: valid release, missing review, invalid review, authority-blocked release fixtures.
- `release-gate-decision-runner.js`: release integration output과 release gate decision event의 final decision/snapshot/evidence 대조.
- `run-release-gate-decision-fixtures.js`: release allow, missing review allow claim, authority-blocked release event fixtures.
- `release-gate-dashboard-runner.js`: ReleaseGateDecided event를 release/authority/review dashboard queue로 projection.
- `run-release-gate-dashboard-fixtures.js`: released, release-review-blocked, authority-blocked projection fixtures.
- `dashboard-ui-prototype/release-gate-dashboard-state.json`: release gate dashboard projection state.
- `maintenance-dashboard-runner.js`: maintenance readiness report를 ready/degraded/down dashboard projection으로 변환.
- `run-maintenance-dashboard-fixtures.js`: ready, degraded, unavailable sustainment projection fixtures.
- `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`: sustainment readiness dashboard projection state.
- `authority-delegation-projection-runner.js`: delegated approval authority lifecycle event를 dashboard projection으로 변환.
- `run-authority-delegation-projection-fixtures.js`: active, revoked, expired delegation projection fixtures.
- `dashboard-ui-prototype/authority-delegation-projection-state.json`: delegated authority dashboard projection state.
- `release-review-runner.js`: context filter output과 release review를 비교.
- `dashboard-ui-prototype/working-group-projection-dashboard-state.json`: B2C2WG dashboard projection state.
- `approval-scope-policy.md`: approval once, constraints, expiry, rollback 정책.
- `risk-acceptance-authority.md`: 위험 수용권한과 commander retained authority.
- `source-map-linter.js`: 공식 출처 도메인 coverage 검증.
- `source-map-url-coverage-report.json`: 공식 출처 host별 source-map coverage snapshot.
- `aar-to-readiness-update.js`: AAR finding을 readiness recommendation과 follow-up action으로 변환.
- `schema-files/aar-readiness-update.schema.json`: AAR readiness update contract.
- `run-aar-readiness-update-fixtures.js`: normal improvement, critical source failure, sustain-only AAR fixtures.
- `schema-files/annex.schema.json`: OPORD body와 role-specific annex detail을 분리하는 contract.
- `schema-files/frago-scope-change.schema.json`: mission scope/authority 변경을 annex update와 분리하는 FRAGO contract.
- `rehearsal-to-ccir-router.js`: rehearsal friction point와 decision point를 CCIR alert/decision packet으로 변환.
- `run-rehearsal-to-ccir-fixtures.js`: medium/high/sensitive rehearsal routing fixtures.
- `information-to-operations-cycle.md`: 정보 수집, 평가, CCIR, running estimate, SITREP, decision packet, FRAGO 변경 흐름.
- `schema-files/information-report.schema.json`: raw information intake와 source/CCIR/handling metadata contract.
- `schema-files/intelligence-assessment.schema.json`: 평가된 정보의 confidence, operational impact, recommended output contract.
- `information-to-operations-router.js`: 정보보고/평가를 CCIR alert, decision packet, SITREP, FRAGO scope-change draft로 변환.
- `run-information-to-operations-fixtures.js`: order change, FFIR SITREP, EEFI release-block routing fixtures.
- `personnel-continuity-model.md`: role continuity, succession, vital records, degraded mode, rotation gate 모델.
- `schema-files/continuity-plan.schema.json`: essential function, successor chain, vital records, degraded mode contract.
- `continuity-drill-runner.js`: role loss/rotation event를 successor activation과 paused functions로 변환.
- `run-continuity-drill-fixtures.js`: Commander unavailable, S6 rotation continuity drill fixtures.
- `ai-special-operations-tf.md`: 미군 SOF 원리를 AI high-risk task force 운영 모델로 변환.
- `schema-files/sof-tf-charter.schema.json`: SOF TF activation, cell separation, context isolation, enabler, rehearsal contract.
- `sof-tf-activation-runner.js`: SOF TF charter를 go/no-go, approval gate, context distribution, preflight block으로 projection.
- `run-sof-tf-fixtures.js`: valid SOF TF activation과 unbounded TF 차단 fixture.
- `department-collaboration-runner.js`: collaboration charter를 relationship edge, missing liaison, commander queue, preflight block으로 projection.
- `run-department-collaboration-fixtures.js`: valid cross-functional collaboration과 siloed collaboration 차단 fixture.
- `force-structure-change-runner.js`: 조직 변경 order를 preflight block, commander queue, transition task, documentation queue, readiness requirement로 projection.
- `run-force-structure-change-fixtures.js`: 정당화된 조직 신설과 근거 없는 증축 차단 fixture.
- `role-document-access-policy.md`: 각 agent가 role, duty, authority에 맞는 정해진 문서만 읽게 하는 방침.
- `schema-files/document-access-manifest.schema.json`: mission별 document access manifest contract.
- `document-access-runner.js`: manifest 기반 allowed/denied document projection runner.
- `run-document-access-fixtures.js`: role-scoped document reading과 overbroad access 차단 fixture.
- `research-compendium.md`: 모든 리서치 자료와 해석의 모음.

다음에 추가할 문서:

- 현재 deep research/documentation/runtime contract 큐는 완료 상태로 둔다
- 다음 확장은 사용자가 새 우선순위를 지정하면 별도 큐로 연다

## 다국적 교리 정합성 감사

목적: 미군 자료를 baseline으로 사용하되, NATO/영국/캐나다/한국 공식 출처와 대조해 현재 정책이 미군 전용 가정을 universal rule로 굳히지 않게 한다.

확인한 공식 출처군:

- NATO/Allied: AJP-01 Allied Joint Doctrine official GOV.UK publication page and PDF.
- UK: JDP 0-01 UK Defence Doctrine, JDP 01 UK Joint Operations Doctrine, JDP 04 Understanding and Decision-making, UK NATOTerm supplement.
- Canada: Canadian Armed Forces public page, DND reports/publications, CAF Ethos: Trusted to Serve.
- Korea: 국방부, 국가법령정보센터, 한국국방연구원.
- US: ADP 6-0, JCS authorities focus paper, existing force management and SOF anchors.

핵심 판단:

- `S2/S3/S4/S6`는 미군/미 육군식 참모명으로 보일 수 있으므로 framework internal function ID로만 사용한다.
- `COMMANDER`는 실제 장군/지휘관 계급이 아니라 final decision authority다.
- OPORD five-paragraph format은 runtime normalization contract로 유지하되, NATO/UK/local annex naming 차이는 alias 처리한다.
- ROE/legal support는 tool-use control analogy로만 사용한다. 법률, 개인정보, 공개발행, 실제 조직 영향은 local jurisdiction gate가 필요하다.
- DOTMLPF-P는 US-derived checklist다. 다국적 적용에서는 capability lifecycle review로 병기한다.
- USSOCOM SOF Truths는 AI high-risk TF heuristic으로만 사용한다. 타국 특수작전 교리 대표로 쓰지 않는다.

산출물:

- `docs/multinational-doctrine-consistency-review.md`
- `schema-files/doctrine-consistency-review.schema.json`
- `sample-payloads/valid-doctrine-consistency-review.json`
- `sample-payloads/invalid-doctrine-consistency-review-us-only.json`
- `doctrine-consistency-runner.js`
- `run-doctrine-consistency-fixtures.js`
- `doctrine-consistency-fixtures/README.md`

검증 기준:

- source family 4개 이상.
- non-US source family 3개 이상.
- `adopt_us_only` disposition 금지.
- role/staff terminology finding에는 alias handling 필수.
- ROE/legal finding에는 jurisdiction gate 필수.
- source-map, compendium, schema, sample, runner documentation update 필수.

## Controls Doctrine Operator Skill

목적: 문서가 많아질수록 에이전트가 전체 corpus를 무작정 읽는 문제가 생긴다. 이를 줄이기 위해 Codex skill을 만들어 task routing, source discipline, validation command selection, self-improvement loop를 절차화했다.

산출물:

- `codex-skills/controls-doctrine-operator/SKILL.md`
- `.claude/skills/controls-doctrine-operator/SKILL.md`
- `codex-skills/controls-doctrine-operator/references/document-routing.md`
- `codex-skills/controls-doctrine-operator/references/self-improvement-loop.md`
- `codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js`
- `install-ai-cli-skills.sh`

운용 원리:

- 먼저 router로 요청을 문서군에 매핑한다.
- 사용자가 직접 쓰는 경우 사용자를 최종결정권자로 보고, AI는 briefing/recommendation/validation 역할을 수행한다.
- AI가 대리 수행하는 경우 role, department, authority, task, need-to-know 기준으로 문서 접근과 실행 범위를 제한한다.
- Claude Code CLI project skill은 같은 router와 coverage gate를 호출하므로 Codex skill과 같은 문서 체계를 공유한다.
- 설치 스크립트는 Codex CLI와 Claude Code CLI의 skill 폴더를 확인/생성하고 각 skill을 symlink로 설치한다.
- 필요한 primary docs만 읽고, source-map에서 근거를 확인한다.
- runtime contract 변경은 schema, valid sample, invalid sample, runner, fixture를 함께 갱신한다.
- 라우터는 repo inventory를 스캔해 Markdown/HTML 문서, JSON schema, sample/runtime payload, fixture, runner/prototype script, skill metadata를 route category에 연결한다.
- 작업 후 AAR 질문으로 routing gap, validation gap, source-map gap을 식별한다.
- 반복 가치가 있는 gap이면 skill reference/script 자체를 갱신한다.

검증:

- `route_controls_docs.js`를 대표 질문 3개로 실행해 권한/release, schema/fixture, 다국적 출처 검증 라우팅을 확인했다.
- `node codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js --coverage .` 기준 routable artifact 329개 중 routed 329개, unrouted 0개를 확인했다.
- skill validator는 임시 PyYAML target으로 실행해 통과했다.
