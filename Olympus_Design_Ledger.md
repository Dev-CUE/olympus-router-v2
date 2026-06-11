# Olympus v6.13 설계 원장 (Design Ledger)

> **성격**: PRD v6.13 일괄 반영 전까지의 작업용 원장. SSOT는 여전히 PRD — 이 문서는 세션 유실 방지용 브릿지.
> **규칙**: 항목 확정 시 이 문서에만 누적. PRD는 전 항목 완료 후 1회 일괄 갱신(v6.13).
> **갱신**: 2026-06-11 | 진행: A2A군 + 16·재개·9(+19)·재시작(보강)·8 확정 / 잔여: L21·L20·L17·L18·L22·L23·LB

---

## 0. 프로세스 규칙

1. 설계 순서(의존성 기준): [기반] 1→2→3 / [A2A] 5→6→7→10 / [운영] 16→9→8→**L21→L20** / [구조] **L17→L18→L19(완료)→L22→L23** / [최후] **LB**
2. 매 항목 종료 시 기존 킵 항목과 충돌 점검 의무. 충돌 시 즉시 앞 항목 수정 + 이력 기록.
3. 보류 결정은 "결정 대기(P-prefix)" 섹션에 누적, 전 항목 완료 후 일괄 결정.
4. PRD 반영 시 Changelog는 v6.13 단일 항목.
5. **원장 쓰기 권한**: 새 세션 에이전트는 GitHub 읽기 전용. 원장 갱신은 이 창(MCP 쓰기 권한 보유)에서 수행. 새 세션이 확정 블록을 출력하면 CUE가 이 창에 전달 → 이 창이 원장에 반영.

---

## 번호 체계 정의 (혼동 방지)

> **이 문서에는 두 가지 번호 체계가 공존한다. 반드시 구분해서 사용한다.**

| 체계 | 형식 | 의미 | 예시 |
|------|------|------|------|
| **설계 항목 번호** | `L숫자` 또는 `LB` | 채택 리스트의 설계 작업 단위. 세션 간 인수인계용 | L21, L20, LB |
| **결정 대기 번호** | `P숫자` | 설계 완료 후 일괄 확정할 보류 결정 사항 | P21, P22 |

**L21 ≠ P21** — L21은 "rate limit·quota 설계 작업", P21은 "어댑터 dedup 영속화 여부 결정"이다.

### 잔여 설계 항목 (L-prefix 전체)

| 항목 | 내용 | 분류 |
|------|------|------|
| **L21** | 테넌트/에이전트별 rate limit·quota | 운영 |
| **L20** | SLO·관측성 (지표·알람·SLO 수치) | 운영 |
| **L17** | SQLite 구현 규약 (WAL·파일 분리) | 구조 |
| **L18** | tenant_id 구체화 (키 계약·범위) | 구조 |
| **L22** | 수평 확장 경로 (전환 전제조건 계약) | 구조 |
| **L23** | 데이터 보존·삭제 정책 | 구조 |
| **LB** | B군 모순 해소 — 아래 4건 일괄 | 최후 |

**LB 상세**:
- LB-11: Phase 의존성 재정렬 (Stage-Gated 원칙 vs Phase 10→8→9 순서)
- LB-12: A2A limits 충돌 확정 (PRD "무시" vs SKILLS "참조") — 원장에서 "무시" 방향 제시됨
- LB-13: resolved '최우선' 서술 분리 (종료 트리거 우선순위 ≠ 가드 검증 순서)
- LB-14: 편집 오류 일괄 (PRD 4.5 중복·session_id platform 중복·14절 미결 표·Phase 8 테스트 ID)

> LB의 11~14는 **통합 리뷰 문서(D군)의 문서 결함 번호**이지 PRD 절 번호가 아니다.

---

## 1. 확정 결정

### [#15] 전송 계층 — SSE + POST 확정

- **deliver**: `GET /agents/:id/events` — SSE 스트림 (롱폴링 GET /poll 폐기)
- **submit**: `POST /agents/:id/result` — 기존 7.3 계약 무변경
- 근거: 트래픽이 단방향 push + 제출 구조라 양방향(WS) 불필요 / 의존성 0 (Node 내장) / "내장 우선" 원칙(v6.9 sqlite 결정 논리) 부합 / push 지연 WS 동등
- 검토 이력: 롱폴링 유지→교체 컨셉→WS-first→SSE+POST. WS 기각 사유: ws 외부 의존 + 사용처 없는 양방향. 롱폴링 기각 사유: A2A DIALOGUE 라운드당 평균 ~12.5초 지연.
- 계약 필수 포함: 하트비트(주석 라인, 주기 15~30s 권고) / 클라이언트 수신 타임아웃 / Last-Event-ID 재전달 / 이벤트마다 flush, 압축 비활성
- 검증 항목: Cloudflare Tunnel SSE 스트리밍 통과 + 유휴 연결 유지 (T10.x 실연동)

