# HANDOFF.md — Olympus Router 상시 진입점 (단일 SSOT 진입점)

> **새 세션은 무조건 이 파일을 먼저 읽는다.** 버전에 묶이지 않는 고정 진입점이며, 작업 진행마다 최신으로 덮어쓴다.
> 최종 갱신: 2026-06-11 | **현재 단계: v6.13 설계 진행 중 — 전 L 항목 확정(L15~L23), 다음 = LB → v6.13 PRD 일괄 반영**
> ⚠️ **진입점은 이 파일 하나다.** 과거 핸드오프가 여러 개 생겨 혼선이 있었으나(06-11 일원화), 이제 이 파일이 유일 진입점이다. 아래 "문서 지도"가 나머지로 가는 길을 안내한다.

---

## 문서 지도 (어느 문서가 무엇을 담나 — 혼선 방지)

| 문서 | 답하는 질문 | 변경 주기 | 상태 |
|------|------------|----------|------|
| **HANDOFF.md** (이 파일) | "지금 뭐부터 보나 / 어디까지 했나 / 다음 뭐 하나 / 내 역할은" | 매 작업 | **현행 단일 진입점** |
| **Olympus_Session_Protocol.md** | "어떻게 일하나" (킵/고잉·푸시 트리거·핸드오프 규칙·혼동 사전) | 거의 안 바뀜 | 현행 (방법론) |
| **Olympus_Design_Ledger.md** | "무엇을 결정했나" (설계 상세 누적 L15~L23, 결정대기 P1~P88) | 매 항목 | 현행 (설계 누적) |
| **Olympus_PRD_Plan.md** | "최종 설계가 무엇인가" (SSOT) | 전 항목 후 일괄(v6.13) | v6.12, v6.13 반영 대기 |
| ~~Olympus_Design_Handoff_New_Session.md~~ | (구) 설계 세션 현재 위치 | — | **이 HANDOFF로 통합됨(06-11)** |
| ~~Olympus_Handoff_v610.md~~ | (구) v6.10 핸드오프 | — | **아카이브(현행 아님)** |

> **SSOT 우선순위(설계 내용 충돌 시)**: PRD > 원장(Ledger) > 핸드오프(이 파일). 단 "지금 어디까지 했나"의 진행 상태 진입점은 이 파일이다.
> **프로세스(일하는 방법)는 Session_Protocol.md가 SSOT.** 킵/고잉·푸시 트리거 규칙·혼동 사전은 거기 참조.

---

## 0. 너의 역할 판별

새 세션에서 네 역할은 셋 중 하나다:
- **A. 설계자/리뷰어** (claude.ai) — 컨셉·설계 결정, 원장·핸드오프 갱신, AGENT.md 작성, CLI 결과 리뷰. **코드 직접 구현 안 함.**
- **B. 문서 정합화 작업자** — PRD(SSOT) 변경을 하위 문서에 반영. **문서만, 코드 금지.**
- **C. 구현자** (Claude Code / Codex CLI) — AGENT.md를 받아 실제 코드 작성·테스트.

이 채팅(claude.ai)에서 너는 보통 **A 또는 B**다. C는 CLI가 한다.
> ⚠️ CLAUDE.md·AGENT.md·SKILLS.md의 "문서 수정 금지", "블랙리스트 파일 수정 금지"는 **C(구현 CLI)를 향한 가드**다. A/B(설계·문서 담당)에게 거는 제약이 아니다 — A/B는 설계·문서 작성이 본업이다.

**공통 규칙:** `[작업금지] 브리핑 → 승인 → 실행`. 추측·아부 금지. 모르면 모른다고. 간결·한국어.
**설계 세션(A) 추가 규칙 (킵/고잉 — 상세는 Session_Protocol.md):**
- 브리핑(출력만, 수정 없음) → CUE **"킵"** 승인 → 원장+핸드오프 직접 푸시 → 다음 항목.
- **"킵" / "킵하고 다음"** 명시 승인 직후에만 푸시. 지적·질문·논의·"~해야 할 것 같다"는 푸시 트리거 아님.
- 각 푸시 전 SHA 재조회. 항목 확정 시 기존 킵 항목과 충돌 점검.

