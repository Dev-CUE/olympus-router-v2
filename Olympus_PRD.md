# Olympus Router — PRD (설계 계약)

> **버전**: v6.13 | **성격**: 증류본 — 확정 설계만 수록, 이력·검토경로 없음. **이 문서가 설계 SSOT다.**
> **갱신 규칙**: 설계 변경은 킵 프로토콜(브리핑→CUE "킵" 승인)로 이 문서를 직접 갱신한다.
> **구현 계획·테스트·진행 상태**: `Olympus_Plan.md` 참조. **일하는 방법**: `Olympus_Session_Protocol.md` 참조.
> **구버전·이력**: `Olympus_PRD_Plan.md`(아카이브)와 git history가 보존한다. 이 문서에서 찾지 마라.
> ⚠️ 설계 vs 코드 갭: 코드는 ~v6.4 수준(push/callback). 본 문서는 설계 기준이다.

---

## 1. 제품 개요

### 1.1 목적
복수의 AI 에이전트를 여러 메신저 플랫폼(Telegram/Slack/Discord)에서 운영하는 범용 멀티플랫폼 AI 조직 운영 인프라. 운영자(CUE)가 최초 지시·최종 확인만 하고 나머지는 에이전트 조직이 처리한다. B2B 상용화 염두(SDK·온보딩·테넌시·보안감사·데이터 보존이 그 포석).

### 1.2 사용자 모델
- **1:1 DM**: 사용자 1명 ↔ 에이전트 1기. `chat_id === user_id`.
- **그룹/포럼**: N명 ↔ 에이전트. 응답은 방 전체 공개. `payload.user_id`로 요청자 식별.
- 응답 귀환: DM은 user_id로, 그룹은 chat_id(방 전체)로.

### 1.3 배포 모델
- 라우터 + 어댑터: Hostinger VPS Docker.
- 에이전트: 위치 무관. **outbound 연결만**(SSE 수신 + result 제출). 에이전트측 inbound 포트·터널 불필요.
- 외부 진입(사용자→라우터): Cloudflare Tunnel.

### 1.4 비범위
에이전트 내부 LLM 추론 / 플랫폼 SDK 저수준 관리 / 자동 오케스트레이션(의도적 제외) / 대고객 서비스 계층(회원·결제·구독·플랜·과금·관리 UI — 서브프로젝트, 20절).

---

## 2. 핵심 원칙

| 원칙 | 내용 |
|------|------|
| Dumb Pipe (Thin Core + Job Queue) | 코어는 파싱·LLM·의도분석 0%. 목적지 검증+큐+패스스루. 일감 큐(상태)는 허용 |
| Zero Hardcoding | 에이전트 이름을 코드에 쓰지 않음. agents.yaml + registry 동적 조회만 |
| Stage-Gated (의존성 기준) | Phase 번호는 역사적 도입순일 뿐, **구현 게이트는 의존성 순**(Plan 1절). Exit Criteria 100% 후 다음 |
| 컴포넌트 독립성 | 라우터는 Mem0/Obsidian/Gemini/Telegram을 직접 호출하지 않음. 알람·배치·wiki는 별도 워커 |
| Push-based Delivery (SSE) | 에이전트는 SSE 스트림으로 일감 수신, POST로 결과 제출. 라우터가 에이전트를 직접 호출하지 않음 |
| 3-Axis Isolation | 메시지=방마다 격리 / 인격=플랫폼 초월 공유 / 지식=조직 공용 |
| Platform Absolute Isolation | 플랫폼 간 메시지 교차·A2A 절대 차단 |
| Router-Owned Limits | A2A 한도는 라우터 DB가 SSOT. **에이전트 제출값 무시** |
| Tenant-Always-Prefix | 모든 격리 키에 tenant_id prefix 상시 적용. 단일 테넌트=`default` |
| mock 통과 ≠ 완료 | 실제 에이전트 왕복 검증 전까지 완료 선언 금지 |

> **Olympus A2A ≠ Google A2A**: 독자 규격. Google/Linux Foundation A2A 표준과 별개. 외부 에이전트 연동 필요 시 호환 레이어 검토(22절 미결).

---

## 3. 시스템 토폴로지

```
[ Users ] → (Cloudflare Tunnel) → [ Adapters ] (Smart Edge: 파싱·context_key·렌더링)
   → JSON Ingress → [ Router Core ] (VPS Docker)
        검증(to/cc) · Job Queue(SQLite) · 인증 · 세션 · A2A 가드 · egress FIFO
        · rate limit/quota · /metrics · /admin/* · (옵션) Raw/audit sink
   ⇄ 에이전트: GET /agents/:id/events (SSE 수신) + POST /agents/:id/result (제출)
        — outbound only, 위치 무관

비동기 워커 (라우터와 분리, 원칙 6):
  Raw Sink → Gemini Wiki 워커 → Obsidian
  관측 워커 (지표 수집·알람 판정·Telegram 발신)
  배치 워커 (보존 만료 삭제·해지 연쇄 삭제)
  배치 감사 워커 (audit 보고서)
```

