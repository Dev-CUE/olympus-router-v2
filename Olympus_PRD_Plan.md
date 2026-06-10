# Olympus Router — PRD & Implementation Plan

> **버전**: v6.7 (다중 사용자 / 관리 UI 준비 설계 반영)
> **상태**: Phase 1~7 구현 완료 / 55/55 테스트 통과 / 실제 에이전트 연동 진행 중
> **문서 성격**: AI 코딩 에이전트가 직접 소비하는 실행 계약서(Contract)
> **업데이트 규칙**: 이 문서가 단일 진실 공급원(SSOT). 설계 변경 시 반드시 이 파일을 먼저 갱신한 뒤 코드를 수정한다.

---

## 0. AI 에이전트용 실행 지침 (READ FIRST)

당신은 Olympus Universal Architecture를 구현하는 코딩 에이전트다. 다음 불변 원칙을 위반하는 코드는 거부된다.

1. **Dumb Pipe**: 라우터 코어는 텍스트를 파싱하지 않는다. 비즈니스 로직·LLM 호출·문자열 의도 분석 금지. 오직 JSON 엔벨롭의 목적지 검증과 병렬 패스스루만 수행한다.
2. **Zero Hardcoding**: 코드 어디에도 `zeus` / `hera` / `athena` 같은 에이전트 이름을 직접 쓰지 않는다. 모든 에이전트는 `config/agents.yaml`에서만 정의되고 registry를 통해 동적 조회된다.
3. **Stage-Gated**: Phase는 순서대로 구현한다. 각 Phase는 정의된 테스트(Exit Criteria)를 100% 통과해야 다음 Phase로 진행한다.
4. **작업 프로토콜**: `[작업금지] 브리핑 → 수정 → 승인`. 코드 작성 전 반드시 브리핑하고 승인을 받는다.
5. **이 문서 우선**: 코드와 이 문서가 충돌하면 이 문서가 정답이다. 구현 중 모순 발견 시 코드를 고치지 말고 이 문서의 갱신을 먼저 제안한다.
6. **컴포넌트 독립성**: 라우터/어댑터는 Mem0·Obsidian·Gemini 등 외부 지식 인프라와 완전히 독립적이다. 라우터의 유일한 Wiki 접점은 "Raw 폴더에 드롭"(옵션)뿐이다.
7. **PRD 선행**: 작업 시작 전 이 문서 최신 버전을 확인한다. 설계 변경이 필요하면 코드보다 이 문서를 먼저 갱신한다.
8. **관리 UI 준비**: 새 코드 작성 시 향후 관리 UI가 붙을 것을 전제한다. 설정·상태·에이전트 정보는 `/admin/*` API로 노출 가능한 구조로 설계한다.

---

## 1. 제품 개요 (Product Overview)

### 1.1 목적
복수의 AI 에이전트를 여러 메신저 플랫폼(Telegram, Slack, Discord)에서 운영하는 **범용 멀티 플랫폼 AI 조직 운영 인프라**를 구축한다. 운영자가 코딩 없이 에이전트 조직을 경영하듯 운영하는 것이 목표다.

### 1.2 사용자 모델
- **1:1 DM**: 사용자 1명 ↔ 에이전트 1기. `chat_id === user_id`. 현재 구조 그대로.
- **그룹/포럼**: N명 사용자 ↔ 에이전트. 응답은 채팅방 전체 공개. 에이전트는 `user_id`로 요청자를 식별해 맥락 파악.
- **user_id**: 어댑터가 플랫폼 사용자 ID(`from.id`)를 추출해 `payload.user_id`로 항상 포함. 에이전트까지 전달.

### 1.3 현재 상태
- Telegram 기반 MVP가 에이전트 3기(Zeus/Hera/Athena)를 통제하며 가동 중.
- Router v2 구현 완료 (55/55 테스트 통과), 실제 에이전트 연동 진행 중.

### 1.4 비범위 (Out of Scope)
- 에이전트 내부의 LLM 추론 로직 (각 에이전트 자체 책임)
- 플랫폼 SDK 저수준 연결 관리 (각 어댑터 자체 책임)
- 자동 오케스트레이션/에이전트 자동 선택 (의도적 제외)

