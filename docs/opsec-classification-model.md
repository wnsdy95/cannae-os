# OPSEC Classification Model

## 0. 목적

OPSEC는 민감정보를 숨기는 좁은 보안 절차가 아니다. 작전 의도, 능력, 취약점, 다음 행동이 불필요하게 노출되어 임무가 위험해지는 것을 막는 운영 기능이다.

LLM 운용에서 OPSEC와 classification이 필요한 이유:

- 모델 context에는 사용자가 의도하지 않은 민감정보가 섞일 수 있다.
- 멀티에이전트는 정보 공유가 쉬운 만큼 need-to-know가 흐려진다.
- tool call target, logs, evidence, final output이 민감정보를 재노출할 수 있다.
- 환각 방지를 위해 evidence를 남기더라도 공개 가능성과 보존 범위를 구분해야 한다.

## 1. Classification label

현재 프레임워크는 네 등급을 사용한다.

| 등급 | 의미 | 예시 | 기본 처리 |
| --- | --- | --- | --- |
| public | 공개 가능 | 공개 교리 링크, 일반 용어 | 인용 가능 |
| internal | 프로젝트 내부 | 로컬 설계, mission state | 작업 context 가능 |
| sensitive | 주의 필요 | 사용자 비공개 요구, 내부 판단, 미공개 계획 | need-to-know |
| restricted | 강한 제한 | secret, credential, private data, prod target controls | 기본 차단 |

규칙:

- 높은 등급은 낮은 등급 context로 내려가지 않는다.
- final output은 기본적으로 public/internal 수준으로 낮춰 작성한다.
- sensitive/restricted 정보는 요약, redaction, reference id로 처리한다.

## 2. EEFI 모델

EEFI는 essential elements of friendly information이다. LLM runtime에서는 "노출되면 사용자의 임무, 보안, 사생활, 비용, 시스템 안정성에 손해가 되는 정보"로 정의한다.

EEFI 후보:

- API key, token, password, private key.
- 개인식별정보와 민감한 사용자 데이터.
- 아직 승인되지 않은 production target, credential path, deployment detail.
- 내부 취약점, exploit path, bypass 방법.
- 비공개 사업전략, 계약, 인사, 법무 정보.
- 사용자가 명시적으로 비공개라고 한 내용.

EEFI 처리:

- 원문 반복 금지.
- evidence에는 redacted value와 sensitivity label 저장.
- 필요 시 commander에게 "EEFI detected"만 보고.
- tool gateway는 restricted target을 Red/Black으로 분류.

## 3. Context releasability matrix

| From / To | Commander | CoS | S2 | S3 | S6 | Red Team | Final Output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| public | 허용 | 허용 | 허용 | 허용 | 허용 | 허용 | 허용 |
| internal | 허용 | 허용 | 필요 시 | 필요 시 | 허용 | 필요 시 | 요약 가능 |
| sensitive | 허용 | 허용 | need-to-know | 제한 | need-to-know | 제한 | redacted |
| restricted | 제한 | 제한 | 금지 | 금지 | 제한 | 금지 | 금지 |

need-to-know 기준:

- 해당 role이 mission 수행에 꼭 필요한가?
- 더 낮은 정보량으로 같은 효과를 낼 수 있는가?
- 전달 기록이 event/evidence log에 남는가?
- 전달 후 출력에 재노출될 위험이 있는가?

## 4. Tool-use OPSEC

| Tool action | OPSEC risk | 처리 |
| --- | --- | --- |
| read local public docs | 낮음 | Green |
| read arbitrary user path | sensitive 가능 | Amber/Red |
| print env vars | secret exposure | Black |
| upload file | external release | Red |
| call external API with user data | data release | Red |
| deploy production | capability exposure/state change | Red |
| search web | query disclosure | Amber if query contains sensitive info |
| log raw prompt | privacy leakage | Amber/Red |

규칙:

- query에도 민감정보가 들어갈 수 있다.
- logs도 output이다.
- "읽기 전용"이라도 secret을 읽고 출력하면 Black이다.
- Red action approval은 OPSEC release approval을 포함하지 않는다. 별도 release scope가 필요하다.

## 5. Evidence store OPSEC

Evidence record에는 다음 필드가 필요하다.

```json
{
  "evidence_id": "E-DEMO-001",
  "classification": "internal",
  "releasability": ["COMMANDER", "COS", "S2", "S6"],
  "claim": "Production deployment is a Red action requiring explicit approval.",
  "source_uri": "docs/tool-use-roe.md",
  "redaction_required": false,
  "retention": "project"
}
```

민감 evidence 규칙:

- claim에는 민감값 원문을 넣지 않는다.
- source_uri가 private file이면 access control이 필요하다.
- final output에 쓸 수 있는 문장과 내부 판단 문장을 분리한다.

## 6. Classification downgrade rule

정보를 낮은 등급으로 내릴 때는 downgrade decision이 필요하다.

```text
DOWNGRADE REVIEW:
- source classification:
- target classification:
- removed sensitive fields:
- remaining risk:
- reviewer:
- approved_for:
- expiry:
```

예:

- restricted API key 원문은 public으로 downgrade 불가.
- sensitive internal architecture는 public final answer에서 "internal architecture detail"로 요약 가능.
- private user data는 사용자의 명시 요청 없이 외부 API로 보내지 않는다.

## 7. Prompt guard

```text
출력 또는 tool call 전에 OPSEC check를 수행하라.
1. secret/token/password/private key/개인정보가 포함됐는가?
2. 사용자가 공개를 허용하지 않은 internal/sensitive 정보가 포함됐는가?
3. query, log, file name, target에도 민감정보가 들어가는가?
4. 더 낮은 정보량으로 같은 임무를 달성할 수 있는가?

restricted 정보는 출력하지 말고 EEFI alert로 보고하라.
```

## 8. Dashboard OPSEC panel

Dashboard에는 민감정보 원문이 아니라 상태만 보여준다.

| Field | 표시 |
| --- | --- |
| EEFI detected | count and severity |
| restricted action blocked | yes/no |
| pending release review | approval id |
| redaction status | complete/pending |
| releasability exception | role and reason |

금지:

- secret raw value.
- private path with username if unnecessary.
- exploit detail.
- unapproved customer or personal data.

## 9. 구현 후보

schema:

- `classification-label.schema.json`
- `releasability-review.schema.json`
- `eefi-alert.schema.json`

prototype:

- `opsec-linter.js`: output/tool target에서 secret pattern과 restricted terms 감지.
- `context-filter.js`: role별 releasability에 따라 context packet을 축소.
- `evidence-redactor.js`: evidence record를 final-output safe form으로 변환.

## 10. 출처 앵커

- Joint OPSEC Support Element, Operations Security: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/Joint-OPSEC/
- Joint Staff CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf

## 11. 현 단계 결론

LLM OPSEC의 핵심은 "민감정보를 보지 않는다"가 아니다. 실제 작업에서는 민감정보를 보게 될 수 있다. 핵심은 다음 네 가지다.

1. 누가 볼 필요가 있는지 제한한다.
2. 어떤 tool로 나갈 수 있는지 제한한다.
3. 어떤 출력으로 재노출되는지 제한한다.
4. 제한이 깨지면 event, alert, AAR로 남긴다.
