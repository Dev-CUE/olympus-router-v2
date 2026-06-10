# Olympus Router — PRD & Implementation Plan

> **버전**: v6.6 (Agora 동기화 — 세션ID/발화카운터/워키토키/스푸핑 강화 반영)
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

---

## 1. 제품 개요 (Product Overview)

### 1.1 목적
복수의 AI 에이전트를 여러 메신저 플랫폼(Telegram, Slack, Discord)에서 운영하는 **범용 멀티 플랫폼 AI 조직 운영 인프라**를 구축한다. 운영자가 코딩 없이 에이전트 조직을 경영하듯 운영하는 것이 목표다. 라우터는 메시지를 격리하면서, 에이전트의 인격·지식은 플랫폼을 초월해 일관되게 유지하고, 에이전트 간 협업(A2A)을 안전하게 중개한다.

### 1.2 오케스트레이션 철학
- **명시적 지시 기반**: "어느 에이전트가 무엇을 하는가"는 운영자(@멘션) 또는 개시 에이전트(A2A)가 결정한다. 라우터는 자동 일 분배를 하지 않는다(Dumb Pipe).
- 운영자가 직접 유연하게 오케스트레이션한다. 향후 역할(Role) 변경 케이스에 대비해 yaml 구조를 확장 가능하게 유지한다.

### 1.3 현재 상태
- Telegram 기반 MVP가 에이전트 3기(Zeus/Hera/Athena)를 통제하며 가동 중 (레퍼런스 환경).
- 에이전트 3기는 Mem0에 맵핑되어 있다.
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
| Router-Owned Limits | A2A 한도(max_speaker_calls, max_rounds)는 라우터가 agents.yaml에서 강제 주입. 에이전트 제출값 무시 |

---

## 3. 시스템 토폴로지 (Topology)

```
[ Users ]
   |
   v
[ Universal Adapters ] (Telegram / Slack / Discord ...)   <- Smart Edge
   |  +- context_key / persona_key 생성
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
   (라우터가 드롭)                  (트리거 시점 별도 결정)     (플랫폼 무관 조직 공용)
```

---

## 4. 3축 격리 모델 (3-Axis Isolation) — 핵심 계약

### 4.1 축1 — MESSAGE (대화 메시지) · 완전 격리
- **키**: `{platform}:{space_type}:{space_id}:{topic_or_thread_id}`
- **규칙**: 모든 방(플랫폼·채널·그룹·DM·토픽)이 서로 격리. 한 방의 대화 로그는 다른 방으로 절대 새지 않는다.

### 4.2 축2 — PERSONA (인격·기억) · 플랫폼 초월 공유
- **키**: `{agent_id}` (Mem0 현재 구조 그대로, 예: `zeus`)
- **규칙**: 모든 플랫폼·모든 채널에서 동일 인격. 텔레그램의 Zeus = 슬랙의 Zeus = 디스코드의 Zeus.
- **저장소**: Mem0
- **중요**: 실제 채팅 로그는 공유되지 않는다. **에이전트의 "기억과 결정사항"만 이어진다.**
- **근거**: 플랫폼은 언제든 변경 가능한 전제. 지식·기억은 플랫폼과 무관하게 이식되어야 함.

### 4.3 축3 — KNOWLEDGE (조직 지식) · 플랫폼 초월 공용
- **저장소**: Obsidian (Gemini가 Raw 분류/정제)
- **입력**: 라우터가 `data/wiki/raw/`에 드롭 (옵션, 플랫폼 메타데이터는 참고용으로만 보존)
- **규칙**: 모든 에이전트·모든 플랫폼 공용. 플랫폼 격리 예외(의도적).
- **접근**: 에이전트는 읽기, 쓰기는 Gemini Wiki 워커 전용.

### 4.4 격리/공유 매트릭스

