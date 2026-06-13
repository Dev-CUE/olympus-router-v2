# Athena Project Map — olympus-router-v2

> 상태: 초안. `Olympus_PRD.md`, `Olympus_Plan.md`, `HANDOFF.md` 기준으로 Athena가 구현 위임 전 참고하는 지도다.

## SSOT 우선순위

1. `HANDOFF.md` — 현재 위치, 다음 작업, 역할 구분
2. `Olympus_PRD.md` — 설계 SSOT
3. `Olympus_Plan.md` — 구현 게이트, Exit Criteria, 진행 상태
4. `Olympus_Session_Protocol.md` — 킵/푸시/작업 방식
5. 이 폴더 `ATHENA/*` — Athena 운영 보조 기록. SSOT 아님

## 현재 상태 요약

- 설계: `Olympus_PRD.md` v6.13
- 코드: 약 v6.4 수준, push/callback/file-only 계약 잔존
- 다음 작업: 구현 헌법 정합화
- 구현 착수 전 정합 대상:
  - `CLAUDE.md`
  - `SKILLS.md`
  - `AGENT.md`
  - `Olympus_Harness.md`

## 구현 전 최우선 리스크

### R1. C용 구현 헌법에 구 계약 잔존

구현 에이전트가 `CLAUDE.md`나 구 `AGENT_*` 문서를 근거로 삼으면 PRD v6.13과 반대 방향으로 구현할 수 있다.

대표 잔존 개념:

- poll / pull
- callback
- round / max_rounds / ROUND_LIMIT
- `_source_url`
- `agents.yaml` url 필드
- volatile queue
- tenant prefix 없는 persona_key

### R2. PRD 문구 충돌 가능성

`Olympus_PRD.md`에는 `유실 0·중복 0·수동 0` 표현과 `at-least-once / 잔여 중복 가능` 표현이 함께 있다. 구현자 혼동 방지를 위해 범위 조정 문구가 필요하다.

### R3. G-G 실연동 위치 모호성

Plan 표는 G-G가 G-F 뒤지만, 주석은 G-B 직후 최소 실연동을 권장한다. `G-G1 최소 실연동` / `G-G2 통합 실연동`으로 나누는 방안 검토 필요.

## 주요 파일 책임 지도

| 파일/폴더 | 현재 추정 책임 | Athena 주의점 |
|---|---|---|
| `Olympus_PRD.md` | 설계 SSOT | 구현자가 임의 수정 금지. 설계 변경은 Kevin 승인 후 진행 |
| `Olympus_Plan.md` | 게이트/Exit Criteria | task brief로 더 잘게 분해 필요 |
| `HANDOFF.md` | 세션 진입점 | 다음 작업은 구현 헌법 정합화 |
| `CLAUDE.md` | C용 구현 헌법 | 구 계약 잔존. 정합화 1순위 |
| `SKILLS.md` | C용 기술 컨벤션 | 구 계약 잔존 가능. 정합화 필요 |
| `AGENT.md` | 현재 구현 지시서 | PRD v6.13 기준으로 재작성 필요 가능성 |
| `Olympus_Harness.md` | 테스트 골격 | 구 테스트 계약 정합 필요 |
| `router-core/` | 라우터 코어 | G-A~G-D 주요 구현 대상 |
| `registry/` | agent registry | Zero Hardcoding, url 필드 제거 확인 필요 |
| `adapters/` | 플랫폼 adapter | egress/dedup/metrics 관련 구현 대상 |
| `harness/tests/` | node:test 기반 테스트 | 테스트를 코드에 맞춰 약화 금지 |

## 게이트별 예상 Athena 사전 작업

### G0. 구현 헌법 정합화

- 목표: 구현자가 읽는 문서를 PRD v6.13과 일치시킨다.
- 작업 전 Athena가 할 일:
  - 금지어 위치 grep
  - 각 문서별 정합화 지시서 작성
  - Codex/Claude Code에게 허용 파일과 금지 파일 지정

### G-A. 저장소 계층

- 목표: storage interface, better-sqlite3, WAL, 단일 writer, migration gate
- Athena가 구현 에이전트에게 특정해야 할 것:
  - 새 storage interface 파일 위치
  - queue.db schema 위치
  - 테스트 파일 위치
  - busy_timeout/WAL 검증 방법

### G-B. 전송·큐·인증

- 목표: SSE+POST, durable job queue, token auth, egress
- Athena 주의점:
  - poll/callback 재도입 금지
  - router가 agent 직접 호출 금지
  - Last-Event-ID 범위 명확화

### G-C. A2A 엔진

- 목표: token-bound caller, ULID session, cc listen, speaker_counts DB SSOT
- Athena 주의점:
  - round 재도입 금지
  - `_source_url` 스푸핑 검증 재도입 금지
  - agent 제출 caller/speaker_counts 신뢰 금지

### G-K 후보. External A2A Gateway

- Kevin이 추가 요구한 외부 A2A 창구.
- 설계 반영은 지금, 구현은 내부 실연동 안정화 이후가 적합.
- 핵심:
  - external inbound/outbound 구분
  - partner namespace
  - context_key 외부 비노출
  - conversation_ref 사용
  - audit 기본 ON
  - Google A2A는 compatibility adapter 후보

## Athena 운영 원칙

- 구현 에이전트에게 “알아서 찾아서 해”라고 던지지 않는다.
- Athena가 먼저 정확한 파일·함수·테스트 위치를 특정한다.
- 구현 에이전트의 탐색 비용을 줄이고, 의도 이탈을 검출한다.
- Kevin과 먼저 용어와 의도를 잠근 뒤 구현을 위임한다.
