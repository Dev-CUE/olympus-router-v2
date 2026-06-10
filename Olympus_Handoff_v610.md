# Olympus Router — 정합화 작업 핸드오프 (v6.10)

> 이 문서 하나로 새 세션에서 **지시 없이** 작업을 이어갈 수 있다.
> 작성일: 2026-06-10 | 작업 단계: 하위 문서 v6.10 정합화 (PRD는 이미 v6.10 완료)

---

## 0. 너의 역할 (새 세션 LLM)

이 프로젝트의 **하위 문서 정합화 작업자**다. PRD(SSOT)가 v6.10으로 올라갔는데
하위 문서 일부가 뒤처져 있다. 그 격차를 메우는 게 이번 작업이다.

**규칙:**
- **코드는 건드리지 않는다. 문서만.**
- `[작업금지] 브리핑 → 승인 → 실행` 프로토콜 유지. 단, 6절의 잠정 기본값은 이미 CUE가
  사실상 승인한 방향이므로 그에 따라 진행하되, 각 문서 push 전 한 줄 브리핑만 한다.
- 추측·아부 금지. 모르면 모른다고. 간결하게. 한국어.

---

## 1. 리포 & 접근

- GitHub: `Dev-CUE/olympus-router-v2`, 브랜치 `master`
- GitHub MCP: 읽기/쓰기 가능 (커밋 작성자 Dev-CUE / dev@incue.co.kr)
- 쓰기: `github:create_or_update_file`(현재 sha 필요) 또는 `github:push_files`
  - ⚠️ `str_replace`는 GitHub 파일에 안 먹는다. 로컬(/home/claude)에 받아 패치 후 전체 내용으로 push.
  - 받기: `curl -s https://raw.githubusercontent.com/Dev-CUE/olympus-router-v2/master/<파일>`
- PRD 최신 sha: `fca05f17a0f80f781d0bafc0a198d960109b5341` (commit `9c996a64`)
  ※ sha는 새 커밋마다 바뀐다. 수정 전 반드시 `github:get_file_contents`로 현재 sha 재확인.

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
- **mock 통과 ≠ 완료**: "55/55 통과"는 전부 mock. 실제 에이전트 왕복 검증 안 됨.

---

## 4. 버전 흐름 (오늘까지)

문서상 설계 변경만 진행, **코드는 아직 옛 구조(push/callback/file-only)**.

- v6.8: 대규모 전환 — VPS Docker 이전 / push→pull 롱폴링 / 등록토큰 / /result 통일
  (callback 8798 폐기) / Stateless→Job Queue / 확정결정 5건 번복(PRD 16절)
- v6.9: Raw 저장 백엔드 추상화(raw-sink) — file 기본 / sqlite 옵션
  (DB 1순위 서버리스 SQLite, node:sqlite 우선, 외부의존 better-sqlite3는 별도승인)
- v6.10: **상용화 골격** — 신규 절 3개 + Phase 11
  - 9-A 에이전트 SDK 계약(규격만, 구현은 Phase 11):
    `OlympusAgent({router_url, agent_id, token, source_url})` + `onJob(handler)` + `start/stop`.
    SDK가 폴링/토큰/result/_source_url/재접속을 감춤. **필수 아님(직접 HTTP도 가능)**.
  - 9-B 멀티테넌시 — 키 확장만(최소 반영): context_key/persona_key/session_id에
    `tenant_id` prefix 자리만 예약. 지금 코드엔 안 넣음. 키 생성 함수를 prefix 주입 가능
    형태로만 유지. **본격 설계 아님**.
  - 9-C 온보딩: POST /admin/agents→토큰 1회 발급→SDK 주입→폴링 시작→
    /admin/agents/:id/test로 확인. 토큰 재발급 = POST /admin/agents/:id/token.
  - Phase 11: T11.1~T11.7 (SDK, 키 prefix 준비, 온보딩, 토큰 재발급) — 전부 미구현.
- **다음 메이저 v7.0**: Pull 모델이 코드로 실제 전환되는 시점(Phase 10 착수)에 부여 예정.

---

## 5. 이번 세션 작업 = 하위 문서 v6.10 정합화

PRD는 v6.10인데 하위 문서는 SDK·멀티테넌시·온보딩 미반영. 모순 제거가 목표.

### 문서별 현재 상태 & 할 일
| 문서 | 현재 정합 | 이번에 할 일 |
|------|----------|-------------|
| Olympus_PRD_Plan.md | v6.10 ✅ | 없음 (SSOT) |
| SKILLS.md | v6.9 (raw-sink까지) | **9-A SDK 클라이언트 패턴 추가** (폴링 루프 감추는 예시 코드 섹션) + 정합기준 라인 v6.10 |
| Dev_Enhancement_Olympus.md | v6.9 | **상용화 골격 반영** (SDK·테넌시·온보딩) + 정합기준 v6.10 |
| Olympus_Harness.md | v6.9 (T7.5/6) | **Phase 11 테스트 매핑 추가** (T11.1~T11.7) + 정합기준 v6.10 |
| README.md | v6.8 | SDK·온보딩 한 줄 추가 |
| CLAUDE.md | v6.8 | 영향 적음 — 검토만, 필요시 원칙표에 SDK/테넌시 1줄 |