| 비교 상황 | 메시지(축1) | 인격(축2) | 지식(축3) |
|-----------|:---:|:---:|:---:|
| 텔레그램 그룹A ↔ 그룹B | 격리 | 공유 | 공유 |
| 텔레그램 그룹 ↔ DM | 격리 | 공유 | 공유 |
| 텔레그램 토픽1 ↔ 토픽2 | 격리 | 공유 | 공유 |
| 텔레그램 ↔ 슬랙 | 격리 | 공유 | 공유 |
| 텔레그램 ↔ 디스코드 | 격리 | 공유 | 공유 |

### 4.5 합성 규칙
```
응답 컨텍스트 = Mem0[{agent_id}]             (플랫폼 초월 인격/기억)
              + SPACE_MEMORY[{context_key}]  (이 방의 대화 흐름)
              + Obsidian KB (읽기)           (조직 공용 지식)
```
> 라우터는 `memory_scope`로 키만 주입. 합성은 에이전트가 수행(Dumb Pipe 유지).

### 4.6 한 줄 정의
> **메시지는 방마다 격리, 에이전트는 어디서나 하나.**

---

## 5. 플랫폼별 공간/토픽 격리 규격

어댑터가 플랫폼별로 정밀한 context_key를 생성한다. topic/thread 없으면 `root`로 정규화.

| 플랫폼 | 공간 유형 | 격리 ID | 특이사항 |
|--------|-----------|---------|---------|
| Telegram | 일반 그룹 | `chat_id` + `root` | thread 없음 |
| Telegram | 포럼 토픽 | `chat_id` + `message_thread_id` | `is_forum:true` 판별. General Topic(1) → `root` 정규화. 응답 시 message_thread_id 필수 |
| Telegram | DM | `chat_id` + `root` | 봇1기=에이전트1 |
| Slack | 채널 | `channel_id` + `root` | |
| Slack | 채널 스레드 | `channel_id` + `thread_ts` | 부모 메시지 ts가 스레드 ID |
| Discord | 일반 채널 | `channel_id` + `root` | API v9+ 필요 |
| Discord | 포럼/스레드 | `parent_id` + `thread_id` | 스레드 자체가 채널 ID |

**context_key 예시**
```
telegram:group:C123:root
telegram:forum:C123:42
telegram:dm:U789:root
slack:channel:C123:171000
discord:forum:C123:C456
```

---

## 6. A2A (Agent-to-Agent) 규약

### 6.1 2-Mode 구조
모드 결정 주체는 **개시 에이전트**, 기본값은 `single`.

| 모드 | 용도 | 동작 |
|------|------|------|
| `single` | 1문1답 (빈번, 기본값) | 호출→응답→즉시 종료. 라운드 없음 |
| `dialogue` | 티키타카/합의 (가끔) | 라운드 카운트, 조기 종료 가능 |

### 6.2 종료 조건 — 3가지 트리거 (먼저 충족되는 것이 우선)

```
우선순위 순서:

1. resolved/out  에이전트가 "결론 났음" 선언      (가장 이상적, 조기종료)
2. round > 10    라운드 한도 도달 (dialogue만)    (결론 못 낸 경우)
3. speaker > 10  특정 에이전트 발화 한도 초과     (한 에이전트 독주 방어)
                 → 해당 에이전트만 개시 불가, 체인 자연 종료
```

> **발화자 기준 10회**: 에이전트 수에 관계없이 각자 공평하게 10회.
> SINGLE 무한 연쇄도 동일 규칙으로 자연 방어(별도 하드캡 불필요).

**over/out/resolved 신호 (워키토키 프로토콜)**
```
에이전트 응답의 a2a_status 필드:
- "resolved" : 합의 완료, 세션 정상 종료 (최우선)
- "out"      : resolved와 동일 효력 (에이전트가 선택적으로 사용 가능)
- undefined  : 계속 진행 (WARNING 로그 기록)
- "continue" : 계속 진행 (명시적)
```
> 워키토키 비유: resolved/out = "오버, 아웃". 신호 없으면 라운드 한도까지 진행.

### 6.3 세션 ID & 발화 카운터 (Session-Gated Counter)