---

## 2. 핵심 원칙 (Core Principles)

| 원칙 | 내용 |
|------|------|
| Stateless Ultra-Thin Core | 코어는 상태·파싱·LLM 0%. JSON 엔벨롭만 배달 |
| Strict Separation of Concerns | 코어=Dumb Pipe / 어댑터=Smart Edge / 에이전트=Brain |
| Universal & Dynamic | 에이전트 추가/제거는 `agents.yaml` 1곳만 수정 |
| Non-Blocking Concurrency | `Promise.allSettled` 기반 100% 병렬, 장애 격리 |
| 3-Axis Isolation | 메시지=격리 / 인격=플랫폼 초월 공유 / 지식=플랫폼 초월 공용 |
| Platform Absolute Isolation | 플랫폼 간 메시지 교차·A2A 절대 차단 |
| Event-Driven Knowledge | Wiki는 메인 파이프라인과 완전 분리된 비동기 워커 |
| Router-Owned Limits | A2A 한도는 라우터가 agents.yaml에서 강제 주입. 에이전트 제출값 무시 |
| Admin-UI Ready | 설정·상태는 `/admin/*` API로 노출 가능한 구조. UI는 세팅과 동시에 테스트 가능해야 함 |

---

## 3. 시스템 토폴로지 (Topology)

```
[ Users (1~N명) ]
   |
   v
[ Universal Adapters ] (Telegram / Slack / Discord ...)   <- Smart Edge
   |  +- context_key / persona_key / user_id 생성
   |  +- @멘션 / DM / 토픽·스레드 파싱
   |  +- UI 렌더링 (이모지/마크다운, A2A 전 과정 표시)
   v  (Standard JSON Ingress)
[ Olympus Router Core ]                                    <- Dumb Pipe
   |  +- agents.yaml 기반 to/cc 검증
   |  +- Session ID 생성/관리 (A2A 세션 식별)
   |  +- A2A 가드 (권한 / 발화자 한도 / 라운드 / 조기종료)
   |  +- Session Store (발화 카운터 서버 보관, TTL 자동 만료)
   |  +- Promise.allSettled 병렬 디스패치
   |  +- callback_url 응답 귀환 경로 (어댑터로 결과 POST)
   |  +- /admin/* 관리 API (에이전트 CRUD, 상태 조회, dry-run)
   |  +- (옵션) 전 메시지 -> /data/wiki/raw/ 드롭
   |
   +--------------+--------------+
   v              v              v
[ Agent A(to) ] [ Agent B(to) ] [ Agent C(cc, 청취전용) ]   <- Brain
   |  +- A2A 필요 시 라우터로 재진입 (_source_url 필수)
   |  +- mode(single/dialogue) 결정 책임
   |  +- over/out/resolved 신호로 종료 선언
   |
  Mem0 (agent_id, 플랫폼 초월 인격/기억)

============= Async Boundary (코어 부하 0%) =============

[ /data/wiki/raw/ ] --(watch)--> [ Gemini Wiki Engine ] --> [ Obsidian Unified KB ]

============= 관리 레이어 (향후) =============

[ Admin UI ] <--> [ /admin/* API ] <--> [ Olympus Router Core ]
   +- 에이전트 등록/수정/삭제 + 즉시 연결 테스트
   +- agents.yaml 편집 + dry-run 검증
   +- 세션/멱등성 스토어 현황 조회
   +- 에이전트별 헬스 집계 대시보드
```

---

## 4. 3축 격리 모델 (3-Axis Isolation) — 핵심 계약

### 4.1 축1 — MESSAGE (대화 메시지) · 완전 격리
- **키**: `{platform}:{space_type}:{space_id}:{topic_or_thread_id}`
- **규칙**: 모든 방이 서로 격리. 한 방의 대화 로그는 다른 방으로 절대 새지 않는다.

### 4.2 축2 — PERSONA (인격·기억) · 플랫폼 초월 공유
- **키**: `{agent_id}` (예: `zeus`)
- **규칙**: 모든 플랫폼·모든 채널에서 동일 인격.
- **저장소**: Mem0
- **중요**: 실제 채팅 로그는 공유되지 않는다. **에이전트의 "기억과 결정사항"만 이어진다.**

