> ⛔ **새 세션 필수 — 설계 착수 전 반드시 읽어라**
> 1. `Olympus_Session_Protocol.md` (킵 프로토콜 + 핸드오프 규칙 + 혼동 사전 + 푸시 트리거 규칙)
> 2. 이 문서(Handoff) — 아래 "현재 위치"
> 두 문서 미독 상태로 설계에 손대지 마라 = 프로토콜 위반.

# Olympus v6.13 설계 세션 핸드오프

> **목적**: 새 세션에서 GitHub의 원장을 읽어 설계를 이어간다.
> **SSOT 우선순위**: PRD > 원장(Ledger) > 핸드오프(이 문서). 프로세스 규칙은 Session_Protocol.md.
> **참조 파일**: Olympus_Session_Protocol.md / Olympus_Design_Ledger.md / Olympus_PRD_Plan.md (모두 Dev-CUE/olympus-router-v2 master)

---

## 📍 현재 위치 (다음 세션은 여기부터)

- **마지막 확정**: **L17 (운영 저장소 계층 규약) 확정 완료** (원장 [#L17] 절 + P63~P67).
  - 갈래 C 채택: 운영 DB를 **단일 저장소 인터페이스**로 추상화(Raw-sink 패턴 확대), SQLite 1차·PostgreSQL 전환 대상 / WAL 모드 전 운영 DB(-wal·-shm 3파일 묶음) / 단일 writer 큐 + busy_timeout 병행 / 파일 분리(queue.db 단일 운영 + audit.db + raw.db 옵션) / user_version 마이그레이션 게이트 / **DB 라이브러리 better-sqlite3 채택**(PRD 9절 "node:sqlite 내장 우선" 변경, CUE 승인 — node:sqlite RC지만 experimental·busy_timeout 기본0) / TS.1~8 테스트 대역 신설
  - **계층 2(대고객 서비스 DB) = 서브프로젝트로 분리, 이번 비범위.** 회원·가입·구독·결제·테넌트 = PostgreSQL급 별도 DB, 라우터와 격리(원칙 6). 코어 검증 우선, 확장 메모만. L24 별도 항목 미생성(CUE 결정).
- **다음 항목**: **L18** (tenant_id 구체화 — 키 계약·범위) 브리핑.
- **진행 중 미확정**: 없음.
- **문서 구조 작업 완료**: Session_Protocol.md 신설 / PRD·원장·핸드오프 게이트 포인터 / 푸시 트리거 규칙 / 테스트 ID 체계 혼동 사전 박제(TR/TO/TS/T10/TA/T5/T7/T9).
- **남은 문서 작업**: PRD 목차(인덱스) 추가 — 미착수. 물리 분할은 v6.13 일괄 반영 시점으로 보류.

---

## 새 세션 시작 지시문

```
GitHub Dev-CUE/olympus-router-v2 master에서 아래 순서로 읽어라:
1. Olympus_Session_Protocol.md  (킵 프로토콜 + 핸드오프 규칙 — 최우선)
2. Olympus_Design_Handoff_New_Session.md  (현재 위치 + 확정 요약)
3. Olympus_Design_Ledger.md + Olympus_PRD_Plan.md  (설계 상세/SSOT — 필요 절)

킵 프로토콜(브리핑→승인→원장 직접 푸시→다음)을 준수하고,
핸드오프 "현재 위치"에 적힌 항목부터 설계를 이어간다.
1·2번 미독 상태로 설계에 착수하지 마라 = 프로토콜 위반.
```

> 킵 프로토콜 전문·절대금지·푸시 트리거 규칙·GitHub 갱신 방법·혼동 사전은 **Session_Protocol.md** 참조. 여기서 중복하지 않는다.

---

## 확정된 설계 요약 (원장 상세 참조)

| L# | 항목 | 핵심 결정 요약 |
|----|------|--------------|
| 15 | 전송 계층 | SSE+POST. WS·롱폴링 기각 |
| 1 | Job Queue | 상태 6종, SQLite 영속, T10.6 폐기, jobs 스키마 platform_message_id 포함 |
| 2 | 인증 | opaque 256-bit, 해시 저장, fail-closed, grace 24h |
| 3 | Egress | 동기 ACK, egress_id dedup, context FIFO, [1,4,16,60,120]s |
| 5 | A2A 신원 | 토큰 바인딩, _source_url 삭제, /agents/:id/a2a 전용 |
| 6 | 세션 신뢰 | ULID, 3중 검증, SQLite, sliding 1h+cap 24h, topic·parent_session_id |
| 7 | cc | listen 타입, CC_RESPONSE_FORBIDDEN, can_initiate 한정 금지 |
| 10 | 미기록 | persona_key 전 라운드 null, 종료 마커 5종, 미결 안건 기록 |
| 16 | SLA+재개 | 마커 60초, 후속 세션+parent_session_id(재오픈 기각) |
| 9+19 | audit | fail-closed, RawSink/AuditSink 분리, 해시 체인, audit.db, 시스템 로그와 독립 레이어 |
| 재시작 | 복구 프로토콜 | 불변식 유실 0·중복 0·수동 0. G1~G9 해소. 보강 6건 확정 완료 |
| 8 | Admin | 127.0.0.1 기본, scope read/write, CLI 부트스트랩 |
| 4.2 | 메모리 태깅 | Mem0 metadata user_id 태깅, 합성 필터 |
| 21 | rate limit·quota | agent_id 단위(tenant L18 이관), token bucket, quota 건수 기반, cc 비계상, fail-open, TR 대역 |
| 20 | SLO·관측성 | metrics API(/metrics+json) 노출, 알람 Admin UI 설정→관측 워커 발신, 시스템 로그 일단위 롤링, SLO 자리표시자, TO 대역 |
| 17 | 운영 저장소 계층 | 저장소 추상화(C, SQLite→PG 전환), WAL, 단일 writer 큐+busy_timeout, queue.db 단일+audit/raw 분리, better-sqlite3(내장우선 변경), 계층2 서브프로젝트, TS 대역 |

---

## 잔여 설계 항목 (L-prefix 순서대로)

| 항목 | 내용 | 분류 |
|------|------|------|
| **L18** | tenant_id 구체화 (키 계약·범위) | 구조 ← **다음** |
| **L22** | 수평 확장 경로 (전환 전제조건 계약) | 구조 |
| **L23** | 데이터 보존·삭제 정책 | 구조 |
| **LB** | B군 모순 해소 4건 일괄 | 최후 |

**LB 상세**:
- LB-11: Phase 의존성 재정렬
- LB-12: A2A limits 충돌 확정 ("무시"로 방향 제시됨)
- LB-13: resolved '최우선' 서술 분리
- LB-14: 편집 오류 일괄

> LB-11~14는 통합 리뷰 D군 문서 결함 번호. PRD 절 번호 아님.

> **L18 주의 (선행 이관 회수)**: L21이 tenant 단위 rate limit·quota를 "구조 예약, 수치·키 L18 이관"(P54)했음. L18에서 tenant_id 키 계약 확정 시 L21 tenant 적용분을 회수해 정합할 것.
> **L22 주의**: L17 PostgreSQL 전환, L20 시스템 로그 retention은 각각 L22·L23로 이관됨.
> **L23 주의**: L20 시스템 로그 retention(P62) + L17 WAL 3파일 백업 단위가 L23로 이관됨.

---

## 번호 체계

| 체계 | 형식 | 의미 |
|------|------|------|
| 설계 항목 | `L숫자`, `LB` | 이번 세션 작업 단위 |
| 결정 대기 | `P숫자` | 설계 완료 후 일괄 확정할 보류 결정 |

**L21 ≠ P21** — 혼동 금지 (상세는 Session_Protocol.md 혼동 사전)

---

## 결정 대기 P1~P67

원장 2절 참조. 전 항목 설계 완료 후 일괄 결정. (P49~P55=L21, P56~P62=L20, P63~P67=L17)

---

## 이전 세션 참조

이전 세션은 컨텍스트 보존용으로 유지. 새 세션에서 판단이 어려운 경우 확인 가능.
단 이전 세션에서 추가 설계 작업은 하지 않음.