**세션 ID 생성 (라우터 책임, SSOT)**
- 에이전트가 `a2a.session_id`를 제출하면 그대로 사용
- 없으면 라우터가 자동 생성: `legacy:{platform}:{context_key}:{origin_agent}`
- 세션 ID는 라우터가 생성하는 유일한 식별자. 에이전트는 수신 후 이후 요청에 포함만 하면 됨

**발화 카운터 (Session Store)**
- 라우터가 `session_store.js`에서 직접 발화 횟수 보관 (서버 메모리)
- TTL: 기본 1시간 (`system.a2a.session_ttl_ms`로 설정 가능), 만료 시 자동 삭제
- 에이전트가 보낸 `speaker_counts`는 세션 초기화 시에만 참조. 이후에는 라우터 보관값이 SSOT
- `max_speaker_calls`, `max_rounds`도 라우터가 `agents.yaml`에서 강제 주입 (에이전트 제출값 무시)

```
핵심: 에이전트는 한도를 조작할 수 없다. 라우터가 유일한 카운터 관리자.
```

### 6.4 호출/응답/기록 규칙

| 역할 | 응답 | SPACE 청취 | Mem0(PERSONA) 기록 |
|------|:---:|:---:|------|
| `to` (호출 대상) | 가능 | - | **최종 결론만** (resolved / single 응답) |
| `cc` (배경) | **금지** | **매 라운드** | 미기록 |
| 개시자 | 결과 통합 후 단일 반환 | - | 최종 결론 기록 |

- DIALOGUE 중간 라운드 발언: SPACE(대화 로그)에만, Mem0 미기록.
- cc는 매 라운드 청취하지만 게시·기록 안 함.

### 6.5 사용자 노출
A2A **전 과정**을 사용자에게 표시(어댑터 렌더링). 라운드별 발언 + 최종 결론.

### 6.6 권한 & 가드 (검증 순서)
```
1. 자기호출     (공통): self-call 금지
2. 권한         (공통): can_initiate, allowed_targets
3. 교차플랫폼   (공통): cross-platform 절대 차단
4. 스푸핑 방지  (공통): payload._source_url 필수, URL origin ↔ registry url 정확 대조
5. 조기종료     (dialogue): a2a_status == "resolved" 또는 "out" → 즉시 정상 종료 (최우선)
6. 라운드 한도  (dialogue): round <= max_rounds (라우터 yaml 기준)
7. 발화자 한도  (공통): session_store 카운터 <= max_speaker_calls (라우터 yaml 기준)
```

> **스푸핑 방지 강화**: A2A 재진입 요청은 반드시 `payload._source_url`을 포함해야 한다.
> `_source_url`의 URL origin이 registry에 등록된 caller URL의 origin과 일치하지 않으면 `A2A_SPOOF_DETECTED`.
> `_source_url` 누락도 즉시 `A2A_SPOOF_DETECTED`.

> resolved를 발화자/라운드 한도보다 먼저 체크한다. 합의가 끝났는데 한도 에러로 처리되는 것을 방지(T5.6).

### 6.7 반환 모델
**모델 A (개시자 통합)**: A2A 결과는 개시 에이전트가 받아 통합해 단일 결과로 어댑터에 반환. 라우터는 상태 비보유.
세션 종료(resolved/out) 시 라우터가 session_store에서 해당 세션 즉시 삭제.

---

## 7. 데이터 규격 (Contracts)

### 7.1 Ingress Envelope (Adapter -> Core)
```json
{
  "context_key": "telegram:forum:C123:42",
  "routing": { "to": ["zeus"], "cc": ["athena"] },
  "memory_scope": {
    "space_key": "telegram:forum:C123:42",
    "persona_key": "zeus"
  },
  "payload": {
    "origin_platform": "telegram",
    "text": "@zeus 검토해줘",
    "raw": {}
  },
  "a2a": { "enabled": false },
  "idempotency_key": "telegram:C123:42:msg_001"
}
```