---

## 1. 작업 분담 모델 (미스매치 방지 핵심)

```
[설계/리뷰: claude.ai]  →  AGENT.md 지시서  →  [구현: CLI]  →  테스트 통과
        ↑                                                          |
        |__________  "구현됨 + 커밋 sha" 문서 반영  ______________|
                          (이 되먹임이 없으면 미스매치 누적)
```

### 4대 규칙
1. **설계 선행, 단 구현 가능한 단위로 절단.** 한 번에 여러 Phase·다수 번복을 몰아넣지 않는다. CLI가 한 세션에 닫을 크기(Phase 1개)로 잘라 AGENT.md로 넘긴다.
2. **구현 완료 = 문서 갱신 의무.** CLI가 Phase 구현·테스트 통과하면 PRD 해당 Phase 표에 "구현 완료 + 커밋 sha" 반영까지가 1작업.
3. **버전을 설계/구현으로 분리 인식.** PRD는 설계 버전이 앞선다(현재 설계 v6.12 + 원장 v6.13 진행 / 코드 ~v6.4). 작업 시작 시 갭부터 확인.
4. **테스트 무결성.** CLI는 테스트를 자기 구현에 맞춰 고치지 않는다. 코드를 설계에 맞춘다. 테스트 수정은 "PRD 자체가 틀렸을 때"만, 그 경우 코드 말고 PRD를 먼저 고친다.

---

## 2. 프로젝트 본질 (1줄)

복수 AI 에이전트(Zeus/Hera/Athena)를 여러 메신저에서 굴리는 범용 멀티플랫폼 오케스트레이션 인프라. 운영자(CUE)가 최초 지시·최종 확인만, 나머지는 에이전트 조직이 처리. 향후 B2B 상용화 염두(SDK·온보딩·테넌시·보안감사·데이터 보존이 그 포석).

---

## 3. 핵심 설계 원칙 (불변)

