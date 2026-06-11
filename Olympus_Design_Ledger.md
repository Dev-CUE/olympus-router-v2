> ⛔ **새 세션 필수 — 설계 착수 전 반드시 읽어라**
> 1. `HANDOFF.md` (단일 진입점 — 현재 위치·역할·다음·문서 지도)
> 2. `Olympus_Session_Protocol.md` (킵 프로토콜 + 핸드오프 규칙 + 혼동 사전 + 푸시 트리거 규칙)
> 이 원장만 읽고 설계에 착수하지 마라 = 프로토콜 위반. SSOT 우선순위: PRD > 이 원장 > 핸드오프(HANDOFF.md).
> ※ 진입점 일원화(06-11): 과거 `Olympus_Design_Handoff_New_Session.md`는 HANDOFF.md로 통합됨.

# Olympus v6.13 설계 원장 (Design Ledger)

> **성격**: PRD v6.13 일괄 반영 전까지의 작업용 원장. SSOT는 여전히 PRD — 이 문서는 세션 유실 방지용 브릿지.
> **규칙**: 항목 확정 시 이 문서에만 누적. PRD는 전 항목 완료 후 1회 일괄 갱신(v6.13).
> **갱신**: 2026-06-11 | 진행: A2A군 + 16·재개·9(+19)·재시작(보강)·8·L21·L20·L17·L18·L22·L23 확정 / 잔여: LB

---

## 0. 프로세스 규칙

1. 설계 순서(의존성 기준): [기반] 1→2→3 / [A2A] 5→6→7→10 / [운영] 16→9→8→L21(완료)→L20(완료) / [구조] L17(완료)→L18(완료)→L19(완료)→L22(완료)→L23(완료) / [최후] **LB**
2. 매 항목 종료 시 기존 킵 항목과 충돌 점검 의무. 충돌 시 즉시 앞 항목 수정 + 이력 기록.
3. 보류 결정은 "결정 대기(P-prefix)" 섹션에 누적, 전 항목 완료 후 일괄 결정.
4. PRD 반영 시 Changelog는 v6.13 단일 항목.
5. **프로세스 규칙 전문은 Session_Protocol.md로 분리**. 킵·핸드오프 갱신·혼동 사전·푸시 트리거 규칙은 거기 참조. 여기서 중복하지 않는다.

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
> platform_message_id·기타 job 레코드는 `completed_retention_h`(기본 72h) 동안만 보존, job 청소 시 함께 소멸. 무한 누적 없음(G2 dedup 보호 창 ≪ retention).

**영속성**: T10.6(휘발 허용) 폐기 → durable. 백엔드 SQLite(L17 저장소 인터페이스 경유). 재시작 시 queued 복원, delivered→queued 회수.

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
- **레코드**: session_id, context_key, origin_agent, participants[{agent_id, role}], mode, round, speaker_counts, status, created_at, last_activity, topic, parent_session_id, tenant_id(L18 확정 — 항상 존재, 단일은 default)
- **SSOT**: speaker_counts·round = 세션 레코드. 에이전트 제출값 무시
- **영속화**: #1과 동일 SQLite sessions 테이블. 재시작 복구 트랜잭션 포함
- **TTL**: sliding idle 1h + absolute cap 24h. 만료 시 A2A_SESSION_EXPIRED 통지
- **테스트**: T5.17 갱신 / T5.25~29 / T5.22 갱신

### [재시작 시나리오 공백 레지스터 G1~G9] (확정 — 보강 완료)

| G | 내용 | 처리 |
|---|------|------|
| G1 | queued 회수 후 result 도착 경쟁 | queued 상태에서도 result→completed 허용. 시스템 로그로 추적 |
| G2 | egress 재시도 ~21s < 어댑터 재기동 + platform_message_id 재발사 | [1,4,16,60,120]s + platform_message_id jobs 기록으로 라우터가 재발사 차단. **이 기록은 job retention(completed_retention_h 72h) 종속 — job 청소 시 동반 소멸, 무한 누적 없음.** 재시도 창(분) ≪ retention(72h)이라 보호 충분. retention 만료 후 지각 재시도는 UNKNOWN_JOB로 이중 차단 |
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

**L22 선결정**: 단일 라우터 + 수직 확장 우선. 수평 전환 전제조건은 L22에서 계약으로 확정(완료).

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
- **(L23 연계) 보존·세그먼트**: audit는 일→월 세그먼트(`audit-YYYYMM.db`)로 롤오버, 보존·삭제 정책은 L23 참조. 세그먼트 경계 prev_hash 인계로 체인 연속.
- **테스트**: TA.1~TA.5

### [재시작·복구 프로토콜 통합] (확정 + 보강 — PRD 독립 절 신설)

**불변식**: 모든 경계 = (재시도+멱등) 쌍 → 유실 0·중복 0·수동 0

**라우터 부팅 시퀀스**:
```
1. config fail-fast
2. SQLite quick_check (실패 = 기동 중단 + 알림, 자동 재생성 금지)
2-b. user_version 마이그레이션 게이트 (L17) — 스키마 버전 불일치 시 마이그레이션 후 진행
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
- **/ready 게이팅**: 어댑터도 /ready 노출. ready 전 도착한 egress는 503 → 라우터 #3 재시도 스케줄로 흡수. 어댑터는 무상태이므로 재동기화 핸드셰이크 불요(명문화).

**에이전트**: SSE 접속
- Last-Event-ID 제출 = 연결 단절(유실분만 재push)
- Last-Event-ID 미제출 = 신규 시작 신호 → delivered 전체 재push + lease 갱신 (G9)

**호스트 전체**: 라우터 ready → 어댑터 순서 권장(compose healthcheck). 어긋나도 G5(ingress 재시도) 흡수.

**시스템 로그**: G1~G4 전이 추적. audit와 독립 레이어. 로그 형태·retention·쿼리는 L20 소관.

**at-least-once 명문화**: 게시→dedup 커밋→ACK 사이 어댑터 사망 시 잔여 중복 게시 가능 — at-least-once 속성으로 명문화. 어댑터 dedup 영속화(P21)로 최소화하되 완전 제거는 보장하지 않음(exactly-once 불가).

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

### [#L21] rate limit·quota — 유량 제어 계약 (확정 — L18 정합 갱신)

> 라우터 인입 경계의 유량 보호. **인프라 가용성 보호 장치**이지 보안 게이트가 아니다(인증 #2와 레이어 구분).

- **제어 키**: **agent_id 단위.** L18 tenant 키 계약 확정 후, 키는 `{tenant_id}:{agent_id}` 형태로 자연 확장(단일 테넌트는 `default:{agent_id}`). tenant별 rate limit·quota 수치 override는 L18 키 위에서 가능 — 별도 tenant 재작업 불요(L18에서 회수 완료).
- **알고리즘**: **token bucket**. 키당 (tokens, last_refill) 2값 — 경량. fixed window·sliding log 기각. 근거: A2A DIALOGUE 라운드 버스트성.
- **rate limit vs quota 2층 분리**:
  - **rate limit**: 초/분 순간 유량(버킷). 초과 시 `RATE_LIMITED` 429 + `Retry-After`.
  - **quota**: 시간·일 누적 총량. 초과 시 `QUOTA_EXCEEDED` 429 + 리셋 시각.
- **quota 계량 단위**: **건수 기반.** 비용 기반은 Dumb Pipe 위반이라 기각.
- **cc(listen) 계상**: **rate limit은 cc 포함 적용**, **quota 건수는 to만 카운트**.
- **영속성**: rate limit 버킷=인메모리(재시작 가득 복원). quota 카운터=영속(SQLite `quota_usage`: key, window_start, count). key는 L18 정규화 키. **(L22 정합) 인메모리 버킷은 수평 확장 시 라우터별 분산 → 공유 버킷 필요(L22 전제조건).**
- **fail 모드**: **fail-open.** 인증(#2)=보안=fail-closed / 유량(L21)=가용성=fail-open 명문 구분.
- **A2A 경로**: rate limit 시 해당 호출만 429, 세션 미파괴. speaker_counts(#6, 회의 독주 방지)와 별 레이어.
- **설정안**:
```yaml
system:
  rate_limit:
    enabled: true
    default:
      rate: { capacity: 60, refill_per_sec: 1 }
      quota: { window: "1d", max_requests: 10000 }
    overrides:                                       # {tenant}:{agent} 또는 agent_id별
      - agent_id: "zeus"
        rate: { capacity: 120, refill_per_sec: 2 }
    fail_mode: "open"
