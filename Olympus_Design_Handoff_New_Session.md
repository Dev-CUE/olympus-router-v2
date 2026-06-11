# Olympus v6.13 설계 세션 핸드오프

> **목적**: 새 세션에서 GitHub의 원장을 읽어 설계를 이어간다.
> **SSOT**: PRD v6.12 + Olympus_Design_Ledger.md (둘 다 GitHub Dev-CUE/olympus-router-v2 master)
> **현재 상태**: 설계 항목 19/24 확정, 잔여 6항목 + B군(모순 해소)

---

## 새 세션 시작 지시

```
GitHub Dev-CUE/olympus-router-v2 master에서
Olympus_Design_Ledger.md와 Olympus_PRD_Plan.md를 읽어라.

원장의 프로세스 규칙과 아래 킵 프로토콜을 따르고,
잔여 항목 L21부터 설계를 이어간다.
```

---

## 킵(KIP) & 고잉 프로토콜 (필수 준수)

> 이 프로토콜을 위반하는 것은 원칙 위반이다. 브리핑 없이 진행하지 않는다.

### 단계

```
1. 브리핑    현재 L-번호 항목의 설계안을 출력한다.
             코드·문서·원장 수정 없음. 출력만.

2. 승인      CUE가 "킵" 또는 "킵하고 다음"이라고 답한다.
             승인 없이 다음 단계로 가지 않는다.

3. 원장 갱신 GitHub MCP로 Olympus_Design_Ledger.md를 직접 수정·푸시한다.
             (Dev-CUE 계정 쓰기 권한 보유 — 직접 푸시 가능)
             갱신 내용: 확정 결정 추가 / 결정 대기 추가 / 충돌 점검 / PRD 반영 메모

4. 다음 항목 원장 푸시 완료 확인 후 다음 L-번호 브리핑으로 넘어간다.
```

### 절대 금지

- CUE 승인 없이 다음 항목 진행
- 브리핑 없이 설계 확정 선언
- 원장 갱신 없이 "킵 완료" 선언
- 승인 없이 원장·PRD·코드 수정

### GitHub 원장 갱신 방법

```javascript
// 파일 SHA 먼저 조회
github:get_file_contents({ owner: "Dev-CUE", repo: "olympus-router-v2",
  path: "Olympus_Design_Ledger.md", branch: "master" })

// SHA 받아서 업데이트
github:create_or_update_file({ owner: "Dev-CUE", repo: "olympus-router-v2",
  path: "Olympus_Design_Ledger.md", branch: "master",
  sha: "<조회한 SHA>",
  message: "docs: confirm L번호 — 항목명",
  content: "<전체 파일 내용>" })
```

---

## 설계 세션 규칙

- 브리핑 없이 코드/문서 생성 금지
- 추측 시 추측임을 명시
- 아부 금지, 팩트 우선
- 모든 항목은 "킵" 승인 후 원장 반영, 다음 항목 진행
- PRD 수정은 전 항목 완료 후 일괄 v6.13 작성 (별도 세션)

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
| 재시작 | 복구 프로토콜 | 불변식 유실 0·중복 0·수동 0. G1~G9 해소. at-least-once 명문화 |
| 8 | Admin | 127.0.0.1 기본, scope read/write, CLI 부트스트랩 |
| 4.2 | 메모리 태깅 | Mem0 metadata user_id 태깅, 합성 필터 |

---

## 잔여 설계 항목 (L-prefix 순서대로)

| 항목 | 내용 | 분류 |
|------|------|------|
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

**L21 ≠ P21** — 혼동 금지

---

## 결정 대기 P1~P47

원장 2절 참조. 전 항목 설계 완료 후 일괄 결정.

---

## 이전 세션 참조

이전 세션은 컨텍스트 보존용으로 유지.
새 세션에서 판단이 어려운 경우 이전 세션에서 확인 가능.
단 이전 세션에서 추가 설계 작업은 하지 않음.
