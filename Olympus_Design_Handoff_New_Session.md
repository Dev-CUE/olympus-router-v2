# Olympus v6.13 설계 세션 핸드오프

> **목적**: 새 세션에서 GitHub의 원장을 읽어 설계를 이어간다.
> **SSOT**: PRD v6.12 + Olympus_Design_Ledger.md (둘 다 GitHub Dev-CUE/olympus-router-v2 master)
> **현재 상태**: 설계 항목 19/24 확정, 잔여 6항목 + B군(모순 해소)

---

## 새 세션 시작 지시

```
GitHub Dev-CUE/olympus-router-v2 master에서
Olympus_Design_Ledger.md와 Olympus_PRD_Plan.md를 읽어라.

원장의 프로세스 규칙을 따르고,
잔여 항목 21번부터 설계를 이어간다.
```

---

## 컨텍스트 요약

**프로젝트**: Olympus Router v2 — AI 에이전트 조직 운영 인프라
- MVP(v1) 운영 완료 → 상용서비스 기준으로 v2 업그레이드 설계 중
- 에이전트 3기(Zeus/Hera/Athena), Telegram 기반, VPS Docker
- PRD v6.12 문서 결함 11건·코드 결함 12건·아키텍처 지적 → v6.13 반영 설계

**설계 세션 규칙**:
- 브리핑 없이 코드/문서 생성 금지
- 추측 시 추측임을 명시
- 아부 금지, 팩트 우선
- 모든 항목은 "킵" 승인 후 원장 반영, 다음 항목 진행
- PRD 수정은 전 항목 완료 후 일괄 v6.13 작성 (별도 세션)

---

## 확정된 설계 요약 (원장 상세 참조)

| # | 항목 | 핵심 결정 요약 |
|---|------|--------------|
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
| 재시작 | 복구 프로토콜 | 불변식 유실 0·중복 0·수동 0. G1~G9 해소 |
| 8 | Admin | 127.0.0.1 기본, scope read/write, CLI 부트스트랩 |
| 4.2 | 메모리 태깅 | Mem0 metadata user_id 태깅, 합성 필터 |

---

## 잔여 설계 항목 (순서대로)

### 운영 군
**21번. 테넌트/에이전트별 rate limit·quota**
- noisy neighbor 방지, 상용 테넌트 격리
- quota 단위(에이전트별·테넌트별), 초과 동작(429·큐잉), 설정 위치

**20번. SLO·관측성**
- 가용성·지연 목표, 지표 정의, 알람
- worker_lag·audit_write_failures·pending_markers 등 이미 예약된 지표 수집 위치
- 알람 채널(Telegram escalation 연계)

### 구조 군
**17번. SQLite 구현 규약**
- WAL 모드, journal_mode, busy_timeout
- DB 파일 분리 규칙(queue.db·audit.db·tokens.db 또는 통합)

**18번. tenant_id 구체화**
- 키 생성 함수 시그니처(`tenant_id=null`)
- 테넌시 영향 범위(큐·세션·레지스트리)

**22번. 수평 확장 경로**
- 단일 인스턴스 한계 수치 명시
- 전환 전제조건(SQLite→외부DB, SSE 레지스트리 공유)
- 현 설계 변경 없이 수직 확장 한계

**23번. 데이터 보존·삭제 정책**
- Raw/audit/세션/큐 retention
- 테넌트 데이터 삭제 요청 처리

### B군 (최후 — 모순 해소)
- **11번**: Phase 의존성 재정렬 (Stage-Gated vs 10→8→9)
- **12번**: A2A limits 충돌 확정 — 원장에서 "무시"로 방향 제시됨, 최종 확인
- **13번**: resolved '최우선' 서술 분리 (종료 트리거 우선순위 ≠ 가드 검증 순서)
- **14번**: 편집 오류 일괄 (4.5 중복, session_id platform 중복, 14절 미결 표, Phase 8 테스트 ID)

---

## 결정 대기 P1~P47

원장 2절 참조. 전 항목 설계 완료 후 일괄 결정.

---

## 이전 세션 참조

이전 세션(이 창)은 컨텍스트 보존용으로 유지.
새 세션에서 판단이 어려운 경우 이전 세션에서 확인 가능.
단 이전 세션에서 추가 설계 작업은 하지 않음.
