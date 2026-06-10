# HANDOFF.md — Olympus Router 상시 진입점

> **새 세션은 무조건 이 파일을 먼저 읽는다.** 이 파일은 버전에 묶이지 않는 고정 진입점이며,
> 작업이 진행될 때마다 최신 상태로 덮어쓴다(영속 SSOT 보조 문서).
> 최종 갱신: 2026-06-10 | **현재 단계: v6.12 정합 전체 완료 ✅ → 다음은 설계 계속(A) 또는 Phase 8~10 구현(C)**

---

## 0. 너의 역할 판별

새 세션에서 네 역할은 셋 중 하나다:
- **A. 설계자/리뷰어** (claude.ai) — 컨셉·설계 결정, AGENT.md 작성, CLI 결과 리뷰. **코드 직접 구현 안 함.**
- **B. 문서 정합화 작업자** — PRD(SSOT) 변경을 하위 문서에 반영. **문서만, 코드 금지.**
- **C. 구현자** (Claude Code / Codex CLI) — AGENT.md를 받아 실제 코드 작성·테스트.

이 채팅(claude.ai)에서 너는 보통 **A 또는 B**다. C는 CLI가 한다.

**공통 규칙:** `[작업금지] 브리핑 → 승인 → 실행`. 추측·아부 금지. 모르면 모른다고. 간결·한국어.
**설계 세션(A) 추가 규칙:** 결정 전 선택지+트레이드오프 제시. 확정 결정(6절·10절)은 재논의 금지. 설계 확정 시 PRD 먼저 갱신(버전 +0.01) → 하위 문서 정합(B) → HANDOFF 되먹임.

---

## 1. 작업 분담 모델 (미스매치 방지 핵심)

문서와 코드의 미스매치를 막기 위한 역할 분리 + 되먹임 루프다.

```
[설계/리뷰: claude.ai]  →  AGENT.md 지시서  →  [구현: CLI]  →  테스트 통과
        ↑                                                          |
        |__________  "구현됨 + 커밋 sha" 문서 반영  ______________|
                          (이 되먹임이 없으면 미스매치 누적)
```

### 4대 규칙 (반드시 지킨다)
1. **설계 선행, 단 구현 가능한 단위로 절단한다.** 한 번에 여러 Phase·다수 결정 번복을
   몰아넣지 않는다. CLI가 한 세션에 닫을 수 있는 크기(Phase 1개)로 잘라 AGENT.md로 넘긴다.
2. **구현 완료 = 문서 갱신 의무.** CLI가 Phase 구현·테스트 통과하면, PRD의 해당 Phase 표에
   "구현 완료 + 커밋 sha"를 반영하는 것까지가 1작업. 문서에 안 돌아오면 미완료로 본다.
3. **버전을 설계/구현으로 분리 인식한다.** PRD는 "설계 버전"이 앞설 수 있다(현재 설계 v6.12 /
   코드 v6.4 수준). 작업 시작 시 이 갭부터 확인한다.
4. **테스트 무결성.** CLI는 테스트를 자기 구현에 맞춰 고치지 않는다. 코드를 설계(PRD)에 맞춘다.
   테스트 수정은 "PRD 자체가 틀렸을 때"만, 그 경우 코드 말고 PRD를 먼저 고친다.

---

## 2. 프로젝트 본질 (1줄)

복수 AI 에이전트(Zeus/Hera/Athena)를 여러 메신저에서 굴리는 범용 멀티플랫폼
오케스트레이션 인프라. 운영자(CUE)가 최초 지시·최종 확인만, 나머지는 에이전트 조직이 처리.
향후 B2B 상용화 염두(SDK·온보딩·테넌시 자리·보안감사가 그 포석).

---

## 3. 핵심 설계 원칙 (불변)

- **Dumb Pipe**: 라우터 코어는 파싱·LLM·의도분석 금지. 목적지 검증+패스스루만.
- **Zero Hardcoding**: zeus/hera/athena를 코드에 직접 쓰지 않음.
- **Stage-Gated**: Phase 순서대로, Exit Criteria 100% 통과 후 다음.
- **컴포넌트 독립성**: 라우터는 Mem0/Obsidian/Gemini 직접 호출 금지.
- **Pull 통신(v6.8)**: 라우터가 에이전트를 호출하지 않음. 에이전트가 롱폴링으로 일감 수령.
- **메모리 라이프사이클(v6.12)**: DM=Mem0(사적 보좌) / DM외(회의·협업)=Obsidian(조직). 인격 자체는 공간 무관 Mem0. 회의 결정은 Raw→Gemini→Obsidian로 eventual 반영, DM에서 읽어 연속성.
- **mock 통과 ≠ 완료**: 현재 "55/55 통과"는 전부 mock. 실제 에이전트 왕복 검증 안 됨.

