# HANDOFF.md — Olympus Router 상시 진입점

> **새 세션은 무조건 이 파일을 먼저 읽는다.** 이 파일은 버전에 묶이지 않는 고정 진입점이며,
> 작업이 진행될 때마다 최신 상태로 덮어쓴다(영속 SSOT 보조 문서).
> 최종 갱신: 2026-06-10 | **현재 단계: PRD v6.12 확정 → 하위 문서 v6.12 재정합 필요 (메모리 라이프사이클 + 보안감사)**

---

## 0. 너의 역할 판별

새 세션에서 네 역할은 셋 중 하나다:
- **A. 설계자/리뷰어** (claude.ai) — 컨셉·설계 결정, AGENT.md 작성, CLI 결과 리뷰. **코드 직접 구현 안 함.**
- **B. 문서 정합화 작업자** — PRD(SSOT) 변경을 하위 문서에 반영. **문서만, 코드 금지.**
- **C. 구현자** (Claude Code / Codex CLI) — AGENT.md를 받아 실제 코드 작성·테스트.

이 채팅(claude.ai)에서 너는 보통 **A 또는 B**다. C는 CLI가 한다.

**공통 규칙:** `[작업금지] 브리핑 → 승인 → 실행`. 추측·아부 금지. 모르면 모른다고. 간결·한국어.

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

**v6.11 정합은 완료됐으나, PRD가 v6.12로 올라가며 하위 문서가 다시 뒤처짐. v6.12 재정합 필요.**

| 문서 | 정합 | 할 일 (v6.12) |
|------|------|--------------|
| Olympus_PRD_Plan.md | **v6.12 ✅** | 없음 (SSOT, commit cf4293e) |
| CLAUDE.md | v6.10 | 메모리 라이프사이클 원칙(4-A) + 보안감사 원칙 반영 검토 |
| SKILLS.md | v6.11 | **DM 스킵 패턴 / audit-sink 패턴 / 회의→Obsidian 트리거** 추가 |
| Olympus_Harness.md | v6.11 | **T5.14 갱신(DM→Mem0/그룹→Obsidian) + Phase 12(T12.1~8) 매핑** |
| Dev_Enhancement_Olympus.md | v6.11 | **메모리 라이프사이클 + 보안감사 운영 시나리오** 반영 |
| README.md | v6.11 | 메모리 모델·감사 옵션 한 줄 |

우선순위: SKILLS → Harness → Dev_Enhancement → CLAUDE → README

### v6.12 정합 시 핵심 (실수 방지)
- **DM=Mem0(사적) / DM외=Obsidian(조직)**. 인격은 공간 무관 Mem0.
- **회의→Obsidian는 eventual** (폴링+resolved/out 마커). 즉시 아님.
- **Raw 드롭은 DM 스킵** (`space_type==dm`).
- **audit-sink는 Raw Sink와 구현 분리** (불변·무손실 vs fire-and-forget·휘발).
- **감사 정책 = 관리자 전용**. 피감사자 접근 불가. 1=감사·0=면제. "블랙리스트" 용어 금지 → "default-on opt-out".
- **T5.14 충돌**: 기존 "resolved→Mem0"를 공간별 분기로 갱신 (before/after 보고).

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

1. **하위 문서 v6.12 재정합** (현재 단계 — B 역할)
2. **Phase 8~10 구현** (AGENT.md 작성 → CLI) — Pull 통신 코드 전환(v7.0 트리거)
3. **T10.10 실연동** — 실제 에이전트 1기 DM/그룹 실메시지 왕복 (mock 통과 불인정)
4. **Phase 11** — SDK(Node), 온보딩, tenant 키 구조
5. **Phase 12** — 보안감사 모듈 (audit-sink + 배치 감사 + 보고서, B2B 옵션)

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
| (이 커밋) | HANDOFF 갱신 — v6.12 반영, 하위 문서 재정합 필요 명시 |

> `Olympus_Handoff_v610.md`는 구 핸드오프. **본 HANDOFF.md가 최신·정본**.

---

## 9. 리포 파일 목록

AGENT.md, AGENT_E2E.md, AGENT_Phase1~7.md, CLAUDE.md, Dev_Enhancement_Olympus.md,
HANDOFF.md(본 파일), Olympus_Handoff_v610.md(구), Olympus_Harness.md,
Olympus_PRD_Plan.md, README.md, SKILLS.md,
hera-webhook-adapter.py, server.js,
디렉터리: adapters/ config/(agents.example.yaml 포함, agents.yaml 미추적) harness/ registry/ router-core/ .claude/