### 4.3 축3 — KNOWLEDGE (조직 지식) · 플랫폼 초월 공용
- **저장소**: Obsidian (Gemini가 Raw 분류/정제)
- **접근**: 에이전트는 읽기, 쓰기는 Gemini Wiki 워커 전용.

### 4.4 격리/공유 매트릭스

| 비교 상황 | 메시지(축1) | 인격(축2) | 지식(축3) |
|-----------|:---:|:---:|:---:|
| 텔레그램 그룹A ↔ 그룹B | 격리 | 공유 | 공유 |
| 텔레그램 그룹 ↔ DM | 격리 | 공유 | 공유 |
| 텔레그램 토픽1 ↔ 토픽2 | 격리 | 공유 | 공유 |
| 텔레그램 ↔ 슬랙 | 격리 | 공유 | 공유 |

### 4.5 한 줄 정의
> **메시지는 방마다 격리, 에이전트는 어디서나 하나.**

---

## 5. 플랫폼별 공간/토픽 격리 규격

어댑터가 플랫폼별로 정밀한 context_key를 생성한다. topic/thread 없으면 `root`로 정규화.

| 플랫폼 | 공간 유형 | 격리 ID | 특이사항 |
|--------|-----------|---------|---------|
| Telegram | 일반 그룹 | `chat_id` + `root` | |
| Telegram | 포럼 토픽 | `chat_id` + `message_thread_id` | General Topic(1) → `root` 정규화 |
| Telegram | DM | `chat_id` + `root` | 봇1기=에이전트1, chat_id===user_id |
| Slack | 채널 | `channel_id` + `root` | |
| Slack | 채널 스레드 | `channel_id` + `thread_ts` | |
| Discord | 일반 채널 | `channel_id` + `root` | |
| Discord | 포럼/스레드 | `parent_id` + `thread_id` | |

---

## 6. A2A (Agent-to-Agent) 규약

### 6.1 2-Mode 구조

| 모드 | 용도 | 동작 |
|------|------|------|
| `single` | 1문1답 (기본값) | 호출→응답→즉시 종료 |
| `dialogue` | 티키타카/합의 | 라운드 카운트, 조기 종료 가능 |

### 6.2 종료 조건 (우선순위 순서)
```
1. resolved/out  에이전트 결론 선언 (최우선, 조기종료)
2. round > 10    라운드 한도 (dialogue만)
3. speaker > 10  발화자 한도 (SINGLE/DIALOGUE 공통)
```

**워키토키 프로토콜 (`a2a_status`)**
```
"resolved" / "out" → 세션 종료 (동일 효력)
"continue" / undefined → 진행 계속
```

### 6.3 세션 ID & 발화 카운터

- **session_id**: 라우터가 생성하는 SSOT. 에이전트 제출 시 그대로 사용, 없으면 자동 생성: `legacy:{platform}:{context_key}:{origin_agent}`
- **session_store**: 라우터 서버 메모리. TTL 기본 1시간. 만료 시 자동 삭제.
- **limits**: `max_speaker_calls`, `max_rounds` 모두 라우터가 `agents.yaml`에서 강제 주입. 에이전트 제출값 무시.

### 6.4 호출/응답/기록 규칙

| 역할 | 응답 | Mem0 기록 |
|------|:---:|------|
| `to` | 가능 | 최종 결론만 |
| `cc` | 금지 | 미기록 |

### 6.5 권한 & 가드 (검증 순서)
```
1. 자기호출 금지
2. can_initiate, allowed_targets 검증
3. 교차플랫폼 차단
4. _source_url 스푸핑 검증 (누락 즉시 A2A_SPOOF_DETECTED)
5. resolved/out 조기종료 (최우선)
6. 라운드 한도 (dialogue)
7. 발화자 한도 (session_store 기준)
```

---

## 7. 데이터 규격 (Contracts)