---

## 4. 버전 흐름 (설계 기준)

문서상 설계 변경만 진행됨. **코드는 아직 옛 구조(push/callback/file-only).**

- v6.8: VPS Docker 이전 / push→pull 롱폴링 / 등록토큰 / /result 통일 / Job Queue
- v6.9: Raw 저장 백엔드 추상화(raw-sink) — file 기본 / sqlite 옵션
- v6.10: 상용화 골격 — 9-A SDK 계약 / 9-B 멀티테넌시 키 확장 / 9-C 온보딩 / Phase 11
- v6.11: Google A2A 표준 관계 명시 — Olympus A2A(독자) vs Google A2A(표준). 호환 레이어 보류.
- v6.12: **메모리 라이프사이클 확정** — DM=Mem0(사적, 적립 1:1 한정) / DM외=Obsidian(조직). 인격은 공간 무관 Mem0. 회의→Obsidian 트리거(폴링+resolved/out 마커, eventual). 4-A 신설. 6.4 공간별 기록 분기. Raw 드롭 DM 스킵. **보안감사 옵션 모듈(9-D)** — audit-sink(불변·무손실) / 정책 yaml(default-on opt-out, 1=감사·0=면제) / 관리자 전용·메타감사 / Phase 12 신설.
- **다음 메이저 v7.0**: Pull 모델이 코드로 실제 전환되는 시점(Phase 10 착수)에 부여.

### 설계 vs 구현 버전 갭
| | 버전 | 상태 |
|---|---|---|
| 설계(PRD) | v6.12 | 최신 |
| 코드 | ~v6.4 수준 | push/callback/file-only. Phase 8~12 미구현 |

---

## 5. 하위 문서 정합화 현황

**PRD v6.12 기준 전 하위 문서 정합 완료 ✅. 더 작업할 정합 없음.**

| 문서 | 정합 | commit |
|------|------|--------|
| Olympus_PRD_Plan.md | **v6.12 ✅** | cf4293e (SSOT) |
| SKILLS.md | **v6.12 ✅** | bcd28ad9 |
| Olympus_Harness.md | **v1.4 / v6.12 ✅** | acaea5a9 |
| Dev_Enhancement_Olympus.md | **v6.12 ✅** | 1cad0f29 |
| CLAUDE.md | **v6.12 ✅** | b812685b |
| README.md | **v6.12 ✅** | b812685b |

### v6.12 핵심 (재확인용 — 구현/후속 설계 시 실수 방지)
- **DM=Mem0(사적) / DM외=Obsidian(조직)**. 인격은 공간 무관 Mem0.
- **회의→Obsidian는 eventual** (Gemini 워커 폴링 + resolved/out 마커). 즉시 아님.
- **Raw 드롭은 DM 스킵** (`space_type==dm`) — SKILLS 12·16절, Harness T7.7.
- **audit-sink는 Raw Sink와 구현 분리** (불변·무손실 vs fire-and-forget·휘발) — SKILLS 17절, Harness Phase 12.
- **감사 정책 = 관리자 전용**(피감사자 접근 불가). 1=감사·0=면제. "default-on opt-out"(블랙리스트 아님).
- **T5.14 갱신됨**: resolved 기록 = DM이면 Mem0 / 그룹·A2A면 Obsidian (Harness v1.4, before/after 명시).

---

## 6. 확정 결정사항

**v6.11 작업 (2026-06-10):**
1. Dev_Enhancement 리포 포함 (commit 2dde8cc).
2. agents.yaml git 미추적 + agents.example.yaml 추가 (commit 9cd4327).
3. Harness Phase 8~11 매핑 (commit b7c1b71).
4. 멀티테넌시 키 확장 여지 선반영. tenant_id 코드 삽입 금지.
5. Google A2A 호환 레이어 보류.

**v6.12 작업 (2026-06-10):**
6. 메모리: DM=Mem0(사적, 적립 1:1 한정) / DM외=Obsidian(조직). 인격은 공간 무관 Mem0.
7. 회의→Obsidian 반영: 폴링+resolved/out 마커, eventual.
8. 보안감사: 옵션 모듈(9-D), audit-sink 불변·무손실, default-on opt-out(1=감사/0=면제), 관리자 전용, 메타감사. Phase 12. **계약만, 구현 별도.**
9. DM 감사 여부·보존기간 등은 B2B 계약·개인정보 법규별 결정(미결).

