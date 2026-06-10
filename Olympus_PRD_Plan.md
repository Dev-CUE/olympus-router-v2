# Olympus Router — PRD & Implementation Plan

> **버전**: v6.10 (상용화 골격 — 에이전트 SDK 계약 / 멀티테넌시 키 확장 / 온보딩 흐름)
> **상태**: Phase 1~7 구현 완료 / 55/55 테스트 통과 / Phase 8~10 미구현
> **다음 메이저**: v7.0은 Pull 통신모델이 코드로 실제 전환되는 시점(Phase 10 구현 착수)에 부여한다. v6.5~v6.9는 문서상 설계 변경이며 코드는 아직 옛 구조다.
> **문서 성격**: AI 코딩 에이전트가 직접 소비하는 실행 계약서(Contract)
> **업데이트 규칙**: 이 문서가 단일 진실 공급원(SSOT). 설계 변경 시 반드시 이 파일을 먼저 갱신한 뒤 코드를 수정한다.

> ⚠️ **v6.8 확정 결정 번복 고지**: 본 버전은 이전까지 "확정/재논의 금지"로 잠겨 있던 결정 5건을 의도적으로 번복한다. 상세는 16절 참조. 하위 문서(CLAUDE.md, SKILLS.md, Dev_Enhancement_Olympus.md)는 본 버전 확정 후 정합화 대상이다(미반영 상태이면 본 PRD가 우선한다).

---

## 0. AI 에이전트용 실행 지침 (READ FIRST)

당신은 Olympus Universal Architecture를 구현하는 코딩 에이전트다. 다음 불변 원칙을 위반하는 코드는 거부된다.

1. **Dumb Pipe**: 라우터 코어는 텍스트를 파싱하지 않는다. 비즈니스 로직·LLM 호출·문자열 의도 분석 금지. 오직 JSON 엔벨롭의 목적지 검증과 패스스루만 수행한다. (v6.8: "상태 0%"는 완화되었으나 "파싱·LLM·의도분석 금지"는 불변이다.)
2. **Zero Hardcoding**: 코드 어디에도 `zeus` / `hera` / `athena` 같은 에이전트 이름을 직접 쓰지 않는다. 모든 에이전트는 `config/agents.yaml`에서만 정의되고 registry를 통해 동적 조회된다.
3. **Stage-Gated**: Phase는 순서대로 구현한다. 각 Phase는 정의된 테스트(Exit Criteria)를 100% 통과해야 다음 Phase로 진행한다.
4. **작업 프로토콜**: `[작업금지] 브리핑 → 수정 → 승인`. 코드 작성 전 반드시 브리핑하고 승인을 받는다.
5. **이 문서 우선**: 코드와 이 문서가 충돌하면 이 문서가 정답이다. 구현 중 모순 발견 시 코드를 고치지 말고 이 문서의 갱신을 먼저 제안한다.
6. **컴포넌트 독립성**: 라우터/어댑터는 Mem0·Obsidian·Gemini 등 외부 지식 인프라와 완전히 독립적이다. 라우터의 유일한 Wiki 접점은 "Raw 폴더에 드롭"(옵션)뿐이다.
7. **PRD 선행**: 작업 시작 전 이 문서 최신 버전을 확인한다. 설계 변경이 필요하면 코드보다 이 문서를 먼저 갱신한다.
8. **관리 UI 준비**: 새 코드 작성 시 향후 관리 UI가 붙을 것을 전제한다. 설정·상태·에이전트 정보는 `/admin/*` API로 노출 가능한 구조로 설계한다.
9. **Pull 통신 (v6.8)**: 라우터는 에이전트를 직접 호출(push)하지 않는다. 에이전트가 라우터로 롱폴링하여 일감을 수령하고(`GET /agents/:id/poll`), 결과를 라우터로 제출한다(`POST /agents/:id/result`). 에이전트는 라우터 URL 하나와 등록 토큰만 알면 된다.

---

## 1. 제품 개요 (Product Overview)

### 1.1 목적
복수의 AI 에이전트를 여러 메신저 플랫폼(Telegram, Slack, Discord)에서 운영하는 **범용 멀티 플랫폼 AI 조직 운영 인프라**를 구축한다. 운영자가 코딩 없이 에이전트 조직을 경영하듯 운영하는 것이 목표다.

### 1.2 사용자 모델
- **1:1 DM**: 사용자 1명 ↔ 에이전트 1기. `chat_id === user_id`. 현재 구조 그대로.
- **그룹/포럼**: N명 사용자 ↔ 에이전트. 응답은 채팅방 전체 공개. 에이전트는 `user_id`로 요청자를 식별해 맥락 파악.
- **user_id**: 어댑터가 플랫폼 사용자 ID(`from.id`)를 추출해 `payload.user_id`로 항상 포함. 에이전트까지 전달.

