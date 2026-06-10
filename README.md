# Olympus Router

복수의 AI 에이전트를 Telegram / Slack / Discord 등 여러 플랫폼에서 운영하는 **범용 멀티 플랫폼 AI 조직 운영 인프라**.

라우터는 메시지를 격리하고, 에이전트 인격은 플랫폼 초월 공유하며, 에이전트 간 협업(A2A)을 안전하게 중개한다.

> **설계 기준: PRD v6.12** — 라우터+어댑터는 VPS Docker에서 구동하고, 에이전트는 위치 무관(외부 접속 전제)으로 라우터에 **롱폴링(pull)** 하여 일감을 받고 결과를 제출한다. SDK(9-A) / tenant 키 확장 여지(9-B) / Google A2A 관계(v6.11) / 메모리 라이프사이클·보안감사 옵션(v6.12).

---

## 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **Dumb Pipe** | 라우터 코어는 텍스트를 파싱하지 않는다. 목적지(to/cc) 검증 + 일감 큐 적재 + 폴링 전달만 수행 (파싱·LLM·의도분석 금지) |
| **Zero Hardcoding** | 코드 어디에도 에이전트 이름을 직접 쓰지 않는다. 모든 에이전트 정보는 `config/agents.yaml` |
| **Pull-based Dispatch** | 라우터가 에이전트를 호출하지 않는다. 에이전트가 롱폴링으로 일감 수령 (에이전트측 inbound 불필요) |
| **3축 격리** | MESSAGE(방마다 격리) / PERSONA(플랫폼 초월 공유) / KNOWLEDGE(조직 공용) |
| **Stage-Gated** | Phase를 순서대로만 구현. Exit Criteria 100% 통과 후 다음 Phase 진행 |

---

## 3축 격리 모델

| 축 | 키 | 격리/공유 |
|----|----|-----------|
| MESSAGE | `context_key` | 방마다 완전 격리 |
| PERSONA | `{agent_id}` | 플랫폼 초월 공유 (Mem0) |
| KNOWLEDGE | Obsidian | 플랫폼 초월 공용 |

> `persona_key: "telegram:zeus"` ❌ — 플랫폼 prefix 금지
> `persona_key: "zeus"` ✅
>
> **(v6.12) 메모리 라이프사이클**: DM = Mem0(사적 보좌) / DM 외 회의·협업 = Obsidian(조직 지식). 인격 자체는 공간 무관 항상 Mem0. 회의 결정은 Raw→Gemini 경로로 Obsidian에 eventual 반영되고, DM의 에이전트가 이를 읽어 대화를 잇는다.

---

## 통신 모델 (v6.8 — Pull)

```
[ Users ] → [ Adapters ] → [ Olympus Router (VPS Docker) ]
                                   │  큐 적재 (202 즉시 반환)
                                   ▲ GET  /agents/:id/poll    (에이전트가 일감 수령, 롱폴링)
                                   ▲ POST /agents/:id/result  (에이전트가 결과 제출 → 어댑터 게시)
[ Agents (위치 무관) ] ── outbound 롱폴링만, 라우터 URL + 등록 토큰만 필요
```

- 라우터는 에이전트를 직접 호출하지 않는다(push 폐기).
- 결과 귀환은 `/result` 단일 경로(기존 callback 서버 폐기).
- 에이전트 인증: 등록 토큰(env 전용). 토큰↔agent_id 바인딩.

---

## 디렉터리 구조

```
olympus-router/
├── config/
│   └── agents.yaml           # 에이전트 레지스트리 (유일한 에이전트 정의 위치)
├── router-core/
│   ├── olympus-router.js     # 라우터 코어 — to/cc 검증, 큐 적재, A2A 가드 호출
│   ├── a2a-guard.js          # A2A 검증 — 권한/라운드/발화 한도/스푸핑 방지
│   ├── job-queue.js          # (v6.8) 에이전트별 일감 큐 — pull 모델
│   ├── auth-token.js         # (v6.8) poll/result 등록 토큰 검증
│   ├── idempotency-store.js  # 멱등성 처리 (중복 요청 드롭)
│   └── raw-logger.js         # Raw 드롭 — fire-and-forget JSONL 기록
├── registry/
│   └── agent-registry.js     # YAML 기반 에이전트 레지스트리
├── adapters/
│   ├── telegram-adapter.js
│   ├── slack-adapter.js
│   └── discord-adapter.js
└── harness/
    ├── fixtures/             # 테스트용 YAML 설정
    └── tests/                # Phase 1~12 단위 테스트 + E2E 통합 테스트
```