### 7.2 A2A Envelope — SINGLE
```json
{
  "context_key": "telegram:forum:C123:42",
  "routing": { "to": ["hera"], "cc": [] },
  "payload": {
    "origin_platform": "telegram",
    "text": "예산 잔액 알려줘",
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
> `max_speaker_calls`, `max_rounds`는 라우터가 agents.yaml에서 주입. 에이전트가 보내도 무시.
> `_source_url`은 A2A 재진입 시 필수. 누락 시 `A2A_SPOOF_DETECTED`.

### 7.3 A2A Envelope — DIALOGUE
```json
{
  "context_key": "telegram:forum:C123:42",
  "routing": { "to": ["hera"], "cc": [] },
  "payload": {
    "origin_platform": "telegram",
    "text": "서버 증설 함께 결정하자",
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

### 7.4 Agent 응답 — 워키토키 신호
```json
{
  "ok": true,
  "response_text": "예산안 검토 완료...",
  "a2a_status": "resolved",
  "activities": [
    { "tool": "terminal", "detail": "kubectl get pods" }
  ]
}
```
> `a2a_status`: `"resolved"` 또는 `"out"` → 세션 종료. 미포함 또는 `"continue"` → 진행.

### 7.5 Egress Envelope (Core -> Adapter)
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
      "activities": [
        { "tool": "terminal", "detail": "kubectl get pods" },
        { "tool": "write_file", "detail": "budget.md" }
      ],
      "_meta": { "persona_key": "hera" }
    }
  ],
  "a2a_termination": {
    "reason": "resolved",
    "rounds_used": 2,
    "max_rounds": 10,
    "speaker_counts": { "zeus": 2, "hera": 2 }
  }
}
```

### 7.6 config/agents.yaml (단일 진실 공급원)
```yaml
system:
  a2a:
    max_speaker_calls: 10      # 발화자별 개인 한도 (SINGLE/DIALOGUE 공통, 라우터 강제 적용)
    max_rounds: 10             # DIALOGUE 라운드 한도 (라우터 강제 적용)
    default_mode: "single"     # 모드 기본값
    allow_self_call: false
    allow_cross_platform: false
    session_ttl_ms: 3600000    # 세션 TTL (기본 1시간, 만료 시 자동 삭제)
  wiki:
    raw_logging_enabled: false
    raw_path: "data/wiki/raw/"

agents:
  - id: "zeus"
    url: "http://127.0.0.1:9001"
    a2a: { can_initiate: true,  allowed_targets: "*" }

  - id: "hera"
    url: "http://127.0.0.1:9002"
    a2a: { can_initiate: true,  allowed_targets: "*" }

  - id: "athena"
    url: "http://127.0.0.1:9003"
    a2a: { can_initiate: true, allowed_targets: "*" }