### 1.3 배포 모델 (v6.8 신규)
- **라우터 + 모든 어댑터**: Hostinger VPS의 Docker에서 구동. (이전: 로컬 soyo 머신 → **번복**, 16절 참조)
- **에이전트(Zeus/Hera/Athena/…)**: 위치 무관. 로컬·외부 머신·클라우드 어디든 가능. **외부 접속을 전제**한다.
- **연결 방식**: 에이전트는 라우터로 **outbound 롱폴링**만 한다. 에이전트 쪽에 inbound 포트·터널·공개주소가 필요 없다. (SSH 터널·Cloudflare Tunnel 역방향 등 에이전트측 인바운드 설정 전부 폐기)
- **외부 진입(사용자→라우터)**: 기존 frameq.io / Cloudflare Tunnel 유지.
- **VPS 사양 참고**: 4core / 8GB, 개발서버 용도. Hera 컨테이너 잔류, 라우터+어댑터 추가 여유 충분.

### 1.4 현재 상태
- Telegram 기반 MVP가 에이전트 3기(Zeus/Hera/Athena)를 통제하며 가동 중.
- Router v2 구현 완료 (55/55 테스트 통과). Phase 8~10 미구현.

### 1.5 비범위 (Out of Scope)
- 에이전트 내부의 LLM 추론 로직 (각 에이전트 자체 책임)
- 플랫폼 SDK 저수준 연결 관리 (각 어댑터 자체 책임)
- 자동 오케스트레이션/에이전트 자동 선택 (의도적 제외)

---

## 2. 핵심 원칙 (Core Principles)

| 원칙 | 내용 |
|------|------|
| Thin Core with Job Queue (v6.8) | 코어는 파싱·LLM 0%. **일감 큐(단기 상태)는 허용**. 비즈니스 로직 없음 |
| Strict Separation of Concerns | 코어=Dumb Pipe / 어댑터=Smart Edge / 에이전트=Brain |
| Universal & Dynamic | 에이전트 추가/제거는 `agents.yaml` 1곳만 수정 |
| Pull-based Dispatch (v6.8) | 라우터가 에이전트를 호출하지 않는다. 에이전트가 롱폴링으로 일감 수령 |
| Zero Agent-side Setup (v6.8) | 에이전트는 라우터 URL + 등록 토큰만 필요. inbound 설정 불필요 |
| 3-Axis Isolation | 메시지=격리 / 인격=플랫폼 초월 공유 / 지식=플랫폼 초월 공용 |
| Platform Absolute Isolation | 플랫폼 간 메시지 교차·A2A 절대 차단 |
| Event-Driven Knowledge | Wiki는 메인 파이프라인과 완전 분리된 비동기 워커. Raw 저장은 백엔드 추상화(file 기본 / sqlite 옵션) |
| Router-Owned Limits | A2A 한도는 라우터가 agents.yaml에서 강제 주입. 에이전트 제출값 무시 |
| Admin-UI Ready | 설정·상태는 `/admin/*` API로 노출 가능한 구조 |
| Agent SDK Contract (v6.10) | 에이전트는 폴링/토큰/result를 직접 짜지 않는다. SDK가 프로토콜을 감춘다 |
| Tenant-Ready Keys (v6.10) | 모든 격리 키는 향후 `tenant_id` prefix 확장이 가능하게 설계한다(지금은 단일 테넌트) |

> **Stateless 완화 명시**: 기존 "Stateless Ultra-Thin Core (상태 0%)"는 롱폴링 채택으로 폐기되고 "Thin Core with Job Queue"로 대체된다. 라우터는 에이전트별 일감 큐(단기 상태)를 보유한다. 단 텍스트 파싱·LLM 호출·의도 분석 금지는 그대로 유지된다(Dumb Pipe의 본질).

---

## 3. 시스템 토폴로지 (Topology) — v6.8 (Pull 모델)