---

## 4. 3축 격리 + tenant 키 + 메모리 라이프사이클

### 4.1 3축 격리

| 축 | 키 | 동작 |
|----|----|------|
| MESSAGE | `{tenant_id}:{platform}:{space_type}:{space_id}:{topic_id}` | 방마다 완전 격리 |
| PERSONA | `{tenant_id}:{agent_id}` | 플랫폼 초월 공유 (Mem0). **플랫폼 prefix 금지** |
| KNOWLEDGE | Obsidian | 조직 공용 |

한 줄: **메시지는 방마다 격리, 에이전트는 어디서나 하나. DM은 사적(Mem0), 회의는 조직(Obsidian).**
- persona는 **플랫폼은 초월(공유)하되 tenant는 격리** — 다른 축이다.

### 4.2 tenant 키 계약
- **항상 prefix.** 단일 테넌트는 고정값 `tenant_id="default"`. 조건 분기 없음. tenant 도입 시 default만 실제 id로 치환, 코드 변경 0.
- 형식: URL-safe(영숫자+하이픈), `:` 금지, 예약어(`system` 등) 금지.
- 출처: 현 단계 고정 주입. 향후 토큰(8절)에서 도출 — 바인딩은 대고객 서브프로젝트 책임. 코어는 키 규칙만.
- 격리 의미: tenant 간 완전 격리(메시지·세션·quota·큐). tenant_id가 모든 격리 키의 최상위 prefix이자 수평 분할 1순위 샤딩 축(15절).
- 근거: v1 호환 불필요(미사용 종료) → 분기 없는 일관 키가 우월. (기각: 생략 후 추가 방식)

### 4.3 메모리 라이프사이클
```
[DM (1:1)]            → Mem0 (사적 보좌)              [Raw 드롭 스킵]
[DM 외 (그룹/포럼/A2A)] → Raw 드롭 → Gemini 워커 → Obsidian (조직 지식, eventual)
[인격 자체]            → 항상 Mem0 (공간 무관 동일 인격)
[응답 합성]            → Mem0 + Obsidian(읽기) + SPACE_MEMORY[context_key]
```
- 판정: `space_type === "dm"` 매칭만(어댑터 생성값, Dumb Pipe 유지).
- DM발 조직급 결정 승격 없음(의도적 단순화 — 승격 판정은 파싱/LLM이라 위반).
- **기억 소유자 태깅**: Mem0 metadata에 user_id 태깅 + 합성 시 요청자 기억만 필터. persona_key 불변.
- 연속성: DM의 에이전트가 Obsidian을 읽어 회의 결정을 알고 이어감. 반영은 eventual(16절 SLA).
- 근거: DM=사적 보좌(개인), 회의=조직 자산 — 성격이 다르면 저장소가 다름. (기각: 전부 Mem0/전부 Obsidian, 공간별 인격 분리, 라우터 직접 쓰기)

---

## 5. 플랫폼별 공간/토픽 규격

어댑터가 context_key 생성(tenant prefix 포함). topic/thread 없으면 `root`.

| 플랫폼 | 공간 | 격리 ID | 특이사항 |
|--------|------|---------|---------|
| Telegram | 그룹 | chat_id + root | |
| Telegram | 포럼 토픽 | chat_id + message_thread_id | General Topic(1)→root |
| Telegram | DM | chat_id + root | chat_id===user_id |
| Slack | 채널 / 스레드 | channel_id + root / thread_ts | |
| Discord | 채널 / 포럼·스레드 | channel_id + root / parent_id + thread_id | |

---

## 6. 전송 계층 — SSE + POST

- **deliver**: `GET /agents/:id/events` — SSE 스트림. 라우터가 일감을 push.
- **submit**: `POST /agents/:id/result` — 결과 제출.
- 계약 필수: 하트비트(주석 라인, 15~30s 권고) / 클라이언트 수신 타임아웃 / `Last-Event-ID` 재전달 / 이벤트마다 flush·압축 비활성.
- event_id = 에이전트별 단조 시퀀스. 재접속 시 Last-Event-ID 기준 유실 delivered만 재push. **Last-Event-ID 미제출 = 신규 시작 → delivered 전체 재push + lease 갱신.**
- SSE 스트림 agent당 1개 — 중복 접속 시 신규가 기존 대체.
- SSE 이벤트 타입: `job`(to — result 의무·lease) / `listen`(cc — fire-and-forget).
- 검증 필수: Cloudflare Tunnel SSE 통과 + 유휴 연결 유지(실연동).
- 근거: 트래픽이 단방향 push+제출 구조라 양방향(WS) 불필요, Node 내장(의존성 0), push 지연 WS 동등. (기각: WS=외부 의존+사용처 없는 양방향 / 롱폴링=A2A 왕복당 ~12.5s 지연)

