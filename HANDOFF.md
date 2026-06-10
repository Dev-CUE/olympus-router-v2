# HANDOFF.md — Olympus Router 상시 진입점

> **새 세션은 무조건 이 파일을 먼저 읽는다.** 이 파일은 버전에 묶이지 않는 고정 진입점이며,
> 작업이 진행될 때마다 최신 상태로 덮어쓴다(영속 SSOT 보조 문서).
> 최종 갱신: 2026-06-10 | 현재 단계: 하위 문서 v6.10 정합화

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
3. **버전을 설계/구현으로 분리 인식한다.** PRD는 "설계 버전"이 앞설 수 있다(현재 설계 v6.10 /
   코드 v6.4 수준). 작업 시작 시 이 갭부터 확인한다. 문서가 앞선 것 자체가 "의도된 미스매치"이며,
   되먹임(규칙 2)으로만 닫힌다.
4. **테스트 무결성.** CLI는 테스트를 자기 구현에 맞춰 고치지 않는다. 코드를 설계(PRD)에 맞춘다.
   테스트 수정은 "PRD 자체가 틀렸을 때"만, 그 경우 코드 말고 PRD를 먼저 고친다(CLAUDE.md 원칙 5).
   ⚠️ 일부 CLI/에이전트는 테스트를 코드에 맞추는 anti-pattern 경향이 있으니 AGENT.md에 명시한다.

### CLI 인터페이스 = AGENT.md
CLI에 줄 지시서는 Phase별 `AGENT.md`(화이트리스트·블랙리스트·자가검증 명령·완료보고 형식).
이 채팅에서 AGENT.md를 작성→CUE 승인→CLI에 전달하는 흐름.

---

## 2. 프로젝트 본질 (1줄)

복수 AI 에이전트(Zeus/Hera/Athena)를 여러 메신저에서 굴리는 범용 멀티플랫폼
오케스트레이션 인프라. 운영자(CUE)가 최초 지시·최종 확인만, 나머지는 에이전트 조직이 처리.

---

## 3. 핵심 설계 원칙 (불변)

- **Dumb Pipe**: 라우터 코어는 파싱·LLM·의도분석 금지. 목적지 검증+패스스루만.
  (v6.8에서 "상태 0%"만 완화 → 일감 큐 허용. 파싱·LLM 금지는 유지)
- **Zero Hardcoding**: zeus/hera/athena를 코드에 직접 쓰지 않음. agents.yaml에서만 정의.
- **Stage-Gated**: Phase 순서대로, Exit Criteria 100% 통과 후 다음.
- **컴포넌트 독립성**: 라우터는 Mem0/Obsidian/Gemini 직접 호출 금지.
- **Pull 통신(v6.8)**: 라우터가 에이전트를 호출(push)하지 않음. 에이전트가 롱폴링으로 일감 수령.
- **mock 통과 ≠ 완료**: 현재 "55/55 통과"는 전부 mock. 실제 에이전트 왕복 검증 안 됨.

---

## 4. 버전 흐름 (설계 기준)

문서상 설계 변경만 진행됨. **코드는 아직 옛 구조(push/callback/file-only).**

- v6.8: VPS Docker 이전 / push→pull 롱폴링 / 등록토큰 / /result 통일(callback 8798 폐기) /
  Stateless→Job Queue / 확정결정 5건 번복(PRD 16절)
- v6.9: Raw 저장 백엔드 추상화(raw-sink) — file 기본 / sqlite 옵션
  (1순위 서버리스 SQLite, node:sqlite 우선, better-sqlite3는 별도승인)
- v6.10: 상용화 골격 — 9-A 에이전트 SDK 계약(규격만) / 9-B 멀티테넌시 키 확장 최소반영
  (tenant_id 자리만 예약, 본격설계 아님) / 9-C 온보딩 / Phase 11(T11.1~T11.7, 미구현)
- **다음 메이저 v7.0**: Pull 모델이 코드로 실제 전환되는 시점(Phase 10 착수)에 부여.

### 설계 vs 구현 버전 갭 (규칙 3)
| | 버전 | 상태 |
|---|---|---|
| 설계(PRD) | v6.10 | 최신 |
| 코드 | ~v6.4 수준 | push/callback/file-only. Phase 8~11 미구현 |

---

## 5. 지금 당장의 작업 = 하위 문서 v6.10 정합화 (B 역할)

PRD는 v6.10인데 하위 문서가 SDK·멀티테넌시·온보딩 미반영. 모순 제거가 목표.