```
[ Users (1~N명) ]
   |
   v  (frameq.io / Cloudflare Tunnel — 사용자→라우터 진입)
[ Universal Adapters ] (Telegram / Slack / Discord ...)   <- Smart Edge
   |  +- context_key / persona_key / user_id 생성
   |  +- @멘션 / DM / 토픽·스레드 파싱 / UI 렌더링
   v  (Standard JSON Ingress)
[ Olympus Router Core ]   ※ Hostinger VPS Docker        <- Thin Core + Job Queue
   |  +- agents.yaml 기반 to/cc 검증
   |  +- 에이전트별 Job Queue (일감 적재, 멱등키 드롭)
   |  +- 등록 토큰 검증 (poll/result 인증)
   |  +- Session ID 생성/관리 + Session Store (TTL)
   |  +- A2A 가드 (권한 / 발화자 한도 / 라운드 / 조기종료)
   |  +- /admin/* 관리 API
   |  +- (옵션) 전 메시지 -> Raw Sink (file/sqlite)
   |
   |  ▲ GET /agents/:id/poll   (에이전트가 일감 가져감, 롱폴링)
   |  ▲ POST /agents/:id/result (에이전트가 결과 제출 → 어댑터 전달)
   |  ※ 라우터는 에이전트를 직접 호출하지 않는다 (push 폐기)
   |
   +--------------+--------------+
   ↑              ↑              ↑   (outbound 롱폴링만, inbound 불필요)
[ Agent A(to) ] [ Agent B(to) ] [ Agent C(cc) ]   <- Brain (위치 무관)
   |  +- 라우터 URL + 등록 토큰만 보유 (또는 Agent SDK 사용)
   |  +- A2A 필요 시 라우터로 재진입 (_source_url 필수)
   |  +- over/out/resolved 신호로 종료 선언
   |
  Mem0 (agent_id, 플랫폼 초월 인격/기억)

============= Async Boundary =============
[ Raw Sink: file(JSONL) | sqlite ] --(watch)--> [ Gemini Wiki Engine ] --> [ Obsidian Unified KB ]

============= 관리 레이어 (향후) =============
[ Admin UI ] <--> [ /admin/* API ] <--> [ Olympus Router Core ]
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

### 6.6 A2A와 Pull 모델 (v6.8)
- A2A 재진입도 직접 호출이 아니라 큐 적재 + 폴링 수령으로 동작한다.
- DIALOGUE는 라운드마다 큐 적재→폴링 수령→result 제출이 반복된다. 롱폴링이므로 라운드당 지연은 최소화되나 0은 아니다. 실제 에이전트 왕복 검증 전까지 "완료"로 보지 않는다.

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

### 7.2 Job 수령 — GET /agents/:id/poll (v6.8)
에이전트가 자신의 일감을 롱폴링으로 가져간다.
```
GET /agents/zeus/poll
Authorization: Bearer <등록 토큰>

# 큐에 일감 있으면 즉시 반환:
200 { "job_id": "j_abc", "envelope": { ...Ingress Envelope... } }

