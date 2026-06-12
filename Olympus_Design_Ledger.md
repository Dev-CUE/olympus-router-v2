# ⛔ 동결 (FROZEN — 2026-06-11 증류)

> **이 원장은 역할을 마쳤다. 읽지 마라.**
> - 전 확정 항목(L15~L23 + LB)은 [`Olympus_PRD.md`](Olympus_PRD.md)(v6.13 증류본)에 **흡수 완료**됐다.
> - P1~P88 결정 대기 표도 전부 본문에 흡수됐다.
> - 이후 설계 변경은 원장을 경유하지 않는다 — 브리핑 → CUE "킵" → **PRD 직접 갱신**.
> - 진입점은 [`HANDOFF.md`](HANDOFF.md), 방법은 [`Olympus_Session_Protocol.md`](Olympus_Session_Protocol.md).
>
> 이 파일은 CUE의 사료(검토 경로·충돌 점검 로그·결정 대기 이력)로만 보존한다.

---

# Olympus v6.13 설계 원장 (Design Ledger) — 동결본

> **성격**: (구) PRD v6.13 일괄 반영 전까지의 작업용 원장. **반영 완료로 동결.**
> **갱신**: 2026-06-11 | 진행: 전 항목 확정 → **Olympus_PRD.md로 흡수 완료**

---

## 0. 프로세스 규칙

1. 설계 순서(의존성 기준): [기반] 1→2→3 / [A2A] 5→6→7→10 / [운영] 16→9→8→L21(완료)→L20(완료) / [구조] L17(완료)→L18(완료)→L19(완료)→L22(완료)→L23(완료) / [최후] **LB (완료)**
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

### 잔여 설계 항목

**없음. 전 항목(L15~L23 + LB) 확정 완료. → Olympus_PRD.md 반영 완료(동결).**

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
- **가드 순서 (LB-13 확정)**: 0.인증→caller확정 / 1.SPOOF / 2.자기호출 / 3.권한 / 4.교차플랫폼 / 5.resolved·out 평가 / 6.발화자 한도
  - ⚠️ 라운드 한도 체크 삭제 (LB-13: 라운드 개념 폐기)
- **테스트**: T5.21 대체 / T5.23~24 / T5.12 갱신

### [#6] A2A 세션 신뢰 모델 (확정 — LB-12 반영)

- **발급**: 라우터 단독 ULID 발급. legacy 조합형 폐기 (D10 해소)
- **검증 3중**: ①A2A_INVALID_SESSION(not_found|expired|closed) ②A2A_NOT_PARTICIPANT ③context_key 불일치
- **레코드**: session_id, context_key, origin_agent, participants[{agent_id, role}], mode, speaker_counts, status, created_at, last_activity, topic, parent_session_id, tenant_id(L18 확정 — 항상 존재, 단일은 default)
  - ⚠️ `round` 필드 삭제 (LB-13: 라운드 개념 폐기)
- **SSOT (LB-12 확정)**: **speaker_counts = 세션 레코드. 에이전트 제출값 무시.** 라우터 DB 기록이 정답. 에이전트가 제출하는 speaker_counts·round 값은 전부 무시한다.
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

### [#10] 중간 라운드 미기록 + 종료 결과 전수 기록 (확정 — LB-13 반영)

- **persona_key**: A2A 세션 진행 중 전체 null 고정 (C5·D8 근본 해소)
- **Mem0 규율**: SDK 계약. origin이 종료 결과 전체 적립(결론+미결+사유). 강제 불가 — 계약+테스트로 보장, 명문화
- **resolved 내용 중립**: 채택·기각·보류·폐기 전부 결론. "성공 시에만" 오독 차단
- **종료 마커 (LB-13 반영)**: reason 4종 — resolved|out|speaker_limit|expired
  - ⚠️ `round_limit` 삭제 (라운드 개념 폐기)
- **Gemini 분류**: resolved/out → 결론 지식화 / speaker_limit·expired → 미결 안건 기록(안건·참여자·사유)
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
- **알고리즘**: **token bucket**. 키당 (tokens, last_refill) 2값 — 경량. fixed window·sliding log 기각. 근거: A2A 버스트성.
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

