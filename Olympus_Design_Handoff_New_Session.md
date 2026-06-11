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

- **마지막 확정**: **L18 (tenant_id 키 계약) 확정 완료** (원장 [#L18] 절 + P68~P71, P54 회수).
  - **v1 호환 불필요(CUE 확정 — v1 미사용)** → 항상 prefix 방식 채택 / 키: `{tenant_id}:{platform}:...`·`{tenant_id}:{agent_id}`·session_id 접두, **단일 테넌트 기본값 `default`**(조건 분기 없음) / **범위 = 키 계약만**(발급·인증·바인딩은 대고객 서브프로젝트) / tenant_id 출처 현 단계 default 고정, 향후 토큰 도출 / **persona는 tenant 격리(`{tenant}:{agent}`)·플랫폼 초월 — 다른 축**(충돌 아님) / L21 tenant override 회수(P54 해소) / TS.9~14 테스트
- **다음 항목**: **L22** (수평 확장 경로 — 전환 전제조건 계약) 브리핑.
- **진행 중 미확정**: 없음.
- **문서 구조 작업 완료**: Session_Protocol.md 신설 / 게이트 포인터 / 푸시 트리거 규칙 / 테스트 ID 체계 혼동 사전(TR/TO/TS/T10/TA/T5/T7/T9).
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
| 6 | 세션 신뢰 | ULID, 3중 검증, SQLite, sliding 1h+cap 24h, topic·parent_session_id, tenant_id(항상·단일 default) |
| 7 | cc | listen 타입, CC_RESPONSE_FORBIDDEN, can_initiate 한정 금지 |
| 10 | 미기록 | persona_key 전 라운드 null, 종료 마커 5종, 미결 안건 기록 |
| 16 | SLA+재개 | 마커 60초, 후속 세션+parent_session_id(재오픈 기각) |
| 9+19 | audit | fail-closed, RawSink/AuditSink 분리, 해시 체인, audit.db, 시스템 로그와 독립 레이어 |
| 재시작 | 복구 프로토콜 | 불변식 유실 0·중복 0·수동 0. G1~G9 해소. 보강 6건 확정 완료 |
| 8 | Admin | 127.0.0.1 기본, scope read/write, CLI 부트스트랩 |
| 4.2 | 메모리 태깅 | Mem0 metadata user_id 태깅, 합성 필터 |
| 21 | rate limit·quota | agent_id 단위, token bucket, quota 건수 기반, cc 비계상, fail-open, {tenant}:{agent} override, TR 대역 |
| 20 | SLO·관측성 | metrics API(/metrics+json), 알람 Admin UI→관측 워커, 시스템 로그 일단위 롤링, SLO 자리표시자, TO 대역 |
| 17 | 운영 저장소 계층 | 저장소 추상화(C, SQLite→PG), WAL, 단일 writer 큐+busy_timeout, queue.db 단일+audit/raw, better-sqlite3, 계층2 서브프로젝트, TS 대역 |
| 18 | tenant 키 계약 | 항상 prefix(단일 default), v1 호환 불필요, 키 계약만(발급은 서브프로젝트), persona tenant 격리·플랫폼 초월(다른 축), P54 회수, TS.9~14 |

---

## 잔여 설계 항목 (L-prefix 순서대로)

| 항목 | 내용 | 분류 |
|------|------|------|
| **L22** | 수평 확장 경로 (전환 전제조건 계약) | 구조 ← **다음** |
| **L23** | 데이터 보존·삭제 정책 | 구조 |
| **LB** | B군 모순 해소 4건 일괄 | 최후 |

**LB 상세**:
- LB-11: Phase 의존성 재정렬
- LB-12: A2A limits 충돌 확정 ("무시"로 방향 제시됨)
- LB-13: resolved '최우선' 서술 분리
- LB-14: 편집 오류 일괄

> LB-11~14는 통합 리뷰 D군 문서 결함 번호. PRD 절 번호 아님.

> **L22 회수 대상**: L17 PostgreSQL 전환(저장소 인터페이스, 트랜잭션 격리 차이) / 재시작 G레지스터 "L22 선결정(단일 라우터 수직 확장 우선, 수평 전제조건 L22)" / L18 tenant_id 샤딩 후보 키.
> **L23 회수 대상**: L20 시스템 로그 retention(P62) / L17 WAL 3파일(-wal·-shm) 백업 단위 / job completed_retention_h(#1) 정합.

---

## 번호 체계

| 체계 | 형식 | 의미 |
|------|------|------|
| 설계 항목 | `L숫자`, `LB` | 이번 세션 작업 단위 |
| 결정 대기 | `P숫자` | 설계 완료 후 일괄 확정할 보류 결정 |

**L21 ≠ P21** — 혼동 금지 (상세는 Session_Protocol.md 혼동 사전)

---

## 결정 대기 P1~P71

원장 2절 참조. 전 항목 설계 완료 후 일괄 결정. (P49~P55=L21, P56~P62=L20, P63~P67=L17, P68~P71=L18)

---

## 이전 세션 참조

이전 세션은 컨텍스트 보존용으로 유지. 새 세션에서 판단이 어려운 경우 확인 가능.
단 이전 세션에서 추가 설계 작업은 하지 않음.