---

## 7. 다음 단계

> 문서 정합은 끝났다. 다음은 설계 계속(A) 또는 구현(C).

1. **Phase 8~10 구현** (AGENT.md 작성 → CLI) — Pull 통신 코드 전환(착수 시 v7.0 트리거)
2. **T10.10 실연동** — 실제 에이전트 1기 DM/그룹 실메시지 왕복 (mock 통과 불인정)
3. **Phase 11** — SDK(Node), 온보딩, tenant 키 구조
4. **Phase 12** — 보안감사 모듈 (audit-sink + 배치 감사 + 보고서, B2B 옵션)

> 코드 우선순위: Phase 8~10(실구현·보안) 먼저, Phase 11·12는 그 이후.

---

## 8. 리포 접근 & 커밋 이력

- GitHub: `Dev-CUE/olympus-router-v2` / 브랜치 `master` / MCP 읽기·쓰기 가능
- ⚠️ `str_replace`는 GitHub 파일에 안 먹음 → 로컬 받아 패치 후 전체 push
- sha는 커밋마다 바뀜 → 수정 전 `github:get_file_contents`로 재확인

| commit | 내용 |
|--------|------|
| cbdfb90 | PRD v6.11 — Google A2A 호환성 |
| a525857 | SKILLS v6.11 — 15절 SDK / tenant·Google A2A |
| b7c1b71 | Harness v1.3 — Phase 11 매핑 |
| 2dde8cc | Dev_Enhancement_Olympus.md 신규 — v6.11 |
| 9cd4327 | README v6.11 + agents.example.yaml 신규 |
| cf4293e | **PRD v6.12** — 메모리 라이프사이클 + 보안감사 모듈(9-D) + Phase 12 |
| bcd28ad9 | SKILLS v6.12 — 12절 DM 스킵 / 16절 메모리 라이프사이클 / 17절 audit-sink |
| acaea5a9 | Harness v1.4 — T5.14 공간별 분기 / T7.7 DM 스킵 / Phase 12 매핑 |
| 1cad0f29 | Dev_Enhancement v6.12 — 메모리·보안감사 운영 시나리오 |
| b812685b | CLAUDE v6.12(원칙 8) + README v6.12 |
| 42d8dc27 | HANDOFF — 하위 문서 v6.12 정합 전체 완료 |

> `Olympus_Handoff_v610.md`는 구 핸드오프. **본 HANDOFF.md가 최신·정본**.

---

## 9. 리포 파일 목록

AGENT.md, AGENT_E2E.md, AGENT_Phase1~7.md, CLAUDE.md, Dev_Enhancement_Olympus.md,
HANDOFF.md(본 파일), Olympus_Handoff_v610.md(구), Olympus_Harness.md,
Olympus_PRD_Plan.md, README.md, SKILLS.md,
hera-webhook-adapter.py, server.js,
디렉터리: adapters/ config/(agents.example.yaml 포함, agents.yaml 미추적) harness/ registry/ router-core/ .claude/

---

## 10. 설계 컨텍스트 (A 역할 진입용 — v6.12 결정의 근거와 미결 설계)

> 설계를 이어갈 세션이 "왜 그렇게 결정됐는지"를 모르면 같은 논의를 반복하거나 확정을 무심코 번복한다. 아래는 v6.12 설계 세션의 근거 요약이다.

### 10.1 v6.12 결정 근거 (재논의 금지, 번복 시 PRD 16절식 번복 기록 필수)