- **지표(metrics) 노출 (D-L20-1 확정)**: 라우터는 **수치만 노출, 대시보드 화면은 안 그림**(Dumb Pipe 정신). 두 형태 병행:
  - `/metrics` — Prometheus 텍스트 익스포지션
  - `/metrics.json` — JSON
  - **(L22 보강) 어댑터도 동일 `/metrics`·`/metrics.json` 노출**(L20 형식 재사용). 관측 워커가 라우터·어댑터 지표를 함께 수집.
- **노출 바인딩 (D-L20-2 확정)**: 127.0.0.1 기본 비공개. 외부 노출은 expose:true + CF Access 전제.
- **핵심 지표 (4 골든 시그널)**:
  - Latency: ingress→egress 내부 처리 시간, A2A 지연, SSE push 지연(히스토그램)
  - Traffic: ingress/egress/result/a2a 요청률, SSE 활성 연결 수
  - Errors: 에러코드별 카운트, egress 재시도율·dead_letter율
  - Saturation: 큐 깊이, lease 활성 수, quota 소진 임박 키 수, 단일 writer 큐 대기 시간(L17)
  - 도메인 지표: 세션 활성 수, audit 큐(closed 백프레셔), Obsidian SLA 위반 카운트
  - **(L22 보강) 어댑터 지표**: 플랫폼 API 호출 지연·실패율, 어댑터 인입 처리량, egress 적체
- **SLO 수치 (D-L20-3 확정 — 자리표시자)**: 실연동(T10.x) 후 재조정.
  - 라우팅 가용성: 99.5% / ingress→egress p95: < 2s / Obsidian SLA: 마커 60s·배치 15분