### [#1] Job Queue 상태머신 + 영속성 (확정, 결정 보류)

**상태 6종**: queued / delivered / completed / failed / expired / dead_letter

**전이**:
```
enqueue → queued
queued ──[SSE push]──→ delivered (lease 시작)
delivered ──[result success]──→ completed
delivered ──[result error]────→ failed
delivered ──[lease_timeout]───→ queued (redeliver_count++)
queued ──[redeliver > max]────→ dead_letter
queued ──[job_ttl 경과]───────→ expired
queued 상태에서도 result 수신 시 → completed (G1: 재전달 전 result 도착 경쟁 처리)
```

**불변 규칙**:
- 종결 상태(completed/failed/expired/dead_letter) 전이 없음
- 종결 job에 지각 result → UNKNOWN_JOB 거부 + 로그
- expired/dead_letter 진입 시 어댑터로 실패 통지 (좀비 세션 차단)

**jobs 테이블 스키마 (보강)**: job_id, agent_id, context_key, status, egress_status, egress_id, platform_message_id, redeliver_count, created_at, updated_at

**영속성**: T10.6(휘발 허용) 폐기 → durable. 백엔드 node:sqlite 권고, JSONL WAL 폴백. 재시작 시 queued 복원, delivered→queued 회수.

**SSE 연동**: event_id = 에이전트별 단조 시퀀스. 재접속 Last-Event-ID 기준 유실 delivered만 재push.

**설정안**:
```yaml
system:
  queue:
    backend: "sqlite"
    sqlite_path: "data/queue.db"
    job_ttl_ms: 600000
    lease_timeout_ms: 300000
    max_redeliver: 3
    completed_retention_h: 72
```

**테스트**: T10.11~T10.17 + T10.31(queued 상태 result 수용)

### [#2] 등록 토큰 인증 계약 (확정)

