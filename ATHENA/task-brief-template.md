# Athena Task Brief Template

> Codex, Claude Code, Antigravity 2.0에 작업을 위임할 때 사용하는 표준 지시서다.

## Task ID

`TASK-ID`: `<예: G0-DOC-SYNC-01>`

## 역할

너는 `olympus-router-v2`의 구현 담당 agent다. 설계자는 아니다.

- 설계를 임의 변경하지 않는다.
- 허용 파일 밖을 수정하지 않는다.
- 테스트를 코드에 맞춰 약화하지 않는다.
- PRD와 충돌하면 구현하지 말고 보고한다.

## 목표

`<이 작업이 끝나면 무엇이 달라지는지 한 문장>`

## 왜 필요한가

`<PRD/Plan/HANDOFF 기준 구현 의도. 단순 기능 설명이 아니라 왜 이 방향이어야 하는지 설명>`

## 반드시 읽을 파일

- `HANDOFF.md`
- `Olympus_PRD.md`
- `Olympus_Plan.md`
- `ATHENA/vocabulary-lock.md`
- `<작업별 추가 파일>`

## 수정 허용 파일

- `<정확한 파일 경로>`

## 수정 금지 파일

- `Olympus_PRD.md` unless task explicitly approved for PRD change
- `Olympus_Plan.md` unless task explicitly approved for Plan change
- `HANDOFF.md` unless task explicitly approved for handoff update
- archive files unless task explicitly approved
- secrets, `.env`, token files

## 정확한 수정 지점

### File: `<path>`

- 함수/섹션: `<name or line range>`
- 현재 문제: `<무엇이 PRD와 충돌하는지>`
- 수정 방향: `<어떻게 바꿀지>`

## 금지 개념

이 작업에서 아래 개념을 새로 도입하거나 부활시키지 않는다.

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

## 테스트 / 검증

### RED

- `<실패해야 하는 테스트 또는 grep/문서 검사>`

### GREEN

- `<통과해야 하는 테스트 또는 검증 명령>`

### 회귀

- `<전체 또는 관련 테스트 명령>`

## 완료 기준

- [ ] 수정 허용 파일만 변경
- [ ] PRD 의도와 일치
- [ ] 금지 개념 재도입 없음
- [ ] 테스트/검증 결과 제출
- [ ] 남은 리스크 보고

## 중단 조건

아래 상황이면 작업을 중단하고 보고한다.

- PRD와 Plan이 충돌한다.
- 허용 파일 밖 수정이 필요하다.
- 금지 개념이 필요해 보인다.
- 테스트를 약화해야만 통과할 수 있다.
- secret/token/env 값을 읽거나 출력해야 한다.

## 보고 형식

```text
[작업 보고]
Task ID:
변경 파일:
변경 요약:
테스트 결과:
금지어 검사 결과:
남은 리스크:
다음 제안:
```
