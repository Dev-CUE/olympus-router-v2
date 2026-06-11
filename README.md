# Olympus Router

복수의 AI 에이전트를 Telegram / Slack / Discord 등 여러 플랫폼에서 운영하는 **범용 멀티 플랫폼 AI 조직 운영 인프라**.

라우터는 메시지를 격리하고, 에이전트 인격은 플랫폼 초월 공유하며, 에이전트 간 협업(A2A)을 안전하게 중개한다.

> **설계 기준: PRD v6.13** — 설계 SSOT는 [`Olympus_PRD.md`](Olympus_PRD.md), 구현 계획은 [`Olympus_Plan.md`](Olympus_Plan.md), 세션 진입점은 [`HANDOFF.md`](HANDOFF.md).
> ⚠️ 코드는 ~v6.4 수준(push/callback) — 설계와 갭 있음. 구현 게이트는 Plan 참조.

---

## 문서 증류 이력 (2026-06-11)

LLM 세션의 할루시네이션·메모리 오염 방어를 위해 설계 문서를 **증류**(이력 제거 + 확정 설계만 보존)했다.

| 단계 | 내용 |
|------|------|
| 배경 | 구 PRD(v6.12, 49KB) + 설계 원장(62KB)에 확정·폐기·검토경로·번복이력이 혼재 → 세션이 "현재 정답"과 "기각된 과거"를 혼동하는 사고 반복 (확정 번복, 라운드 잔존, 무단 푸시 등) |
| 결정 | 신규 레포 분리는 취소(SSOT 이중화 위험). 현 레포 내에서 PRD/Plan 분리 + PRD만 증류. 증류본은 동결이 아니라 **살아있는 SSOT** — 이후 설계는 킵 프로토콜로 직접 갱신 |
| 산출 | `Olympus_PRD.md`(v6.13 설계 계약 24절, 31KB, 결정 근거 1줄씩 포함) / `Olympus_Plan.md`(의존성 게이트 G-A~G-J + 테스트) |
| 사료화 | `Olympus_PRD_Plan.md`(구 v6.12)·`Olympus_Design_Ledger.md`(v6.13 원장) = **아카이브/동결**. 검토경로·충돌로그·번복이력(R1~R6)은 해당 파일과 git history가 보존. 새 세션은 읽지 않는다 |
| 규칙 | 증류본에 없는 내용은 "없다"가 정답. 아카이브나 기억으로 메우지 않는다 (HANDOFF 읽기 게이트) |

주요 폐기 개념 (구 문서·기억에 나오면 전부 과거다): 라운드(round/max_rounds/ROUND_LIMIT) / 롱폴링(GET /poll) / `_source_url` 스푸핑 검증 / legacy session_id / 큐 휘발 허용(T10.6) / persona_key 무 prefix.

---

## 핵심 설계 원칙 (상세는 PRD 2절)

| 원칙 | 설명 |
|------|------|
| **Dumb Pipe** | 코어는 파싱·LLM·의도분석 0%. 목적지 검증 + 큐 + 패스스루 (일감 큐 상태는 허용) |
| **Zero Hardcoding** | 에이전트 이름을 코드에 쓰지 않음. `config/agents.yaml`만 |
| **SSE Push Delivery** | 에이전트는 SSE로 일감 수신 + POST로 결과 제출. outbound only, inbound 불필요 |
| **3축 격리** | MESSAGE(방마다 격리) / PERSONA(플랫폼 초월·tenant 격리) / KNOWLEDGE(조직 공용) |
| **Router-Owned Limits** | A2A 신원=토큰, 발화 카운트=세션 DB. 에이전트 제출값 무시 |
| **Tenant-Always-Prefix** | 모든 격리 키에 tenant_id prefix. 단일 테넌트=`default` |
| **의존성 게이트** | 구현은 의존성 순(G-A~G-J). Exit Criteria 100% + 실연동 전 완료 선언 금지 |

---

## 통신 모델 (v6.13 — SSE + POST)

