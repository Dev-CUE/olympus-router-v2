# CLAUDE.md — Olympus Router 프로젝트 헌법

> 🧭 **작업 시작 전 `HANDOFF.md`를 가장 먼저 읽어라.** 그 파일이 고정 진입점이며,
> 현재 작업 단계·역할 분담·미스매치 방지 규칙·최신 상태를 담고 있다. 이후 이 헌법을 읽는다.

> 이 파일은 코딩 에이전트가 작업을 시작하기 전 **반드시 먼저 읽어야 하는** 프로젝트 최상위 규칙이다.
> 자기완결형 — 이 파일만으로 핵심 규칙을 파악할 수 있다.
> **정합 기준: Olympus_PRD_Plan.md v6.10** (pull 통신모델 / VPS 이전 / 등록토큰 / Stateless 완화 / Raw 백엔드 추상화 / 상용화 골격 SDK·테넌시·온보딩)

---

## ⛔ 0. 문서 보호 규칙 (최최우선 — 다른 모든 규칙보다 앞선다)

### AGENT.md는 읽기 전용이다

```
AGENT.md를 수정하는 것은 어떤 이유로도, 어떤 상황에서도 절대 금지된다.
"더 나은 구현을 위해", "Phase 진행을 위해", "브리핑 내용 반영을 위해" 등
어떤 명분도 AGENT.md 수정을 정당화할 수 없다.
```

**발견 즉시 행동 지침**:
- 작업 중 AGENT.md를 수정하고 싶은 충동이 생기면 → 즉시 멈추고 보고
- AGENT.md가 수정된 흔적을 발견하면 → 작업 전부 중단, 원본 복원 요청 보고
- 수정된 AGENT.md를 근거로 작업을 정당화하는 것 → 엄격히 금지

### 문서 수정 권한

| 파일 | 수정 권한 |
|------|-----------|
| AGENT.md | **사장님(운영자) 전용. 에이전트 절대 수정 불가** |
| CLAUDE.md | **사장님(운영자) 전용. 에이전트 절대 수정 불가** |
| SKILLS.md | **사장님(운영자) 전용. 에이전트 절대 수정 불가** |
| Olympus_PRD_Plan.md | **사장님(운영자) 전용. 에이전트 절대 수정 불가** |
| Olympus_Harness.md | **사장님(운영자) 전용. 에이전트 절대 수정 불가** |
| HANDOFF.md | **사장님(운영자) 전용. 단 정합화 세션이 완료 상태 갱신은 가능(운영자 지시 하)** |
| config/agents.yaml | AGENT.md에 명시된 Phase에서만 수정 가능 |
| 소스 코드 | AGENT.md 화이트리스트에 명시된 파일만 수정 가능 |

### 자기 승인 금지

```
에이전트가 문서를 수정한 뒤 그 문서를 근거로 작업을 정당화하는 행위는
"자기 승인(Self-Authorization)"으로 간주하며 가장 심각한 원칙 위반이다.
이런 패턴이 감지되면 즉시 모든 작업을 중단하고 사장님에게 보고해야 한다.
```

---

## 1. 한 줄 요약

복수의 AI 에이전트를 Telegram/Slack/Discord 등 여러 플랫폼에서 운영하는 **범용 멀티 플랫폼 AI 조직 운영 인프라**. 라우터는 메시지를 격리하고, 에이전트 인격은 플랫폼 초월 공유하며, 에이전트 간 협업(A2A)을 안전하게 중개한다.

> **v6.8 배포 형태**: 라우터+어댑터는 Hostinger VPS Docker에서 구동. 에이전트는 위치 무관(외부 접속 전제)이며 라우터로 **롱폴링(pull)** 하여 일감을 받고 결과를 제출한다. 라우터는 에이전트를 직접 호출하지 않는다.

---

## 1-A. 작업 분담 모델 (미스매치 방지 — HANDOFF.md와 동일)

문서와 코드의 미스매치를 막기 위한 역할 분리 + 되먹임 루프다.

