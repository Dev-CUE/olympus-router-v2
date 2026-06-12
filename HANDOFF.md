# HANDOFF.md — Olympus Router 상시 진입점

> **새 세션은 무조건 이 파일을 먼저 읽는다.** 작업 진행마다 최신으로 덮어쓴다.
> 최종 갱신: 2026-06-12 | **현재 단계: 대고객 계층 설계 + 보안 검토 완료 — 다음 = 코어 알파테스트 트랙 (1단계: 구현 헌법 정합화)**

---

## 문서 지도 (⚠️ 06-11 증류로 체계 변경됨 — 구버전 기억과 다르다)

| 문서 | 답하는 질문 | 상태 |
|------|------------|------|
| **HANDOFF.md** (이 파일) | 현재 위치·역할·다음 할 일 | 단일 진입점 |
| **Olympus_PRD.md** | 최종 설계가 무엇인가 | **설계 SSOT (v6.13 증류본 + 06-12 11·22절 확장).** 이력 없음, 확정 설계+근거만 |
| **Olympus_Service_Layer.md** | 대고객 계층·UI가 무엇인가 | **서브프로젝트 설계 SSOT (v1.0).** 데이터 모델·UI·인터페이스 계약·결정 레지스터 D1~D9/A1~A3 |
| **Olympus_Plan.md** | 무엇을 어떤 순서로 구현하고 어떻게 검증하나 | 구현 게이트(의존성 순)·Exit Criteria·진행 상태 |
| **Olympus_Session_Protocol.md** | 어떻게 일하나 (킵·푸시 트리거·혼동 사전) | 방법론 SSOT |
| ~~Olympus_PRD_Plan.md~~ | (구) PRD v6.12+계획 통합본 | **아카이브(상단 헤더 부착 완료) — 읽지 마라.** 낡은 설계(라운드·poll·_source_url) 포함 |
| ~~Olympus_Design_Ledger.md~~ | (구) v6.13 설계 원장 | **동결(상단 헤더 부착 완료) — 읽지 마라.** 전 항목 PRD에 흡수 완료 |
| ~~Olympus_Design_Handoff_New_Session.md / Olympus_Handoff_v610.md~~ | (구) 핸드오프 | 아카이브 |

> **SSOT**: 코어 설계 = `Olympus_PRD.md` / 대고객 계층·UI = `Olympus_Service_Layer.md`(코어 영역 충돌 시 PRD 우선) / 구현 계획 = `Olympus_Plan.md` / 방법 = `Session_Protocol.md` / 진행 상태 = 이 파일.
> **설계 변경 절차 (06-11 변경)**: 원장 경유 폐지. 브리핑 → CUE "킵" → **PRD(또는 Service_Layer) 직접 갱신** + 이 파일 현재 위치 갱신.
> **읽기 게이트**: PRD·Service_Layer에 없는 내용은 "없다/모른다"가 정답이다. 아카이브·동결 문서나 기억으로 메우지 마라.

---

## 0. 너의 역할 판별

- **A. 설계자/리뷰어** (claude.ai) — 설계 결정, PRD·핸드오프 갱신, AGENT.md 작성, CLI 결과 리뷰. 코드 직접 구현 안 함.
- **B. 문서 정합화 작업자** — PRD 변경을 하위 문서(C용)에 반영. 문서만.
- **C. 구현자** (Claude Code / Codex CLI) — AGENT.md 받아 코드 작성·테스트.

이 채팅(claude.ai)은 보통 A 또는 B. CLAUDE.md·AGENT.md·SKILLS.md의 "문서 수정 금지"는 **C를 향한 가드**다 — A/B의 제약이 아니다.

**공통 규칙**: `[작업금지] 브리핑 → 승인 → 실행`. 추측·아부 금지. 모르면 모른다고. 간결·한국어.
**킵 규칙 (상세 Session_Protocol)**: "킵"/"킵하고 다음" 명시 승인 직후에만 푸시. 지적·질문·논의는 푸시 트리거 아님. 푸시 전 SHA 재조회.

---

## 1. 작업 분담 모델