| 문서 | 현재 정합 | 할 일 |
|------|----------|-------|
| Olympus_PRD_Plan.md | v6.10 ✅ | 없음 (SSOT) |
| SKILLS.md | v6.9 | **9-A SDK 클라이언트 패턴 추가** + 정합기준 v6.10 |
| Olympus_Harness.md | v6.9 | **Phase 11 매핑(T11.1~T11.7) 추가** + 정합기준 v6.10 |
| Dev_Enhancement_Olympus.md | v6.9 | **상용화 골격 반영** (리포 미포함, outputs 산출물로) |
| README.md | v6.8 | SDK·온보딩 한 줄 |
| CLAUDE.md | v6.8 | 원칙표에 SDK/테넌시 1줄(검토) |

우선순위: SKILLS → Harness → Dev_Enhancement → README/CLAUDE

### 정합화 시 계약 디테일 (실수 방지)
- **SDK는 필수 아님** — "직접 HTTP로도 동일 동작" 명시.
- **tenant_id 코드 삽입 금지** — prefix 주입 "가능성"만. 단일 테넌트는 prefix 없이 동작.
- **persona_key 플랫폼 prefix 금지 불변** — 확장해도 `{tenant_id}:{agent_id}`까지만.
- **SDK onJob 반환 = result 계약**: status/response_text/a2a_status/activities. 예외는 SDK가 error result로.
- **온보딩 성공 판정 = 최근 폴링 수신**(push 아님). /admin/agents/:id/test가 last_poll_ms_ago로 판정.

---

## 6. 미해결 질문 + 잠정 기본값 (지시 없이 진행용)

CUE 명시 결정 전까지 아래로 진행. 다른 의견 오면 그때 수정.
1. **Dev_Enhancement 리포 포함?** → 기본: 미포함 유지(Drive/outputs 전용). 정합 패치본은 산출물로 전달.
2. **agents.yaml git 미추적 / example 부재** → 기본: 이번 범위 밖(코드 착수 때 결정).
3. **Harness Phase 11 매핑 추가?** → 기본: 추가한다. "[v6.10 미구현]" 태그 명시.
4. **멀티테넌시 본격 설계 시점** → 기본: 보류. v6.10은 키 자리 예약만.

---

## 7. 작업 순서

1. PRD v6.10의 9-A/9-B/9-C·Phase 11을 읽어 계약 파악
   (raw: https://raw.githubusercontent.com/Dev-CUE/olympus-router-v2/master/Olympus_PRD_Plan.md)
2. 6절 기본값으로 범위 확정
3. 문서별: 로컬 받기 → 패치 → 한 줄 브리핑 → push (sha는 수정 전 get_file_contents로 재확인)
4. 커밋 메시지에 버전·변경요지 명시
5. **완료 후 이 HANDOFF.md의 5절 표·8절 이력을 갱신하고 다시 push** (되먹임 규칙 2)

---

## 8. 리포 접근 & 커밋 이력

- GitHub: `Dev-CUE/olympus-router-v2` / 브랜치 `master` / MCP 읽기·쓰기 가능
- ⚠️ `str_replace`는 GitHub 파일에 안 먹음 → 로컬 받아 패치 후 전체 push
- PRD 최신 sha: 수정 전 `github:get_file_contents`로 재확인 (커밋마다 바뀜)

| commit | 내용 |
|--------|------|
| a4dae54 | PRD v6.9 (raw-sink) |
| fa31583 | SKILLS v6.9 |
| 8723be1 | Harness v1.2 (T7.5/6) |
| 9c996a64 | PRD v6.10 (상용화 골격) |
| f70c679 | Handoff v6.10 (구버전, 본 HANDOFF.md로 대체됨) |
| (이 문서) | HANDOFF.md — 고정 진입점 + 작업 분담 모델 |

> `Olympus_Handoff_v610.md`는 구 핸드오프다. **본 HANDOFF.md가 최신·정본**이다.

---

## 9. 리포 파일 목록 (참고)

AGENT.md, AGENT_E2E.md, AGENT_Phase1~7.md, CLAUDE.md, HANDOFF.md(본 파일),
Olympus_Handoff_v610.md(구), Olympus_Harness.md, Olympus_PRD_Plan.md, README.md, SKILLS.md,
hera-webhook-adapter.py, server.js, 디렉터리: adapters/ config/ harness/ registry/ router-core/ .claude/

> Dev_Enhancement_Olympus.md는 리포에 없음(Drive/outputs 전용, 6절-1).
> config/agents.yaml은 git 미추적(6절-2).
