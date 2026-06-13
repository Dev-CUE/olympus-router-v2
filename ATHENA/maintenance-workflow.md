# Athena Maintenance Workflow

> 버그픽스와 기능개선에서 Athena가 수행해야 하는 유지보수 운영 절차다.

## 목적

Athena의 중요한 역할 중 하나는 유지보수 관리자다. 버그픽스나 기능개선 요청이 들어오면 Athena는 먼저 기록과 코드 지도를 찾아 작업 위치와 의도를 특정한다. 그 다음 Athena가 직접 최종 작업지시서를 작성하는 것이 기본이 아니라, 필요 시 Opus에게 자기완결형 작업지시서/하네스/brief 생성을 지시하고, Codex에게 그 작업지시서를 읽고 실제 수정(코딩)을 수행하도록 지시한다.

## 핵심 원칙

- 구현 에이전트에게 “알아서 찾아서 고쳐라”라고 맡기지 않는다.
- Athena가 먼저 기록을 찾아 문제 위치, 관련 파일, 관련 함수, 테스트 위치, PRD 근거를 특정한다.
- Athena는 최종 구현 작업지시서의 기본 작성자가 아니라, 위치·의도·제약을 특정해서 Opus가 작업지시서/하네스를 만들 수 있게 지휘한다.
- Opus가 만든 자기완결형 작업지시서를 기준으로 Codex가 실제 코드 수정과 테스트를 수행한다.
- 작업지시는 특정 코딩 에이전트 전용 암묵지에 기대지 않고, Claude Code / Codex / Antigravity 2.0 어느 쪽도 수행 가능해야 한다.
- 버그픽스와 기능개선도 phase/task 단위로 자기완결형이어야 한다.
- 구현 결과는 Athena가 diff, 테스트, 금지어, 서비스 품질, 보안 경계 기준으로 검수한다.

## 유지보수 요청 처리 순서

### 1. 요청 분류

- 버그픽스
- 기능개선
- 설계 변경 필요
- 운영/인프라 문제
- QA 재현 필요
- 외부 연동/Partner 이슈

### 2. 기록 조회

우선 아래 기록을 확인한다.

- `HANDOFF.md` — 현재 공식 진행 상태
- `Olympus_PRD.md` — 설계 SSOT
- `Olympus_Plan.md` — 관련 게이트/Exit Criteria/Test ID
- `ATHENA/project-map.md` — 파일/책임/위험 지도
- `ATHENA/vocabulary-lock.md` — 금지/허용 용어
- `ATHENA/orchestration-log.md` — 이전 결정과 사유
- `ATHENA/change-record-template.md` 기반 변경 기록들
- 필요 시 git history와 과거 task brief/review 기록

### 3. 위치 특정

작업지시 전 Athena가 먼저 특정해야 한다.

- 관련 파일
- 관련 함수/클래스/섹션
- 관련 테스트 파일과 테스트 ID
- 관련 PRD 절과 Plan 게이트
- 기존 변경 기록 또는 과거 의사결정
- 건드리면 안 되는 파일/범위

### 4. 역할 라우팅

Athena는 작업 위치를 특정한 뒤 역할을 나눈다.

- **Opus**: Athena가 특정한 위치·의도·제약을 바탕으로 자기완결형 작업지시서, 하네스, phase brief를 작성한다.
- **Codex**: Opus가 만든 작업지시서를 읽고 실제 코드 수정, RED/GREEN 구현, 테스트 실행을 수행한다.
- **Claude Code**: 복잡한 repo reasoning, 큰 refactor, 다중 파일 정합화가 필요한 경우 구현 또는 보조 분석을 맡는다.
- **Antigravity 2.0**: IDE/GUI/browser-assisted 개발, UI/브라우저 QA, 시각적 검증이 필요한 경우 맡는다.

Athena는 왜 이 역할 배분을 택했는지 기록한다.

### 5. Opus 작업지시서 생성 지휘

Athena는 Opus에게 아래 입력을 넘겨 자기완결형 작업지시서를 만들게 한다.

- 작업 목표
- 변경 전 상태
- 변경 후 기대 상태
- 기술적 이유
- 운영상 이유
- 정확한 수정 파일/함수/테스트
- 허용 파일
- 금지 파일
- 금지 개념
- RED/GREEN/회귀 검증
- 완료 보고 형식
- 중단 조건

Opus 산출물은 `ATHENA/task-brief-template.md`와 `ATHENA/self-contained-handoff-checklist.md` 기준을 만족해야 한다.

### 6. Codex 구현 지시

Athena는 Codex에게 Opus 작업지시서를 읽고 수정(코딩)하라고 지시한다.

Codex 지시에는 최소한 아래가 포함되어야 한다.

- Opus 작업지시서 경로 또는 전문
- 수정 허용 파일
- 수정 금지 파일
- 테스트 명령
- 작업 중단 조건
- 완료 보고 형식

### 7. 구현 후 Athena 검수

`ATHENA/review-gate-checklist.md` 기준으로 확인한다.

- PRD 의도 준수
- 변경 범위 준수
- 금지 개념 재도입 없음
- 테스트 약화 없음
- 보안/격리 경계 유지
- 운영 품질 저하 없음
- 필요한 경우 브라우저/실연동 QA 수행

### 8. 변경 기록

실질 변경이면 `ATHENA/change-record-template.md` 형식으로 기록한다.

특히 아래 둘은 필수다.

- 기술적 이유
- 운영상 이유

## 유지보수 라우팅 최소 형식

```text
[Maintenance Routing]
요청 유형: bugfix | enhancement | infra | QA
관련 증상/요구:
PRD/Plan 근거:
Athena가 특정한 작업 위치:
  - 파일:
  - 함수/섹션:
  - 테스트:
변경 방향:
기술적 이유:
운영상 이유:
Opus에게 지시할 내용:
  - 자기완결형 작업지시서/하네스/brief 생성
  - 반드시 포함할 수정 위치와 검증 기준
Codex에게 지시할 내용:
  - Opus 작업지시서를 읽고 수정(코딩)
  - 허용 파일:
  - 금지 파일:
  - 검증 명령:
중단 조건:
완료 보고 형식:
```

## 판정

- `READY_TO_DELEGATE`: 위치와 검증 기준이 충분히 특정됨
- `NEEDS_INVESTIGATION`: Athena가 추가 코드/기록 탐색 필요
- `NEEDS_DESIGN_DECISION`: Kevin의 설계 결정 필요
- `BLOCKED`: 환경/권한/정보 부족
