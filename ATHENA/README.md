# ATHENA — Orchestration Records

이 폴더는 Athena/Hermes가 `olympus-router-v2` 프로젝트를 관리·검수·위임하기 위해 사용하는 전용 기록 공간이다.

## 목적

Athena는 이 프로젝트에서 직접 코딩자가 아니라 다음 역할을 맡는다.

- Kevin과 설계 의도·용어·품질 기준을 먼저 정렬한다.
- Codex, Claude Code, Antigravity 2.0에 구현/QA 작업을 정확히 위임한다.
- 구현 에이전트가 헤매지 않도록 파일·함수·테스트 위치를 먼저 특정한다.
- diff, 테스트, 금지어, 서비스 품질, 보안 경계를 검수한다.
- 필요한 경우 브라우저 기반 QA를 직접 수행한다.

## 이 폴더의 성격

- 프로젝트의 PRD/Plan SSOT를 대체하지 않는다.
- 설계 SSOT는 `Olympus_PRD.md`다.
- 구현 순서와 Exit Criteria는 `Olympus_Plan.md`다.
- 세션 진입점은 `HANDOFF.md`다.
- 이 폴더는 Athena의 오케스트레이션 보조 기록이다.

## 기본 파일

- `project-map.md` — 프로젝트 구조, 책임, 주요 함수/파일 지도
- `vocabulary-lock.md` — 허용/금지 용어와 의도 잠금
- `task-brief-template.md` — Codex/Claude Code/Antigravity 작업 지시서 템플릿
- `review-gate-checklist.md` — Athena 검수 게이트
- `orchestration-log.md` — Athena 운영 기록과 의사결정 로그

## 운영 원칙

1. 구현 에이전트에게 광범위한 탐색을 맡기지 않는다.
2. Athena가 먼저 프로젝트 맵을 잡고 정확한 수정 지점을 지정한다.
3. 테스트를 코드에 맞추지 않는다. 코드를 PRD에 맞춘다.
4. mock 통과만으로 완료 선언하지 않는다.
5. 금지된 과거 개념이 재등장하면 즉시 중단·보고한다.
6. Kevin의 명시 승인 없이 push/deploy/production data 접근을 하지 않는다.