- **설계·리뷰는 claude.ai에서**, **구현은 CLI(Claude Code / Codex)에서.** 설계자는 코드를 직접 짜지 않고, AGENT.md 지시서를 만들어 CLI에 넘긴다.
- **4대 규칙:**
  1. 설계 선행, 단 **구현 가능한 단위(Phase 1개)로 절단**해서 CLI에 넘긴다.
  2. **구현 완료 = 문서 갱신 의무.** CLI가 Phase 구현·테스트 통과하면 PRD/HANDOFF에 "구현 완료 + 커밋 sha" 반영까지가 1작업.
  3. **버전을 설계/구현으로 분리 인식.** 설계(PRD)가 앞설 수 있다(현재 설계 v6.10 / 코드 ~v6.4). 작업 시작 시 이 갭부터 본다.
  4. **테스트 무결성.** 테스트를 코드에 맞추지 않는다. 코드를 PRD에 맞춘다. 테스트 수정은 PRD 모순일 때만, 그땐 PRD를 먼저 고친다(원칙 5).

---

## 2. 불변 원칙 (위반 = 작업 거부)

### 원칙 1: Dumb Pipe (v6.8 조정)
라우터 코어는 텍스트를 파싱하지 않는다. 비즈니스 로직·LLM 호출·문자열 의도 분석을 일절 포함하지 않는다. 목적지(to/cc) 검증 + 일감 큐 적재 + 폴링 전달만 수행한다.
> v6.8: "상태 0%"는 폐기되고 **일감 큐(단기 상태) 보유는 허용**된다. 단 파싱·LLM·의도분석 금지는 그대로 불변이다.

### 원칙 2: Zero Hardcoding
코드 어디에도 `zeus`, `hera`, `athena` 같은 에이전트 이름을 직접 쓰지 않는다.
- 금지: `if (agent === "zeus")`, `const ZEUS_URL = ...`, `registry["athena"]`
- 허용: `registry.exists(id)`, `registry.getUrl(id)`, `registry.getAllIds()`

### 원칙 3: Stage-Gated
Phase는 순서대로만 구현한다. 각 Phase의 Exit Criteria를 100% 통과해야 다음 Phase로 진행한다. 현재 AGENT.md에 명시된 Phase 외의 작업을 선점하지 않는다.

### 원칙 4: 작업 프로토콜
`[작업금지] 브리핑 → 수정 → 승인` 순서를 지킨다. 코드 작성 전 반드시 무엇을 할지 브리핑하고 승인을 받는다. 승인 없이 코드를 생성하지 않는다.

### 원칙 5: 이 문서 우선
코드와 설계 문서가 충돌하면 설계 문서가 정답이다. 구현 중 모순을 발견하면 코드를 임의로 고치지 말고, 모순 내용을 정확히 기술해 보고한다.

### 원칙 6: 컴포넌트 독립성
라우터/어댑터는 Mem0·Obsidian·Gemini 등 외부 지식 인프라와 완전히 독립적이다. 라우터의 유일한 Wiki 접점은 Raw 폴더 드롭(옵션)뿐이다.

### 원칙 7: Pull 통신 (v6.8 신규)
라우터는 에이전트를 직접 호출하지 않는다. 에이전트가 `GET /agents/:id/poll`로 일감을 가져가고 `POST /agents/:id/result`로 결과를 제출한다. 에이전트는 라우터 URL과 등록 토큰만 알면 된다. 에이전트측 inbound 포트·터널은 불필요하다.

---

## 3. 3축 격리 모델 (절대 혼동 금지)

| 축 | 대상 | 키 | 격리/공유 |
|----|------|-----|-----------|
| MESSAGE | 대화 메시지 로그 | `context_key` | 방마다 완전 격리 |
| PERSONA | 에이전트 인격·기억 | `{agent_id}` | 플랫폼 초월 공유 (Mem0) |
| KNOWLEDGE | 조직 지식 | Obsidian | 플랫폼 초월 공용 |

> ❌ `persona_key: "telegram:zeus"` — 절대 금지
> ✅ `persona_key: "zeus"` — 플랫폼 prefix 없음
> (v6.10) 향후 멀티테넌시 도입 시 `{tenant_id}:{agent_id}`까지만 확장 가능. 플랫폼 prefix는 여전히 금지. 단 현재는 단일 테넌트, tenant_id 미사용.

---

## 4. 디렉터리 구조