- **알람 (D-L20-4 확정)**: Admin UI 설정→yaml→관측 워커 판정·Telegram 발신. 라우터 직접 호출 금지(원칙 6).
- **시스템 로그 형식**: 일단위 롤링 `system-YYYYMMDD.log`. retention은 L23 소관.
- **레이어 구분**: 관측 지표(L20) ≠ audit 로그(#9). 별 레이어.
- **설정안**:
```yaml
system:
  observability:
    metrics:
      enabled: true
      bind: "127.0.0.1"
      expose: false
      formats: ["prometheus", "json"]
    system_log:
      dir: "data/logs/"
      file_pattern: "system-{YYYYMMDD}.log"
      rollover: "daily"
    alerts:
      enabled: true
      channel: "telegram"
      rules: []
```
- **테스트 (TO 대역)**: TO.1~9

### [#L17] 운영 저장소 계층 규약 — SQLite 구현 + 추상화 (확정)

- **저장소 추상화 인터페이스 (갈래 C 확정)**: 운영 DB 접근을 단일 저장소 인터페이스 뒤로. 백엔드 교체 시 코어 코드 무수정.
- **WAL 모드**: 전 운영 DB에 `journal_mode=WAL` 적용. 보조 파일 `-wal`·`-shm` 동반 — 3개 한 묶음(L23 연계).
- **동시 쓰기 직렬화**: 단일 writer 큐 + busy_timeout(예 5000ms) 병행.
- **파일 분리**:
  - `data/queue.db` — 큐·tokens·tokens_admin·sessions·quota_usage 단일 파일
  - `data/audit.db` — 감사 전용. (L23) 월 세그먼트 시 `audit-YYYYMM.db`로 분화
  - `data/wiki/raw.db` — Raw 백엔드 옵션
- **스키마 마이그레이션**: `user_version` PRAGMA. 재시작 시 quick_check 직후 마이그레이션 게이트.
- **DB 라이브러리**: **better-sqlite3 채택.** PRD 9절 "내장 우선" 변경 — CUE 승인. node:sqlite는 experimental 졸업 후 전환 가능.
- **테스트 (TS 대역)**: TS.1~8

### [#L18] tenant_id 구체화 — 키 계약·범위 (확정)

- **키 prefix 계약**: 항상 prefix. 단일 테넌트 기본값 `default`.
```
context_key  {tenant_id}:{platform}:{space_type}:{space_id}:{topic_id}
persona_key  {tenant_id}:{agent_id}
session_id   {tenant_id} 접두
```
- **tenant_id 출처**: 현 단계 고정 기본값 `default`. 향후 토큰(#2)에서 도출 — 바인딩은 대고객 서브프로젝트.
- **격리 의미**: tenant 간 완전 격리. persona는 tenant 격리·플랫폼 초월(다른 축).
- **L21 tenant 회수**: {tenant_id}:{agent_id} override로 자연 적용.
- **테스트 (TS 대역 공유)**: TS.9~14

### [#L22] 수평 확장 경로 — 전환 전제조건 계약 (확정)

- **수평 확장 구현 안 함.** 단일 라우터+수직 확장 우선(SPOF 수용, SLO 99.5%).
- **전환 전제조건 체크리스트**: 상태공유·SSE고정·writer직렬화·세션SSOT·dedup·L21버킷 공유화.
- **샤딩 축**: tenant_id 1순위.
- **스케일업 판단**: L20 지표(라우터+어댑터) 지속 포화 시 전환 신호.
- **테스트 (TS/TO 대역)**: TS.15~16 / TO.9

### [#L23] 데이터 보존·삭제 정책 (확정)

#### A. 일→월 롤오버 공통 정책
- 일단위 파일 → 월단위 파일. 구현 메커니즘은 레이어별 분리.
- 기준시: 코어 폴백 UTC / 운영 주입 디폴트 UTC+9(Asia/Seoul).

#### B. 레이어별 구현
| 레이어 | 일 파일 | 월 파일 | 무결성 |
|--------|---------|---------|--------|
| 시스템 로그(L20) | `system-YYYYMMDD.log` | `system-YYYYMM.log` 합본+gzip | 없음(운영) |
| audit(#9) | `audit-YYYYMMDD.db` | `audit-YYYYMM.db` 세그먼트 통합 | **해시 체인 보존** |

#### C. 회수 항목별 retention
1. **audit.db**: 기본 30일. 세그먼트 단위 삭제, 당월 보호, 레코드 단위 삭제 금지.
2. **시스템 로그**: 기본 30일(자리표시자).
3. **job 72h**: 유지. dedup창(분) ≪ 72h ≪ audit 30일 정합 OK.
4. **WAL 3파일**: 본파일+-wal+-shm = 3개 한 묶음 백업·삭제.
5. **quota_usage 7일 / 세션 30일 / Mem0·Obsidian 코어 미규정(원칙 6).**
6. **tenant 삭제 연쇄**: prefix 전 데이터. audit는 보존 정책 따름.

#### D. 데이터 관리 & 배치잡
- 단일 관리자 UI(서브프로젝트). 배치잡 2종: 보존 만료 삭제 / 해지 익일 연쇄.
- audit 레코드 단위 삭제·수정 금지(관리자 포함). 세그먼트 단위만.
- 고객 UI: 조회/내려받기만.

#### E. 고객 해지 → 익일 일괄 삭제
- 해지 즉시 `pending_deletion` 마킹. 익일 배치 연쇄 삭제. 멱등. 철회 창(익일까지).

#### 설정안
```yaml
system:
  rollover:
    base_timezone: "UTC"
    granularity: "daily_to_monthly"
  retention:
    audit_days: 30
    system_log_days: 30
    quota_usage_days: 7
    session_days: 30
```

- **테스트 (TD 대역)**: TD.1~15

### [LB] B군 모순 4건 — 확정 (2026-06-11)

#### LB-11 — Phase 의존성 재정렬
- **확정**: Phase 번호는 역사적 도입순, 구현 게이트는 의존성 순. 재정렬 작업은 전 설계 완료 후 PRD 반영 시 일괄.
- **PRD 반영**: Stage-Gated 원칙 서술을 "번호 순서" → "의존성 기준 순서"로 정정. Phase 10이 8·9보다 선행임 명문화.

#### LB-12 — A2A limits 에이전트 제출값 무시 확정
- **확정**: **에이전트가 제출하는 speaker_counts 값은 무시한다. 라우터 sessions 테이블 DB 기록이 SSOT.**
- 근거: 토큰 바인딩(#5) + session SSOT(#6) 확정 상태에서 클라이언트 제출값 신뢰 시 스푸핑 가능.
- **PRD 반영**: PRD·SKILLS.md "참조" 서술 → "무시" 로 교체. #6 레코드 SSOT 서술 강화.

#### LB-13 — 라운드 개념 폐기 + resolved/가드순서 분리 확정
- **확정 1 — 라운드 폐기**: 라운드(round) 개념 전면 폐기. **발화 횟수(speaker_counts)만 라우터가 통제.**
  - 삭제 대상: round 필드(sessions 레코드) / max_rounds 설정 / ROUND_LIMIT 에러코드 / A2A_ROUND_LIMIT_EXCEEDED / T5.4 / PRD 6절 라운드 관련 서술 전체 / DIALOGUE 모드 라운드 카운팅 로직.
- **확정 2 — 종료 사유 판정 vs 가드 검사 순서 분리**:
  - **종료 사유 판정** (무엇으로 종료됐나): `resolved > speaker_limit`
  - **가드 검사 순서** (요청 처리 시 검증 순서):
    ```
    0. 인증 (토큰 유효)
    1. SPOOF (caller ↔ 토큰 일치)
    2. 자기호출 금지
    3. 권한 (allowed_targets)
    4. 교차플랫폼 금지
    5. resolved/out 평가 → 정상종료 분기
    6. 발화자 한도 초과 여부
    ```
  - "resolved 최우선"은 종료 사유 판정 축에서만. 가드 검사는 보안(0~4) 먼저, 그다음 resolved(5).
  - **T5.6 재기술**: "resolved가 speaker 에러보다 정상종료를 우선 반환한다" — 가드 5번에서 평가, 6번 에러 미발생 검증.
- **PRD 반영**: PRD 6.5절·SKILLS.md 7절 가드 순서 수정. 라운드 관련 서술 전체 삭제. 종료 마커 5종→4종(round_limit 제거).

#### LB-14 — 편집 오류 일괄
- **확정**: 설계 결정 변경 없음. v6.13 PRD 반영 시 일괄 정정.
  1. PRD 4.5 합성 규칙 중복 기재 → 하나 삭제
  2. session_id 서술 내 platform 필드 중복 기재 → 정리
  3. PRD 14절 미결 표에서 해소된 항목 제거
  4. Phase 8 테스트 ID 오기 → T9 대역으로 정정

---

## 2. 결정 대기 (P-prefix) — 전부 PRD 흡수 완료

> P숫자는 설계 완료 후 일괄 확정할 보류 결정이었다. **전 항목이 Olympus_PRD.md 본문에 흡수되어 역할 종료.**

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
| P27 | #10 | dialogue persona_key | 전 구간 null |
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
| P54 | L21 | tenant 단위 제어 | L18에서 회수·해소 — {tenant}:{agent} 키 override로 적용 |
| P55 | L21 | 기본 한도값 | rate 60/리필1·quota 1d/10000 (override agent_id별) |
| P56 | L20 | 지표 노출 형태 | /metrics(Prometheus) + /metrics.json 병행, 라우터 내장 대시보드 기각 |
| P57 | L20 | 지표 바인딩 | 127.0.0.1 기본 비공개(admin 동일) |
| P58 | L20 | SLO 수치 | 자리표시자(가용성 99.5%/p95<2s), 실측 후 재조정 |
| P59 | L20 | 알람 관리 | Admin UI 설정→yaml→관측 워커 판정·Telegram 발신 |
| P60 | L20 | 알람 발신 주체 | 별도 관측 워커(라우터 직접 호출 금지, 원칙 6) |
| P61 | L20 | 시스템 로그 파일 규칙 | 일단위 롤링 system-YYYYMMDD.log |
| P62 | L20 | 시스템 로그 retention | L23에서 회수·확정 — 월파일 단위 30일(자리표시자) |
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
| 06-11 | 재시작 보강 | #9 audit-시스템로그 혼용, G2~G4 미완, jobs 스키마 | audit/시스템로그 분리 명문화, G2~G4 재정의, jobs 스키마 보강, at-least-once 명문화, 복구 트랜잭션 egress pending 추가 |
| 06-11 | 무단 푸시 | 재시작 보강이 CUE 승인 전 무단 푸시됨(이전 창) | 위반 기록. 사후 추인(CUE 승인). Session_Protocol에 푸시 트리거 규칙 신설 |
| 06-11 | G2 보강 | retention 종속 누락 | platform_message_id가 job retention 72h 종속 명문화. P48 신설 |
| 06-11 | 문서구조 | 킵·핸드오프 규칙 PRD/원장 산재 | Session_Protocol.md 분리 |
| 06-11 | L21 | #2 fail-closed vs L21 fail-open | 충돌 아님 — 레이어 구분 명문화 |
| 06-11 | L21 | #6 speaker_counts vs L21 rate limit | 충돌 아님 — 별 레이어. 혼동 사전 박제 |
| 06-11 | L21 | quota 비용 기반 vs Dumb Pipe | 건수 기반 확정 |
| 06-11 | L21 | tenant 제어 vs L18 미확정 | L18 이관 |
| 06-11 | L20·L17·L18·L22·L23 | (각 항목 충돌 이력) | 원장 이전 버전 참조 |
| 06-11 | 문서구조 | 진입점 다중화 | HANDOFF.md 단일 진입점 일원화 |
| 06-11 | 16절 | 재논의금지 임시조치 | 킵 프로토콜이 대체, 해제(R6) |
| 06-11 | LB-12 | #6 "에이전트 제출값 무시" vs SKILLS "참조" | SKILLS "참조" 서술 폐기. DB SSOT로 확정 |
| 06-11 | LB-13 | 라운드 개념 | **라운드 전면 폐기.** sessions.round 필드·max_rounds·ROUND_LIMIT·T5.4 삭제 대상으로 확정 |
| 06-11 | LB-13 | PRD 6.5·SKILLS 7절 "resolved 가드 최우선" | 종료 사유 판정 축과 가드 검사 순서 축 분리. 보안 검사(0~4) 먼저, resolved(5) 그 다음으로 정정 |
| 06-11 | LB-11 | Phase 번호 순서 vs 의존성 순서 | 재정렬 작업 = 전 설계 완료 후 PRD 반영 시 일괄 |
| 06-11 | LB-14 | PRD 4.5 중복·session_id platform 중복·14절 미결 표·Phase 8 테스트 ID | PRD 반영 시 일괄 정정(설계 변경 없음) |

---

## 4. PRD 반영 대기 메모 — ✅ 반영 완료 (2026-06-11)

> 아래 메모는 전부 **Olympus_PRD.md(증류본) + Olympus_Plan.md에 반영 완료**됐다. 사료로만 보존.

**교체/재작성**: 7.2(SSE), 6.3(세션), 6.5(가드 — 라운드 삭제·resolved/가드순서 분리), 8절(Admin), 9-D(audit), 9-A(SDK), 9절(DB 라이브러리 better-sqlite3로 변경), 9-B(tenant 키 항상 prefix·default 구체화)

**삭제**: GET /poll, _source_url, url 필드, legacy session_id, T10.6 휘발, UNAUTHORIZED_POLL, round 필드(sessions), max_rounds 설정, A2A_ROUND_LIMIT_EXCEEDED 에러코드, T5.4, PRD 6절 라운드 서술 전체

**신규 엔드포인트**: GET /agents/:id/events, POST /agents/:id/a2a, GET /health, GET /ready(라우터·어댑터), POST /admin/reload, GET /metrics, GET /metrics.json (라우터·어댑터 공통)

**신규 에러코드**: AUDIT_UNAVAILABLE, CC_RESPONSE_FORBIDDEN, A2A_INVALID_SESSION, A2A_NOT_PARTICIPANT, A2A_SESSION_EXPIRED, JOB_EXPIRED, JOB_DEAD_LETTER, UNAUTHORIZED(개명), RATE_LIMITED, QUOTA_EXCEEDED

**신설 절**: 재시작·복구 프로토콜 / 어댑터 계약(플랫폼별) / 전송 추상 계약 / rate limit·quota 계약(L21) / SLO·관측성 계약(L20) / 운영 저장소 계층 규약(L17) / tenant 키 계약(L18) / 수평 확장 경로 계약(L22) / 데이터 보존·삭제 정책(L23)

**agents.yaml 추가**: system.queue, system.egress, system.audit, system.admin, system.rate_limit, system.observability 블록 / system.tenant / system.rollover / system.retention

**A2A 계약 변경 (LB-12·13)**: sessions 레코드에서 round 필드 삭제 / speaker_counts SSOT = DB, 에이전트 제출값 무시 / 종료 마커 4종 / 가드 6단계 / 종료 사유 resolved > speaker_limit

**편집 오류 정정 (LB-14)**: PRD 4.5 중복 제거 / session_id platform 중복 정리 / 미결 표 해소 항목 제거 / Phase 8 테스트 ID → T9 대역 정정

**LB-11**: Stage-Gated "번호 순서" → "의존성 기준 순서" (Plan G-A~G-J 게이트로 구체화)

**테스트**: T5.4 삭제 / T5.6 재기술 / T5.13~14 갱신 / sessions 스키마 round 제거 — Plan 3절 반영 완료