- **토큰**: opaque random 256-bit (`crypto.randomBytes(32)` base64url). JWT 기각
- **저장**: SHA-256 해시만 보관 (#1 큐와 동일 SQLite, tokens 테이블). 평문은 발급 응답 1회 노출
- **재정의**: "토큰 env로만 관리" → env는 에이전트측 보관 규칙, 라우터측은 해시 DB
- **검증**: Bearer ↔ 해시 ↔ agent_id 3중 대조. URL :id ≠ 토큰 agent_id → 401
- **fail-closed**: 저장소 공백/초기화 실패 → 전 요청 거부. 무인증은 yaml `auth.mode: disabled` 명시 + 기동 경고만
- **로테이션**: grace period — 재발급 시 구토큰 grace(기본 24h) 병행 유효 후 자동 삭제. 즉시 차단은 grace=0
- **DoS**: 실패 카운터 임계 초과 429 / result 본문 상한(1MB, 413) / SSE 스트림 agent당 1개 — 중복 접속 시 신규가 기존 대체
- **테스트**: T10.2 갱신 + T10.18~22

### [#3] Egress 계약 — 라우터→어댑터 전달 보장 (확정)

- **흐름**: POST /result → 라우터 영속화 후 200 → 비동기 egress → POST {adapter_url}/egress
- **ACK**: 동기 — 어댑터 200 = 플랫폼 게시 완료 + platform_message_id (jobs 테이블에 기록 → 라우터가 재발사 차단에 활용)
- **재시도**: 5xx/timeout만 [1,4,16,60,120]s. 4xx는 즉시 실패
- **중복 방지**: egress_id(job_id 파생) dedup — 재시도발 중복 게시 차단
- **상태**: jobs 테이블 egress_status 컬럼(pending/sent/failed)
- **순서**: 동일 context_key FIFO 직렬, 타 context 병렬
- **실패 통지**: dead_letter/expired → JOB_EXPIRED / JOB_DEAD_LETTER (신규 2종)
- **인증**: 어댑터별 shared secret(env) 헤더, fail-closed
- **원칙**: Zero Inbound는 에이전트 대상. 어댑터는 inbound 허용
- **시스템 로그**: job 상태 전이(G1~G4) 추적 — audit와 독립 레이어. 로그 형태·retention·쿼리는 L20 소관
- **테스트**: T10.23~29

### [#5] A2A 신원 모델 — 토큰 바인딩 (확정)

- **원리**: caller := Bearer 토큰에서 도출. 자기신고 폐기
- **자기신고 불일치**: envelope.a2a.caller ≠ 토큰 agent_id → A2A_SPOOF_DETECTED 거부
- **삭제 3종**: payload._source_url / agents.yaml url 필드 / SDK source_url — SDK 필수 설정 3개로 축소
- **재진입 엔드포인트**: POST /agents/:id/a2a (전용 신설, Bearer)
- **가드 순서**: 0.인증→caller확정 / 1.SPOOF / 2.자기호출 / 3.권한 / 4.교차플랫폼 / 5.resolved·out / 6.라운드 / 7.발화자
- **테스트**: T5.21 대체 / T5.23~24 / T5.12 갱신

### [#6] A2A 세션 신뢰 모델 (확정)

- **발급**: 라우터 단독 ULID 발급. legacy 조합형 폐기 (D10 해소)
- **검증 3중**: ①A2A_INVALID_SESSION(not_found|expired|closed) ②A2A_NOT_PARTICIPANT ③context_key 불일치
- **레코드**: session_id, context_key, origin_agent, participants[{agent_id, role}], mode, round, speaker_counts, status, created_at, last_activity, topic, parent_session_id, tenant(예약)
- **SSOT**: speaker_counts·round = 세션 레코드. 에이전트 제출값 무시
- **영속화**: #1과 동일 SQLite sessions 테이블. 재시작 복구 트랜잭션 포함
- **TTL**: sliding idle 1h + absolute cap 24h. 만료 시 A2A_SESSION_EXPIRED 통지
- **테스트**: T5.17 갱신 / T5.25~29 / T5.22 갱신

### [재시작 시나리오 공백 레지스터 G1~G9] (확정 — 보강 완료)

| G | 내용 | 처리 |
|---|------|------|
| G1 | queued 회수 후 result 도착 경쟁 | queued 상태에서도 result→completed 허용. 시스템 로그로 추적 |
| G2 | egress 재시도 ~21s < 어댑터 재기동 + platform_message_id 재발사 | [1,4,16,60,120]s + platform_message_id jobs 기록으로 라우터가 재발사 차단 |
| G3 | 복구 트랜잭션의 pending egress 회수 명시 | 부팅 복구 트랜잭션에 egress pending → 재시도 큐 복원 명시 |
| G4 | 게시→dedup 커밋→ACK 순서 + at-least-once 잔여 중복 한계 | 어댑터 dedup 영속화(P21). 잔여 중복은 at-least-once 속성으로 명문화 |
| G5 | 라우터 다운 시 어댑터 ingress 재시도 | P22: 백오프 최대 5분 |
| G6 | SDK result 재시도 미정 | 9-A 보강: 백오프 + job_id 멱등 |
| G7 | DB 손상(quick_check 실패) | fail-fast + 알림. 자동 재생성 금지 |
| G8 | 복구 중 ingress 수용 위험 | /health·/ready 분리. ready 전 503 |
| G9 | Last-Event-ID 부재 의미 미정 | 신규 시작 신호 → delivered 전체 재push |

**플랫폼별 내구성 매트릭스**:
| 플랫폼 | 어댑터 다운 시 |
|--------|---------------|
| Telegram | ~24h 보존, 유실 없음 |
| Slack | 수 분 내 3회 재시도 후 드롭 |
| Discord | resume 윈도우 내 재전달, 초과 시 유실 |

**L22 선결정**: 단일 라우터 + 수직 확장 우선. 수평 전환 전제조건은 L22에서 계약으로만 명시.

### [#7] cc — SSE 전달·차단·수명 정의 (확정)

- **SSE 타입**: `job`(to, result 의무·lease) vs `listen`(cc, fire-and-forget)
- **listen 생명주기**: queued → delivered → 완료. lease·재전달·dead_letter 없음. 만료 시 통지 없이 expired
- **금지**: listen job_id로 result → CC_RESPONSE_FORBIDDEN / cc role 세션 재진입 → A2A_INITIATION_DENIED / 무관 신규 개시는 can_initiate만 적용
- **기록**: persona_key null. Mem0/Obsidian 미기록. 매 라운드 listen은 비차단
- **테스트**: T5.15·T5.11 갱신 / T10.32~34

### [메모리 라이프사이클 검증 + 기억 소유자 태깅] (확정)

- 회의→DM 이어가기: Obsidian 읽기로 성립. 조건: #16 SLA + 종료된 회의 결론만(진행 중 불가 — 축1 의도)
- Mem0→회의실: "DM 한정"은 쓰기 제한, 읽기는 공간 무관 — 성립
- **기억 소유자 태깅 (PRD 4.2 보강)**: Mem0 metadata에 user_id 태깅 + 합성 시 요청자 기억만 필터. persona_key 불변 유지. 라우터 변경 없음.

### [#10] 중간 라운드 미기록 + 종료 결과 전수 기록 (확정)

- **persona_key**: DIALOGUE 전 라운드 null 고정 (C5·D8 근본 해소)
- **Mem0 규율**: SDK 계약. origin이 종료 결과 전체 적립(결론+미결+사유). 강제 불가 — 계약+테스트로 보장, 명문화
- **resolved 내용 중립**: 채택·기각·보류·폐기 전부 결론. "성공 시에만" 오독 차단
- **종료 마커**: reason 5종 — resolved|out|round_limit|speaker_limit|expired
- **Gemini 분류**: resolved/out → 결론 지식화 / limit·expired → 미결 안건 기록(안건·참여자·라운드·사유)
- **테스트**: T5.13/T5.14 갱신 / T10.35 / T7.4 보강

### [#16] Obsidian 반영 SLA + 세션 재개 (확정)

- **트리거**: 마커 감시(워커측, 1~5s) + 5분 배치. 라우터 직접 호출 금지(원칙 6 유지)
- **SLA**: 마커 60초 / 배치 15분 내 Obsidian 반영. SLA 초과 = 알람, 라우팅 무관
- **장애**: 다운 시 Raw·마커 누적(유실 0), 복구 시 시간순 백로그. 멱등(session_id+처리 플래그)
- **폴백**: 에이전트 프롬프트 지침("반영 중일 수 있음"). 라우터 캐시 기각
- **세션 재개**: 재오픈 기각(#6 신뢰 모델 손상). 후속 세션 + parent_session_id + topic. Gemini "재개된 회의" 연결 지식화
- **테스트**: T7.5(실연동 60s)/T7.6~7.8

### [#9] audit-sink + 인터페이스 분리(L19 흡수, 완료) (확정)

- **위치**: 옵션 모듈, 기본 OFF. **시스템 로그(운영)와 레이어 분리 — 독립 동작, 상호 토글 영향 없음**
  - audit = 메시지 내용(컴플라이언스). 시스템 로그 = job 상태 전이(운영). 같은 egress라도 audit는 "게시한 텍스트", 시스템 로그는 "전달 상태·재시도·dedup"
- **적재**: 라우터 동기 기록. 이벤트 4종: ingress/egress/a2a/admin
- **failure_mode**: 기본 closed. closed=해당 메시지 503+AUDIT_UNAVAILABLE, open=통과+지표
- **Non-Blocking 예외 명문화**: audit 활성 시 동기 쓰기 경로 진입 — 원칙의 명시적 예외(D6 해소)
- **L19(인터페이스 분리) 흡수 완료**: RawSink.write→void / AuditSink.write→Result. 인터페이스 공유 선언 폐기
- **무결성**: 별도 audit.db, append-only + prev_hash 해시 체인
- **테스트**: TA.1~TA.5

### [재시작·복구 프로토콜 통합] (확정 + 보강 — PRD 독립 절 신설)

**불변식**: 모든 경계 = (재시도+멱등) 쌍 → 유실 0·중복 0·수동 0

**라우터 부팅 시퀀스**:
```
1. config fail-fast
2. SQLite quick_check (실패 = 기동 중단 + 알림, 자동 재생성 금지)
3. 복구 트랜잭션 (단일 원자):
   - delivered → queued 회수 (redeliver_count++)
   - active 세션 복원
   - egress pending → 재시도 큐 복원  ← G3 보강
4. audit 준비 (closed 모드면 필수, 미완료 시 ready 불가)
5. /ready 선언 (이전 ingress 503)
6. SSE 수용 (Last-Event-ID 기준 재push)
7. egress FIFO 재개
```

**어댑터**: env fail-fast → dedup 영속 오픈(P21) → 플랫폼 재연결 → ingress·egress 재개

**에이전트**: SSE 접속
- Last-Event-ID 제출 = 연결 단절(유실분만 재push)
- Last-Event-ID 미제출 = 신규 시작 신호 → delivered 전체 재push + lease 갱신 (G9)

**호스트 전체**: 라우터 ready → 어댑터 순서 권장(compose healthcheck). 어긋나도 G5(ingress 재시도) 흡수.

**시스템 로그**: G1~G4 전이 추적. audit와 독립 레이어. 로그 형태·retention·쿼리는 L20 소관.

**at-least-once 명문화**: 게시→dedup 커밋→ACK 사이 어댑터 사망 시 잔여 중복 게시 가능 — at-least-once 속성으로 명문화. 어댑터 dedup 영속화(P21)로 최소화하되 완전 제거는 보장하지 않음.

**테스트**: T10.36~38, TA.6, T10.39(복구 트랜잭션 egress pending 재개 확인)

### [#8] Admin API 인증/인가 (확정)

- **바인딩**: 127.0.0.1:8800 기본. 외부 노출은 expose:true + CF Access 전제
- **인증**: #2 재사용 + 별도 tokens_admin 테이블. admin 토큰 0개 시 전체 거부
- **부트스트랩**: 로컬 CLI 1회 발급. 이후 API
- **scope**: read(GET+dry-run) / write(POST·PUT·DELETE). RBAC 기각
- **세션 조회**: 메타만(본문 제외). admin read ≠ 대화 열람권
- **yaml 쓰기**: API 우선. 직접 수정 시 POST /admin/reload 필요
- **감사 연계**: write → #9 audit admin 이벤트
- **테스트**: T9.8~12

---

## 2. 결정 대기 (P-prefix)

> P숫자는 설계 완료 후 일괄 확정할 보류 결정. L(설계 항목)과 다른 체계다.

| P# | 출처 | 결정 사항 | 권고 |
|----|------|----------|------|
| P1 | #1 | 큐 백엔드 | sqlite |
| P2 | #1 | lease_timeout 기본값 | 5분 |
| P3 | #1 | 재시작 시 redeliver_count 증가 | 증가 |
| P4 | #1 | 지각 result | 거부+로그 |
| P5 | #1 | 실패 통지 | 통지 |
| P6 | #2 | 토큰 방식 | opaque 256-bit |
| P7 | #2 | grace 기본값 | 24h |
| P8 | #2 | 중복 SSE | 신규 대체 |
| P9 | #2 | 실패 임계·본문 상한 | 10회/분·1MB |
| P10 | #3 | ACK | 동기 |
| P11 | G2 | egress 재시도 수치 | [1,4,16,60,120]s |
| P12 | #3 | context 직렬화 | 채택 |
| P13 | #3 | egress 영구 실패 알림 | L20 이관 |
| P14 | #5 | _source_url·url·source_url 삭제 | 삭제 |
| P15 | #5 | A2A 전용 엔드포인트 | 채택 |
| P16 | #5 | caller 불일치 | 거부 |
| P17 | #6 | session_id | ULID |
| P18 | #6 | 무효 세션 에러 | A2A_INVALID_SESSION+meta |
| P19 | #6 | 세션 영속화 | SQLite |
| P20 | #6 | 세션 TTL | sliding 1h + cap 24h |
| P21 | G4 | 어댑터 dedup 영속화 | 채택 (at-least-once 잔여 중복 최소화) |
| P22 | G5 | ingress 재시도 | 최대 5분 |
| P23 | #7 | listen 만료 | 조용히 expired |
| P24 | #7 | metadata-only | 기각 |
| P25 | #7 | cc 위반 코드 | CC_RESPONSE_FORBIDDEN |
| P26 | 4.2 | 기억 태깅 | 채택 |
| P27 | #10 | dialogue persona_key | 전 라운드 null |
| P28 | #10 | origin 적립 범위 | 종료 결과 전체 |
| P29 | #10 | 종료 유형 기록 | 전수(결론/미결 분류) |
| P30 | #16 | 워커 트리거 | 감시+배치 이중 |
| P31 | #16 | SLA 수치 | 60초/15분 |
| P32 | #16 | SLA 폴백 | 프롬프트 지침 |
| P33 | 재개 | topic 필드 | 의무 |
| P34 | 재개 | parent_session_id | 선택 |
| P35 | 재개 | 후속 세션 카운터 | 리셋 |
| P36 | #9 | failure_mode | 기본 closed |
| P37 | #9 | 무결성 | 해시 체인 |
| P38 | #9 | 저장 | 별도 audit.db |
| P39 | #9 | 감사 이벤트 | 4종 |
| P40 | 재시작 | readiness | /health·/ready 분리 |
| P41 | 재시작 | DB 손상 | fail-fast, 재생성 금지 |
| P42 | 재시작 | Last-Event-ID 부재 | delivered 전체 재push |
| P43 | #8 | admin 바인딩 | 127.0.0.1+CF Access |
| P44 | #8 | admin scope | read/write |
| P45 | #8 | 부트스트랩 | 로컬 CLI |
| P46 | #8 | 세션 조회 | 메타만 |
| P47 | #8 | yaml 쓰기 | API 우선+/admin/reload |

---

## 3. 충돌 점검 로그

| 일자 | 항목 | 충돌 대상 | 처리 |
|------|------|----------|------|
| 06-11 | #1 | T10.6 휘발 허용 | 폐기 |
| 06-11 | #15 | GET /poll | SSE 교체 |
| 06-11 | #2 | 토큰 env로만 관리 | 에이전트측 규칙으로 재정의 |
| 06-11 | #2 | UNAUTHORIZED_POLL | UNAUTHORIZED로 일반화 |
| 06-11 | #3 | jobs 스키마 | egress_status, platform_message_id 추가 |
| 06-11 | #5 | _source_url·url·가드·T5.21·getUrl | 일괄 삭제/교체 |
| 06-11 | #6 | 세션 서술·D3/D5/D10 | 6.3 재작성·해소 |
| 06-11 | G1 | #1 상태머신 | queued+result→completed 추가 |
| 06-11 | G4 | G4 초안 | 플랫폼별 일반화 → G2~G4 재시작 보강으로 확장 |
| 06-11 | #7 | #1 상태머신·T5.11 | listen 타입 lease 제외 |
| 06-11 | 4.2 | PRD 4.2/4.5 | 태깅·합성 필터 추가 |
| 06-11 | #10 | C5/D8·resolved 용어 | 해소·갱신 |
| 06-11 | #16 | Gemini 트리거·세션 레코드 | 해소·컬럼 보강 |
| 06-11 | #9 | D6·LSP | 해소. L19 완료 처리 |
| 06-11 | 재시작 | G1~G6 산재 규칙 | 통합 절 신설, G7~G9 추가 |
| 06-11 | #8 | PRD 8절·리뷰B 4.3 | 재작성·해소 |
| 06-11 | 번호체계 | L/P 혼용 혼동 | 번호 체계 정의 섹션 추가, L-prefix 명시 |
| 06-11 | 재시작 보강 | #9 audit-시스템로그 혼용, G2~G4 미완, jobs 스키마 | 새 세션 검토 반영 — audit/시스템로그 분리 명문화, G2~G4 재정의, jobs 스키마 보강, at-least-once 명문화, 복구 트랜잭션 egress pending 추가 |

---

## 4. PRD 반영 대기 메모

**교체/재작성**: 7.2(SSE), 6.3(세션), 6.5(가드), 8절(Admin), 9-D(audit), 9-A(SDK)

**삭제**: GET /poll, _source_url, url 필드, legacy session_id, T10.6 휘발, UNAUTHORIZED_POLL

**신규 엔드포인트**: GET /agents/:id/events, POST /agents/:id/a2a, GET /health, GET /ready, POST /admin/reload

**신규 에러코드**: AUDIT_UNAVAILABLE, CC_RESPONSE_FORBIDDEN, A2A_INVALID_SESSION, A2A_NOT_PARTICIPANT, A2A_SESSION_EXPIRED, JOB_EXPIRED, JOB_DEAD_LETTER, UNAUTHORIZED(개명)

**신설 절**: 재시작·복구 프로토콜 / 어댑터 계약(플랫폼별) / 전송 추상 계약

**agents.yaml 추가**: system.queue, system.egress, system.audit, system.admin 블록

**4절 보강**: 4.2 태깅·합성 필터, 4.5 합성 규칙

**9-A SDK 보강**: 재시도, 태깅, 합성 필터, Mem0 기록 규율

**용어집**: resolved 내용 중립, job 상태 6종, 종료 마커 5종, SSE 이벤트 타입(job/listen), topic, parent_session_id, at-least-once 전달 보장 수준

**테스트 추가/갱신**: T5.11~12·T5.13~15·T5.17·T5.21~29 갱신 / T7.4~7.8 / T9.8~12 / T10.11~17·T10.18~39 신설 / TA.1~6 신설