```
- **신규 에러코드**: `RATE_LIMITED`, `QUOTA_EXCEEDED`
- **테스트 (TR 대역)**: TR.1~8 (버킷 소진 429 / Retry-After / quota 리셋 / 재시작 영속 / fail-open / override / A2A 세션 미파괴 / cc 비계상). TR.6 override는 L18 tenant 키 정합 포함.

### [#L20] SLO·관측성 — 지표·알람·SLO (확정 — L22 어댑터 지표 보강)

> 라우터의 건강 상태를 숫자로 노출하고(지표), 위험선 초과 시 알린다(알람). 외부 인프라 직접 호출 금지(원칙 6) 유지 — 라우터는 노출·기록까지만, 알람 판정·발신은 별도 워커.

- **지표(metrics) 노출 (D-L20-1 확정)**: 라우터는 **수치만 노출, 대시보드 화면은 안 그림**(Dumb Pipe 정신). **향후 외부 대시보드(Grafana 등)를 연결할 수 있도록 조회 API 제공.** 두 형태 병행:
  - `/metrics` — Prometheus 텍스트 익스포지션(표준 모니터링 도구 연결용)
  - `/metrics.json` — JSON(자체 화면·스크립트·간단 조회용)
  - 같은 수치를 형식만 다르게 내놓음. 라우터 내장 대시보드(차트 렌더링)는 채택 안 함 — UI 로직은 원칙 충돌.
  - **(L22 보강) 어댑터도 동일 `/metrics`·`/metrics.json` 노출**(L20 형식 재사용). 라우터만 보면 어댑터 병목을 놓침. 어댑터 지표는 무상태 원칙상 인메모리 카운터+노출만. 관측 워커가 라우터·어댑터 지표를 함께 수집.
- **노출 바인딩 (D-L20-2 확정)**: **#8 admin과 동일 정책 — 127.0.0.1 기본 비공개.** 외부 노출은 expose:true + CF Access 전제. 트래픽 패턴 유출 방지.
- **핵심 지표 (4 골든 시그널)**:
  - Latency: ingress→egress 내부 처리 시간, A2A 라운드 지연, SSE push 지연(히스토그램)
  - Traffic: ingress/egress/result/a2a 요청률, SSE 활성 연결 수
  - Errors: 에러코드별 카운트(RATE_LIMITED·QUOTA_EXCEEDED·A2A_*·JOB_*·AUDIT_UNAVAILABLE), egress 재시도율·dead_letter율
  - Saturation: 큐 깊이(queued 수), lease 활성 수, quota 소진 임박 키 수, 단일 writer 큐 대기 시간(L17)
  - 도메인 지표: 세션 활성 수, audit 큐(closed 백프레셔), Obsidian SLA 위반 카운트
  - **(L22 보강) 어댑터 지표**: 플랫폼 API 호출 지연·실패율, 어댑터 인입 처리량, egress 적체
- **SLO 수치 (D-L20-3 확정 — 자리표시자, 실측 후 재조정)**: 실연동 데이터 없는 현 시점엔 **목표 후보로만 선언**, 실측(T10.x) 후 v6.13+ 재조정. 근거 없는 단정 회피.
  - 라우팅 가용성: 99.5%(초기 보수값, 단일 라우터 수직 확장 전제 — 단일 라우터는 SPOF, L22 수용 위험)
  - ingress→egress p95 내부 지연: < 2s(플랫폼 게시 제외)
  - Obsidian SLA: 마커 60s / 배치 15분(#16 확정 — L20은 위반 측정·알람만)
- **알람 (D-L20-4 확정 — UI 설정으로 변경)**: 알람 규칙(어떤 지표가 어떤 임계 초과 시 알림)을 **#8 Admin UI에서 설정 → yaml 저장 → 관측 워커가 yaml 읽어 판정·Telegram 발신.** 운영자가 코드 수정 없이 임계·on/off 조정. **라우터는 Telegram 직접 호출 안 함(원칙 6 유지)** — 발신은 별도 관측 워커(audit·wiki 워커와 동일 비동기 분리 패턴).
  - 알람 트리거 후보: dead_letter 발생(#3/P13 회수) / audit closed 차단 발생 / 큐 깊이 임계 초과 / quota 소진율 급증 / Obsidian SLA 위반(#16 회수) / SSE 연결 0 지속(에이전트 전체 단절) / **(L22) 스케일업 검토 신호(지속 포화)**
  - 채널: 기존 Telegram 에스컬레이션(escalator) 재사용. PagerDuty 등 외부는 비범위.
- **시스템 로그 형식 (확정 — 일단위 파일 롤링)**: job 상태 전이(#3/재시작 G1~G4 이관)는 **구조화 JSON 1줄/이벤트**(job_id, agent_id, from_state, to_state, reason, ts). **파일은 일단위 생성·롤링, 파일명 `system-YYYYMMDD.log` 형식**(예: `system-20260101.log`). 자정 롤오버. **(L23 연계) 일→월 합본·retention은 L23 참조.**
  - retention(보존 기간) 수치는 **L23 이관**(D-L20-5). L20은 로그 스키마·파일 규칙·조회 인터페이스까지만.
- **레이어 구분**: 관측 지표(L20) ≠ audit 로그(#9). audit는 컴플라이언스(메시지 내용), L20은 운영 관측(상태·수치). 별 레이어 — 혼동 사전 박제.
- **설정안**:
```yaml
system:
  observability:
    metrics:
      enabled: true
      bind: "127.0.0.1"          # 기본 비공개. 외부는 expose+CF Access
      expose: false
      formats: ["prometheus", "json"]   # /metrics, /metrics.json (라우터·어댑터 공통)
    system_log:
      dir: "data/logs/"
      file_pattern: "system-{YYYYMMDD}.log"   # 일단위 롤링
      rollover: "daily"
      # retention: L23 소관
    alerts:
      enabled: true              # 규칙은 Admin UI에서 관리(yaml 기록)
      channel: "telegram"
      rules: []                  # Admin UI가 채움 (metric·threshold·on/off)
