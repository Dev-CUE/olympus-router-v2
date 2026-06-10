# HANDOFF.md — Olympus Router 상시 진입점

> **새 세션은 무조건 이 파일을 먼저 읽는다.** 이 파일은 버전에 묶이지 않는 고정 진입점이며,
> 작업이 진행될 때마다 최신 상태로 덮어쓴다(영속 SSOT 보조 문서).
> 최종 갱신: 2026-06-10 | 현재 단계: 하위 문서 v6.11 정합화 (SKILLS·Harness 완료 / Dev_Enhancement·README 남음)

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
3. **버전을 설계/구현으로 분리 인식한다.** PRD는 "설계 버전"이 앞설 수 있다(현재 설계 v6.11 /
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
- **mock 통과 ≠ 완료**: 현재 "55/55 통과"는 전부 mock. 실제 에이전트 왕복 검증 안 됨.

---

## 4. 버전 흐름 (설계 기준)

문서상 설계 변경만 진행됨. **코드는 아직 옛 구조(push/callback/file-only).**

- v6.8: VPS Docker 이전 / push→pull 롱폴링 / 등록토큰 / /result 통일 / Job Queue
- v6.9: Raw 저장 백엔드 추상화(raw-sink) — file 기본 / sqlite 옵션
- v6.10: 상용화 골격 — 9-A SDK 계약 / 9-B 멀티테넌시 키 확장 / 9-C 온보딩 / Phase 11
- v6.11: Google A2A 표준 호환성 결정 사항 반영 — Olympus A2A(독자 규격) vs Google A2A(Linux Foundation 표준) 관계 명시. 외부 연동 시 호환 레이어 보류. SDK에 Agent Card 확장 여지 명시.
- **다음 메이저 v7.0**: Pull 모델이 코드로 실제 전환되는 시점(Phase 10 착수)에 부여.

### 설계 vs 구현 버전 갭
| | 버전 | 상태 |
|---|---|---|
| 설계(PRD) | v6.11 | 최신 |
| 코드 | ~v6.4 수준 | push/callback/file-only. Phase 8~11 미구현 |

---

## 5. 지금 당장의 작업 = 하위 문서 v6.11 정합화 (B 역할)

| 문서 | 현재 정합 | 할 일 |
|------|----------|-------|
| Olympus_PRD_Plan.md | v6.11 ✅ | 없음 (SSOT) |
| CLAUDE.md | v6.10 ✅ | 없음 (HANDOFF 진입점 포함 완료) |
| SKILLS.md | v6.11 ✅ | **완료** — 15절 SDK 클라이언트 패턴 추가 / tenant 확장·Google A2A 인라인 (commit a525857) |
| Olympus_Harness.md | **v6.11 ✅** | **완료** — Phase 11(T11.1~7) 매핑 추가 / 정합기준 v6.11 (commit b7c1b71) |
| Dev_Enhancement_Olympus.md | v6.9 | **상용화 골격 + Google A2A 반영** + **리포에 포함**(신규 파일로 push) |
| README.md | v6.8 | SDK·온보딩·Google A2A 관계 한 줄 + agents.example.yaml 안내 |
| config/agents.example.yaml | 없음 | **신규 생성** — agents.yaml 공개 템플릿 |

우선순위: Dev_Enhancement → README + agents.example.yaml (SKILLS·Harness 완료)

### 정합화 시 계약 디테일 (실수 방지)
- **SDK는 필수 아님** — "직접 HTTP로도 동일 동작" 명시.
- **tenant_id 코드 삽입 금지** — prefix 주입 가능성만. (멀티테넌시는 향후 계획으로 키 확장 여지만 선반영)
- **persona_key 플랫폼 prefix 금지 불변** (단 tenant prefix는 향후 허용).
- **Google A2A = 외부 표준, Olympus A2A = 내부 독자 규격** — 혼용 금지. 호환 레이어는 미결.

---

## 6. 미해결 질문 + 확정값 (2026-06-10 세션 확정)

1. **Dev_Enhancement 리포 포함?** → **확정: 리포에 포함**(신규 파일로 push).
2. **agents.yaml git 미추적** → **확정: 미추적 유지 + `config/agents.example.yaml`(공개 템플릿) 추가**. README에 "복사해서 agents.yaml 작성" 안내.
3. **Harness Phase 8~11 매핑?** → **확정: 완료**. "[미구현]" 태그로 명시됨.
4. **멀티테넌시 본격 설계** → **확정: 향후 계획**. 이번 작업에서 키 확장 여지(prefix 주입 가능 구조)만 일부 선반영. tenant_id 코드 삽입은 금지.
5. **Google A2A 표준 호환 레이어** → 보류. 외부 에이전트 연동 필요 시 재검토. SDK Agent Card 확장 여지는 9-A에 명시됨.

---

## 7. 작업 순서

1. PRD v6.11을 읽어 계약 파악
   (raw: https://raw.githubusercontent.com/Dev-CUE/olympus-router-v2/master/Olympus_PRD_Plan.md)
2. 6절 확정값으로 범위 확정
3. 문서별: 로컬 받기 → 패치 → 한 줄 브리핑 → push (sha는 수정 전 재확인)
4. **완료 후 이 HANDOFF.md 5절 표를 갱신하고 다시 push**

---

## 8. 리포 접근 & 커밋 이력

- GitHub: `Dev-CUE/olympus-router-v2` / 브랜치 `master` / MCP 읽기·쓰기 가능
- ⚠️ `str_replace`는 GitHub 파일에 안 먹음 → 로컬 받아 패치 후 전체 push
- sha는 커밋마다 바뀜 → 수정 전 `github:get_file_contents`로 재확인

| commit | 내용 |
|--------|------|
| a4dae54 | PRD v6.9 |
| fa31583 | SKILLS v6.9 |
| 8723be1 | Harness v1.2 (T7.5/6) |
| 9c996a64 | PRD v6.10 (상용화 골격) |
| fd29266 | HANDOFF.md 신설 |
| 2e90360 | CLAUDE.md — HANDOFF 진입점 / v6.10 정합 |
| cbdfb90 | PRD v6.11 + HANDOFF 갱신 — Google A2A 호환성 |
| a525857 | SKILLS v6.11 정합 — 15절 SDK 클라이언트 패턴 / tenant 확장·Google A2A 인라인 |
| e2f8f85 | HANDOFF 되먹임 — SKILLS 완료 / 6절 확정값 반영 |
| b7c1b71 | Harness v1.3 — Phase 11(T11.1~7) 매핑 / 정합기준 v6.11 |
| (이 커밋) | HANDOFF 되먹임 — Harness 완료 반영 / 5절 표·우선순위 갱신 |

> `Olympus_Handoff_v610.md`는 구 핸드오프. **본 HANDOFF.md가 최신·정본**.

---

## 9. 리포 파일 목록

AGENT.md, AGENT_E2E.md, AGENT_Phase1~7.md, CLAUDE.md, HANDOFF.md(본 파일),
Olympus_Handoff_v610.md(구), Olympus_Harness.md, Olympus_PRD_Plan.md, README.md, SKILLS.md,
hera-webhook-adapter.py, server.js, 디렉터리: adapters/ config/ harness/ registry/ router-core/ .claude/

> **Dev_Enhancement_Olympus.md는 이번 작업에서 리포에 포함 예정**(6절 1번 확정).
> config/agents.yaml은 git 미추적 — 대신 `config/agents.example.yaml`(공개 템플릿)을 추가 예정(6절 2번 확정).
