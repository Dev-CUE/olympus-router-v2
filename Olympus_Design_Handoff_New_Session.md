> ⛔ **새 세션 필수 — 설계 착수 전 반드시 읽어라**
> 1. `Olympus_Session_Protocol.md` (킵 프로토콜 + 핸드오프 규칙 + 혼동 사전)
> 2. 이 문서(Handoff) — 아래 "현재 위치"
> 두 문서 미독 상태로 설계에 손대지 마라 = 프로토콜 위반.

# Olympus v6.13 설계 세션 핸드오프

> **목적**: 새 세션에서 GitHub의 원장을 읽어 설계를 이어간다.
> **SSOT 우선순위**: PRD > 원장(Ledger) > 핸드오프(이 문서). 프로세스 규칙은 Session_Protocol.md.
> **참조 파일**: Olympus_Session_Protocol.md / Olympus_Design_Ledger.md / Olympus_PRD_Plan.md (모두 Dev-CUE/olympus-router-v2 master)

---

## 📍 현재 위치 (다음 세션은 여기부터)

- **마지막 확정**: #8 Admin (원장 1절). 문서 구조 개선(Session_Protocol 신설·게이트 포인터·PRD 목차) 완료.
- **다음 항목**: 재시작·복구 프로토콜 **보강 6건** 확정 → 그 다음 L21.
- **진행 중 미확정**: 재시작 보강 6건 — 대화로 합의됐으나 **원장 미반영**. 재브리핑 후 "킵" 필요.
  - ① 어댑터 `/ready` + ready 전 egress 503→재시도 / 어댑터 무상태→재동기화 불요
  - ② G1: egress 재시도 소진 → dead_letter + JOB_DEAD_LETTER 통지
  - ③ G2: platform_message_id를 jobs에 기록, 발사 전 채워졌으면 재발사 안 함. **job retention(72h) 종속**
  - ④ G3: 복구 트랜잭션 egress 'pending' 회수 명문화
  - ⑤ G4: 게시→dedup커밋→ACK 순서 + at-least-once 1회 중복 한계 명문화
  - ⑥ 시스템 로그: G1~G4 상태전이 추적(내용 없음), audit와 독립 명문화, 인프라(how)는 L20 이관
- **PRD 목차/물리분할**: 목차는 추가 완료. 물리 분할은 v6.13 일괄 반영 시점으로 보류.

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

> 킵 프로토콜 전문·절대금지·GitHub 갱신 방법·혼동 사전은 **Session_Protocol.md** 참조. 여기서 중복하지 않는다.

---

## 확정된 설계 요약 (원장 상세 참조)

| L# | 항목 | 핵심 결정 요약 |
|----|------|--------------|
| 15 | 전송 계층 | SSE+POST. WS·롱폴링 기각 |
| 1 | Job Queue | 상태 6종, SQLite 영속, T10.6 폐기 |
| 2 | 인증 | opaque 256-bit, 해시 저장, fail-closed, grace 24h |
| 3 | Egress | 동기 ACK, egress_id dedup, context FIFO, [1,4,16,60,120]s |
| 5 | A2A 신원 | 토큰 바인딩, _source_url 삭제, /agents/:id/a2a 전용 |
| 6 | 세션 신뢰 | ULID, 3중 검증, SQLite, sliding 1h+cap 24h, topic·parent_session_id |
| 7 | cc | listen 타입, CC_RESPONSE_FORBIDDEN, can_initiate 한정 금지 |
| 10 | 미기록 | persona_key 전 라운드 null, 종료 마커 5종, 미결 안건 기록 |
| 16 | SLA+재개 | 마커 60초, 후속 세션+parent_session_id(재오픈 기각) |
| 9+19 | audit | fail-closed, RawSink/AuditSink 분리, 해시 체인, audit.db |
| 재시작 | 복구 프로토콜 | 불변식 유실 0·중복 0·수동 0. G1~G9 해소. at-least-once 명문화. **보강 6건 미확정** |
| 8 | Admin | 127.0.0.1 기본, scope read/write, CLI 부트스트랩 |
| 4.2 | 메모리 태깅 | Mem0 metadata user_id 태깅, 합성 필터 |

---

## 잔여 설계 항목 (L-prefix 순서대로)

| 항목 | 내용 | 분류 |
|------|------|------|
| (재시작 보강) | 위 6건 — L21보다 선행 | 운영 |
| **L21** | 테넌트/에이전트별 rate limit·quota | 운영 |
| **L20** | SLO·관측성 (지표·알람·SLO 수치) | 운영 |
| **L17** | SQLite 구현 규약 (WAL·파일 분리) | 구조 |
| **L18** | tenant_id 구체화 (키 계약·범위) | 구조 |
| **L22** | 수평 확장 경로 (전환 전제조건 계약) | 구조 |
| **L23** | 데이터 보존·삭제 정책 | 구조 |
| **LB** | B군 모순 해소 4건 일괄 | 최후 |

**LB 상세**:
- LB-11: Phase 의존성 재정렬
- LB-12: A2A limits 충돌 확정 ("무시"로 방향 제시됨)
- LB-13: resolved '최우선' 서술 분리
- LB-14: 편집 오류 일괄

> LB-11~14는 통합 리뷰 D군 문서 결함 번호. PRD 절 번호 아님.

---

## 번호 체계

| 체계 | 형식 | 의미 |
|------|------|------|
| 설계 항목 | `L숫자`, `LB` | 이번 세션 작업 단위 |
| 결정 대기 | `P숫자` | 설계 완료 후 일괄 확정할 보류 결정 |

**L21 ≠ P21** — 혼동 금지 (상세는 Session_Protocol.md 혼동 사전)

---

## 결정 대기 P1~P47

원장 2절 참조. 전 항목 설계 완료 후 일괄 결정.

---

## 이전 세션 참조

이전 세션은 컨텍스트 보존용으로 유지. 새 세션에서 판단이 어려운 경우 확인 가능.
단 이전 세션에서 추가 설계 작업은 하지 않음.