```
[설계: claude.ai] → AGENT.md → [구현: CLI] → 테스트 통과
        ↑________ "구현 완료 + 커밋 sha" Plan 반영 ________|
```
1. 설계 선행, CLI가 한 세션에 닫을 크기(게이트 1개)로 절단.
2. 구현 완료 = Plan 문서 갱신까지가 1작업.
3. 버전 갭 인식: 설계 v6.13 / 코드 ~v6.4. 시작 시 갭 확인.
4. 테스트 무결성: 코드를 설계에 맞춘다. 테스트를 구현에 맞춰 고치지 않는다.

---

## 2. 프로젝트 본질 (1줄)

복수 AI 에이전트(Zeus/Hera/Athena)를 여러 메신저에서 굴리는 범용 멀티플랫폼 오케스트레이션 인프라. 운영자(CUE)는 최초 지시·최종 확인만. B2B 상용화 염두.

핵심 원칙·설계 상세는 **전부 Olympus_PRD.md**. 여기 중복하지 않는다.

---

## 3. 현재 위치 (다음 세션은 여기부터)

- **완료 (06-12)**:
  1. **UI·대고객 계층 설계 확정**: `Olympus_Service_Layer.md` v1.0 신설 (5a07ad4)
  2. **PRD 11·22절 갱신** (15c6ff2): Admin API 서비스 계층 연동 확장(tenant CRUD 없음 — tenant SSOT는 서비스 계층)
  3. **고객 데이터 보안 검토 완료**: 인증·권한 계층 충분 / 유출 방어 계층 공백 7건 식별 → 아래 "보안 보강 설계 7건"으로 등재. **CUE 결정: 코어 알파테스트 우선, 보안 보강은 시스템 오픈 전 필수 해결(오픈 게이트)**
  4. (06-11~12 기완료) v6.13 설계 확정 / PRD 증류 / 사료화 / 핸드오프 테스트 통과
- **다음 작업**: **코어 알파테스트 트랙** (순서 고정)
  1. **구현 헌법 정합화 (역할 B)** ← 여기부터 — CLAUDE.md·SKILLS.md·AGENT.md·Olympus_Harness.md의 구 계약(라운드·poll·_source_url·url 필드) 잔존분을 PRD v6.13에 일괄 정합
  2. 게이트 구현 (Olympus_Plan.md G-A부터, 역할 A가 AGENT.md 절단 → C 구현)
  3. 실연동 알파테스트 (mock 통과 ≠ 완료 — 실제 에이전트 왕복 검증)
- **진행 중 미확정**: 없음.

### 🔒 보안 보강 설계 7건 (오픈 게이트 — **시스템 오픈 전 필수 해결**, CUE 킵 06-12)

| # | 항목 | 요지 |
|---|------|------|
| S1 | 저장 데이터 암호화(at-rest) | queue.db·audit.db·Raw 드롭의 대화 내용 평문 보관 해소. **최대 공백** |
| S2 | totp_secret 암호화 저장 | 해시 불가(검증에 원문 필요) → 암호화 방식 규정 (Service_Layer) |
| S3 | 백업 보안 | 백업 주기·RPO/RTO 설계와 묶음 — 백업본 암호화·접근통제 |
| S4 | 내부 전송 TLS 명문화 | 외부 위치 에이전트→라우터 outbound / 라우터↔어댑터 구간 |
| S5 | 유출 대응 플레이북 | PIPA 유출 통지 의무(인지 후 신고 기한) 대응 절차·연락 체계. 법규·약관 백로그와 연동 |
| S6 | 결제 데이터 경계 명문화 | 카드 원정보 비보유·PG 토큰만 보관 → PCI-DSS 범위 축소 (Service_Layer payment.method 규정) |
| S7 | Mem0·Obsidian 보안 책임 규정 | 고객 대화 파생 데이터가 들어가는 외부 저장소의 암호화·접근통제 책임 주체 명문화 |

> 알파테스트(내부)는 이 7건 없이 진행 가능. **외부 사용자 데이터가 들어가는 시점(오픈) 전에는 미해결 상태로 진행 금지.**

### 상용 준비 항목 (설계 백로그 — CUE 승인된 권고)
~~UI·대고객 데이터 모델~~(완료 06-12 → Service_Layer v1.0) / **보안 보강 7건(위 — 오픈 게이트)** / 백업 주기·RPO/RTO·오프사이트(S3와 묶음) / 토큰 발급·로테이션 운영 정책 / 법규·약관(PIPA 등 — S5 및 Service_Layer 9절 미결 연동) / 고객 SLA 문서(실측 후) / 공개 API 인증 강화 / SDK 고객 문서 / 장애 공지·지원 프로세스. (PRD 22절 미결과 합산 관리)