- **Dumb Pipe**: 라우터 코어는 파싱·LLM·의도분석 금지. 목적지 검증+패스스루만. (v6.8: 큐 상태는 허용)
- **Zero Hardcoding**: zeus/hera/athena를 코드에 직접 쓰지 않음.
- **Stage-Gated (의존성 기준)**: Phase 번호는 역사적 도입순. 구현 게이트는 **의존성 순**(LB-11 확정 예정). Exit Criteria 100% 통과 후 다음.
- **컴포넌트 독립성(원칙 6)**: 라우터는 Mem0/Obsidian/Gemini 직접 호출 금지. 알람·배치·wiki는 별도 워커.
- **Pull 통신(v6.8)→SSE 전환(v6.13/L15)**: 설계는 SSE+POST로 진화(원장 #15). 코드는 아직 옛 구조.
- **메모리 라이프사이클(v6.12)**: DM=Mem0(사적 보좌) / DM외(회의·협업)=Obsidian(조직). 인격 자체는 공간 무관 Mem0. 회의 결정은 Raw→Gemini→Obsidian eventual 반영.
- **mock 통과 ≠ 완료**: "55/55 통과"는 전부 mock. 실제 에이전트 왕복 검증 안 됨.

---

## 4. 버전 흐름 (설계 기준)

문서상 설계 변경만 진행됨. **코드는 아직 옛 구조(push/callback/file-only).**

- v6.8~v6.12: VPS Docker / push→pull / raw-sink / SDK·테넌시 키 / Google A2A 관계 / 메모리 라이프사이클·보안감사(상세는 8절 커밋 이력·PRD 13절)
- **v6.13 (진행 중, 원장이 브릿지 SSOT)**: 설계 항목 L15~L23을 원장에 누적 확정. 전 항목(+LB) 완료 후 PRD에 1회 일괄 반영 예정.
- **다음 메이저 v7.0**: Pull/SSE 모델이 코드로 실제 전환되는 시점(Phase 10 착수)에 부여.

### 설계 vs 구현 버전 갭
| | 버전 | 상태 |
|---|---|---|
| 설계(원장) | v6.13 진행 | L15~L23 확정, LB 잔여, PRD 미반영 |
| 설계(PRD) | v6.12 | v6.13 일괄 반영 대기 |
| 코드 | ~v6.4 수준 | push/callback/file-only. Phase 8~12 미구현 |

---

## 5. 현재 위치 (v6.13 설계 세션 — 다음 세션은 여기부터)

> 설계 세션 진행 상태. 상세는 **Olympus_Design_Ledger.md**, 방법은 **Olympus_Session_Protocol.md**.

- **마지막 확정**: **L23 (데이터 보존·삭제 정책)** 확정 완료 (원장 [#L23] + P77~P88).
  - 일→월 롤오버(텍스트·DB 공통 정책, 구현 레이어별 분리). 기준시 코어 폴백 UTC / 운영 디폴트 UTC+9(Seoul), tenant별은 서브프로젝트.
  - audit 보존 플랜 기반 기본 30일, 세그먼트(audit-YYYYMM.db) 단위 삭제·세그먼트 전체 30일 만료 후·당월 보호·레코드 단위 삭제 금지.
  - 시스템 로그 30일 / WAL 3파일 묶음 / quota_usage 7일·세션 30일 / Mem0·Obsidian 코어 미규정 / tenant 삭제 연쇄(audit 보존 정책 따름).
  - 단일 관리자 UI(서브프로젝트)=삭제/백업/추출+배치잡 생성·세팅, 고객 UI 조회/내려받기만. 고객 해지→익일 배치(pending_deletion·멱등·철회 창). 코어는 인터페이스만.
  - 테스트 TD 대역 신설(TD.1~15).
- **다음 항목**: **LB** (B군 모순 해소 4건: LB-11 Phase 의존성 재정렬 / LB-12 A2A limits "무시" 확정 / LB-13 resolved 종료순위≠가드순서 분리 / LB-14 편집 오류 일괄). **모든 L 항목 완료 — LB가 최후 설계 작업.**
- **LB 다음**: **v6.13 PRD 일괄 반영** (원장 4절 "PRD 반영 대기 메모" 전체 → PRD, 별도 큰 작업).
- **진행 중 미확정**: 없음.

### 전 L 항목 확정 요약 (원장 상세 참조)
| L# | 항목 | 핵심 |
|----|------|------|
| 15 | 전송 계층 | SSE+POST. WS·롱폴링 기각 |
| 1 | Job Queue | 상태 6종, SQLite 영속, jobs 스키마 platform_message_id |
| 2 | 인증 | opaque 256-bit, 해시 저장, fail-closed, grace 24h |
| 3 | Egress | 동기 ACK, egress_id dedup, context FIFO, [1,4,16,60,120]s |
| 5 | A2A 신원 | 토큰 바인딩, _source_url 삭제, /agents/:id/a2a |
| 6 | 세션 신뢰 | ULID, 3중 검증, SQLite, sliding 1h+cap 24h, tenant_id |
| 7 | cc | listen 타입, CC_RESPONSE_FORBIDDEN |
| 10 | 미기록 | persona_key 전 라운드 null, 종료 마커 5종 |
| 16 | SLA+재개 | 마커 60초, 후속 세션+parent_session_id |
| 9+19 | audit | fail-closed, 해시 체인, audit.db, 시스템 로그 독립 레이어 |
| 재시작 | 복구 | 유실0·중복0·수동0, G1~G9 해소 |
| 8 | Admin | 127.0.0.1, scope read/write, CLI 부트스트랩 |
| 4.2 | 메모리 태깅 | Mem0 user_id 태깅, 합성 필터 |
| 21 | rate limit·quota | agent_id, token bucket, fail-open, TR 대역 |
| 20 | SLO·관측성 | /metrics+json(라우터·어댑터), 관측 워커, TO 대역 |
| 17 | 저장소 계층 | 추상화(SQLite→PG), WAL, 단일 writer, better-sqlite3, TS 대역 |
| 18 | tenant 키 | 항상 prefix(단일 default), 키 계약만, TS.9~14 |
| 22 | 수평 확장 | 구현 안 함, 전제조건+전환신호, tenant_id 샤딩 |
| 23 | 보존·삭제 | 일→월 롤오버, audit 플랜 30일 세그먼트, 관리자 UI, 해지 배치, TD 대역 |

### 테스트 ID 대역 (혼동 사전 — Session_Protocol 참조)
`T5`=A2A / `T7`=wiki·Obsidian / `T9`=admin / `T10`=큐·전송·재시작 / `TA`=audit / `TR`=rate limit·quota / `TO`=관측성·어댑터 metrics / `TS`=저장소·tenant 키·수평전환 / `TD`=보존·삭제·롤오버·배치. 신규는 해당 관심사 대역에 붙인다.

---

## 6. 새 세션 시작 지시문 (CUE가 붙여넣는 프롬프트)

```
GitHub Dev-CUE/olympus-router-v2 master에서 아래 순서로 읽어라:
1. HANDOFF.md                       (단일 진입점 — 현재 위치·역할·다음)
2. Olympus_Session_Protocol.md      (일하는 방법: 킵/고잉·푸시 트리거·혼동 사전)
3. Olympus_Design_Ledger.md + Olympus_PRD_Plan.md  (설계 상세/SSOT — 필요 절)

킵 프로토콜(브리핑→"킵" 승인→원장+핸드오프 직접 푸시→다음)을 준수하고,
HANDOFF "현재 위치"(5절)에 적힌 항목부터 설계를 이어간다.
1·2 미독 상태로 설계에 착수하지 마라 = 프로토콜 위반.
```

---

## 7. 다음 단계

**설계(A) 트랙 (현재 진행):**
1. **LB** — B군 모순 4건 일괄 확정 (원장+핸드오프 갱신)
2. **v6.13 PRD 일괄 반영** — 원장 4절 전체 → PRD (별도 큰 작업)

**구현(C) 트랙 (설계 안정화 후):**
3. **Phase 8~10 구현** — Pull/SSE 통신 전환(착수 시 v7.0)
4. **T10.10 실연동** — 실제 에이전트 1기 왕복 (mock 통과 불인정)
5. **Phase 11** — SDK·온보딩·tenant 키 / **Phase 12** — 보안감사 모듈

---

## 8. 리포 접근 & 커밋 이력

- GitHub: `Dev-CUE/olympus-router-v2` / 브랜치 `master` / MCP 읽기·쓰기 가능
- ⚠️ sha는 커밋마다 바뀜 → 수정 전 `github:get_file_contents`로 재확인 (str_replace는 GitHub 파일에 안 먹음 → 전체 push)

| commit | 내용 |
|--------|------|
| cf4293e | PRD v6.12 — 메모리 라이프사이클 + 보안감사 모듈(9-D) + Phase 12 |
| b812685b | CLAUDE v6.12 + README v6.12 |
| 42d8dc27 | HANDOFF — 하위 문서 v6.12 정합 완료 |
| (06-11) | Session_Protocol.md 신설 / 원장 L15~L23 확정 / 킵 프로토콜·푸시 트리거 / 문서 진입점 일원화 |

> v6.13 설계 세션 커밋은 원장(Ledger) 이력 참조. 본 HANDOFF가 진행 상태 정본.

---

## 9. 리포 파일 목록

**진입·설계 문서**: HANDOFF.md(본 파일·진입점), Olympus_Session_Protocol.md(방법), Olympus_Design_Ledger.md(설계 누적), Olympus_PRD_Plan.md(SSOT)
**구현 헌법(C용)**: CLAUDE.md, SKILLS.md, AGENT.md, Olympus_Harness.md, Dev_Enhancement_Olympus.md
**AGENT 단계 지시서**: AGENT_Phase1~7.md, AGENT_E2E.md
**아카이브(현행 아님)**: Olympus_Design_Handoff_New_Session.md(→HANDOFF로 통합), Olympus_Handoff_v610.md(v6.10 구)
**코드**: hera-webhook-adapter.py, server.js, README.md
**디렉터리**: adapters/ config/(agents.example.yaml, agents.yaml 미추적) harness/ registry/ router-core/ .claude/

---

## 10. 설계 컨텍스트 (A 역할 진입용 — 결정 근거)

> 설계를 이어갈 세션이 근거를 모르면 같은 논의를 반복하거나 확정을 무심코 번복한다.

### 10.1 v6.12 결정 근거 (재논의 금지)

| 결정 | 채택 근거 | 기각 대안 |
|------|----------|----------|
| DM=Mem0 / DM외=Obsidian | DM은 사적 보좌(개인), 회의는 조직 자산. 성격 다르면 저장소 다름 | 전부 Mem0/전부 Obsidian |
| 인격은 공간 무관 Mem0 | "그룹 Zeus ≠ DM Zeus"면 PERSONA 축 붕괴 | 공간별 인격 분리 |
| 회의→Obsidian eventual | 즉시 반영은 원칙 6·Dumb Pipe 위반 | 라우터 직접 쓰기/동기 반영 |
| "DB를 Obsidian에 붙인다" 폐기 | Obsidian은 마크다운 vault 근본. DB 옵션은 Raw Sink에만 | Obsidian+DB 통합(불성립) |
| DM발 조직급 결정 승격 없음 | 의도적 단순화. 승격 판정=파싱/LLM(위반) 또는 수동(복잡) | 자동/수동 승격 |
| audit-sink ≠ Raw Sink 구현 | 비기능 요구 정반대(무손실·동기 vs 휘발) | Raw Sink 재사용 |
| 감사 default-on opt-out + 관리자 전용 | 피감사자가 끄면 감사 무의미(separation of duties) | opt-in/셀프 설정 |

### 10.2 v6.13 결정 근거 (원장 상세, 재논의 금지 — 요약)
- **SSE 전환(L15)**: 롱폴링 라운드 지연(~12.5s)·WS 외부 의존 회피. 내장 우선.
- **better-sqlite3(L17)**: node:sqlite는 experimental·busy_timeout 기본0. 동시성 안정성 우선. PRD 9절 "내장 우선" 변경(CUE 승인).
- **tenant 항상 prefix(L18)**: v1 호환 불필요 → 분기 없는 일관 키. 단일=default.
- **수평확장 구현 안 함(L22)**: 단일 라우터+수직 우선(SPOF 수용, SLO 99.5%). 전제조건만 계약.
- **audit 무결성=생명(L23)**: 보존 구간 내 해시 체인 불변. 기간은 플랜 기반(기본 30일), 세그먼트 단위 삭제로 무결성·기간삭제 양립.
- **레이어 구분(혼동 사전)**: audit≠시스템로그 / fail-open(유량)≠fail-closed(인증) / speaker_counts(A2A)≠rate limit(인프라) / persona tenant격리≠플랫폼초월. 상세 Session_Protocol.

### 10.3 미결 설계 항목
| 항목 | 상태 |
|------|------|
| DM 감사 여부 / 감사 보고서 포맷 | 미결 — B2B 계약·법규별 (Phase 12) |
| Gemini 워커 폴링 주기·마커 스키마 | 방향 확정, 수치는 Wiki 구현 시 |
| 등록 토큰 발급/로테이션 정책 | env 키 네이밍·주기 미정 |
| 멀티테넌시 본격 설계 / Google A2A 호환 | 보류 — 수요 발생 시 |
| 대고객 서비스 계층(서브프로젝트) | 회원·결제·구독·tenant 발급·플랜·과금·데이터관리 UI = PostgreSQL 별도 DB, 코어 검증 후 별도 프로젝트 |

### 10.4 확정 번복 절차
"재논의 금지" 항목 번복 시: PRD 16절(Decision Reversal Log)에 기존·번복후·사유 표 기록 + CUE 명시 승인(v6.8 R1~R5 선례).

### 10.5 설계 세션 진행 절차
1. 논의 → 선택지·트레이드오프 제시 → CUE 결정
2. 필요 시 팩트체크(추측 금지)
3. 확정 → 원장 갱신(킵 프로토콜) + 핸드오프 현재 위치 동시 갱신
4. 기존 계약 변경 시 연쇄 영향·충돌 점검 명시
5. 전 항목(L+LB) 완료 후 PRD v6.13 일괄 반영 → 하위 문서(C용) 정합
