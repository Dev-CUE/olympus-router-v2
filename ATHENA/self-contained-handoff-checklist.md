# Self-Contained Handoff Checklist

> phase/task가 새 세션에서 바로 이어질 수 있으려면 이 체크리스트를 만족해야 한다.

## 목적

Olympus Router v2 작업은 phase 단위로 진행한다. 각 phase는 코드 완성 및 테스트 통과 후 종료하고, 다음 작업은 새 세션에서 시작할 수 있어야 한다. 따라서 모든 phase/task handoff는 자기완결형이어야 한다.

이 방식은 v1 MVP 작업 경험에서 나온 운영 규칙이다. 같은 세션 안에서 계속 이어가면 이전 시행착오, 폐기된 아이디어, 임시 우회, 리뷰 논쟁이 컨텍스트에 남아 구현 에이전트 판단을 오염시킬 수 있었다. 새 세션으로 phase를 시작하면 오염되지 않은 상태에서 더 클린한 코드가 나오는 경향이 있었다. 단, 새 세션이 길을 잃지 않으려면 handoff가 반드시 자기완결형이어야 한다.

## 필수 포함 항목

### 1. 현재 기준 문서

- [ ] `HANDOFF.md` 현재 위치 요약
- [ ] `Olympus_PRD.md` 관련 절/계약
- [ ] `Olympus_Plan.md` 관련 게이트/Exit Criteria/Test ID
- [ ] `ATHENA/vocabulary-lock.md` 관련 금지/허용 용어

### 2. 작업 목표

- [ ] phase/task 목표 한 문장
- [ ] 변경 전 상태
- [ ] 변경 후 기대 상태
- [ ] 하지 않는 것 / 비범위

### 3. 기술적 이유

- [ ] 아키텍처상 왜 필요한지
- [ ] 데이터/상태/보안/복구/테스트 관점 이유
- [ ] 기존 v1 산출물과 충돌하는 부분

### 4. 운영상 이유

- [ ] 실제 운영 또는 QA에서 막으려는 문제
- [ ] 다음 LLM/코딩 에이전트 오해 방지 포인트
- [ ] 시간/토큰/재작업 절감 효과
- [ ] Kevin이 사람이 읽고 판단해야 할 영향

### 5. 정확한 수정 지점

- [ ] 수정 허용 파일
- [ ] 수정 금지 파일
- [ ] 수정 함수/섹션/테스트 ID
- [ ] 새 파일 생성 위치

### 6. 금지 개념

아래 개념이 필요한 것처럼 보이면 구현하지 말고 보고한다.

```text
poll
callback
round
max_rounds
ROUND_LIMIT
_source_url
agents.yaml url
volatile queue
persona_key without tenant prefix
```

### 7. 검증

- [ ] RED 또는 실패 확인 방법
- [ ] GREEN 확인 방법
- [ ] 회귀 테스트 명령
- [ ] 금지어 grep 또는 동등 검사
- [ ] mock 통과와 실연동 완료 여부 구분

### 8. 완료 보고

- [ ] 변경 파일 목록
- [ ] 변경 요약
- [ ] 기술적 변경 사유
- [ ] 운영상 변경 사유
- [ ] 테스트 결과 원문 요약
- [ ] 남은 리스크
- [ ] 다음 phase/task 시작 조건

## 판정

- `SELF_CONTAINED`: 새 세션이 추가 질문 없이 시작 가능
- `NEEDS_CONTEXT`: 필수 기준 문서/수정 지점/검증 기준이 부족함
- `BLOCKED`: PRD/Plan 충돌 또는 Kevin 결정 필요
