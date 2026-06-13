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
- `CLAUDE.md`, `AGENT.md`, `SKILLS.md`, `Olympus_Harness.md`는 v2용 현행 문서가 아니라 v1 계열 산출물이다.
- 따라서 다음 작업은 v1 문서를 단순 patch하는 것이 아니라, 정리된 v2 PRD를 기준으로 새 v2 구현 헌법/하네스/작업지시 체계를 재생성하는 것이다.

## 구현 전 최우선 리스크

### R1. v1 문서를 v2 구현 기준으로 오인할 위험

`CLAUDE.md`, `AGENT.md`, `SKILLS.md`, `Olympus_Harness.md`는 v1 기준 문서라서 PRD v6.13과 맞지 않는다. 구현 에이전트가 이 문서들을 현행 기준으로 읽으면 PRD v6.13과 반대 방향으로 구현할 수 있다.

운영 방침:

- 이 파일들을 “v2와 불일치하는 v1 산출물”로 취급한다.
- 단순 정합화 patch보다, 정리된 `Olympus_PRD.md` 기준으로 새 v2용 파일을 생성하는 방향을 우선한다.
- 구현 에이전트에게는 v1 문서를 근거로 판단하지 말라고 명시한다.

대표 v1/폐기 개념:

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
| `HANDOFF.md` | 세션 진입점 | 다음 작업은 v2 구현 체계 재생성 |
| `CLAUDE.md` | v1 구현 헌법 산출물 | v2 기준으로 오인 금지. 단순 patch보다 새 v2 문서 생성 우선 |
| `SKILLS.md` | v1 기술 컨벤션 산출물 | v2 기준으로 오인 금지. 새 v2 컨벤션 생성 필요 |
| `AGENT.md` | v1/구현 지시 산출물 | phase별 자기완결형 v2 작업지시 파일로 새로 생성 예정 |
| `Olympus_Harness.md` | v1 테스트 골격 산출물 | Opus로 v2 PRD 기반 하네스 파일 새로 생성 예정 |
| `router-core/` | 라우터 코어 | G-A~G-D 주요 구현 대상 |
| `registry/` | agent registry | Zero Hardcoding, url 필드 제거 확인 필요 |
| `adapters/` | 플랫폼 adapter | egress/dedup/metrics 관련 구현 대상 |
| `harness/tests/` | node:test 기반 테스트 | 테스트를 코드에 맞춰 약화 금지 |

## 게이트별 예상 Athena 사전 작업

### G0. v2 구현 체계 재생성

- 목표: v1 산출물을 patch하는 대신, 정리된 `Olympus_PRD.md` 기준으로 v2 하네스와 phase별 자기완결형 작업지시 체계를 새로 만든다.
- 운영 이유: v1 MVP 경험상 긴 세션은 시행착오·폐기된 아이디어·임시 우회가 컨텍스트에 남아 코드 품질을 오염시킬 수 있었다. phase마다 새 세션을 열면 구현 에이전트가 클린한 상태에서 작업하지만, 그 대신 handoff가 자기완결형이어야 한다.
- 역할 분담:
  - Opus: v2 PRD 기반 `Olympus_Harness.md` 또는 새 하네스 파일 생성
  - Codex: phase 단위로 자기완결형 agent 작업지시 파일 생성 및 구현
  - Athena: PRD/Plan/HANDOFF/ATHENA 기록 기준으로 의도·용어·검증 게이트 관리
- 작업 전 Athena가 할 일:
  - v1 문서를 현행 기준으로 오인하지 않도록 표시
  - Opus용 하네스 생성 브리핑 작성
  - Codex용 phase 작업지시 파일 생성 브리핑 작성
  - 각 phase가 새 세션에서 시작 가능하도록 자기완결성 체크리스트 작성

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