### 우선순위
1. SKILLS.md (구현자가 볼 실질 패턴)
2. Olympus_Harness.md (Phase 11 매핑)
3. Dev_Enhancement_Olympus.md (상용화 골격)
4. README.md / CLAUDE.md (가벼운 정합)

---

## 6. 미해결 질문 + 잠정 기본값 (지시 없이 진행용)

CUE의 명시적 결정이 오기 전까지 아래 기본값으로 진행한다. CUE가 다른 의견을 주면 그때 수정.

1. **Dev_Enhancement_Olympus.md를 리포에 넣을지**
   → 잠정 기본: **리포 미포함 유지.** 이 문서는 CUE의 Drive 강화지침 성격이라
     /mnt outputs 산출 + Drive 보관으로 둔다. 정합화 패치본은 산출물로 전달만.
   (CUE가 "리포에 넣자" 하면 그때 커밋)
2. **config/agents.yaml git 미추적 / agents.example.yaml 부재**
   → 잠정 기본: **이번 정합화 범위 밖.** 코드/설정 파일이므로 문서 정합화와 분리.
     별도 작업으로 분류해 6절에 남겨둔다(만들지 여부는 코드 착수 때 결정).
3. **Harness에 Phase 11 매핑 추가 여부**
   → 잠정 기본: **추가한다.** PRD에 Phase 11이 있으므로 테스트 골격도 정합 유지가 맞다.
     단 "[v6.10 미구현]" 태그 명시(다른 미구현 Phase와 동일 표기).
4. **멀티테넌시 본격 설계 시점**
   → 잠정 기본: **보류 유지.** v6.10은 키 자리 예약만. 테넌트별 격리·과금·권한은
     별도 메이저 결정 사항. 이번 정합화에서 건드리지 않는다.

---

## 7. 작업 순서

1. PRD v6.10의 9-A/9-B/9-C 절과 Phase 11을 읽어 정확한 계약 파악
   (raw: https://raw.githubusercontent.com/Dev-CUE/olympus-router-v2/master/Olympus_PRD_Plan.md)
2. 6절 기본값에 따라 범위 확정 (SKILLS / Harness 정합화가 핵심, Dev_Enhancement는 산출물)
3. 문서별: 로컬에 받기 → 패치 → 한 줄 브리핑 → push
4. 커밋 메시지에 버전·변경요지 명시 (기존 패턴 따름)
5. 완료 후 이 핸드오프의 5절 표를 갱신(정합 완료 표기)하고 다시 push

---

## 8. 정합화 시 지켜야 할 계약 디테일 (실수 방지)

- **SDK는 "필수 아님"** — SKILLS에 SDK 패턴 넣되 "직접 HTTP로도 동일 동작" 명시.
- **tenant_id는 지금 코드에 넣지 않음** — SKILLS 키 생성 패턴에 prefix 주입 "가능성"만,
  실제 tenant_id 삽입 코드는 금지. "단일 테넌트는 prefix 없이 동작" 유지.
- **persona_key 플랫폼 prefix 금지 원칙은 불변** — 테넌시 확장에서도 `{tenant_id}:{agent_id}`까지만,
  플랫폼 prefix는 절대 안 됨.
- **SDK onJob 반환 = result 계약** — status/response_text/a2a_status/activities. 핸들러 예외는
  SDK가 error result로 변환.
- **온보딩 성공 판정 = 최근 폴링 수신** (push 아님). /admin/agents/:id/test가 last_poll_ms_ago로 판정.

---

## 9. 오늘 커밋 이력 (참고)

| commit | 내용 |
|--------|------|
| a4dae54 | PRD v6.9 (raw-sink) |
| fa31583 | SKILLS v6.9 (raw-sink 패턴) |
| 8723be1 | Harness v1.2 (T7.5/6) |
| 9c996a64 | PRD v6.10 (상용화 골격 9-A/B/C + Phase 11) ← PRD 최신 |
| (이 문서) | Handoff v6.10 |

---

## 10. 리포 파일 목록 (참고)
AGENT.md, AGENT_E2E.md, AGENT_Phase1~7.md, CLAUDE.md, Olympus_Harness.md,
Olympus_PRD_Plan.md, README.md, SKILLS.md, hera-webhook-adapter.py, server.js,
디렉터리: adapters/ config/ harness/ registry/ router-core/ .claude/

> Dev_Enhancement_Olympus.md는 리포에 없음(Drive/outputs 전용, 6절-1 참조).
> config/agents.yaml은 git 미추적(agents.example.yaml만 추적 대상이나 아직 부재, 6절-2 참조).