---

## 7. Job Queue · 전달 보장

### 7.1 상태머신 (durable)
**상태 6종**: queued / delivered / completed / failed / expired / dead_letter
```
enqueue → queued ──[SSE push]──→ delivered (lease)
delivered ──[result success]──→ completed     ──[result error]──→ failed
delivered ──[lease_timeout]──→ queued (redeliver_count++)
queued ──[redeliver > max]──→ dead_letter     ──[job_ttl 경과]──→ expired
queued 상태에서도 result 수신 → completed (재전달 경쟁 처리)
```
- 종결 상태 전이 없음. 종결 job에 지각 result → `UNKNOWN_JOB` 거부+로그.
- expired/dead_letter 진입 시 어댑터로 실패 통지(`JOB_EXPIRED`/`JOB_DEAD_LETTER`).
- jobs 스키마: job_id, agent_id, context_key, status, egress_status, egress_id, platform_message_id, redeliver_count, created_at, updated_at. 보존 `completed_retention_h`(기본 72h), 청소 시 동반 소멸.
- 영속: SQLite(14절 저장소 인터페이스 경유). 재시작 시 queued 복원, delivered→queued 회수.
- listen(cc) 생명주기: queued→delivered→완료. lease·재전달·dead_letter 없음, 만료 시 통지 없이 expired.

### 7.2 Egress 계약 (라우터→어댑터)
- 흐름: POST /result → 영속화 후 200 → 비동기 egress → POST {adapter_url}/egress.
- ACK 동기: 어댑터 200 = 플랫폼 게시 완료 + platform_message_id(jobs 기록 → 재발사 차단).
- 재시도: 5xx/timeout만 [1,4,16,60,120]s. 4xx 즉시 실패. egress_id(job_id 파생) dedup.
- 순서: 동일 context_key FIFO 직렬, 타 context 병렬.
- 인증: 어댑터별 shared secret(env) 헤더, fail-closed.
- **at-least-once 명문화**: 게시→dedup 커밋→ACK 사이 어댑터 사망 시 잔여 중복 게시 가능. 어댑터 dedup 영속화로 최소화하되 exactly-once는 불가.

### 7.3 플랫폼별 내구성 (어댑터 다운 시)
Telegram ~24h 보존·유실 없음 / Slack 수 분 내 3회 재시도 후 드롭 / Discord resume 윈도우 초과 시 유실.

---

## 8. 인증 · 신원

### 8.1 등록 토큰
- opaque random 256-bit (`crypto.randomBytes(32)` base64url). (기각: JWT)
- 라우터는 SHA-256 해시만 저장(tokens 테이블). 평문은 발급 응답 1회 노출. env는 에이전트측 보관 규칙.
- 검증: Bearer ↔ 해시 ↔ agent_id 3중 대조. URL :id ≠ 토큰 agent_id → 401.
- **fail-closed**: 저장소 공백/초기화 실패 → 전 요청 거부. 무인증은 `auth.mode: disabled` 명시+기동 경고.
- 로테이션: grace period(기본 24h) 병행 유효 후 자동 삭제. 즉시 차단=grace 0.
- DoS: 실패 카운터 임계 초과 429 / result 본문 상한 1MB(413).

### 8.2 A2A 신원 — 토큰 바인딩
- **caller := Bearer 토큰에서 도출. 자기신고 폐기.** envelope.a2a.caller ≠ 토큰 agent_id → `A2A_SPOOF_DETECTED`.
- `_source_url` / agents.yaml `url` 필드 / SDK source_url — **전부 삭제.** SDK 필수 설정 3개(router_url, agent_id, token).
- A2A 재진입 전용 엔드포인트: `POST /agents/:id/a2a` (Bearer).

---

## 9. A2A 규약

### 9.1 모드
| 모드 | 용도 | 동작 |
|------|------|------|
| `single` (기본) | 1문1답 | 호출→응답→즉시 종료 |
| `dialogue` | 티키타카/합의 | resolved/out 또는 발화 한도까지 반복 |

**라운드 개념 없음.** 발화 횟수(speaker_counts)만 라우터가 통제한다. round 필드·max_rounds·라운드 한도는 존재하지 않는다.

### 9.2 종료
- **종료 사유 판정 우선순위**: `resolved/out > speaker_limit` (+TTL expired)
- 워키토키: `a2a_status: "resolved"|"out"` → 종료(동일 효력) / `"continue"|undefined` → 진행.
- **resolved 내용 중립**: 채택·기각·보류·폐기 전부 "결론"이다. 성공 시에만이 아님.
- 종료 마커 reason 4종: `resolved | out | speaker_limit | expired`.

