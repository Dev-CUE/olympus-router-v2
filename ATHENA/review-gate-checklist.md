# Athena Review Gate Checklist

> 구현 에이전트 결과물을 Athena가 검수할 때 사용하는 체크리스트다.

## 1. 범위 통제

- [ ] 허용 파일만 수정했는가
- [ ] 불필요한 리팩터링이 없는가
- [ ] 새 dependency 추가가 승인되었는가
- [ ] 문서 보호 규칙을 어기지 않았는가

## 2. PRD 의도 정합성

- [ ] `Olympus_PRD.md`의 현재 계약과 일치하는가
- [ ] `Olympus_Plan.md` Exit Criteria와 연결되는가
- [ ] 아카이브/구 문서의 폐기 개념을 근거로 삼지 않았는가
- [ ] 구현자가 설계를 임의 변경하지 않았는가

## 3. 금지 개념 검사

아래 용어가 코드/테스트/문서에 새로 도입되지 않았는지 확인한다.

```text
poll
callback
round
max_rounds
ROUND_LIMIT
_source_url
agents.yaml url
volatile queue
```

예외: 금지어 설명 문서, migration note, 아카이브 처리 맥락.

## 4. 테스트 무결성

- [ ] 테스트를 코드에 맞춰 약화하지 않았는가
- [ ] 실패해야 하는 케이스가 실패하는가
- [ ] 성공 케이스만이 아니라 보안/오류/복구 케이스가 있는가
- [ ] mock 통과만으로 완료 선언하지 않았는가
- [ ] 실연동이 필요한 항목은 실연동 미완료로 표시했는가

## 5. 보안/격리

- [ ] Bearer token-bound caller 원칙을 지키는가
- [ ] agent 자기신고 caller/speaker_counts를 신뢰하지 않는가
- [ ] tenant prefix를 유지하는가
- [ ] context_key 외부 노출 위험이 없는가
- [ ] secret/token/env 값을 출력하지 않았는가
- [ ] 외부 A2A와 내부 A2A 신뢰 경계를 섞지 않았는가

## 6. 운영 품질

- [ ] 장애/재시작/복구 경로를 고려했는가
- [ ] 로그/metrics/audit 영향이 명확한가
- [ ] egress 중복/재시도/멱등 경계가 문서화되었는가
- [ ] 테스트 명령과 결과가 재현 가능한가

## 7. QA 필요 여부

- [ ] 브라우저/UI 테스트가 필요한가
- [ ] 실제 Telegram/Slack/Discord/Cloudflare/Hostinger 연동 테스트가 필요한가
- [ ] SSE 유휴 연결/Last-Event-ID 검증이 필요한가
- [ ] 외부 partner 연동 mock/contract 테스트가 필요한가

## 판정

- `PASS`: 그대로 다음 단계 가능
- `REQUEST_CHANGES`: 수정 지시 후 재검토
- `BLOCKED`: 요구/설계/권한/환경 문제로 Kevin 결정 필요
