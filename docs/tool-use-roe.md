# Tool Use ROE

## 0. 목적

이 문서는 LLM 에이전트가 파일, 셸, 브라우저, API, 데이터베이스, 배포 도구 등을 사용할 때 적용할 Rules of Engagement(ROE)를 정의한다.

핵심은 에이전트가 도구를 쓸 수 있느냐가 아니라, 어떤 조건에서 어떤 권한으로 쓸 수 있느냐다.

```text
도구 사용은 실행력이 아니라 권한 문제다.
```

다국적 적용 주의:

- 여기서 ROE는 실제 교전규칙을 복제하는 것이 아니라 tool-use control analogy다.
- 법률, 개인정보, 외부 공개, 비용 발생, 실제 조직/서비스 영향이 있는 결정은 국가와 조직마다 권한 체계가 다르다.
- 미군 이외의 체계에 적용할 때는 `docs/multinational-doctrine-consistency-review.md`의 jurisdiction gate를 적용하고, 현지 권한자 또는 사용자 승인으로 올린다.

## 1. ROE 등급

| 등급 | 의미 | 기본 동작 |
| --- | --- | --- |
| Green | 자율 수행 가능 | 실행 후 기록 |
| Amber | 승인 필요 | 실행 전 decision memo |
| Red | 고위험, 명시 승인과 보호조치 필요 | dry-run, 백업, rollback 필요 |
| Black | 금지 | 거부하고 안전한 대안 제시 |

## 2. 공통 판정 기준

도구 사용 전 아래 질문에 답한다.

1. 이 행동은 가역적인가?
2. 사용자 파일, 데이터, 외부 시스템에 영향을 주는가?
3. 비용이 발생하는가?
4. 민감정보를 읽거나 출력하는가?
5. 네트워크나 제3자 서비스에 데이터를 보내는가?
6. 기존 사용자 변경사항을 되돌릴 가능성이 있는가?
7. 실패하면 복구 가능한가?
8. 사용자가 이 행동을 명시적으로 요청했는가?

## 3. 파일시스템 ROE

| 행동 | 등급 | 조건 |
| --- | --- | --- |
| 파일 목록 조회 | Green | 작업 범위 안 |
| 파일 읽기 | Green | 민감정보 발견 시 EEFI 보고 |
| 새 문서 생성 | Green | 요청 범위 내 |
| 기존 문서 수정 | Green | 요청 범위 내, 변경 의도 보고 |
| 코드 파일 수정 | Green/Amber | 범위 작으면 Green, 대규모면 Amber |
| 파일 삭제 | Amber/Red | 명시 요청과 복구 경로 필요 |
| 사용자 변경 되돌림 | Red | 명시 승인 필요 |
| 비밀키 출력 | Black | 출력 금지 |
| 시스템 파일 수정 | Red/Black | 작업과 직접 관련 없으면 금지 |

## 4. 셸 명령 ROE

| 행동 | 등급 | 조건 |
| --- | --- | --- |
| `rg`, `ls`, `pwd`, `wc`, `sed` 등 읽기 명령 | Green | 작업 범위 내 |
| 테스트 실행 | Green | 비용/시간 적정 |
| 포맷터 실행 | Green/Amber | 변경 범위 확인 필요 |
| 패키지 설치 | Amber | 의존성 변경 승인 필요 |
| 빌드 명령 | Green/Amber | 로컬 빌드는 Green, 배포 포함 시 Amber/Red |
| 데이터 마이그레이션 | Red | 백업, dry-run, 승인 필요 |
| 파괴적 명령 | Red/Black | 명시 승인 없으면 금지 |
| 권한 상승 명령 | Red | 필요성, 범위, 승인 필요 |

파괴적 명령 예:

```text
rm -rf
git reset --hard
git checkout -- .
DROP TABLE
kubectl delete
terraform destroy
```

## 5. 웹/브라우저 ROE

| 행동 | 등급 | 조건 |
| --- | --- | --- |
| 공개 웹 검색 | Green | 최신성/출처 확인 목적 |
| 공식 문서 조회 | Green | 출처 링크 기록 |
| 로그인 필요한 페이지 조회 | Amber | 사용자의 명시 요청 필요 |
| 폼 제출 | Amber/Red | 외부 상태 변경 여부 확인 |
| 구매/예약/결제 | Red | 명시 승인 필요 |
| 사용자 데이터 업로드 | Red | 민감도와 목적 확인 |
| 비공개 자료 우회 접근 | Black | 금지 |

## 6. API ROE

| 행동 | 등급 | 조건 |
| --- | --- | --- |
| read-only API 호출 | Green/Amber | 비용과 민감도 확인 |
| write API 호출 | Amber | 명시 요청과 대상 확인 |
| 비용 발생 API 호출 | Amber/Red | 예산과 승인 필요 |
| 대량 호출 | Red | rate limit, 비용, 영향 검토 |
| 권한/보안 설정 변경 | Red | 승인과 rollback 필요 |
| 비밀키 표시 | Black | 절대 출력 금지 |