---

## 4. 새 세션 시작 지시문 (CUE가 붙여넣는 프롬프트)

```
GitHub Dev-CUE/olympus-router-v2 master에서 아래 순서로 읽어라:
1. HANDOFF.md                    (단일 진입점 — 현재 위치·역할·다음)
2. Olympus_Session_Protocol.md   (일하는 방법: 킵·푸시 트리거·혼동 사전)
3. Olympus_PRD.md                (설계 SSOT — 필요 절)
   + 대고객 계층·UI 작업이면 Olympus_Service_Layer.md
   + 구현 작업이면 Olympus_Plan.md

킵 프로토콜(브리핑→"킵" 승인→PRD+핸드오프 직접 푸시→다음)을 준수하고,
HANDOFF "현재 위치"(3절)에 적힌 항목부터 작업을 이어간다.
⚠️ Olympus_PRD_Plan.md와 Olympus_Design_Ledger.md는 아카이브다 — 읽지 마라.
1·2 미독 상태로 작업 착수 = 프로토콜 위반.
```

---

## 5. 리포 접근 & 파일 목록

- `Dev-CUE/olympus-router-v2` / `master` / MCP 읽기·쓰기 가능. 푸시 전 SHA 재조회 필수(전체 push 방식).
- **현행 문서**: HANDOFF.md / Olympus_PRD.md / Olympus_Service_Layer.md / Olympus_Plan.md / Olympus_Session_Protocol.md
- **구현 헌법(C용, 정합 대기 — 다음 작업 1단계)**: CLAUDE.md, SKILLS.md, AGENT.md, Olympus_Harness.md — ⚠️ 구 계약(라운드·poll·_source_url) 잔존. 충돌 시 PRD 우선.
- **아카이브**: Olympus_PRD_Plan.md, Olympus_Design_Ledger.md, AGENT_Phase1~7.md, AGENT_E2E.md, Olympus_Design_Handoff_New_Session.md, Olympus_Handoff_v610.md
- **코드(~v6.4)**: server.js, hera-webhook-adapter.py, adapters/ config/ harness/ registry/ router-core/

### 주요 커밋 (최근)
| commit | 내용 |
|--------|------|
| 76d9b2e | HANDOFF — Service_Layer v1.0 반영 |
| 15c6ff2 | PRD 11절 Admin API 서비스 계층 확장 + 22절 링크 |
| 5a07ad4 | **Olympus_Service_Layer.md v1.0 신설 — 대고객 계층·UI 설계** |
| 4a83620 | Olympus_PRD.md 신설 — v6.13 증류본 (설계 SSOT) |
| 382286f | Olympus_Plan.md 신설 — 의존성 게이트 G-A~G-J |

---

## 6. 핵심 주의 (혼동 방지 — 상세는 Session_Protocol 혼동 사전)

- **라운드는 없다.** 구 문서·기억에 round/max_rounds/ROUND_LIMIT이 나오면 그건 폐기된 과거다. 발화 횟수(speaker_counts)만 존재.
- **에이전트 제출값(caller·speaker_counts)은 무시된다.** 신원=토큰, 카운트=세션 DB.
- **mock 통과 ≠ 완료.** 실연동 전 완료 선언 금지.
- **"킵" = CUE 전용 승인어.** 에이전트 자칭 킵 완료 금지.
- **tenant SSOT는 서비스 계층** — 코어에 tenant CRUD 없음(PRD 11절). tenant_id는 시스템 생성 불투명 값(slug 금지 — Service_Layer 3절).
- **보안 보강 7건(S1~S7)은 오픈 게이트** — 알파테스트는 가능하나, 외부 사용자 데이터 수용(오픈) 전 미해결 진행 금지.
- 설계 근거(채택/기각 사유)는 PRD·Service_Layer 각 절에 1줄씩 박혀 있다 — 같은 논의를 반복하거나 기각 대안(WS·롱폴링·JWT·node:sqlite·라운드·FDW 조인·slug tenant_id)을 다시 들고 오지 마라.