# 큐 비어있으면 보류(롱폴링 타임아웃까지 대기), 만료 시:
204 No Content   # 에이전트는 즉시 재폴링
```
> 토큰 불일치/누락 → `401`. 등록되지 않은 `:id` → `404`.

### 7.3 Job 결과 — POST /agents/:id/result (v6.8)
에이전트가 처리 결과를 제출한다. 라우터가 어댑터로 전달한다.
```
POST /agents/zeus/result
Authorization: Bearer <등록 토큰>
{
  "job_id": "j_abc",
  "result": {
    "status": "success",
    "response_text": "검토 완료...",
    "a2a_status": "resolved",
    "activities": [{ "tool": "terminal", "detail": "kubectl get pods" }]
  }
}
```
> 응답 귀환은 `/result` 단일 경로로 통일. 기존 callback 서버(8798)는 폐기(16절 참조).
> 라우터는 result 수신 후 어댑터로 전달. 라우터가 Telegram API를 직접 호출하지 않는다는 원칙은 유지(어댑터가 게시).

### 7.4 A2A Envelope — SINGLE
```json
{
  "context_key": "telegram:forum:C123:42",
  "routing": { "to": ["hera"], "cc": [] },
  "payload": {
    "origin_platform": "telegram",
    "text": "예산 잔액 알려줘",
    "user_id": "123456789",
    "_source_url": "http://zeus-host:9001"
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
> `_source_url`: A2A 재진입 시 caller 자신의 URL. registry 등록 URL origin과 정확 일치해야 함. 누락 시 `A2A_SPOOF_DETECTED`.

### 7.5 A2A Envelope — DIALOGUE
```json
{
  "context_key": "telegram:forum:C123:42",
  "routing": { "to": ["hera"], "cc": [] },
  "payload": {
    "origin_platform": "telegram",
    "text": "서버 증설 함께 결정하자",
    "user_id": "123456789",
    "_source_url": "http://zeus-host:9001"
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

### 7.6 Egress Envelope (Core -> Adapter)
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

### 7.7 config/agents.yaml (v6.8)
```yaml
system:
  a2a:
    max_speaker_calls: 10
    max_rounds: 10
    default_mode: "single"
    allow_self_call: false
    allow_cross_platform: false
    session_ttl_ms: 3600000
  poll:
    long_poll_timeout_ms: 25000   # 롱폴링 보류 최대 대기 (만료 시 204)
    job_queue_ttl_ms: 600000      # 큐 일감 TTL (미수령 시 만료)
  wiki:
    raw_logging_enabled: false
    raw_backend: "file"            # (v6.9) "file" | "sqlite" — Raw 저장 백엔드 선택
    raw_path: "data/wiki/raw/"     # file 백엔드용 디렉터리
    sqlite_path: "data/wiki/raw.db"  # sqlite 백엔드용 DB 파일 경로

agents:
  - id: "zeus"
    url: "http://zeus-host:9001"      # _source_url 스푸핑 대조용 (라우터가 호출하지 않음)
    a2a: { can_initiate: true, allowed_targets: "*" }
  - id: "hera"
    url: "http://hera-host:9002"
    a2a: { can_initiate: true, allowed_targets: "*" }
  - id: "athena"
    url: "http://athena-host:9003"
    a2a: { can_initiate: true, allowed_targets: "*" }
```
> **v6.8에서 `url`의 의미 변화**: 라우터가 에이전트를 호출하던 주소 → 이제 호출하지 않으므로 호출 용도 폐기. `url`은 **A2A 재진입 시 `_source_url` origin 대조(스푸핑 방지)용 식별값**으로만 사용된다.
> **등록 토큰**: 에이전트별 토큰은 yaml이 아닌 **env**로만 관리(예: `OLYMPUS_AGENT_TOKEN_ZEUS`). yaml·API에 노출 금지.

---

## 8. 관리 UI 준비 설계 (Admin-UI Ready)

향후 라우터·어댑터 설정 및 관리용 UI를 붙일 것을 전제한다.
**원칙: 세팅하면서 바로 테스트할 수 있어야 한다.**

### 8.1 Admin API 네임스페이스 (`/admin/*`)

| 엔드포인트 | 용도 |
|-----------|------|
| `GET /admin/agents` | 등록된 에이전트 목록 + **폴링 연결 상태** 집계 |
| `POST /admin/agents` | 에이전트 등록 (yaml 반영) + 등록 토큰 발급(1회 노출) |
| `PUT /admin/agents/:id` | 에이전트 수정 |
| `DELETE /admin/agents/:id` | 에이전트 삭제 |
| `POST /admin/agents/:id/test` | **연결 테스트** — pull 모델에선 "최근 폴링 수신 여부"로 판정 |
| `POST /admin/agents/:id/token` | **토큰 재발급** — 기존 무효화 + 신규 발급(1회 노출) (v6.10) |
| `POST /admin/dry-run` | **라우팅 dry-run** — 실제 전송 없이 라우팅 경로 + 에이전트 폴링 활성 여부 검증 |
| `GET /admin/sessions` | 현재 활성 A2A 세션 목록 |
| `GET /admin/queues` | 에이전트별 큐 적재 현황 (v6.8 신규) |
| `GET /admin/status` | 전체 컴포넌트 상태 |

### 8.2 Dry-run 엔드포인트 규격 (v6.8 — 헬스 판정 기준 변경)
```json
// POST /admin/dry-run
// Request
{ "envelope": { ... }, "options": { "check_poll": true } }

// Response
{
  "ok": true,
  "routing_resolved": { "to": ["zeus"], "cc": ["athena"] },
  "agent_poll_status": {
    "zeus":   { "polling": true,  "last_poll_ms_ago": 1200 },
    "athena": { "polling": false, "note": "no recent poll — agent offline?" }
  },
  "would_enqueue": true,
  "warnings": ["athena is not polling — job will sit in queue until TTL"]
}
```
> **헬스 판정 변화 (push→pull)**: 기존 dry-run은 라우터가 에이전트로 ping(reachable) 했으나, pull 모델에선 라우터가 에이전트를 호출하지 않으므로 **"최근 폴링 수신 여부(`last_poll_ms_ago`)"** 로 살아있음을 판정한다.

### 8.3 설계 원칙
- **민감값 분리**: 토큰·시크릿은 env로만. yaml/API에 노출 금지(발급/재발급 응답에서만 1회 노출).
- **세팅 즉시 테스트**: 에이전트 등록 → `/admin/agents/:id/test`로 폴링 수신 확인.
- **상태 가시성**: session_store, job queue, idempotency_store 현황을 Admin API로 조회 가능.
- **registry 런타임 재로드**: agents.yaml 변경 시 재시작 없이 반영.

---

## 9. 외부 지식 인프라 (참고 — 라우터/어댑터와 독립)

| 컴포넌트 | 역할 | 비고 |
|----------|------|------|
| Mem0 | PERSONA(인격/기억), `agent_id` 키 | 에이전트가 직접 연동 |
| 라우터 Raw 드롭 | 전 메시지 → Raw 저장소 | 옵션(yaml 토글). 백엔드: **file 기본 / sqlite 옵션** |
| Gemini Wiki Engine | Raw 분류/정제 | 트리거 시점 별도 결정 |
| Obsidian | 조직 공용 지식 저장 | 플랫폼 무관 |

> **Raw 저장 백엔드 (v6.9)**: `raw-sink` 인터페이스 뒤에 백엔드를 교체한다. 기본 `file`(JSONL append), 옵션 `sqlite`. 어느 백엔드든 fire-and-forget·코어 블로킹 금지·컴포넌트 독립성 원칙은 유지된다.
> **DB 선택 근거**: Raw 드롭은 append 중심 + 배치 읽기, 단일 VPS, 고정 스키마(text만 비정형)다. 별도 서버가 필요한 RDB/NoSQL(PostgreSQL·MongoDB)은 "단순 운영" 의도·컴포넌트 독립성에 역행하므로 **서버리스 SQLite를 옵션 1순위**로 한다. 비정형 text는 SQLite의 TEXT/JSON 컬럼으로 충분하다. PostgreSQL(JSONB)·문서형 NoSQL은 향후 Raw를 본격 검색 인프라로 키우거나 레코드 스키마가 가변화될 경우의 **향후 가능성**으로만 열어둔다(현재 1순위 아님).
> **외부 의존 제약**: SQLite 구현 시 Node 내장 `node:sqlite`(22+) 우선. 불가 시 외부 라이브러리(`better-sqlite3`) 추가는 별도 승인 필요. SQLite는 동시 쓰기 락이 있으므로 fire-and-forget을 큐 직렬화로 처리한다.

---

## 9-A. 에이전트 SDK 계약 (v6.10 — 규격만, 구현은 Phase 11)

에이전트 개발자가 폴링 루프·토큰 헤더·`/result` 제출·재폴링을 직접 구현하지 않도록, SDK가 라우터 통신 프로토콜을 감춘다. **본 절은 계약(인터페이스)만 정의한다. 실제 SDK 코드는 Phase 11.**

### 9-A.1 SDK가 감추는 것 (에이전트 개발자가 몰라도 되는 것)
- 롱폴링 루프 (`GET /agents/:id/poll`, 204 시 즉시 재폴링)
- `Authorization: Bearer <등록 토큰>` 헤더 부착
- 결과 제출 (`POST /agents/:id/result`, `{job_id, result}`)
- A2A 재진입 시 `payload._source_url` 자동 첨부
- 네트워크 단절 시 백오프 재접속

### 9-A.2 SDK 노출 인터페이스 (언어 무관 의사 규격)
```
client = OlympusAgent({
  router_url,        // 라우터 단일 진입점 (예: https://router.frameq.io)
  agent_id,          // 이 에이전트의 id (registry 등록값과 일치)
  token,             // 등록 토큰 (env에서 주입, SDK가 헤더 처리)
  source_url         // 이 에이전트 자신의 URL (A2A _source_url 자동 첨부용)
})

client.onJob(async (envelope) => {
  // 에이전트는 일감 처리에만 집중한다. 통신은 SDK가 처리.
  return {
    status: "success",
    response_text: "...",
    a2a_status: "resolved" | "out" | "continue",
    activities: [ ... ]
  }
})

client.start()   // 폴링 시작. 이후 onJob 핸들러가 자동 호출됨.
client.stop()
```

> 에이전트는 `onJob` 핸들러만 구현하면 된다. "라우터 URL + agent_id + token + source_url" 4개 설정값이 전부.
> SDK는 핸들러 반환값을 그대로 `/result`로 제출한다. 핸들러 예외 시 SDK가 error result로 변환해 제출(라우터가 어댑터로 실패 전달).

### 9-A.3 참조 구현 & 호환
- 참조 구현 언어: **Node.js** (1차). 라우터와 동일 스택.
- 타 언어(Python 등)는 본 계약(폴링·헤더·result·_source_url)을 준수하면 호환. SDK 없이 직접 HTTP로도 동일 동작 가능(SDK는 편의 레이어일 뿐, 필수 아님).

---

## 9-B. 멀티테넌시 — 키 확장만 (v6.10 — 최소 반영, 본격 설계 아님)

> **현재는 단일 테넌트 전제.** 본격적인 멀티테넌시(테넌트별 격리·과금·권한)는 구현하지 않는다.
> 다만 **나중에 테넌트를 도입할 때 키 구조를 갈아엎지 않도록**, 격리 키에 `tenant_id` prefix를 끼울 자리만 열어둔다.

### 9-B.1 키 확장 규약 (지금은 미사용, 자리만 예약)
```
context_key  (현재) {platform}:{space_type}:{space_id}:{topic_id}
             (확장) {tenant_id}:{platform}:{space_type}:{space_id}:{topic_id}

persona_key  (현재) {agent_id}
             (확장) {tenant_id}:{agent_id}    ← 단, 플랫폼 prefix 금지 원칙은 유지

session_id   (현재) legacy:{platform}:{context_key}:{origin_agent}
             (확장) {tenant_id}:... 접두
```

### 9-B.2 최소 반영 원칙 (과설계 방지)
- 지금 코드에 `tenant_id`를 **넣지 않는다.** 단일 테넌트는 `tenant_id` 없이 동작.
- 키 생성 함수를 **prefix 주입이 가능한 형태**로만 유지한다(하드코딩된 키 조립 금지).
- 향후 도입 시: 키 생성 지점 1곳에 prefix 추가 + registry를 테넌트별로 분리. 그 외 로직 무변경이 목표.
- agents.yaml은 향후 테넌트별 파일 분리 가능하게, 단일 파일 로딩을 "디렉터리 스캔"으로 바꿀 수 있는 여지만 남긴다(지금은 단일 파일).

> 즉 v6.10은 "멀티테넌시를 한다"가 아니라 "나중에 할 때 키를 안 갈아엎는다"만 보장한다.

---

## 9-C. 온보딩 흐름 (v6.10 — Admin API 기반)

신규 에이전트를 추가 설정 없이 합류시키는 흐름. 기존 8절 Admin API + 9-A SDK를 엮는다.

```
1. [운영자] Admin에서 에이전트 생성: POST /admin/agents { id, url }
              → 라우터가 등록 토큰 발급 (env에 기록, API 응답에는 1회만 노출)
2. [운영자] 발급된 토큰을 에이전트 SDK 설정에 주입 (router_url + agent_id + token + source_url)
3. [에이전트] client.start() → 폴링 시작
4. [운영자] POST /admin/agents/:id/test → 폴링 수신 확인 (last_poll_ms_ago)
              → 수신 확인되면 "온보딩 완료". 안 되면 토큰/네트워크 점검 안내.
5. 이후 해당 에이전트는 to/cc 라우팅 대상에 자동 포함.
```

> 온보딩 성공 판정 = "최근 폴링 수신". push 모델이 아니므로 라우터가 에이전트를 부르지 않는다.
> 토큰은 발급 시 1회만 노출, 이후 조회 불가(env 보관). 분실 시 `/admin/agents/:id/token`으로 재발급.

---

## 10. 단계별 구현 계획 (Phased Plan + Test Gates)

### Phase 0~7 ✅ (완료, 단 v6.9 추가분 미구현)
Phase 1~7 및 E2E E1~E8 전체 통과 (55/55).

> **v6.9 Phase 7 추가 (미구현)** — Raw 저장 백엔드 추상화:
> - [ ] T7.5: `raw_backend:"sqlite"` → SqliteSink로 Raw 기록 (file과 동일 계약)
> - [ ] T7.6: 백엔드 토글(file↔sqlite) 전환 시 라우터 코드 무수정, fire-and-forget·코어 지연 0 유지

> ⚠️ **v6.8 영향**: Phase 2(병렬 push 디스패치) 관련 테스트는 pull 모델 전환으로 계약이 바뀐다. Phase 10 구현 시 충돌하는 기존 테스트는 1회성 수정 허용(before/after 보고 필수).

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
- [ ] T9.3: `GET /admin/agents` — 목록 + 폴링 상태 집계
- [ ] T9.4: `POST /admin/agents/:id/test` — 폴링 수신 확인
- [ ] T9.5: `POST /admin/dry-run` — 라우팅 경로 + 폴링 활성 검증
- [ ] T9.6: `GET /admin/sessions` — 활성 A2A 세션 목록
- [ ] T9.7: `GET /admin/status` — 전체 컴포넌트 상태

### Phase 10 — Pull 통신 모델 전환 (v6.8 신규, 미구현)
- [ ] T10.1: 에이전트 토큰으로 `GET /poll` → 큐 비면 보류(204), 일감 들어오면 즉시 반환
- [ ] T10.2: 잘못된/누락 토큰 폴링 → `401`
- [ ] T10.3: 라우터가 에이전트 inbound 없이 일감 전달 (직접 push 호출 코드 제거 확인)
- [ ] T10.4: `POST /result` → 어댑터로 결과 전달, 텔레그램 게시 (callback 8798 미사용 확인)
- [ ] T10.5: 큐 적재 시 idempotency_key 적용 — 중복 일감 드롭
- [ ] T10.6: 라우터 재시작 시 큐 휘발 허용 (느슨한 멱등성, 기존 결정과 정합)
- [ ] T10.7: A2A 재진입도 폴링 경로로 동작 (DIALOGUE 라운드 큐 적재→수령→result)
- [ ] T10.8: 등록 안 된 agent_id 폴링 → `404`
- [ ] T10.9: 큐 일감 TTL 만료 → 미수령 일감 제거 + warning 로그
- [ ] T10.10: (실연동) 실제 에이전트 1기 DM/그룹 실메시지 왕복 — mock 통과는 완료 불인정

### Phase 11 — 상용화 골격 (v6.10 신규, 미구현)
- [ ] T11.1: 에이전트 SDK(Node) — connect/onJob/start로 폴링·토큰·result 자동 처리
- [ ] T11.2: SDK가 핸들러 예외를 error result로 변환·제출
- [ ] T11.3: SDK가 A2A 재진입 시 `_source_url` 자동 첨부
- [ ] T11.4: SDK 없이 직접 HTTP로도 동일 계약 동작 (호환성)
- [ ] T11.5: 키 생성 함수가 tenant_id prefix 주입 가능한 구조 (단일 테넌트는 prefix 없이 동작)
- [ ] T11.6: 온보딩 — POST /admin/agents 시 토큰 발급(1회 노출), /admin/agents/:id/test로 폴링 수신 확인
- [ ] T11.7: 토큰 재발급 — 분실 시 기존 무효화 + 신규 발급

---

## 11. 용어집 (Glossary)

| 용어 | 정의 |
|------|------|
| context_key | 대화 공간 고유 식별자, 메시지 격리축 |
| persona_key | `{agent_id}`, 인격/기억 식별자, 플랫폼 초월 공유 |
| user_id | 플랫폼 사용자 고유 ID. 어댑터가 추출해 payload에 포함 |
| session_id | A2A 세션 식별자. 라우터 SSOT |
| session_store | 라우터 서버 메모리의 발화 카운터 보관소. TTL 자동 만료 |
| job queue | (v6.8) 에이전트별 일감 적재 큐. 에이전트가 폴링으로 수령. 단기 상태 |
| poll | (v6.8) 에이전트가 라우터로 일감을 가져가는 롱폴링 요청 (`GET /agents/:id/poll`) |
| result | (v6.8) 에이전트가 라우터로 결과를 제출하는 요청 (`POST /agents/:id/result`) |
| 등록 토큰 | (v6.8) 에이전트가 poll/result 시 제시하는 인증 토큰. env로만 관리 |
| raw-sink | (v6.9) Raw 저장 백엔드 추상화 인터페이스. file/sqlite 교체 가능 |
| Agent SDK | (v6.10) 폴링·토큰·result·_source_url을 감추는 에이전트측 편의 레이어. 필수 아님(직접 HTTP 가능) |
| tenant_id | (v6.10) 향후 멀티테넌시용 격리 prefix. 현재 미사용, 키 확장 자리만 예약 |
| 온보딩 | (v6.10) 에이전트 등록→토큰 발급→SDK 주입→폴링 확인 흐름 |
| speaker_counts | 발화자별 호출 카운트 (에이전트당 최대 10회). session_store가 SSOT |
| over/out | 워키토키 프로토콜 — `a2a_status:"resolved"` 또는 `"out"` 으로 세션 종료 |
| _source_url | A2A 재진입 시 caller 필수 포함 URL. 스푸핑 방지용 |
| dry-run | 실제 전송 없이 라우팅 경로·폴링 활성 여부만 검증하는 테스트 모드 |
| to / cc | 응답 의무 대상 / 청취만 하는 배경 참여자 |
| Dumb Pipe | 파싱·로직 없는 순수 라우팅 코어 (v6.8: 큐 상태는 허용) |
| Smart Edge | 파싱·렌더링 담당 어댑터 |
| SSOT | 단일 진실 공급원 (이 문서 + agents.yaml) |

---

## 12. 에러 코드 목록

| 코드 | 의미 |
|------|------|
| `UNKNOWN_AGENT` | routing 대상이 registry에 없음 |
| `UNKNOWN_JOB` | (v6.8) result 제출 시 미발급/소비된 job_id |
| `UNAUTHORIZED_POLL` | (v6.8) poll/result 토큰 누락·불일치 (HTTP 401) |
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
| v6.8 | **대규모 설계 전환** — 라우터+어댑터 VPS Docker 이전 / push→pull(롱폴링) 통신모델 / 에이전트 등록 토큰 / 결과 귀환 `/result` 통일(callback 8798 폐기) / Stateless 0% → Thin Core with Job Queue 완화 / SSH·Tunnel 역방향 등 에이전트측 inbound 폐기 / Phase 10 추가 / 확정결정 5건 번복(16절) |
| v6.9 | Raw 저장 백엔드 추상화(raw-sink) — file 기본 / sqlite 옵션. DB 1순위 SQLite(서버리스), PostgreSQL·NoSQL은 향후 가능성. node:sqlite 우선·외부의존 별도승인. Phase 7에 T7.5/T7.6 추가. 다음 메이저 v7.0은 Pull 코드 구현 시점 명시 |
| v6.10 | 상용화 골격 — 에이전트 SDK 계약(9-A, 규격만) / 멀티테넌시 키 확장 최소반영(9-B, tenant_id 자리만 예약·본격설계 아님) / 온보딩 흐름(9-C) / Phase 11(T11.1~T11.7) 추가. 원칙표에 Agent SDK Contract·Tenant-Ready Keys 추가. 에러코드에 UNKNOWN_JOB·UNAUTHORIZED_POLL 정합 / Admin에 토큰 재발급 엔드포인트 추가 |

---

## 14. 미결 사항

| 항목 | 상태 |
|------|------|
| Phase 8 (T5.17~T5.22) | 미완 — Agora session-store 포팅 필요 |
| Phase 9 (user_id, Admin API) | 미완 — 설계 확정, 구현 대기 |
| Phase 10 (Pull 통신 전환) | 미완 — v6.8 신규, 구현 대기 |
| Phase 11 (상용화 골격) | 미완 — SDK·멀티테넌시 키·온보딩. 단 코드 우선순위는 Phase 8~10(실구현·보안) 이후 |
| 하위 문서 정합화 | 완료 — CLAUDE.md / SKILLS.md / Harness / README v6.8~v6.9 반영, Dev_Enhancement 별도 산출 |
| A2A 병렬 실제 검증 | mock 통과, 실제 에이전트 연동 검증 필요 |
| Athena Windows 이전 | 위치 무관(pull)이라 제약 완화. 단 실연동 검증 필요 |
| Gemini Wiki 트리거 시점 | Wiki 설정 시점에 결정 |
| 등록 토큰 발급/배포 절차 | 미정 — env 키 네이밍·로테이션 정책 필요 |
| Raw SQLite 외부 의존 결정 | 미정 — node:sqlite(내장) vs better-sqlite3(외부). 내장 우선, 외부는 승인 필요 |
| 멀티테넌시 본격 설계 | 보류 — v6.10은 키 확장 자리만. 테넌트별 격리·과금·권한은 별도 결정 |

---

## 15. 다음 액션

> `[작업금지] 브리핑 → 수정 → 승인` 프로토콜 유지.

1. **Phase 10** — Job Queue + poll/result 엔드포인트 + 등록 토큰 검증 구현 (착수 시 v7.0 부여)
2. **Phase 8** — Agora session-store 포팅
3. **Phase 9** — user_id 어댑터 추출 + Admin API
4. **Raw 백엔드** — SqliteSink 구현 (T7.5/T7.6), node:sqlite 가용성 확인
5. **VPS Docker 이전** — Dockerfile + docker-compose (라우터+어댑터)
6. **보안 [구현필요]** — 토큰↔agent_id 바인딩, job_id 대조, DoS 상한, Admin 인증 (Dev_Enhancement 보안 섹션)
7. **Phase 11** — 에이전트 SDK + 온보딩 (실구현·보안 이후)
8. **실연동 검증** — 실제 에이전트 1기 폴링 왕복 (T10.10)

---

## 16. v6.8 확정 결정 번복 기록 (Decision Reversal Log)

이전까지 "확정/재논의 금지/핵심 제약"으로 잠겨 있던 결정 5건을 본 버전에서 의도적으로 번복한다. 사유: 라우터·어댑터를 외부 접속 가능한 VPS로 이전하고, 에이전트가 어디 있든 추가 설정 없이 합류할 수 있게 하기 위함.

| # | 기존 확정 결정 | v6.8 번복 후 | 사유 |
|---|------|------|------|
| R1 | Olympus Router는 로컬(soyo)에서 실행, Hostinger VPS 아님 | 라우터+어댑터를 Hostinger VPS Docker로 이전 | 외부 접속·범용 운영 전제 |
| R2 | 라우터가 에이전트를 직접 호출(push), 202 즉시 반환 후 dispatch | push 폐기, 에이전트가 롱폴링으로 일감 수령(pull) | 에이전트측 inbound 설정 제거 |
| R3 | Stateless Ultra-Thin Core — 코어 상태 0% | Thin Core with Job Queue — 일감 큐(단기 상태) 허용 | pull 모델은 큐 보유 불가피. 파싱·LLM 금지는 유지 |
| R4 | Hera는 SSH 터널(port 9002)로 연결 | SSH 폐기, 모든 에이전트 outbound 롱폴링으로 통일 | SSH는 사전 키 교환 필요, 외부·무설정 전제에 부적합 |
| R5 | 응답 귀환은 callback 서버(8798) 방식 | `/result` 단일 경로로 통일, 8798 폐기 | 에이전트가 라우터 URL 하나만 알면 되도록 |

> 본 번복은 운영자(CUE) 승인 하에 이루어졌다. 하위 문서가 아직 기존 기술을 담고 있으면 본 PRD가 우선한다.