```
[ Users ] → [ Adapters ] → [ Olympus Router (VPS Docker) ]
                                 │  큐 적재 (SQLite durable)
                                 ▼ GET  /agents/:id/events   (SSE — 일감 push: job/listen)
                                 ▲ POST /agents/:id/result   (결과 제출 → egress → 어댑터 게시)
                                 ▲ POST /agents/:id/a2a      (A2A 재진입, Bearer)
[ Agents (위치 무관) ] ── outbound only. 라우터 URL + agent_id + 등록 토큰 3개만 필요
```

- 라우터는 에이전트를 직접 호출하지 않는다. 신원은 Bearer 토큰에서 도출(자기신고 폐기).
- 전달 보장: durable 큐(상태 6종) + lease + egress 동기 ACK + at-least-once.

---

## 메모리 라이프사이클

```
DM(1:1)            → Mem0 (사적 보좌)
그룹/포럼/A2A       → Raw → Gemini 워커 → Obsidian (조직 지식, eventual)
인격 자체           → 항상 Mem0 (공간 무관 동일 인격)
```
> `persona_key: "default:zeus"` ✅ (tenant prefix) / `"telegram:zeus"` ❌ (플랫폼 prefix 금지)

---

## A2A 협업

| 모드 | 설명 |
|------|------|
| `single` (기본) | 1문 1답 즉시 종료 |
| `dialogue` | 다자 순환 대화. `resolved`/`out` 또는 발화 한도(각 10회) 도달 시 종료. **라운드 개념 없음** |

- session_id = 라우터 단독 ULID. speaker_counts SSOT = 세션 DB.
- 가드 순서: 인증 → SPOOF → 자기호출 → 권한 → 교차플랫폼 → resolved/out → 발화 한도.

---

## 기술 스택

Node.js (ESM) / `node:test` / YAML 설정 / **better-sqlite3** (WAL, 단일 writer 큐) / Docker (Hostinger VPS) / Cloudflare Tunnel.

---

## 에이전트 등록

```yaml
agents:
  - id: "myAgent"
    a2a: { can_initiate: true, allowed_targets: "*" }
# url 필드 없음 — 라우터는 호출하지 않고, 신원은 토큰으로 검증
```
> 등록 토큰: 라우터가 발급(1회 노출, 해시만 저장). 에이전트측은 env 보관.
> `config/agents.yaml`은 git 미추적 — `config/agents.example.yaml` 복사 후 작성.

---

## 테스트 실행

```bash
node --test harness/tests/*.test.js
grep -rE '\b(zeus|hera|athena)\b' router-core/ adapters/ registry/   # 하드코딩 0건 확인
```
> 기존 mock 55/55는 **구 계약 기준**이며 완료로 인정하지 않는다(mock 통과 ≠ 완료). 게이트별 Exit Criteria와 실연동(G-G)은 `Olympus_Plan.md`.

---

## 관련 문서

- [Olympus_PRD.md](Olympus_PRD.md) — **설계 SSOT (v6.13 증류본)**
- [Olympus_Plan.md](Olympus_Plan.md) — 구현 게이트·Exit Criteria·진행 상태
- [HANDOFF.md](HANDOFF.md) — 세션 진입점 (현재 위치·역할·다음)
- [Olympus_Session_Protocol.md](Olympus_Session_Protocol.md) — 일하는 방법 (킵·푸시 트리거·혼동 사전)
- SKILLS.md / Olympus_Harness.md / CLAUDE.md — 구현 헌법(C용). ⚠️ 구 계약 잔존, 구현 착수 전 정합 예정. 충돌 시 PRD 우선
- ~~Olympus_PRD_Plan.md / Olympus_Design_Ledger.md~~ — 아카이브 (사료, 읽지 않음)

> **Olympus A2A vs Google A2A**: 독자 규격. Google/Linux Foundation A2A 표준과 별개. 외부 연동 시 호환 레이어 검토(보류).