### 9.3 가드 검증 순서 (종료 사유 우선순위와 다른 축 — 혼동 금지)
```
0. 인증 (Bearer 토큰 유효 → caller 확정)
1. SPOOF (자기신고 caller ↔ 토큰 불일치)
2. 자기호출 금지
3. 권한 (can_initiate, allowed_targets)
4. 교차플랫폼 차단
5. resolved/out 평가 → 정상종료 분기
6. 발화자 한도 (speaker_counts)
```
"resolved 최우선"은 종료 사유 판정 축에서만. 가드는 보안(0~4) 먼저 통과 후 resolved(5) 평가.

### 9.4 세션 신뢰 모델
- session_id: **라우터 단독 ULID 발급.** 에이전트가 만들 수 없다.
- 검증 3중: ①`A2A_INVALID_SESSION`(not_found|expired|closed) ②`A2A_NOT_PARTICIPANT` ③context_key 불일치.
- 레코드: session_id, context_key, origin_agent, participants[{agent_id, role}], mode, speaker_counts, status, created_at, last_activity, topic, parent_session_id, tenant_id.
- **SSOT: speaker_counts = 세션 레코드(DB). 에이전트 제출값 무시.**
- 영속: SQLite sessions 테이블. 재시작 복구 트랜잭션 포함.
- TTL: sliding idle 1h + absolute cap 24h. 만료 → `A2A_SESSION_EXPIRED` 통지.
- **세션 재개 없음**: 재오픈 기각(신뢰 모델 손상). 후속 세션 + parent_session_id + topic(의무). 카운터 리셋. Gemini가 "재개된 회의"로 연결 지식화.

### 9.5 cc (배경 청취자)
- SSE `listen` 타입 수신. 응답 금지 — listen job_id로 result 제출 → `CC_RESPONSE_FORBIDDEN`.
- cc role로 세션 재진입 → `A2A_INITIATION_DENIED`. 무관한 신규 개시는 can_initiate만 적용.
- persona_key null, Mem0/Obsidian 미기록. 청취는 비차단.

### 9.6 기록 규율
- **A2A 세션 진행 중: persona_key 전 구간 null** (중간 발언 미기록).
- 종료 시: origin이 종료 결과 전체 적립(결론+미결+사유) — SDK 계약, 강제 불가하므로 계약+테스트로 보장.
- 기록처는 공간 분기: DM이면 Mem0 / 그룹·포럼·A2A면 Obsidian(Raw→Gemini, eventual).
- Gemini 분류: resolved/out → 결론 지식화 / speaker_limit·expired → 미결 안건 기록(안건·참여자·사유).

---

## 10. 재시작·복구 프로토콜

**불변식**: 모든 경계 = (재시도+멱등) 쌍 → 유실 0·중복 0·수동 0.

**라우터 부팅 시퀀스**:
```
1. config fail-fast
2. SQLite quick_check (실패=기동 중단+알림, 자동 재생성 금지)
2-b. user_version 마이그레이션 게이트
3. 복구 트랜잭션 (단일 원자): delivered→queued 회수(redeliver_count++) / active 세션 복원 / egress pending→재시도 큐 복원
4. audit 준비 (closed 모드면 필수)
5. /ready 선언 (이전 ingress 503; /health와 분리)
6. SSE 수용 (Last-Event-ID 기준 재push)
7. egress FIFO 재개
```

**어댑터**: env fail-fast → dedup 영속 오픈 → 플랫폼 재연결 → ingress·egress 재개. 어댑터도 /ready 노출 — ready 전 egress는 503 → 라우터 재시도로 흡수. 어댑터는 무상태, 재동기화 핸드셰이크 불요.
**라우터 다운 시**: 어댑터 ingress 재시도 백오프 최대 5분.
**SDK result 재시도**: 백오프 + job_id 멱등.
**기동 순서**: 라우터 ready → 어댑터 권장(compose healthcheck). 어긋나도 재시도로 흡수.

---

## 11. Admin API

- 바인딩: `127.0.0.1:8800` 기본. 외부 노출은 expose:true + Cloudflare Access 전제.
- 인증: 8.1 재사용 + 별도 tokens_admin 테이블. admin 토큰 0개 → 전체 거부. 부트스트랩은 로컬 CLI 1회 발급.
- scope: `read`(GET+dry-run) / `write`(POST·PUT·DELETE). (기각: RBAC)
- 세션 조회는 메타만 — admin read ≠ 대화 열람권.
- yaml 쓰기는 API 우선. 직접 수정 시 `POST /admin/reload` 필요.
- write 호출 → audit admin 이벤트 기록(17절).
- 엔드포인트: GET/POST /admin/agents, PUT/DELETE /admin/agents/:id, POST /admin/agents/:id/test(최근 SSE 연결 여부로 판정), POST /admin/agents/:id/token(재발급), POST /admin/dry-run, GET /admin/sessions, GET /admin/queues, GET /admin/status, POST /admin/reload.
- **서비스 계층 연동 확장** (설계 확정 06-12, 구현 게이트 별도 — 계약 상세 `Olympus_Service_Layer.md`):
  - `PUT /admin/tenants/:id/limits` — rate/quota/retention override 주입 (write)
  - `POST /admin/tenants/:id/deletion` / `DELETE /admin/tenants/:id/deletion` — pending_deletion 마킹 / 철회 (write)
  - `GET /admin/usage?tenant&from&to` — 건수 집계 조회 (read)
  - `POST /admin/batch-jobs` / `GET /admin/batch-jobs` — 배치잡 스펙 생성(→yaml→배치 워커 폴링) / 이력 (write/read)
  - **tenant CRUD는 없음** — tenant 레코드 SSOT는 서비스 계층, 코어는 키 규칙(4.2)만 적용.