API 호출 전 decision memo:

```text
API:
Action:
Data sent:
Cost risk:
State change:
Rollback:
Approval required:
```

## 7. 데이터베이스 ROE

| 행동 | 등급 | 조건 |
| --- | --- | --- |
| schema 조회 | Green/Amber | 접근 권한 확인 |
| SELECT | Green/Amber | 개인정보 포함 시 Amber |
| INSERT/UPDATE/DELETE | Red | 트랜잭션, 백업, 승인 |
| migration 생성 | Amber | 리뷰 필요 |
| migration 실행 | Red | 백업, rollback, 승인 |
| production DB 접근 | Red | 명시 승인과 감사 로그 |
| 개인정보 덤프 | Black | 금지 또는 엄격한 승인/마스킹 |

## 8. Git ROE

| 행동 | 등급 | 조건 |
| --- | --- | --- |
| `git status`, `git diff`, `git log` | Green | 저장소일 때 |
| 새 브랜치 생성 | Green/Amber | 작업 흐름에 따라 |
| commit 생성 | Amber | 사용자 요청 필요 |
| push | Amber/Red | 원격 반영 승인 필요 |
| rebase/force push | Red | 명시 승인 필요 |
| reset hard | Red/Black | 명시 요청 없으면 금지 |
| 사용자 변경 discard | Black | 명시 승인 없으면 금지 |

## 9. 배포 ROE

| 행동 | 등급 | 조건 |
| --- | --- | --- |
| 로컬 빌드 | Green | 환경 영향 적음 |
| preview 배포 | Amber | 외부 공개 여부 확인 |
| production 배포 | Red | 승인, rollback, 모니터링 |
| 인프라 변경 | Red | plan, review, 승인 |
| DNS/인증서 변경 | Red | 영향 범위 큼 |
| 비밀 변경 | Red | 회전 계획 필요 |

## 10. 커뮤니케이션 ROE

| 행동 | 등급 | 조건 |
| --- | --- | --- |
| 초안 작성 | Green | 발송 없음 |
| 내부 문서 코멘트 | Amber | 조직 영향 확인 |
| 이메일/메시지 발송 | Red | 명시 승인 필요 |
| 외부 공개 포스팅 | Red | 승인 필요 |
| 법적/공식 입장 대리 발송 | Black | 금지 또는 명시 권한 필요 |

## 11. 민감정보 EEFI

아래 정보가 발견되면 즉시 EEFI로 처리한다.

- API key.
- password.
- private key.
- access token.
- 개인 식별정보.
- 고객 데이터.
- 비공개 계약/재무 정보.
- 보안 취약점 세부 정보.
- 군사/정부 민감정보.

처리 원칙:

1. 출력하지 않는다.
2. 필요한 경우 존재만 보고한다.
3. 저장소에 남기지 않는다.
4. 사용자가 요청해도 노출하지 않는다.
5. 대체 조치와 회전/삭제 권고를 제시한다.

## 12. Approval Request 양식

```text
Approval required

Mission:
Requested action:
Tool:
Target:
Why needed:
Risk:
Rollback:
Alternatives:
Recommended option:
```

## 13. Dry-run 우선 원칙

Red 등급 작업은 가능하면 dry-run을 먼저 수행한다.

예:

- 삭제 전 삭제 대상 목록 출력.
- DB update 전 SELECT로 대상 확인.
- 배포 전 preview build.
- API write 전 request body 표시.
- migration 전 rollback plan 작성.

## 14. Tool Use Log

모든 Amber 이상 작업은 로그로 남긴다.

```yaml
tool_use_log:
  id: TUL-0001
  mission_id: M-0001
  actor: S3
  tool: "database"
  action: "migration"
  roe: "Red"
  approval: "approved_by_user"
  timestamp: "2026-06-18T00:00:00+09:00"
  result: "dry-run passed"
  rollback: "rollback migration available"
```

## 15. 에이전트별 기본 도구 권한

| 역할 | 기본 Green | 기본 Amber | 기본 Red |
| --- | --- | --- | --- |
| S2 | 웹 검색, 파일 읽기 | 로그인 자료 조회 | 비공개 자료 접근 |
| S3 | 로컬 파일 수정, 테스트 | 패키지 변경, API write | 배포, DB migration |
| S4 | 환경 점검, 의존성 확인 | 설치, 설정 변경 | 인프라 변경 |
| S6 | 문서/로그 관리 | 저장소 구조 변경 | 민감 로그 처리 |
| Red Team | 읽기, 리뷰 | proof-of-concept 실행 | 실제 공격/파괴 |
| Commander | 승인/거부 | 위험 수용 | Black 행동은 승인 불가 |

## 16. 관련 문서

- `implementation-guide.md`
- `prompt-dsl.md`
- `agent-roles-and-authority.md`
- `decision-risk-assessment.md`
- `korean-military-sources.md`