| 결정 | 채택 근거 | 기각된 대안 |
|------|----------|------------|
| DM=Mem0 / DM외=Obsidian 분리 | DM은 운영자 사적 보좌 맥락(개인), 회의·협업은 조직이 공유해야 할 자산(조직). 성격이 다르면 저장소도 다르다 | "전부 Mem0"(조직 지식이 개인 기억에 묻힘), "전부 Obsidian"(사적 맥락이 조직에 노출) |
| 인격은 공간 무관 Mem0 | "그룹 Zeus ≠ DM Zeus"가 되면 3축 격리의 PERSONA 축(플랫폼·공간 초월 단일 인격) 자체가 무너짐 | 공간별 인격 분리(기각 — 설계 근간 훼손) |
| 회의→Obsidian eventual(폴링+마커) | 즉시 반영하려면 라우터가 Obsidian을 직접 쓰거나 동기 대기해야 함 → 원칙 6(컴포넌트 독립성)·Dumb Pipe 위반. 결합도↑ 트레이드오프를 받지 않기로 함 | 라우터 직접 쓰기(원칙 6 위반), 동기 반영(코어 블로킹) |
| "DB를 Obsidian에 붙인다" 폐기 | 팩트체크 결과: Obsidian은 마크다운 vault가 근본 구조. SQLite 플러그인은 vault 내 .db 조회/렌더 보조도구일 뿐(대부분 읽기전용). DB 옵션은 Raw Sink(file/sqlite)에만 둔다 | Obsidian+DB 통합(기술적으로 불성립) |
| DM발 조직급 결정 승격 로직 없음 | 의도적 단순화 — 조직 결정은 조직 공간에서 내린다. 승격 로직은 "어떤 DM 발언이 조직급인가" 판정이 필요해지고, 그 판정은 파싱/LLM(=Dumb Pipe 위반) 아니면 수동(=복잡도만 증가) | 자동 승격(Dumb Pipe 위반), 수동 승격 명령(복잡도 대비 효용 낮음) |
| audit-sink를 Raw Sink와 구현 분리 | 비기능 요구가 정반대(무손실·동기 vs fire-and-forget·휘발). 한 싱크로 둘 다 만족 불가 | Raw Sink 재사용(감사 무손실 보장 불가) |
| 감사 정책 default-on opt-out + 관리자 전용 | 피감사자가 자기 감사를 끌 수 있으면 감사 무의미(separation of duties). opt-in이면 "감사 안 켠 채널"이 기본이 되어 컴플라이언스 취지 훼손 | opt-in(전수성 훼손), 피감사자 셀프 설정(무결성 훼손) |
| 보안감사 "계약만, 구현 Phase 12" | 멀티테넌시(9-B)와 동일 패턴 — 지금 코드에 넣으면 과설계. 켜기 전엔 없는 것과 동일하게 자리만 | 즉시 구현(B2B 수요 확정 전 과설계) |

### 10.2 미결 설계 항목 (다음 설계 세션 후보)

| 항목 | 상태 | 비고 |
|------|------|------|
| DM 감사 여부 | 미결 | 사적성↔감사 필요성 충돌. B2B 계약·개인정보 법규별. PRD는 `audit.dm` 토글 존재만 정의 |
| 감사 보존기간(retention)·접근통제·보고서 포맷 | 미결 | Phase 12 구현 시 결정 |
| Gemini 워커 폴링 주기·마커 포맷 상세 | 미결 | 방향(폴링+마커)은 확정, 수치·스키마는 Wiki 구현 시 |
| 등록 토큰 발급/로테이션 정책 | 미정 | env 키 네이밍·로테이션 주기 |
| Raw SQLite 외부 의존(node:sqlite vs better-sqlite3) | 미정 | 내장 우선, 외부는 승인 필요 |
| 멀티테넌시 본격 설계 | 보류 | v6.10은 키 자리만. 테넌트별 격리·과금·권한은 별도 |
| Google A2A 호환 레이어 | 보류 | 외부 에이전트 연동 수요 발생 시 재검토 |
| S8 TLS 강제 / S10 재전송 방어 | 정책미정 | Dev_Enhancement 보안 매트릭스 참조 |

### 10.3 설계 세션 진행 절차 (이 세션이 따른 방식)

1. 논의 → 선택지·트레이드오프 제시 → CUE 결정
2. 필요 시 팩트체크(web_search) — 추측으로 설계하지 않는다 (예: Obsidian DB 플러그인 검증)
3. 설계 확정 → **PRD 먼저 갱신**(버전 +0.01, changelog·미결 갱신, 기존 절 번호 시프트 회피 — 신규 절은 4-A/9-D식 별칭 또는 맨 끝)
4. 기존 계약 변경 시(예: 6.4 기록 규칙) **연쇄 영향 명시**(Harness 테스트 갱신 대상 + before/after)
5. HANDOFF 되먹임("하위 문서 재정합 필요" 명시) → B 역할이 SKILLS → Harness → Dev_Enhancement → CLAUDE → README 순으로 정합
6. 전 문서 정합 후 HANDOFF 최종 갱신

### 10.4 확정 번복 시 절차

"재논의 금지" 항목을 번복해야 한다면: PRD 16절(Decision Reversal Log)에 기존 결정·번복 후·사유를 표로 기록하고 CUE 명시 승인 하에만 진행한다(v6.8 R1~R5 선례).