### 7.1 Ingress Envelope (Adapter -> Core)
```json
{
  "context_key": "telegram:forum:C123:42",
  "routing": { "to": ["zeus"], "cc": ["athena"] },
  "memory_scope": { "space_key": "telegram:forum:C123:42", "persona_key": "zeus" },
  "payload": {
    "origin_platform": "telegram",
    "text": "@zeus 검토해줘",
    "user_id": "123456789",
    "username": "incue"
  },
  "a2a": { "enabled": false },
  "idempotency_key": "telegram:C123:42:msg_001"
}
```
> `user_id`: 어댑터가 항상 포함. DM은 `chat_id === user_id`. 그룹은 요청자 식별용.
> 응답 귀환: DM은 `user_id`로, 그룹/포럼은 `chat_id`(방 전체)로.

### 7.2 A2A Envelope — SINGLE
```json
{
  "context_key": "telegram:forum:C123:42",
  "routing": { "to": ["hera"], "cc": [] },
  "payload": {
    "origin_platform": "telegram",
    "text": "예산 잔액 알려줘",
    "user_id": "123456789",
    "_source_url": "http://127.0.0.1:9001"
  },
  "a2a": {
    "enabled": true,
    "mode": "single",
    "origin_agent": "zeus",
    "caller": "zeus",
    "session_id": "legacy:telegram:telegram:forum:C123:42:zeus",
    "parent_platform": "telegram"
  }
}
```

### 7.3 A2A Envelope — DIALOGUE
```json
{
  "context_key": "telegram:forum:C123:42",
  "routing": { "to": ["hera"], "cc": [] },
  "payload": {
    "origin_platform": "telegram",
    "text": "서버 증설 함께 결정하자",
    "user_id": "123456789",
    "_source_url": "http://127.0.0.1:9001"
  },
  "a2a": {
    "enabled": true,
    "mode": "dialogue",
    "origin_agent": "zeus",
    "caller": "zeus",
    "session_id": "legacy:telegram:telegram:forum:C123:42:zeus",
    "round": 2,
    "last_caller": "hera",
    "parent_platform": "telegram"
  }
}
```

### 7.4 Egress Envelope (Core -> Adapter)
```json
{
  "ok": true,
  "context_key": "telegram:forum:C123:42",
  "results": [
    {
      "agent": "hera",
      "status": "success",
      "response_text": "예산안 검토 완료...",
      "a2a_status": "resolved",
      "activities": [{ "tool": "terminal", "detail": "kubectl get pods" }],
      "_meta": { "persona_key": "hera" }
    }
  ],
  "a2a_termination": {
    "reason": "resolved",
    "rounds_used": 2,
    "speaker_counts": { "zeus": 2, "hera": 2 }
  }
}
```

### 7.5 config/agents.yaml
```yaml
system:
  a2a:
    max_speaker_calls: 10
    max_rounds: 10
    default_mode: "single"
    allow_self_call: false
    allow_cross_platform: false
    session_ttl_ms: 3600000
  wiki:
    raw_logging_enabled: false
    raw_path: "data/wiki/raw/"

agents:
  - id: "zeus"
    url: "http://127.0.0.1:9001"
    a2a: { can_initiate: true, allowed_targets: "*" }
  - id: "hera"
    url: "http://127.0.0.1:9002"
    a2a: { can_initiate: true, allowed_targets: "*" }
  - id: "athena"
    url: "http://127.0.0.1:9003"
    a2a: { can_initiate: true, allowed_targets: "*" }
```

---

## 8. 관리 UI 준비 설계 (Admin-UI Ready)

향후 라우터·어댑터 설정 및 관리용 UI를 붙일 것을 전제한다.
**원칙: 세팅하면서 바로 테스트할 수 있어야 한다.**

### 8.1 Admin API 네임스페이스 (`/admin/*`)

지금 당장 구현하지 않더라도, 신규 코드 작성 시 아래 엔드포인트를 붙일 수 있는 구조로 설계한다.