```
- **테스트 (TO 대역 신설, D-L20-6)**: TO.1 /metrics Prometheus 포맷 유효성 / TO.2 /metrics.json 유효성 / TO.3 골든 시그널 카운터 증가 / TO.4 dead_letter 시 알람 트리거 / TO.5 Obsidian SLA 위반 카운트 / TO.6 /metrics 비공개 바인딩(외부 차단) / TO.7 관측 워커가 라우터 직접 호출 안 함(원칙 6 격리) / TO.8 시스템 로그 일단위 파일 롤링(파일명 규칙) / TO.9 어댑터 /metrics 노출(L22)

### [#L17] 운영 저장소 계층 규약 — SQLite 구현 + 추상화 (확정)

> 범위 = **계층 1(라우터 운영 DB)만**. 큐(#1)·토큰(#2/#8)·세션(#6)·quota(L21)·audit(#9)·Raw(v6.9). 계층 2(대고객 서비스 DB)는 서브프로젝트로 분리 — 아래 확장 메모만.

- **저장소 추상화 인터페이스 (갈래 C 확정)**: 운영 DB 접근을 **단일 저장소 인터페이스 뒤로** 숨긴다. Raw-sink 패턴(v6.9)을 운영 DB 전체로 확대. 백엔드 교체 시 라우터 코어 코드 무수정.
  - 1차 구현: SQLite. 전환 대상: PostgreSQL(코어 수평 확장 시 = L22, 또는 대고객 서브프로젝트 연계). 전환 시 트랜잭션 격리 수준 차이는 L22에서 상세.
- **WAL 모드 (D-L17 확정)**: 전 운영 DB에 `journal_mode=WAL` 적용 — 쓰는 중 읽기 비차단(Admin 조회 끊김 방지). 보조 파일 `-wal`·`-shm` 2개 동반(정상). 백업·삭제 시 본 파일+보조 2개 = **3개 한 묶음**(L23 연계). audit.db의 WAL은 해시 체인 append-only와 충돌 없음(WAL은 저장 방식, 논리 append 유지 — 명문화).
- **동시 쓰기 직렬화 (D-L17-2 확정)**: SQLite는 동시 쓰기 하나만 허용 → **라우터 내부 단일 writer 큐**로 충돌(SQLITE_BUSY) 구조적 회피(1차). + **busy_timeout 명시 설정**(기본값 0=즉시 에러이므로 반드시 설정, 예 5000ms) 2차 안전망. PRD 기존 "fire-and-forget 큐 직렬화"를 전 쓰기 경로로 일반화.
- **파일 분리 (D-L17-1 확정)**:
  - `data/queue.db` (+ -wal, -shm) — 큐·tokens·tokens_admin·sessions·quota_usage **단일 파일**(재시작 복구를 단일 원자 트랜잭션으로; 쪼개면 원자성 깨짐)
  - `data/audit.db` (+ -wal, -shm) — 감사 전용 분리(불변·해시 체인, #9). **(L23) 월 세그먼트 시 `audit-YYYYMM.db`로 분화**
  - `data/wiki/raw.db` (+ -wal, -shm) — Raw 백엔드 옵션(raw_backend:sqlite일 때만)
- **스키마 마이그레이션**: `user_version` PRAGMA로 버전 관리. 재시작 시퀀스 quick_check 직후 **마이그레이션 게이트** 추가.
- **DB 라이브러리 (D-L17-3 확정 — PRD "내장 우선" 변경)**: **better-sqlite3 채택.** 근거(검색 확인): node:sqlite는 RC지만 여전히 "experimental" 표기 + busy_timeout 기본 0; better-sqlite3는 성숙·동기 API·production 실적, 단일 VPS Docker라 네이티브 빌드 의존 부담 작음. 큐·세션·복구 트랜잭션 동시성 안정성이 중요. node:sqlite는 experimental 졸업 후 전환 가능으로 열어둠(저장소 인터페이스로 교체 용이).
  - ⚠️ 이는 PRD 9절 "node:sqlite 내장 우선, 외부는 별도 승인" 결정의 변경 — CUE 승인 완료(이 항목 킵).
- **확장 메모 — 계층 2 (대고객 서비스 DB, 설계 안 함·자리만)**: 회원·가입·구독·결제·테넌트는 **별도 서브프로젝트**. **PostgreSQL급 RDB**(조인이 본질), **별도 DB로 격리**. 라우터는 계층 2 직접 호출 금지(원칙 6). 멀티테넌시(9-B) tenant 키가 계층 2에서 실체화될 접점. 대시보드 사업 지표(가입자·매출·구독)는 계층 2 별도 데이터 소스 — L20 운영 metrics와 구분. **이번 코어 설계가 이를 막지 않음만 보장**(현 단계 = 코어 검증 우선).
- **테스트 (TS 대역 신설, D-L17-4)**: TS.1 WAL 모드 활성 확인 / TS.2 쓰기 중 읽기 비차단 / TS.3 단일 writer 직렬화로 SQLITE_BUSY 미발생 / TS.4 busy_timeout 동작 / TS.5 단일 queue.db 원자 복구 / TS.6 audit·raw 파일 분리 / TS.7 user_version 마이그레이션 게이트 / TS.8 저장소 인터페이스 백엔드 교체 시 코어 무수정

### [#L18] tenant_id 구체화 — 키 계약·범위 (확정)

> 범위 = **키 계약만**(D-L18-1 확정). tenant **발급·인증·과금**은 대고객 서비스(서브프로젝트, L17 계층 2)의 책임. 코어는 "tenant_id를 격리 키에 끼우는 규칙"만 안다. PRD 9-B "본격 멀티테넌시 안 함, 키 자리만"의 구체화이지 멀티테넌시 구현이 아니다.

- **v1 호환 불필요 (CUE 확정)**: v1은 가능성 검토용으로 종료, **현재 미사용**. 따라서 v1 키 호환 부담 없음 → 더 깨끗한 "항상 prefix" 방식 채택 가능.
- **키 prefix 계약 (D-L18-2 확정 — 항상 prefix·기본값 default)**:
```
context_key  {tenant_id}:{platform}:{space_type}:{space_id}:{topic_id}
persona_key  {tenant_id}:{agent_id}        (플랫폼 prefix 금지 원칙 유지)
session_id   {tenant_id} 접두
```
  - **항상 tenant_id prefix를 붙인다.** 단일 테넌트(현 단계)는 고정 기본값 `tenant_id = "default"`. 조건 분기(있으면 prefix/없으면 생략) 없음 → 키가 항상 같은 모양, 디버깅·로그 명확. tenant 도입 시 `default`만 실제 id로 치환, 코드 변경 0.
  - 근거: v1 호환 불필요해져 "생략 후 추가" 방식의 이점 소멸. 분기 없는 일관성이 우월.
- **tenant_id 출처 (D-L18-3 확정)**: **현 단계는 고정 기본값 `default` 주입**(설정/상수). 향후 토큰(#2)에서 도출(agent_id처럼 위조 불가) — 단 토큰↔tenant 바인딩은 **대고객 서비스 서브프로젝트** 책임. 코어는 구조만 정의.
- **tenant_id 형식·정규화**: URL-safe(영숫자+하이픈), 길이 상한, 구분자 `:` 금지(context_key 충돌 방지), 예약어 금지(`system` 등). `default`는 단일 테넌트 기본 예약값.
- **격리 의미 (D-L18-4 확정)**:
  - tenant 간 **완전 격리** — 메시지·세션·quota·큐가 tenant 경계를 넘지 않음. tenant_id가 모든 격리 키의 최상위 prefix.
  - **persona는 tenant별 격리**(`{tenant_id}:{agent_id}`). 상용에서 고객 A의 Zeus와 고객 B의 Zeus는 다른 인격·기억(데이터 격리=상용 필수). 단일 테넌트(default)에선 차이 없음.
  - **"플랫폼 초월 공유"와 충돌 아님** — persona는 **플랫폼은 초월(공유)하되 tenant는 격리**. 축이 다르다(혼동 사전 박제): 플랫폼 격리 금지 ≠ tenant 격리 허용.
- **L21 tenant 회수 (P54 해소)**: L21이 미뤘던 tenant rate limit·quota는 본 키 계약 위에서 `{tenant_id}:{agent_id}` override로 자연 적용. L21 tenant 적용분 정합 완료 — 별도 tenant 재작업 불요.
- **현 동작 보장**: 코어는 tenant 없이 돌던 게 아니라 **항상 `default` prefix로 돈다**. 키 생성 함수는 tenant_id 주입 형태. 단일 테넌트 = `default` 고정.
- **L22 연계**: tenant별 데이터 증가 시 수평 분할(샤딩) 후보 키가 tenant_id. L22가 1순위 샤딩 축으로 받음.
- **테스트 (TS 대역 공유, D-L18-5)**: TS.9 항상 prefix 적용(단일=default) / TS.10 tenant prefix 키 정규화 / TS.11 tenant 간 격리(메시지·세션·quota 경계) / TS.12 persona tenant 격리(`{tenant}:{agent}`)·플랫폼 초월 동시 성립 / TS.13 예약어·구분자(`:`) 충돌 거부 / TS.14 default 고정 시 현 동작 정상

### [#L22] 수평 확장 경로 — 전환 전제조건 계약 (확정)

> **수평 확장을 구현하지 않는다.** 단일 라우터+수직 확장이 현 정답(코어 검증 우선). L22는 천장에 닿았을 때 다중 라우터로 넘어가기 위한 **전제조건 체크리스트 + 전환 신호**만 계약으로 명시. 멀티테넌시(9-B)·tenant 키(L18)와 동일 "자리만" 패턴.

- **현 전제 재확인**: 단일 라우터 + 수직 확장(CPU·RAM 증설) 우선. 단일 라우터는 **SPOF**(단일 장애점) — 현 단계 수용 위험(가용성 SLO 99.5%가 이 전제, L20 정합).
- **스케일업 판단 지표 (CUE 지적 반영 — 전환 신호)**: 수직 증설로 못 버티는 순간을 **관측으로 가늠**. L20 지표 재사용(신규 모니터링 안 만듦):
  - 라우터: SSE 동시 연결 수, 큐 깊이 지속 상승, ingress→egress p95 지연 상승, **단일 writer 큐 대기 시간(SQLite 쓰기 병목, L17)**, CPU·RAM 포화
  - **어댑터(CUE 지적): 플랫폼 API 호출 지연·실패율, 어댑터 인입 처리량, egress 적체** — 어댑터가 먼저 막힐 수 있으므로 어댑터도 `/metrics` 노출(L20 보강). 관측 워커가 라우터·어댑터 함께 수집.
  - 이 지표들이 **지속적으로** 임계 근접 = 수평 전환 검토 신호. L20 알람에 "스케일업 검토" 임계 추가 가능(Admin UI 설정).
- **수평 전환 시 깨지는 가정 = 전제조건 체크리스트 (D-L22-1 확정 — 체크리스트+권고 해법, 구현 비범위)**:
  1. **상태 공유** — 큐·세션·quota가 라우터 로컬 SQLite. 다중 라우터면 각자 DB로 갈림. → 공유 저장소(PostgreSQL)로 전환(L17 저장소 인터페이스가 길 열어둠).
  2. **SSE 연결 고정** — 에이전트가 라우터 A에 연결, job은 B에 쌓이면 미전달. → 연결-라우터 어피니티 또는 공유 큐 pull.
  3. **단일 writer 직렬화** — L17 단일 writer 큐는 단일 프로세스 전제. 다중이면 DB 레벨 동시성(PostgreSQL MVCC·행 락)으로 대체.
  4. **세션 SSOT** — #6 라우터 session_id SSOT. 다중이면 공유 세션 저장소 필수.
  5. **idempotency·dedup** — 라우터별 로컬이면 중복 통과. → 공유 dedup 저장소.
  6. **(D-L22-3) L21 rate limit 인메모리 버킷** — 다중 라우터에서 한도가 라우터별 분산(고객이 라우터 수만큼 초과 가능). → 수평 전환 시 공유 버킷(저장소/캐시) 필요.
- **샤딩 축 (D-L22-2 확정)**: **tenant_id를 1순위 수평 분할(샤딩) 축**으로 명시. L18 키 구조(모든 키 최상위 prefix=tenant_id)가 이를 지원. 단일 테넌트(default) 단계엔 무의미, 다중 테넌트 시점 전제.
- **전환 막지 않기 위한 현 단계 계약**: 상태는 저장소 인터페이스 경유(L17 — 로컬 메모리 가정 코드 금지). session_id·idempotency 검사는 저장소 통해(인메모리 전용 금지). L21 인메모리 버킷은 "수평 전환 시 공유화 필요" 항목으로 명시.
- **테스트 (TS/TO 대역 공유)**: TS.15 상태가 저장소 인터페이스 경유(로컬 메모리 하드코딩 0) / TS.16 session·idempotency 저장소 경유 / TO.9 어댑터 /metrics 노출(스케일업 판단 지표) / 다중 라우터 실런타임 테스트는 전환 구현 시점(현 비범위).

### [#L23] 데이터 보존·삭제 정책 (확정)

> 코어 전체의 보존 기간(retention)·삭제 규칙을 단일 정책으로 확정. 각 항목이 "L23 이관"으로 미뤘던 것을 회수. 삭제·관리 UI·플랜·과금은 대고객 서브프로젝트 책임(L18·L17 계층 2 분리 일관), 코어는 메커니즘·인터페이스만.

#### A. 일→월 롤오버 공통 정책 (D-L23-1 확정)
- **단위**: 일단위 파일 → 월단위 파일 (텍스트·DB 공통 **정책**). 구현 메커니즘은 레이어별 분리(혼동 사전 유지 — audit≠시스템 로그).
- **경계**: 기준시(base timezone) 자정. 일·월 롤오버 모두 동일 기준.
- **기준시**: 코어 폴백 기본값 **UTC**. 운영 주입 디폴트 **UTC+9(Asia/Seoul)**. tenant별 타임존은 대고객 서브프로젝트 주입(코어는 주입 인터페이스만). 설정 경로: 관리자 UI → yaml → 로그/audit 워커 적용(L20 알람 패턴 동형).
- **기준시 변경 적용**: 진행 중 일/월 파일은 기존 기준 유지, **다음 월 경계부터** 신 기준 적용. 변경 이력 yaml 기록.
- **롤오버 원자성**: L17 단일 writer 큐 경유 파일 스위칭. 경계 시점 레코드는 큐 순서대로 처리.
- **DST**: 기본 UTC라 무영향. 기준시가 DST 지역이면 경계 불균등(23/25h) 허용 — 무결성 무관, 명문화.

#### B. 레이어별 구현 (D-L23-2 확정)
| 레이어 | 일 파일 | 월 파일 | 무결성 |
|--------|---------|---------|--------|
| 시스템 로그(L20) | `system-YYYYMMDD.log` | `system-YYYYMM.log` 합본+gzip | 없음(운영) |
| audit(#9) | `audit-YYYYMMDD.db` | `audit-YYYYMM.db` 세그먼트 통합 | **해시 체인 보존**(컴플라이언스) |
- audit 월 통합 시 세그먼트 경계 **prev_hash 인계** 필수. 합본이 레코드·순서·해시 1비트도 변경 금지. 텍스트 concat 아님 — DB 세그먼트.

#### C. 회수 항목별 retention (D-L23-3 확정)
1. **audit.db**: 무결성=보존 구간 내 해시 체인 불변(절대). 보존 기간=tenant별 설정값 주입, **기본 30일**. 플랜↔기간 매핑·디스크 용량·과금은 서브프로젝트. **삭제는 세그먼트 단위, 세그먼트 전체가 30일 만료된 뒤에만 삭제(보존 30일 절대 미위반). 당월 활성 세그먼트 보호.** 중간 레코드 삭제 금지(체인 보호).
2. **시스템 로그**: 월파일 단위 보존. **기본 30일**(자리표시자, 운영 디버깅용). 초과 월파일 삭제. `system.observability.system_log.retention_days`.
3. **job 72h**: `completed_retention_h: 72` 유지. L23은 모순 점검만 → dedup창(분) ≪ job 72h ≪ audit 30일. **정합 OK.**
4. **WAL 3파일**: 본파일+`-wal`+`-shm` = 3개 한 묶음 백업·삭제 명문화. 라이브 백업은 `.backup`/`VACUUM INTO`(원자 스냅샷) 권장. 정책은 3파일 묶음 원칙 박제.
5. **quota_usage / 세션 / Mem0 / Obsidian**: quota_usage=만료 윈도우 행 정리(기본 7일, 목적은 재시작 복원). 세션(sessions)=cap 24h 후 디버깅·parent_session_id 추적용 보존(기본 30일) 후 정리. **Mem0/Obsidian=코어 소관 아님(원칙 6), 코어 미규정 명시.** 삭제는 SDK·워커 책임, 경계만 박제.
6. **tenant 삭제 연쇄**: `{tenant_id}:` prefix 가진 전 데이터 연쇄 삭제(context·session·quota_usage·job·rate limit 버킷). **audit는 보존 정책 따름**(직전 "예외 보존" 철회 — 플랜 기간제로 재확정). 법적 hold 시 보류 자리(판정은 서브프로젝트). 실삭제 트리거·실행=서브프로젝트, 코어는 prefix 연쇄 삭제 인터페이스만.

#### D. 데이터 관리 & 배치잡 — 단일 관리자 UI (D-L23-4 확정)
- **단일 관리자 인터페이스(서브프로젝트)**: 데이터 삭제/백업/추출 + 배치잡 생성·세팅을 하나의 관리자 UI에서 처리. (코어 #8 운영 admin과 별개 레이어 — 대고객 서브프로젝트 admin. 혼동 사전 후보.)
- **배치잡**: 관리자 UI에서 생성·설정(스케줄·on/off·retention·대상) → yaml 기록 → 배치 워커가 읽어 실행. L20 알람 패턴 동형. 라우터 직접 실행 금지, 별도 배치 워커(원칙 6).
  - 배치 2종: (1) 보존 만료 삭제(30일 충족 세그먼트 — audit·로그·세션·quota), (2) 해지 tenant 익일 연쇄 삭제(E절).
- **코어 책임**: 세그먼트 삭제·조회·추출·배치 실행 인터페이스 + 무결성 검증. 권한 판정·화면·스케줄러·플랜 매핑은 서브프로젝트.
- **audit 레코드 단위 삭제·수정 금지(관리자 권한 포함). 세그먼트 단위만.**
- **추출(export)**: audit는 해시 체인 포함(무결성 검증 가능) 형태 권고. 형식 상세는 서브프로젝트.
- **고객 UI**: 조회/내려받기만. 삭제 불가(삭제 API 미연결).

#### E. 고객 해지 → 익일 일괄 삭제 배치 (D-L23-5 확정)
- 해지 즉시: tenant 상태 `pending_deletion` 마킹 + 타임스탬프. 실삭제 안 함.
- 익일 배치: 기준시(tenant 타임존, 기본 UTC+9) 자정 이후, `pending_deletion` tenant 일괄 연쇄 삭제(C-6 prefix 기준).
- 유예 = 해지 철회 창(익일까지). 철회 시 마킹 해제.
- 멱등: 중복 실행·재시도 안전(삭제 완료 tenant skip).
- audit: 보존 정책 따름 — 해지로 즉시 삭제 안 함, 만료 시 세그먼트 정리.
- 주체: 서브프로젝트(배치 스케줄·상태관리). 코어는 prefix 연쇄 삭제 인터페이스만.

#### 설정안
```yaml
system:
  rollover:
    base_timezone: "UTC"              # 코어 폴백. 운영 주입 디폴트 "Asia/Seoul"(UTC+9)
    granularity: "daily_to_monthly"   # 일→월
  retention:
    audit_days: 30                    # 플랜 기반 주입, 기본 30. 세그먼트 단위 만료 삭제
    system_log_days: 30               # 자리표시자
    quota_usage_days: 7
    session_days: 30
    # job: completed_retention_h=72 (system.queue, 기존 확정 — 변경 없음)
    # Mem0/Obsidian: 코어 미규정(원칙 6, 외부)