- 온보딩 흐름: 에이전트 생성→토큰 발급(1회 노출)→SDK 주입→SSE 접속 확인→완료.

---

## 12. Rate Limit · Quota

> 인프라 가용성 보호. 보안 게이트 아님(인증과 레이어 구분).

- 키: `{tenant_id}:{agent_id}` (단일=default:). 알고리즘: **token bucket**(키당 2값). (기각: fixed window·sliding log)
- 2층: **rate limit**(순간 유량, `RATE_LIMITED` 429+Retry-After) / **quota**(누적 총량, `QUOTA_EXCEEDED` 429+리셋 시각).
- quota 계량: **건수 기반.** (기각: 비용 기반=Dumb Pipe 위반)
- cc 계상: rate limit 포함 / quota는 to만.
- 영속: 버킷=인메모리(재시작 가득 복원) / quota=SQLite quota_usage. 수평 확장 시 공유 버킷 필요(15절 전제조건).
- **fail-open** (인증=보안=closed / 유량=가용성=open — 레이어 구분).
- A2A: rate limit 429 시 해당 호출만 거부, 세션 미파괴. speaker_counts와 별 레이어.
- 기본값: rate capacity 60/refill 1/s, quota 1d/10000 (agent별 override 가능).

---

## 13. SLO · 관측성

- 라우터·어댑터 모두 `/metrics`(Prometheus) + `/metrics.json` 노출. 수치만, 내장 대시보드 없음(외부 도구 연결). 바인딩 127.0.0.1 기본(Admin 동일 정책).
- 4 골든 시그널: Latency(ingress→egress·A2A·SSE push) / Traffic(요청률·SSE 연결 수) / Errors(코드별·재시도율·dead_letter율) / Saturation(큐 깊이·lease·quota 임박·writer 큐 대기). + 도메인(세션 수·audit 백프레셔·Obsidian SLA 위반) + 어댑터(플랫폼 API 지연·실패율·인입량·egress 적체).
- SLO(자리표시자, 실측 후 재조정): 가용성 99.5%(단일 라우터 SPOF 수용 전제) / ingress→egress p95 < 2s / Obsidian 마커 60s·배치 15분.
- 알람: Admin UI 설정 → yaml → **관측 워커**가 판정·Telegram 발신. 라우터 직접 발신 금지(원칙 6). 트리거: dead_letter / audit closed 차단 / 큐 깊이 / quota 급증 / SLA 위반 / SSE 연결 0 지속 / 스케일업 검토 신호.
- 시스템 로그: job 상태 전이를 구조화 JSON 1줄/이벤트, `system-YYYYMMDD.log` 일단위 롤링. audit와 독립 레이어(같은 egress라도 audit=게시 텍스트 / 시스템 로그=전달 상태).

---

## 14. 운영 저장소 계층

- **저장소 추상화 인터페이스** 뒤로 전 운영 DB 접근 통일. 1차 SQLite, 전환 대상 PostgreSQL(수평 확장 또는 서브프로젝트 연계 시). 백엔드 교체 시 코어 무수정.
- **DB 라이브러리: better-sqlite3.** (기각: node:sqlite — experimental·busy_timeout 기본 0. 졸업 후 전환 가능)
- WAL 모드 전 DB 적용(쓰기 중 읽기 비차단). 본파일+`-wal`+`-shm` = **3파일 한 묶음** 백업·삭제. audit의 WAL은 논리 append 유지 — 해시 체인과 충돌 없음.
- 동시 쓰기: **단일 writer 큐**(1차) + busy_timeout 명시 설정(2차, 예 5000ms).
- 파일: `data/queue.db`(큐·tokens·tokens_admin·sessions·quota_usage 단일 — 복구를 단일 원자 트랜잭션으로) / `data/audit.db`(분리, 월 세그먼트 시 audit-YYYYMM.db) / `data/wiki/raw.db`(옵션).
- 마이그레이션: `user_version` PRAGMA, 부팅 시 게이트.
- Raw Sink: 인터페이스 뒤 file(JSONL 기본)/sqlite 옵션. fire-and-forget·코어 비차단·DM 스킵.

---

## 15. 수평 확장 경로 (구현 안 함 — 전제조건 계약만)