```
> `allowed_targets`: `"*"`=전체 / `[]`=수신전용 / `["id"]`=지정.

---

## 8. 외부 지식 인프라 (참고 — 라우터/어댑터와 독립)

| 컴포넌트 | 역할 | 비고 |
|----------|------|------|
| Mem0 | PERSONA(인격/기억), `agent_id` 키 | 에이전트가 직접 연동 |
| 라우터 Raw 드롭 | 전 메시지 → `data/wiki/raw/` | 옵션(yaml 토글) |
| Gemini Wiki Engine | Raw 분류/정제 | 트리거 시점 별도 결정(비차단) |
| Obsidian | 조직 공용 지식 저장 | 플랫폼 무관 |

---

## 9. 단계별 구현 계획 (Phased Plan + Test Gates)

각 Phase는 Exit Criteria를 100% 통과해야 다음으로 진행.

### Phase 0 — 설계 확정 ✅
- [x] 3축 격리 모델 확정
- [x] A2A 2모드 + 발화자 기준 한도 확정
- [x] 종료 조건 3-트리거 확정
- [x] 페르소나 플랫폼 초월 공유 확정 (Mem0 agent_id)
- [x] 플랫폼별 토픽/스레드 격리 규격 확정
- [x] 세션ID/발화카운터/워키토키/스푸핑 강화 확정 (v6.6)

### Phase 1 — 코어 철거 & 동적 레지스트리 ✅
**Exit Criteria**
- [x] T1.1: yaml 에이전트 3기 → registry 3개 로드
- [x] T1.2: yaml에 4번째 추가 → 코드 무수정으로 4개 로드
- [x] T1.3: 존재하지 않는 `to:["ghost"]` → `UNKNOWN_AGENT`
- [x] T1.4: 코드 전체 grep, 에이전트 이름 하드코딩 0건
- [x] T1.5: 유효 단일 `to` → 해당 URL 패스스루 성공

### Phase 2 — 논블로킹 병렬 실행 엔진 ✅
**Exit Criteria**
- [x] T2.1: `to:[A,B,C]` 병렬 (총시간 ≈ 최장 1개)
- [x] T2.2: A 타임아웃 → B,C 정상 (장애 격리)
- [x] T2.3: `cc:[D]` → 응답 대기 없이 즉시 반환
- [x] T2.4: cc D 다운 → 메인 영향 0
- [x] T2.5: 실패 `status:"error"`, 성공 `status:"success"`

### Phase 3 — 유니버셜 스마트 어댑터 ✅
**Exit Criteria**
- [x] T3.1: 텔레그램 DM → `space_type=dm`, to=봇1기
- [x] T3.2: 텔레그램 그룹 `@hera` → `to:[hera]`, `cc:[나머지]`
- [x] T3.3: 멘션 없는 그룹 → `to:[]`, 전원 cc
- [x] T3.4: 포럼 토픽 → `telegram:forum:C:42`, 토픽1↔토픽2 격리
- [x] T3.5: General Topic(1) → `root` 정규화
- [x] T3.6: 슬랙 thread_ts / 디스코드 thread_id 정확 추출
- [x] T3.7: persona_key = `{agent_id}` (플랫폼 prefix 없음)
- [x] T3.8: activities → 이모지 렌더링
- [x] T3.9: 어댑터 코드 에이전트 이름 하드코딩 0건

### Phase 4 — 메모리 스코프 주입 (3축) ✅
**Exit Criteria**
- [x] T4.1: 그룹A 대화 → 그룹B에 raw 로그 미노출 (MESSAGE 격리)
- [x] T4.2: 슬랙 에이전트가 텔레그램 결정사항 인지 (PERSONA 공유)
- [x] T4.3: 슬랙 에이전트가 텔레그램 대화 로그는 미인지 (MESSAGE 격리)
- [x] T4.4: persona_key = `{agent_id}` (플랫폼 무관)
- [x] T4.5: cc 참여 시 persona 미기록

### Phase 5 — A2A 협업 엔진 (2모드 + 발화자 한도) ✅
**Exit Criteria**
- [x] T5.1: SINGLE zeus→hera → 즉시 종료, speaker_counts[zeus]: 1
- [x] T5.2: SINGLE 연쇄 — zeus 11번째 발화 → `A2A_SPEAKER_LIMIT_EXCEEDED` (10까지만)
- [x] T5.3: 3기 DIALOGUE — 각자 10회씩 발화 가능, 전원 10라운드 도달 ✅
- [x] T5.4: DIALOGUE 11라운드 → `A2A_ROUND_LIMIT_EXCEEDED`
- [x] T5.5: DIALOGUE 중 `status:"resolved"` → 라운드·발화 한도 전 조기종료
- [x] T5.6: resolved가 발화 한도·라운드보다 먼저 체크됨 확인
- [x] T5.7: `can_initiate:false` A2A → `A2A_INITIATION_DENIED`
- [x] T5.8: `allowed_targets` 위반 → `A2A_UNAUTHORIZED`
- [x] T5.9: 자기 호출 → `A2A_SELF_CALL`
- [x] T5.10: telegram→slack A2A → `A2A_CROSS_PLATFORM_DENIED`
- [x] T5.11: cc의 A2A 개시 → 차단
- [x] T5.12: 위조 caller 재진입 → `A2A_SPOOF_DETECTED` (`_source_url` 누락 또는 불일치)
- [x] T5.13: DIALOGUE 중간 라운드 → SPACE만 기록, Mem0 미기록
- [x] T5.14: DIALOGUE resolved → 최종 결론만 Mem0 기록
- [x] T5.15: cc가 DIALOGUE 매 라운드 청취 (게시·기록 없음)
- [x] T5.16: 모드 미지정 → 기본값 single 적용

> **미구현 (v6.6 추가 요건):**
> - [ ] T5.17: session_id 없으면 라우터가 자동 생성하여 엔벨롭에 주입
> - [ ] T5.18: 발화 카운터를 session_store에서 관리 (에이전트 제출값 아님)
> - [ ] T5.19: `a2a_status:"out"` → resolved와 동일하게 세션 종료
> - [ ] T5.20: max_speaker_calls/max_rounds는 agents.yaml 값으로 강제 교체 (에이전트 제출 무시)
> - [ ] T5.21: `_source_url` 누락 → `A2A_SPOOF_DETECTED`
> - [ ] T5.22: session TTL 만료 시 session_store 자동 삭제

### Phase 6 — 멱등성 & 장애 격리 ✅
**Exit Criteria**
- [x] T6.1: 동일 message_id 재전송 → `202 Accepted` 무시
- [x] T6.2: Wiki 워커 다운 → 메인 라우팅 정상
- [x] T6.3: 1000건 동시 인입 → 코어 블로킹 없음

### Phase 7 — 분리형 Wiki 파이프라인 ✅
**Exit Criteria**
- [x] T7.1: raw_logging_enabled=true → 메시지 Raw 드롭 (플랫폼 메타 보존)
- [x] T7.2: raw_logging_enabled=false → 드롭 안 함
- [x] T7.3: Raw 드롭이 코어 응답 지연 0
- [x] T7.4: (Wiki 설정 후) Gemini 분류 → Obsidian 병합

---

## 10. 통합 테스트 시나리오 (E2E) ✅

- [x] E1: 텔레그램 그룹 `@zeus @hera` 다중 멘션 → 병렬 응답 + athena cc 청취
- [x] E2: SINGLE A2A — zeus→hera 단일 질의 → 통합 응답, speaker_counts 정확
- [x] E3: DIALOGUE A2A 2기 — zeus↔hera 3라운드 resolved 조기종료, 전 과정 표시, 최종만 Mem0
- [x] E4: DIALOGUE A2A 3기 — zeus↔hera↔athena, 각자 10회 발화 보장
- [x] E5: 텔레그램 결정 → 슬랙 동일 에이전트 결정사항 인지(인격 공유), 로그 미노출(메시지 격리)
- [x] E6: 텔레그램 포럼 토픽1↔토픽2 대화 격리
- [x] E7: 재시도 폭격 + 에이전트 1기 다운에도 무중단
- [x] E8: 회의 종료 → Raw 드롭 → (설정 시) Gemini→Obsidian, 코어 성능 무영향

---

## 11. 용어집 (Glossary)

| 용어 | 정의 |
|------|------|
| context_key | 대화 공간 고유 식별자, 메시지 격리축 |
| persona_key | `{agent_id}`, 인격/기억 식별자, 플랫폼 초월 공유 |
| session_id | A2A 세션 고유 식별자. 라우터가 생성하는 SSOT. `legacy:{platform}:{context_key}:{origin_agent}` 형식 |
| session_store | 라우터 서버 메모리의 발화 카운터 보관소. TTL 자동 만료 |
| speaker_counts | 발화자별 개인 호출 카운트 (에이전트당 최대 10회). session_store가 SSOT |
| over/out | 워키토키 프로토콜 — `a2a_status:"resolved"` 또는 `"out"` 으로 세션 종료 선언 |
| _source_url | A2A 재진입 시 caller가 반드시 포함해야 하는 자신의 URL. 스푸핑 방지용 |
| to | 응답 의무가 있는 호출 대상 |
| cc | 청취만 하는 배경 참여자 (게시·기록 금지, 매 라운드 청취) |
| A2A SINGLE | 1문1답 즉시 종료 모드 (기본값) |
| A2A DIALOGUE | 티키타카 (최대 10라운드, resolved/out 조기종료) |
| resolved | 에이전트의 결론 선언 신호 (최우선 조기종료 트리거) |
| Mem0 | PERSONA 저장소 (인격/기억, agent_id 키) |
| Obsidian | 조직 공용 지식 저장소 (Gemini 분류) |
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
| `A2A_CROSS_PLATFORM_DENIED` | 플랫폼 간 A2A (절대 차단) |
| `A2A_SPOOF_DETECTED` | `_source_url` 누락 또는 registry URL과 origin 불일치 |
| `A2A_SPEAKER_LIMIT_EXCEEDED` | 발화자 10회 초과 |
| `A2A_ROUND_LIMIT_EXCEEDED` | DIALOGUE 10라운드 초과 |
| `A2A_EARLY_TERMINATION` | resolved/out 정상 조기종료 |

---

## 13. 변경 이력 (Changelog)

| 버전 | 변경 내용 |
|------|-----------|
| v6.0 | 초기 V6 (Dumb Pipe, 병렬, Wiki 분리) |
| v6.1 | A2A count 방식 / 범용성 강화 / 메모리 2축 |
| v6.2 | 3축 격리 확정 / 페르소나 플랫폼 초월 / Mem0·Obsidian 명시 / A2A 2모드 |
| v6.3 | A2A 한도 발화자 기준으로 변경 (에이전트당 10회, 에이전트 수 무관 공평) / 종료 조건 3-트리거 확정 (resolved > 라운드 > 발화자) |
| v6.4 | 아테나 검토 반영 — A2A 가드 검증 순서를 resolved 최우선으로 정정(T5.6 정합) / agents.yaml의 wiki를 system.wiki 하위로 통일 |
| v6.5 | Phase 1~7 + E2E 전체 구현 완료 반영 (55/55 통과) / callback_url 응답 귀환 경로 추가 / hera-webhook-adapter.py 추가 |
| v6.6 | Agora Router 동기화 — 세션ID(라우터 SSOT) / Session Store(발화카운터 서버보관, TTL) / 워키토키 프로토콜(over/out 신호) / 스푸핑 방지 강화(_source_url 필수) / 라우터 limits 강제 주입 / T5.17~T5.22 미구현 요건 명시 / 에러코드 목록 섹션 추가 |

---

## 14. 미결 사항

| 항목 | 상태 |
|------|------|
| T5.17~T5.22 구현 | 미완 — session_store, _source_url 강제, out 신호, limits 강제주입 코드 포팅 필요 |
| Zeus 비서실 응답 귀환 | 진행 중 — callback 서버(8798) 구현 완료, 실제 동작 미검증 |
| Gemini Wiki 트리거 시점 | Wiki 설정 시점에 결정 |
| A2A 역할(Role) 기반 권한 | 운영 중 결정, yaml 확장 가능하게 유지 |
| A2A 병렬 실제 검증 | mock 통과, 실제 에이전트 연동 검증 필요 |
| Athena Windows 이전 | Hostinger Docker → Windows native 예정 |

---

## 15. 다음 액션

> `[작업금지] 브리핑 → 수정 → 승인` 프로토콜 유지.

1. **T5.17~T5.22 구현** — Agora의 session-store.js 포팅 + a2a-guard.js/_source_url 강제 + out 신호 처리
2. Zeus 비서실 응답 귀환 확인 (callback 서버 실제 동작 검증)
3. A2A 병렬 실제 에이전트 연동 검증
4. Athena Windows 이전