```

- **테스트 (TD 대역 신설, D-L23-6)**: TD.1 일→월 롤오버 경계(시스템 로그) / TD.2 audit 월 세그먼트 통합+prev_hash 인계 / TD.3 기준시 자정 롤오버(UTC 폴백·Seoul 주입) / TD.4 시스템 로그 retention 월파일 삭제 / TD.5 audit 세그먼트 전체 30일 만료 후에만 삭제(미만료 거부) / TD.6 당월 세그먼트 삭제 거부 / TD.7 WAL 3파일 묶음 백업·삭제 / TD.8 quota_usage·세션 만료 정리 / TD.9 job 72h+dedup 정합 / TD.10 tenant 연쇄 삭제(audit 보존 확인) / TD.11 해지 pending_deletion 마킹(즉시 미삭제) / TD.12 익일 배치 연쇄 삭제+멱등 / TD.13 audit 레코드 단위 삭제 거부 / TD.14 배치잡 UI 설정→yaml→워커 실행 / TD.15 Mem0/Obsidian 코어 비책임 경계

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
| P13 | #3 | egress 영구 실패 알림 | L20 알람으로 확정(관측 워커 발신) |
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
| P48 | 재시작 | 어댑터 /ready 게이팅 | 채택 (ready 전 egress 503→#3 재시도) |
| P49 | L21 | rate limit 알고리즘 | token bucket |
| P50 | L21 | quota 계량 단위 | 건수 기반(비용 기각, Dumb Pipe) |
| P51 | L21 | rate limit fail 모드 | fail-open (인증 closed와 구분) |
| P52 | L21 | quota 카운터 영속 | SQLite quota_usage 테이블 |
| P53 | L21 | cc quota 계상 | 비계상 (rate limit만 적용) |
| P54 | L21 | tenant 단위 제어 | **L18에서 회수·해소** — {tenant}:{agent} 키 override로 적용 |
| P55 | L21 | 기본 한도값 | rate 60/리필1·quota 1d/10000 (override agent_id별) |
| P56 | L20 | 지표 노출 형태 | /metrics(Prometheus) + /metrics.json 병행, 라우터 내장 대시보드 기각 |
| P57 | L20 | 지표 바인딩 | 127.0.0.1 기본 비공개(admin 동일) |
| P58 | L20 | SLO 수치 | 자리표시자(가용성 99.5%/p95<2s), 실측 후 재조정 |
| P59 | L20 | 알람 관리 | Admin UI 설정→yaml→관측 워커 판정·Telegram 발신 |
| P60 | L20 | 알람 발신 주체 | 별도 관측 워커(라우터 직접 호출 금지, 원칙 6) |
| P61 | L20 | 시스템 로그 파일 규칙 | 일단위 롤링 system-YYYYMMDD.log |
| P62 | L20 | 시스템 로그 retention | **L23에서 회수·확정** — 월파일 단위 30일(자리표시자) |
| P63 | L17 | 저장소 추상화 | 단일 인터페이스, SQLite 1차·PostgreSQL 전환 대상(갈래 C) |
| P64 | L17 | WAL 모드 | 전 운영 DB 적용 (-wal·-shm 동반, 3파일 한 묶음) |
| P65 | L17 | 동시 쓰기 | 단일 writer 큐 + busy_timeout 병행 |
| P66 | L17 | 파일 분리 | queue.db 단일(운영) + audit.db + raw.db(옵션) |
| P67 | L17 | DB 라이브러리 | better-sqlite3 (PRD 내장 우선 변경, CUE 승인). node:sqlite는 졸업 후 전환 가능 |
| P68 | L18 | tenant 키 방식 | 항상 prefix, 단일 테넌트 기본값 default (v1 호환 불필요로 생략 방식 기각) |
| P69 | L18 | L18 범위 | 키 계약만. 발급·인증·바인딩은 대고객 서브프로젝트 |
| P70 | L18 | persona tenant | tenant별 격리({tenant}:{agent}). 플랫폼 초월과 다른 축 |
| P71 | L18 | tenant_id 출처 | 현 단계 default 고정, 향후 토큰 도출(바인딩은 서브프로젝트) |
| P72 | L22 | 수평 확장 범위 | 전제조건 체크리스트+전환 신호만. 구현 비범위 |
| P73 | L22 | 샤딩 축 | tenant_id 1순위 (L18 키 구조 지원) |
| P74 | L22 | 스케일업 판단 지표 | L20 지표 재사용(라우터+어댑터), 지속 포화 시 전환 신호 |
| P75 | L22 | 어댑터 지표 노출 | 어댑터도 /metrics 자체 노출(L20 형식), 관측 워커 수집 |
| P76 | L22 | 전환 전제조건 | 상태공유·SSE고정·writer직렬화·세션SSOT·dedup·L21버킷 공유화 (전환 시 해소) |
| P77 | L23 | 일→월 롤오버 | 텍스트·DB 공통 정책(구현 레이어별 분리). 일단위→월단위 |
| P78 | L23 | 기준시 | 코어 폴백 UTC / 운영 주입 디폴트 Asia/Seoul(UTC+9). tenant별은 서브프로젝트. 관리자 UI→yaml |
| P79 | L23 | audit 보존 | 플랜 기반(기본 30일). 세그먼트(audit-YYYYMM.db) 전체 30일 만료 후 통째 삭제, 당월 불가, 레코드 단위 삭제 금지 |
| P80 | L23 | 시스템 로그 retention | 월파일 단위 30일(자리표시자) |
| P81 | L23 | quota_usage·세션 보존 | quota_usage 7일 / 세션 30일 |
| P82 | L23 | Mem0/Obsidian 보존 | 코어 미규정(원칙 6, 외부 책임) |
| P83 | L23 | tenant 삭제 연쇄 | {tenant}: prefix 전 데이터. audit는 보존 정책 따름(즉시 삭제 아님), 법적 hold 자리 |
| P84 | L23 | WAL 백업·삭제 단위 | 본+ -wal + -shm = 3파일 한 묶음. 라이브 백업 .backup/VACUUM INTO 권장 |
| P85 | L23 | 데이터 관리/배치 UI | 단일 관리자 UI(서브프로젝트). 삭제/백업/추출+배치잡 생성·세팅. 고객 UI는 조회/내려받기만(삭제 불가). 코어는 인터페이스만 |
| P86 | L23 | 배치잡 설정 | 관리자 UI 생성·설정→yaml→배치 워커 실행(L20 알람 패턴). 2종: 보존 만료 삭제 / 해지 익일 연쇄 |
| P87 | L23 | 고객 해지 삭제 | 익일 배치(pending_deletion 마킹, 멱등, 철회 창). audit는 보존 정책 따름 |
| P88 | L23 | TD 테스트 대역 | TD.1~15 신설(롤오버·retention·삭제·배치) |

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
| 06-11 | 무단 푸시 | 재시작 보강이 CUE 승인 전 무단 푸시됨(이전 창) | 위반 기록. 내용은 합의안과 일치 → 롤백 없이 사후 추인(CUE 승인). 재발 방지로 Session_Protocol에 푸시 트리거 규칙 신설 |
| 06-11 | G2 보강 | retention 종속 누락 | platform_message_id가 job retention 72h 종속(무한 누적 방지) 명문화. P48(어댑터 /ready) 신설 |
| 06-11 | 문서구조 | 킵·핸드오프 규칙 PRD/원장 산재 | Session_Protocol.md 분리, 게이트 포인터 박제 |
| 06-11 | L21 | #2 fail-closed vs L21 fail-open | 충돌 아님 — 인증=보안=closed / 유량=가용성=open 레이어 구분 명문화 |
| 06-11 | L21 | #6 speaker_counts(10회) vs L21 rate limit | 충돌 아님 — 회의 독주 방지(A2A) vs 인프라 유량 보호(L21) 별 레이어. 혼동 사전 박제 |
| 06-11 | L21 | quota 비용 기반 vs Dumb Pipe | 비용 계량 기각, 건수 기반 확정 |
| 06-11 | L21 | tenant 제어 vs L18 미확정 | tenant 수치·키 L18 이관, L21은 agent_id만 확정 |
| 06-11 | 테스트 ID | T10.x 연장 vs 신규 대역 | rate limit·quota는 독립 관심사 → TR 대역 신설. Session_Protocol 혼동 사전에 테스트 ID 체계 박제 |
| 06-11 | L20 | #3/P13 egress 영구 실패 알림 | L20 알람 트리거로 회수·확정(관측 워커 발신) |
| 06-11 | L20 | #16 Obsidian SLA 위반 알람 | L20 알람 트리거로 회수(임계·채널 확정) |
| 06-11 | L20 | 알람 라우터 직접 발신 vs 원칙 6 | 관측 워커 분리로 회피. 라우터는 지표 노출·로그 기록까지만 |
| 06-11 | L20 | 알람 코드 규칙 vs UI 설정 | CUE 지시로 Admin UI 설정→yaml→워커 판정 방식으로 변경 |
| 06-11 | L20 | 라우터 내장 대시보드 vs Dumb Pipe | 내장 대시보드 기각, /metrics·/metrics.json API 노출만(외부 도구 연결) |
| 06-11 | L20 | 시스템 로그 형식 | 일단위 롤링 system-YYYYMMDD.log 확정(CUE 지시). retention은 L23 이관 |
| 06-11 | 테스트 ID | 관측 테스트 대역 | TO 대역 신설(TR과 동일 관심사 분리 논리). 혼동 사전 반영 |
| 06-11 | L17 | PRD 9절 "node:sqlite 내장 우선" | better-sqlite3로 변경(검색 확인: node:sqlite RC지만 experimental·busy_timeout 기본0). CUE 승인. 저장소 인터페이스로 향후 교체 가능 |
| 06-11 | L17 | #1·#6·#2·#8·L21 "동일 SQLite" 직접 참조 | 저장소 추상화 인터페이스 뒤로 일반화(갈래 C). 재작성 아니라 계층 삽입 |
| 06-11 | L17 | 대고객 서비스 DB 공백(CUE 지적) | 계층 2(회원·결제·구독, PostgreSQL 별도 DB)는 서브프로젝트로 분리. 코어 검증 우선, 확장 메모만. L24 별도 항목 미생성(CUE 결정) |
| 06-11 | 테스트 ID | 저장소 테스트 대역 | TS 대역 신설. 혼동 사전 반영 |
| 06-11 | L18 | v1 키 호환 | CUE 확정: v1 미사용·호환 불필요 → 항상 prefix(default) 방식 채택, 생략 방식 기각 |
| 06-11 | L18 | P54 tenant 제어 이관분 | L18 키 계약 위에서 {tenant}:{agent} override로 회수·해소 |
| 06-11 | L18 | persona "플랫폼 초월 공유" vs tenant 격리 | 충돌 아님 — 플랫폼 초월(공유)·tenant 격리는 다른 축. 혼동 사전 박제 |
| 06-11 | L18 | #6 세션 tenant(예약) 필드 | "항상 존재, 단일=default"로 구체화 |
| 06-11 | L18 | 범위 과확장 위험 | 키 계약만 확정. 발급·인증·바인딩은 대고객 서브프로젝트로 분리 |
| 06-11 | L22 | 단일 라우터 SPOF vs 가용성 | 현 단계 수용 위험으로 명문화(SLO 99.5% 전제). 수평 전환은 전제조건 충족 시 |
| 06-11 | L22 | L21 인메모리 버킷 vs 다중 라우터 | 전환 시 공유 버킷 필요 — L22 전제조건(P76)으로 명시. 현 단일은 무해 |
| 06-11 | L22 | 어댑터 지표 부재(CUE 지적) | 어댑터도 /metrics 노출(L20 보강). 스케일업 판단에 라우터+어댑터 함께 |
| 06-11 | L22 | 스케일업 판단 부재(CUE 지적) | L20 지표 재사용해 전환 신호 명시(지속 포화). 신규 모니터링 미신설 |
| 06-11 | L23 | L20 P62 시스템 로그 retention | L23에서 회수·확정(월파일 30일) |
| 06-11 | L23 | L17 WAL -wal·-shm | 백업·삭제 단위 3파일 한 묶음으로 L23 명문화 |
| 06-11 | L23 | #1 job 72h vs audit 30일 | 정합 점검 OK — dedup창 ≪ 72h ≪ audit 30일 |
| 06-11 | L23 | #9 audit 해시 체인 vs 기간 삭제 | 세그먼트(audit-YYYYMM.db) 단위 삭제로 양립. 중간 레코드 삭제 금지, 당월 보호, 세그먼트 전체 30일 만료 후 삭제 |
| 06-11 | L23 | audit 보존 vs tenant 연쇄 삭제(직전 "예외 보존") | 철회 — audit도 플랜 보존 정책 따름. 법적 hold만 보류 자리 |
| 06-11 | L23 | tenant별 타임존/audit 플랜/관리 UI vs L18 범위 | 코어는 주입·삭제·조회·추출 인터페이스만. 발급·플랜·과금·UI·권한은 대고객 서브프로젝트 — L18 분리 유지 |
| 06-11 | L23 | Mem0/Obsidian retention vs 원칙 6 | 코어 미규정(외부 책임)으로 회피 |
| 06-11 | L23 | 기준시 UTC vs 디폴트 Seoul | 코어 폴백 UTC / 운영 주입 디폴트 Asia/Seoul(UTC+9)로 양립 |
| 06-11 | L23 | 일→월 공통 롤오버 vs 혼동 사전(audit≠시스템 로그) | 정책만 공통, 구현 분리(텍스트 합본 vs DB 세그먼트)로 유지 |
| 06-11 | L23 | 관리자 삭제 vs audit 무결성 | 세그먼트 단위·당월 불가·레코드 단위 금지로 무결성 보존 |
| 06-11 | 테스트 ID | 보존·삭제 테스트 대역 | TD 대역 신설(TR/TO/TS 동일 관심사 분리 논리). 혼동 사전 반영 대상 |
| 06-11 | 문서구조 | 진입점 다중화(HANDOFF/Design_Handoff/v610) | HANDOFF.md 단일 진입점으로 일원화. Design_Handoff_New_Session 통합·v610 아카이브. 원장·Session_Protocol 게이트 포인터 갱신 |
| 06-11 | 16절 | 재논의금지 임시조치 | LLM 메모리 오염 방지용 임시 방어였음 → 킵 프로토콜이 대체, 해제(R6). R1~R5 이력 보존, "재논의 금지"→"확정·변경 시 CUE 승인" 완화 |

---

## 4. PRD 반영 대기 메모

**교체/재작성**: 7.2(SSE), 6.3(세션), 6.5(가드), 8절(Admin), 9-D(audit), 9-A(SDK), 9절(DB 라이브러리 better-sqlite3로 변경), 9-B(tenant 키 항상 prefix·default 구체화)

**삭제**: GET /poll, _source_url, url 필드, legacy session_id, T10.6 휘발, UNAUTHORIZED_POLL

**신규 엔드포인트**: GET /agents/:id/events, POST /agents/:id/a2a, GET /health, GET /ready(라우터·어댑터), POST /admin/reload, GET /metrics, GET /metrics.json (라우터·어댑터 공통)

**신규 에러코드**: AUDIT_UNAVAILABLE, CC_RESPONSE_FORBIDDEN, A2A_INVALID_SESSION, A2A_NOT_PARTICIPANT, A2A_SESSION_EXPIRED, JOB_EXPIRED, JOB_DEAD_LETTER, UNAUTHORIZED(개명), RATE_LIMITED, QUOTA_EXCEEDED

**신설 절**: 재시작·복구 프로토콜 / 어댑터 계약(플랫폼별) / 전송 추상 계약 / rate limit·quota 계약(L21) / SLO·관측성 계약(L20) / 운영 저장소 계층 규약(L17) / tenant 키 계약(L18) / 수평 확장 경로 계약(L22) / 데이터 보존·삭제 정책(L23)

**agents.yaml 추가**: system.queue, system.egress, system.audit, system.admin, system.rate_limit, system.observability 블록 / system.tenant(default 기본값·정규화 규칙) / system.rollover(base_timezone·granularity) / system.retention(audit_days·system_log_days·quota_usage_days·session_days)

**4절 보강**: 4.2 태깅·합성 필터, 4.5 합성 규칙

**9-B 구체화 (L18)**: tenant 키 = 항상 prefix(단일=default). context_key/persona_key/session_id 전부 `{tenant_id}:` 접두. persona는 tenant 격리·플랫폼 초월(다른 축). 발급·인증은 대고객 서브프로젝트. v1 호환 불필요 명시

**수평 확장 계약 (L22)**: 단일 라우터 우선(SPOF 수용). 전환 전제조건 체크리스트(상태공유·SSE고정·writer직렬화·세션SSOT·dedup·L21버킷). tenant_id 1순위 샤딩 축. 스케일업 판단 = L20 지표(라우터+어댑터) 지속 포화. 어댑터 /metrics 노출. 구현 비범위

**데이터 보존·삭제 정책 (L23)**: 일→월 롤오버(텍스트·DB 공통 정책, 구현 레이어별 분리). 기준시 UTC 폴백·운영 디폴트 Asia/Seoul. audit 플랜 보존(기본 30일)·세그먼트(audit-YYYYMM.db) 단위 삭제·당월 보호·레코드 단위 삭제 금지. 시스템 로그 30일. WAL 3파일 묶음. quota_usage 7일·세션 30일. Mem0/Obsidian 코어 미규정. tenant 삭제 연쇄(audit 보존 정책 따름). 단일 관리자 UI(서브프로젝트)=삭제/백업/추출+배치잡 생성·세팅, 고객 UI 조회/내려받기만. 고객 해지→익일 배치(pending_deletion·멱등·철회 창). 코어는 메커니즘·인터페이스만, 플랜·과금·UI·권한은 서브프로젝트

**관측 워커 신설**: 라우터와 분리된 비동기 워커. 라우터·어댑터 /metrics·시스템 로그 감시 → Admin UI yaml 규칙 판정 → Telegram 알람 발신(라우터 직접 호출 금지, 원칙 6)

**배치 워커 신설 (L23)**: 라우터와 분리된 비동기 워커. 관리자 UI yaml 배치 설정 읽어 실행 — 보존 만료 삭제(세그먼트 단위)·해지 tenant 익일 연쇄 삭제. 라우터 직접 실행 금지(원칙 6).

**저장소 인터페이스 신설**: 운영 DB 단일 추상화 계층(SQLite 1차/PostgreSQL 전환). better-sqlite3 채택(PRD 9절 변경). WAL·단일 writer 큐·busy_timeout·user_version 마이그레이션 규약. 9절 "node:sqlite 우선" 폐기

**대고객 서비스 계층(서브프로젝트, 향후)**: 회원·가입·구독·결제·테넌트 = PostgreSQL급 별도 DB. 라우터와 격리(원칙 6). 멀티테넌시(9-B) 실체화 접점(L18 tenant_id가 여기서 발급·바인딩). 대시보드 사업 지표 별도 소스. **데이터 관리 단일 관리자 UI·플랜↔보존 매핑·디스크 용량·과금·tenant 해지 트리거·tenant별 타임존 주입도 여기 책임(L23)**. 코어 검증 후 별도 프로젝트로 설계 — 현 v6.13 비범위

**용어집**: resolved 내용 중립, job 상태 6종, 종료 마커 5종, SSE 이벤트 타입(job/listen), topic, parent_session_id, at-least-once 전달 보장 수준, rate limit/quota 구분, fail-open(유량) vs fail-closed(인증), 4 골든 시그널, SLO/SLA 구분, 관측 워커, 저장소 인터페이스, WAL, 단일 writer 큐, 계층1(운영 DB)·계층2(대고객 서비스 DB), tenant_id(항상 prefix·단일 default), persona tenant 격리 vs 플랫폼 초월(다른 축), SPOF, 샤딩(tenant_id 축), 스케일업 판단 지표, 일→월 롤오버, 기준시(base_timezone), audit 세그먼트(audit-YYYYMM.db), WAL 3파일 묶음, 배치 워커, pending_deletion(해지 익일 배치)

**문서 구조**: Session_Protocol.md 신설(프로세스 분리) / PRD·원장·핸드오프 게이트 포인터 / PRD 목차 추가 / 물리 분할은 v6.13 시점 보류 / 진입점 일원화(HANDOFF.md 단일, Design_Handoff_New_Session 통합·Handoff_v610 아카이브, 06-11)

**16절 Decision Reversal Log — R6 추가**: "재논의 금지" 강제 절차(확정 결정 번복 시 16절 기록+CUE 승인 의무)는 **LLM 세션 간 메모리 오염으로 확정 결정이 반복 번복·재논의되던 문제를 막기 위한 임시 방어 조치**였음. 킵/고잉 프로토콜+푸시 트리거 규칙+혼동 사전이 그 역할을 대체하므로 **2026-06-11 해제**(CUE 승인). 과거 번복 이력 R1~R5는 사료로 보존. "재논의 금지" 표현은 "확정 — 변경 시 CUE 승인"으로 완화(HANDOFF 10.1·10.2·10.4 반영 완료).

**테스트 추가/갱신**: T5.11~12·T5.13~15·T5.17·T5.21~29 갱신 / T7.4~7.8 / T9.8~12 / T10.11~17·T10.18~39 신설 / TA.1~6 신설 / TR.1~8 신설(rate limit·quota) / TO.1~9 신설(관측성·어댑터 metrics) / TS.1~16 신설(저장소·tenant 키·수평 전환 가드) / TD.1~15 신설(보존·삭제·롤오버·배치)