```
olympus-router/
├── HANDOFF.md             # 고정 진입점 — 새 세션이 가장 먼저 읽음
├── CLAUDE.md              # 이 파일 — 읽기 전용
├── SKILLS.md              # 기술 컨벤션 — 읽기 전용
├── AGENT.md               # 현재 Phase 지시서 — 읽기 전용
├── Olympus_PRD_Plan.md    # 설계 전체 명세 — 읽기 전용
├── Olympus_Harness.md     # 테스트 골격 — 읽기 전용
├── config/
│   └── agents.yaml
├── router-core/
│   ├── olympus-router.js
│   ├── a2a-guard.js
│   ├── job-queue.js        # (v6.8) 에이전트별 일감 큐 — pull 모델
│   ├── auth-token.js       # (v6.8) poll/result 등록 토큰 검증
│   └── raw-logger.js       # (v6.9) raw-sink 추상화 (file/sqlite)
├── registry/
│   └── agent-registry.js
├── adapters/
│   ├── telegram-adapter.js
│   ├── slack-adapter.js
│   └── discord-adapter.js
├── harness/
│   ├── tests/
│   ├── mocks/
│   └── fixtures/
└── data/wiki/raw/
```

> 위 `job-queue.js` / `auth-token.js`는 v6.8 Phase 10에서 신설 예정. 파일명은 구현 시 AGENT.md 화이트리스트로 확정한다.
> (v6.10) 에이전트 SDK는 별도 패키지로 Phase 11에서 신설 예정(라우터 코어 외부).

---

## 5. 절대 금지 사항

1. **AGENT.md / CLAUDE.md / SKILLS.md / PRD / Harness / HANDOFF.md 수정** (최우선 금지)
2. 에이전트 이름 하드코딩 (zeus/hera/athena)
3. 라우터 코어에서 텍스트/의도 파싱
4. 라우터에서 Mem0/Obsidian/Gemini 직접 호출
5. 플랫폼 간 메시지 교차
6. 플랫폼 간 A2A 호출
7. persona_key에 플랫폼 prefix 부착
8. AGENT.md에 명시되지 않은 파일 수정
9. Exit Criteria 미통과 상태로 Phase 완료 선언
10. 승인 없는 코드 생성
11. 설계 모순 발견 시 임의 수정
12. **자기 승인 (문서 수정 후 그 문서를 근거로 작업 정당화)**
13. (v6.8) 라우터가 에이전트를 직접 호출(push)하는 코드 작성 — pull 모델 위반
14. (v6.8) 등록 토큰·시크릿을 agents.yaml 또는 코드에 하드코딩 — env 전용
15. (v6.10) tenant_id를 지금 코드에 삽입 — 키 prefix "자리"만 열어두고, 실제 주입은 멀티테넌시 본격 도입 시

---

## 6. 기술 스택 고정

- 언어: Node.js (ESM, `import`/`export`)
- 병렬: `Promise.allSettled`
- 테스트: `node:test` + `node:assert`
- 설정: YAML (`config/agents.yaml`)
- HTTP: Node 내장 `fetch`
- (v6.8) 배포: Docker (Hostinger VPS). 사용자 진입은 frameq.io / Cloudflare Tunnel
- (v6.9) Raw 저장: 백엔드 추상화. 기본 file(JSONL) / 옵션 sqlite(node:sqlite 우선, 외부의존 별도승인)

---

## 7. 작업 보고 형식

```
[Phase N 완료 보고]
구현 파일: [목록]
Exit Criteria:
  T_N.1 ✅
  T_N.2 ✅
  T_N.3 ❌ — 원인: [구체적 설명]
상태: 전체 통과 / 미통과 항목 있음
다음 액션: Phase N+1 AGENT.md 제공 요청 (작업 대기)
```

> 모든 Exit Criteria가 통과하기 전에는 "완료"를 선언하지 않는다.
> mock 통과는 "완료"가 아니다. 실제 에이전트 왕복 검증이 필요한 항목은 별도 표기한다.
> 완료 후에는 **반드시 멈추고** 다음 AGENT.md가 제공될 때까지 대기한다.
> (작업 분담 규칙 2) 완료 시 PRD/HANDOFF에 "구현 완료 + 커밋 sha" 반영까지가 1작업.

---

## 8. 현재 Phase

현재 작업 Phase와 구체적 지시는 `AGENT.md`를 참조한다.
**AGENT.md는 Phase 시작 시마다 사장님이 교체해서 제공한다.**
에이전트는 AGENT.md를 수동으로 교체하거나 수정할 수 없다.

> 설계 v6.10 기준 미구현 Phase: **Phase 8**(Agora 동기화), **Phase 9**(다중 사용자·Admin API), **Phase 10**(Pull 통신 전환 — Job Queue·poll/result·등록토큰), **Phase 11**(상용화 골격 — SDK·테넌시 키·온보딩).
> 코드 우선순위: Phase 8~10(실구현·보안) 먼저, Phase 11은 그 이후.