| 엔드포인트 | 용도 |
|-----------|------|
| `GET /admin/agents` | 등록된 에이전트 목록 + 헬스 상태 집계 |
| `POST /admin/agents` | 에이전트 등록 (yaml 반영) |
| `PUT /admin/agents/:id` | 에이전트 수정 |
| `DELETE /admin/agents/:id` | 에이전트 삭제 |
| `POST /admin/agents/:id/test` | **연결 테스트** — 저장 전 헬스체크 + ping |
| `POST /admin/dry-run` | **라우팅 dry-run** — 실제 전송 없이 라우팅 경로·에이전트 연결 검증 |
| `GET /admin/sessions` | 현재 활성 A2A 세션 목록 |
| `GET /admin/status` | 전체 컴포넌트 상태 (router/gateway/agents) |

### 8.2 Dry-run 엔드포인트 규격

```json
// POST /admin/dry-run
// Request
{
  "envelope": { ... },   // 테스트할 엔벨롭
  "options": { "check_health": true }
}

// Response
{
  "ok": true,
  "routing_resolved": { "to": ["zeus"], "cc": ["athena"] },
  "agent_health": {
    "zeus":   { "reachable": true,  "latency_ms": 12 },
    "athena": { "reachable": false, "error": "ECONNREFUSED" }
  },
  "would_dispatch": true,
  "warnings": ["athena is unreachable — cc will silently fail"]
}
```

### 8.3 설계 원칙

- **민감값 분리**: 토큰·시크릿은 yaml이 아닌 env로만. Admin API가 yaml을 읽고 쓸 수 있어도 민감값은 노출하지 않는다.
- **세팅 즉시 테스트**: URL 입력 → 저장 전 `/admin/agents/:id/test` 자동 호출. 실패 시 저장 불가.
- **상태 가시성**: session_store, idempotency_store 현재 상태를 Admin API로 조회 가능.
- **registry 런타임 재로드**: agents.yaml 변경 시 재시작 없이 반영 가능한 구조 유지.

---

## 9. 외부 지식 인프라 (참고 — 라우터/어댑터와 독립)

| 컴포넌트 | 역할 | 비고 |
|----------|------|------|
| Mem0 | PERSONA(인격/기억), `agent_id` 키 | 에이전트가 직접 연동 |
| 라우터 Raw 드롭 | 전 메시지 → `data/wiki/raw/` | 옵션(yaml 토글) |
| Gemini Wiki Engine | Raw 분류/정제 | 트리거 시점 별도 결정 |
| Obsidian | 조직 공용 지식 저장 | 플랫폼 무관 |

---

## 10. 단계별 구현 계획 (Phased Plan + Test Gates)

### Phase 0~7 ✅ (완료)
Phase 1~7 및 E2E E1~E8 전체 통과 (55/55).

### Phase 8 — Agora 동기화 (미구현)
- [ ] T5.17: session_id 없으면 라우터가 자동 생성
- [ ] T5.18: 발화 카운터를 session_store에서 관리
- [ ] T5.19: `a2a_status:"out"` → resolved와 동일 처리
- [ ] T5.20: max_speaker_calls/max_rounds agents.yaml 강제 교체
- [ ] T5.21: `_source_url` 누락 → `A2A_SPOOF_DETECTED`
- [ ] T5.22: session TTL 만료 시 자동 삭제

### Phase 9 — 다중 사용자 & Admin UI 준비 (미구현)
- [ ] T9.1: 어댑터가 `payload.user_id` 항상 추출·포함
- [ ] T9.2: DM 응답은 `user_id`로, 그룹 응답은 `chat_id`(전체)로
- [ ] T9.3: `GET /admin/agents` — 에이전트 목록 + 헬스 집계
- [ ] T9.4: `POST /admin/agents/:id/test` — 저장 전 연결 테스트
- [ ] T9.5: `POST /admin/dry-run` — 라우팅 경로 + 에이전트 연결 검증
- [ ] T9.6: `GET /admin/sessions` — 활성 A2A 세션 목록
- [ ] T9.7: `GET /admin/status` — 전체 컴포넌트 상태

---

## 11. 용어집 (Glossary)