- 현 단계: 단일 라우터 + 수직 확장. **SPOF 수용 위험**(SLO 99.5% 전제).
- 전환 신호: 13절 지표(라우터+어댑터)의 지속 포화 — SSE 연결 수·큐 깊이·p95·writer 큐 대기·CPU/RAM·어댑터 적체.
- 전환 전제조건(전환 시 해소): ①상태 공유(로컬 SQLite→공유 저장소) ②SSE 연결-라우터 어피니티 ③단일 writer→DB 동시성 ④세션 SSOT 공유화 ⑤dedup 공유화 ⑥rate limit 버킷 공유화.
- 샤딩 축 1순위: tenant_id (4.2 키 구조가 지원).
- 현 단계 계약: 상태·세션·idempotency는 저장소 인터페이스 경유(로컬 메모리 하드코딩 금지).

---

## 16. Obsidian 반영 SLA + Wiki 파이프라인

- 트리거: 워커측 마커 감시(1~5s) + 5분 배치 폴링. 라우터 직접 호출 금지(원칙 6).
- SLA: 마커 60초 / 배치 15분 내 반영. 초과=알람, 라우팅 무관.
- 장애: 다운 시 Raw·마커 누적(유실 0), 복구 시 시간순 백로그. 멱등(session_id+처리 플래그).
- 폴백: 에이전트 프롬프트 지침("반영 중일 수 있음"). (기각: 라우터 캐시)

---

## 17. Audit 모듈 (옵션, 기본 OFF)

- 시스템 로그와 **독립 레이어** — 상호 토글 무관. audit=메시지 내용(컴플라이언스) / 시스템 로그=상태 전이(운영).
- 적재: 라우터 **동기** 기록 — Non-Blocking 원칙의 명시적 예외. 이벤트 4종: ingress/egress/a2a/admin.
- failure_mode 기본 **closed**: 해당 메시지 503+`AUDIT_UNAVAILABLE`. open=통과+지표.
- 무결성: 별도 audit.db, append-only + prev_hash 해시 체인. **보존 구간 내 체인 불변(절대).**
- 인터페이스: RawSink.write→void / AuditSink.write→Result — 구현 분리(비기능 요구 정반대: 휘발·비동기 vs 무손실·동기).
- 정책(yaml, 관리자 전용): enabled / dm(기본 끔) / org.default true(전수 감사 opt-out 방식) / exclusions. 피감사자는 정책 조회·변경 불가(separation of duties). 정책 변경도 audit 기록(메타 감사). 런타임 재로드.
- 판정: space_type/space_id 매칭만(Dumb Pipe 유지).
- 세그먼트·보존: 18절.

---

## 18. 데이터 보존·삭제 정책

- **일→월 롤오버** 공통 정책(구현은 레이어별 분리): 시스템 로그=`system-YYYYMM.log` 합본+gzip / audit=`audit-YYYYMM.db` DB 세그먼트 통합(경계 prev_hash 인계, 1비트도 변경 금지).
- 기준시: 코어 폴백 UTC / 운영 주입 디폴트 Asia/Seoul(UTC+9). tenant별은 서브프로젝트 주입. 변경은 다음 월 경계부터.
- retention: audit 기본 30일(플랜 주입) — **세그먼트 단위 삭제, 세그먼트 전체 만료 후에만, 당월 보호, 레코드 단위 삭제 금지(관리자 포함)** / 시스템 로그 30일 / quota_usage 7일 / 세션 30일(cap 후 추적용) / job 72h(dedup창≪72h≪30일 정합) / Mem0·Obsidian 코어 미규정(원칙 6).
- tenant 삭제 연쇄: `{tenant_id}:` prefix 전 데이터. audit는 보존 정책 따름(즉시 삭제 아님). 법적 hold 자리(판정은 서브프로젝트).
- 관리: 단일 관리자 UI(서브프로젝트)=삭제/백업/추출+배치잡 생성. 배치 2종(보존 만료 삭제 / 해지 익일 연쇄) — yaml→**배치 워커** 실행(원칙 6). 고객 UI는 조회/내려받기만.
- 해지: 즉시 `pending_deletion` 마킹 → 익일 자정 배치 연쇄 삭제. 멱등. 철회 창(익일까지).
- 백업: 3파일 묶음, 라이브 백업은 `.backup`/`VACUUM INTO` 권장.

---

## 19. 데이터 규격

### 19.1 Ingress Envelope (Adapter → Core)
```json
{
  "context_key": "default:telegram:forum:C123:42",
  "routing": { "to": ["zeus"], "cc": ["athena"] },
  "memory_scope": { "space_key": "default:telegram:forum:C123:42", "persona_key": "default:zeus" },
  "payload": { "origin_platform": "telegram", "text": "@zeus 검토해줘", "user_id": "123456789", "username": "incue" },
  "a2a": { "enabled": false },
  "idempotency_key": "telegram:C123:42:msg_001"
}
```