> `job-queue.js` / `auth-token.js`는 v6.8 Phase 10에서 신설 예정.

---

## 기술 스택

- **언어**: Node.js (ESM)
- **병렬**: `Promise.allSettled`
- **테스트**: `node:test` + `node:assert`
- **설정**: YAML (`config/agents.yaml`)
- **HTTP**: Node 내장 `fetch`
- **배포**: Docker (Hostinger VPS). 사용자 진입은 frameq.io / Cloudflare Tunnel

---

## 에이전트 등록

`config/agents.yaml` 에 에이전트를 추가하면 코드 수정 없이 즉시 라우팅된다.

```yaml
agents:
  - id: "myAgent"
    url: "http://my-agent-host:3001"   # v6.8: 호출용 아님 — A2A _source_url origin 대조용
    a2a:
      can_initiate: true
      allowed_targets: "*"
```

> 등록 토큰은 yaml이 아닌 env로 관리: `OLYMPUS_AGENT_TOKEN_MYAGENT`.
> `config/agents.yaml`은 git 미추적. `config/agents.example.yaml`을 복사해 작성한다: `cp config/agents.example.yaml config/agents.yaml`.

---

## 메시지 엔벨롭

```json
{
  "context_key": "telegram:group:G1:root",
  "routing": { "to": ["agentA", "agentB"], "cc": ["agentC"] },
  "payload": {
    "origin_platform": "telegram",
    "text": "메시지 내용",
    "user_id": "123456789"
  },
  "idempotency_key": "telegram:G1:root:msg_001"
}
```

- `to`: 응답 대상 에이전트
- `cc`: 청취 전용 에이전트 (fire-and-forget)
- `user_id`: (v6.8) 어댑터가 항상 포함. DM은 `chat_id === user_id`
- `idempotency_key`: 중복 요청 방지

---

## A2A (Agent-to-Agent) 협업

```json
{
  "a2a": {
    "enabled": true,
    "mode": "single",
    "caller": "agentA",
    "session_id": "<라우터 생성>",
    "parent_platform": "telegram"
  }
}
```

| 모드 | 설명 |
|------|------|
| `single` | 1문 1답. caller가 target에게 질의 후 즉시 종료 |
| `dialogue` | 다자 순환 대화. `resolved`/`out` 신호 또는 라운드 한도 도달 시 종료 |

- 발화 한도·라운드·세션은 라우터의 session_store가 관리(SSOT). 엔벨롭 제출값 무시.
- A2A 재진입은 `payload._source_url` 필수(스푸핑 방지).

---

## 테스트 실행

```bash
# 전체 테스트 (Windows + Node v24 호환 glob)
node --test harness/tests/*.test.js

# E2E 통합 테스트
node --test harness/tests/e2e.test.js

# 하드코딩 검사
grep -rE '\b(zeus|hera|athena)\b' router-core/ adapters/ registry/
```

> Phase 1~7 + E2E 완료(55/55). Phase 8~12(Agora 동기화 / 다중 사용자·Admin / Pull 통신·보안 / SDK·상용화 골격 / 보안감사 모듈)은 미구현.

---

## 관련 문서

- [PRD v6.12](Olympus_PRD_Plan.md) — 설계 전체 명세(SSOT)
- [SKILLS.md](SKILLS.md) — 기술 컨벤션 & 패턴
- [Olympus_Harness.md](Olympus_Harness.md) — 테스트 하네스 명세
- [Dev_Enhancement_Olympus.md](Dev_Enhancement_Olympus.md) — 운영 시나리오 & 보안 매트릭스
- [HANDOFF.md](HANDOFF.md) — 상시 진입점 (세션 간 상태 유지)

> **Olympus A2A vs Google A2A**: 이 라우터의 A2A는 독자 설계 규격(SINGLE/DIALOGUE/resolved/out)이다. Google이 발표하고 Linux Foundation에 이관한 Google A2A 표준(`a2a-protocol.org`)과는 별개다. 외부 에이전트 연동 시 호환 레이어 검토(현재 보류).