| 용어 | 정의 |
|------|------|
| context_key | 대화 공간 고유 식별자, 메시지 격리축 |
| persona_key | `{agent_id}`, 인격/기억 식별자, 플랫폼 초월 공유 |
| user_id | 플랫폼 사용자 고유 ID. 어댑터가 추출해 payload에 포함. 에이전트 맥락 파악용 |
| session_id | A2A 세션 식별자. 라우터 SSOT. `legacy:{platform}:{context_key}:{origin_agent}` |
| session_store | 라우터 서버 메모리의 발화 카운터 보관소. TTL 자동 만료 |
| speaker_counts | 발화자별 호출 카운트 (에이전트당 최대 10회). session_store가 SSOT |
| over/out | 워키토키 프로토콜 — `a2a_status:"resolved"` 또는 `"out"` 으로 세션 종료 |
| _source_url | A2A 재진입 시 caller 필수 포함 URL. 스푸핑 방지용 |
| dry-run | 실제 전송 없이 라우팅 경로·에이전트 연결만 검증하는 테스트 모드 |
| to | 응답 의무가 있는 호출 대상 |
| cc | 청취만 하는 배경 참여자 |
| Dumb Pipe | 파싱·로직 없는 순수 라우팅 코어 |
| Smart Edge | 파싱·렌더링 담당 어댑터 |
| SSOT | 단일 진실 공급원 (이 문서 + agents.yaml) |

---

## 12. 에러 코드 목록

| 코드 | 의미 |
|------|------|
| `UNKNOWN_AGENT` | routing 대상이 registry에 없음 |
| `A2A_INITIATION_DENIED` | can_initiate:false 에이전트가 A2A 시도 |
| `A2A_UNAUTHORIZED` | allowed_targets 위반 |
| `A2A_SELF_CALL` | 자기 자신 호출 |
| `A2A_CROSS_PLATFORM_DENIED` | 플랫폼 간 A2A |
| `A2A_SPOOF_DETECTED` | `_source_url` 누락 또는 origin 불일치 |
| `A2A_SPEAKER_LIMIT_EXCEEDED` | 발화자 10회 초과 |
| `A2A_ROUND_LIMIT_EXCEEDED` | DIALOGUE 10라운드 초과 |
| `A2A_EARLY_TERMINATION` | resolved/out 정상 조기종료 |

---

## 13. 변경 이력 (Changelog)

| 버전 | 변경 내용 |
|------|-----------|
| v6.0 | 초기 V6 (Dumb Pipe, 병렬, Wiki 분리) |
| v6.1 | A2A count 방식 / 범용성 강화 / 메모리 2축 |
| v6.2 | 3축 격리 확정 / 페르소나 플랫폼 초월 / A2A 2모드 |
| v6.3 | A2A 한도 발화자 기준 / 종료 조건 3-트리거 확정 |
| v6.4 | A2A 가드 resolved 최우선 정정 / agents.yaml wiki 통일 |
| v6.5 | Phase 1~7 + E2E 완료 / callback_url 응답 귀환 / hera-webhook-adapter |
| v6.6 | Agora 동기화 — 세션ID/Session Store/워키토키/스푸핑 강화/limits 강제 주입 |
| v6.7 | 다중 사용자(user_id) / Admin UI 준비 설계(8절) / Phase 9 추가 / PRD 선행 원칙 추가 |

---

## 14. 미결 사항

| 항목 | 상태 |
|------|------|
| Phase 8 (T5.17~T5.22) | 미완 — Agora session-store 포팅 필요 |
| Phase 9 (user_id, Admin API) | 미완 — 설계 확정, 구현 대기 |
| Zeus 비서실 응답 귀환 | 진행 중 — callback 서버(8798) 실제 동작 미검증 |
| A2A 병렬 실제 검증 | mock 통과, 실제 에이전트 연동 검증 필요 |
| Athena Windows 이전 | Hostinger Docker → Windows native 예정 |
| Gemini Wiki 트리거 시점 | Wiki 설정 시점에 결정 |

---

## 15. 다음 액션

> `[작업금지] 브리핑 → 수정 → 승인` 프로토콜 유지.

1. **Phase 8** — Agora session-store.js 포팅 + _source_url 강제 + out 신호
2. **Zeus 비서실** — callback 서버 실제 동작 검증
3. **Phase 9** — user_id 어댑터 추출 + Admin API 기초 구현
4. **Athena Windows 이전**