### 19.2 SSE 이벤트 (Router → Agent)
```
GET /agents/zeus/events     Authorization: Bearer <token>
event: job        — { "job_id": "j_abc", "envelope": {...} }   ← result 의무, lease
event: listen     — { "job_id": "j_def", "envelope": {...} }   ← cc, 응답 금지
: heartbeat (주석 라인)
id: <단조 시퀀스>
```

### 19.3 Result (Agent → Router)
```json
POST /agents/zeus/result    Authorization: Bearer <token>
{ "job_id": "j_abc",
  "result": { "status": "success", "response_text": "...", "a2a_status": "resolved",
              "activities": [{ "tool": "terminal", "detail": "kubectl get pods" }] } }
```

### 19.4 A2A 재진입 (Agent → Router)
```json
POST /agents/hera/a2a       Authorization: Bearer <zeus 토큰 — caller는 토큰에서 도출>
{ "context_key": "default:telegram:forum:C123:42",
  "routing": { "to": ["hera"], "cc": [] },
  "payload": { "origin_platform": "telegram", "text": "예산 잔액 알려줘", "user_id": "123456789" },
  "a2a": { "enabled": true, "mode": "single", "session_id": "<라우터 발급 ULID>", "parent_platform": "telegram" } }
```
> caller·speaker_counts를 envelope로 제출해도 무시된다. 신원=토큰, 카운트=세션 DB.

### 19.5 Egress (Core → Adapter)
```json
{ "ok": true, "context_key": "default:telegram:forum:C123:42",
  "results": [{ "agent": "hera", "status": "success", "response_text": "...",
                "a2a_status": "resolved", "activities": [...] }],
  "a2a_termination": { "reason": "resolved", "speaker_counts": { "zeus": 2, "hera": 2 } } }
```

### 19.6 에러 코드
| 코드 | 의미 |
|------|------|
| UNKNOWN_AGENT | routing 대상이 registry에 없음 |
| UNKNOWN_JOB | 미발급/종결 job_id로 result 제출 |
| UNAUTHORIZED | 토큰 누락·불일치 (401) |
| RATE_LIMITED / QUOTA_EXCEEDED | 유량/누적 한도 초과 (429) |
| AUDIT_UNAVAILABLE | audit closed 모드 쓰기 실패 (503) |
| JOB_EXPIRED / JOB_DEAD_LETTER | 일감 만료 / 재전달 한도 초과 실패 통지 |
| CC_RESPONSE_FORBIDDEN | listen job에 result 제출 |
| A2A_INITIATION_DENIED | can_initiate:false 또는 cc role 재진입 |
| A2A_UNAUTHORIZED | allowed_targets 위반 |
| A2A_SELF_CALL | 자기 호출 |
| A2A_CROSS_PLATFORM_DENIED | 플랫폼 간 A2A |
| A2A_SPOOF_DETECTED | 자기신고 caller ↔ 토큰 불일치 |
| A2A_SPEAKER_LIMIT_EXCEEDED | 발화자 한도(10) 초과 |
| A2A_INVALID_SESSION / A2A_NOT_PARTICIPANT / A2A_SESSION_EXPIRED | 세션 검증 실패 3종 |
| A2A_EARLY_TERMINATION | resolved/out 정상 조기종료 (에러 아님, 종료 신호) |

---

## 20. agents.yaml 스키마 (통합)

```yaml
system:
  a2a:
    max_speaker_calls: 10
    default_mode: "single"
    allow_self_call: false
    allow_cross_platform: false
    session_ttl: { sliding_idle_h: 1, absolute_cap_h: 24 }
  auth: { mode: "enabled" }          # disabled는 명시+기동 경고
  queue:
    backend: "sqlite"
    sqlite_path: "data/queue.db"
    job_ttl_ms: 600000
    lease_timeout_ms: 300000
    max_redeliver: 3
    completed_retention_h: 72
  egress: { retry_schedule_s: [1, 4, 16, 60, 120] }
  rate_limit:
    enabled: true
    default:
      rate: { capacity: 60, refill_per_sec: 1 }
      quota: { window: "1d", max_requests: 10000 }
    overrides: []
    fail_mode: "open"
  observability:
    metrics: { enabled: true, bind: "127.0.0.1", expose: false, formats: ["prometheus", "json"] }
    system_log: { dir: "data/logs/", file_pattern: "system-{YYYYMMDD}.log", rollover: "daily" }
    alerts: { enabled: true, channel: "telegram", rules: [] }   # Admin UI가 채움
  admin: { bind: "127.0.0.1", port: 8800, expose: false }
  audit:
    enabled: false
    failure_mode: "closed"
    dm: false
    org: { enabled: true, default: true, exclusions: [] }
  wiki:
    raw_logging_enabled: false
    raw_backend: "file"              # file | sqlite
    raw_path: "data/wiki/raw/"
    sqlite_path: "data/wiki/raw.db"
  tenant: { id: "default" }          # 정규화: URL-safe, ':' 금지, 예약어 금지
  rollover: { base_timezone: "UTC", granularity: "daily_to_monthly" }
  retention: { audit_days: 30, system_log_days: 30, quota_usage_days: 7, session_days: 30 }

agents:
  - id: "zeus"
    a2a: { can_initiate: true, allowed_targets: "*" }
  # url 필드 없음 — 라우터는 에이전트를 호출하지 않고, 신원은 토큰으로 검증
```

---

## 21. 외부 인프라 경계 + SDK 계약

### 21.1 외부 인프라 (라우터와 독립 — 원칙 6)
| 컴포넌트 | 역할 | 경계 |
|----------|------|------|
| Mem0 | PERSONA. 대화 기억 적립은 DM 한정 + user_id 태깅 | 에이전트(SDK)가 직접 연동. 보존은 코어 미규정 |
| Gemini Wiki 워커 | Raw 분류/정제 | 마커 감시+배치. 라우터 비호출 |
| Obsidian | 조직 지식 | 에이전트 읽기 / 쓰기는 워커 전용. 보존 코어 미규정 |
| 관측·배치·감사 워커 | 알람 / 보존 삭제 / 감사 보고서 | 전부 라우터 외부 비동기 |

### 21.2 Agent SDK 계약 (구현은 Plan 참조)
- SDK가 감추는 것: SSE 접속·재접속(Last-Event-ID)·Bearer 헤더·result 제출·백오프·job_id 멱등 재시도·핸들러 예외→error result 변환.
- 필수 설정 3개: `router_url, agent_id, token`. 인터페이스: `onJob(handler)` / `start()` / `stop()`.
- SDK 없이 직접 HTTP로도 동일 계약 동작(편의 레이어, 필수 아님). 참조 구현 Node.js.

---

## 22. 미결 항목 (의도적 보류)

| 항목 | 결정 시점 |
|------|----------|
| DM 감사 여부·보존기간·접근통제·감사 보고서 포맷 | B2B 계약·법규별 (audit 구현 시) |
| Gemini 워커 폴링 주기·마커 스키마 수치 | Wiki 구현 시 |
| 등록 토큰 발급/로테이션 운영 정책 (env 네이밍·주기) | 운영 정책 수립 시 |
| 멀티테넌시 본격 설계 / Google A2A 호환 레이어 | 수요 발생 시 |
| 대고객 서비스 계층 — **설계 확정: `Olympus_Service_Layer.md` v1.0** (데이터 모델·UI·인터페이스 계약·결정 레지스터) | 구현은 코어 검증 후 (서브프로젝트) |

---

## 23. 용어집

| 용어 | 정의 |
|------|------|
| context_key | `{tenant}:{platform}:{space_type}:{space_id}:{topic_id}`. 메시지 격리축 |
| persona_key | `{tenant}:{agent_id}`. 플랫폼 초월·tenant 격리(다른 축) |
| session_id | 라우터 단독 발급 ULID. A2A 세션 SSOT |
| speaker_counts | 발화자별 카운트(각 10회). 세션 DB가 SSOT, 에이전트 제출값 무시 |
| resolved / out | 결론 선언(내용 중립 — 기각·보류도 결론). 세션 종료 동일 효력 |
| 종료 마커 | reason 4종: resolved\|out\|speaker_limit\|expired |
| job / listen | SSE 이벤트 타입. job=to(result 의무·lease) / listen=cc(fire-and-forget) |
| lease | delivered 상태의 처리 임차 시간. 만료 시 queued 회수 |
| at-least-once | egress 전달 보장 수준. 잔여 중복 게시 구조적 0 아님 |
| fail-closed / fail-open | 인증·audit=closed(보안) / rate limit=open(가용성). 레이어 구분 |
| 단일 writer 큐 | SQLite 동시 쓰기 직렬화 장치 |
| WAL 3파일 묶음 | 본파일+-wal+-shm. 백업·삭제 단위 |
| audit 세그먼트 | audit-YYYYMM.db. 삭제 최소 단위(레코드 단위 금지) |
| 관측/배치/감사 워커 | 라우터 외부 비동기 워커 3종 (원칙 6) |
| tenant_id | 모든 격리 키 최상위 prefix. 단일=default. 샤딩 1순위 축 |
| pending_deletion | 해지 마킹. 익일 배치 연쇄 삭제, 철회 창 |
| SSOT | 단일 진실 공급원 = 이 문서 + agents.yaml |

---

## 24. 버전

**v6.13** — 본 증류본 기준. 변경 이력(v6.0~v6.12, R1~R6)은 `Olympus_PRD_Plan.md`(아카이브) 및 git history 참조. 이후 변경은 킵 프로토콜로 이 문서를 직접 갱신하며, 절 단위 변경 사유는 커밋 메시지가 담는다.
- 06-12: 11절 서비스 계층 연동 확장(tenant limits/deletion·usage·batch-jobs, tenant CRUD 없음) + 22절 대고객 계층 설계 확정 링크 (`Olympus_Service_Layer.md` v1.0).
