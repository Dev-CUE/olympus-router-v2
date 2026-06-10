# SKILLS.md — Olympus Router 기술 컨벤션 & 패턴

> 구현 전 반드시 참조. 이 프로젝트에서 허용되는 코드 패턴과 금지되는 안티패턴을 정의한다.
> 자기완결형 — 예시 코드를 그대로 따라 작성하면 설계 원칙을 자동으로 지키게 된다.
> **정합 기준: Olympus_PRD_Plan.md v6.12** (pull 통신모델 / Job Queue / 등록토큰 / Raw 백엔드 추상화 / 에이전트 SDK 계약(9-A) / tenant_id 키 확장 여지(9-B) / Google A2A 관계 / **메모리 라이프사이클(DM=Mem0·DM외=Obsidian, 4-A) / 보안감사 audit-sink(9-D)**)

---

## 1. 핵심 기술 스택

| 항목 | 선택 | 비고 |
|------|------|------|
| 언어 | Node.js (ESM, `import`/`export`) | CommonJS 금지 |
| 병렬 처리 | `Promise.allSettled` | 절대 `await` 직렬 루프 금지 |
| 테스트 | `node:test` + `node:assert` | 내장, 외부 의존 없음 |
| 설정 | `js-yaml` | agents.yaml 파싱 |
| HTTP | Node 내장 `fetch` | axios 등 불필요 |
| 타임아웃 | `AbortSignal.timeout(ms)` | |
| 통신 모델 (v6.8) | pull (롱폴링) | 라우터가 에이전트를 직접 호출하지 않음 |

---

## 2. agents.yaml 로딩 패턴 (정답 코드)

```javascript
// registry/agent-registry.js
import yaml from 'js-yaml';
import fs from 'fs';

class AgentRegistry {
  constructor() {
    this.agents = new Map();   // id -> agent config
    this.system = {};
  }

  load(configPath = './config/agents.yaml') {
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8'));
    this.system = raw.system;
    // 에이전트 이름을 모른 채 순수 반복만 (Zero Hardcoding)
    for (const agent of raw.agents) {
      this.agents.set(agent.id, agent);
    }
  }

  exists(id)      { return this.agents.has(id); }
  getUrl(id)      { return this.agents.get(id)?.url; }  // v6.8: 호출용 아님, _source_url 대조용
  getAllIds()     { return [...this.agents.keys()]; }
  getAgent(id)    { return this.agents.get(id); }
}

export default new AgentRegistry();  // 싱글턴
```

> 포인트: `zeus`/`hera` 문자열이 코드에 단 한 번도 등장하지 않는다.
> v6.8: `url`은 라우터가 에이전트를 호출하는 주소가 아니라, A2A 재진입 시 `_source_url` origin 대조용 식별값이다.

---

## 3. Pull 디스패치 패턴 (v6.8 정답 코드 — 기존 push 폐기)

라우터는 에이전트를 호출하지 않는다. 검증된 일감을 **에이전트별 큐에 적재**하고, 에이전트가 롱폴링으로 가져간다.

```javascript
// router-core/olympus-router.js — 인그레스 처리
// to/cc 검증 후 큐에 적재만 한다 (직접 호출 없음)
for (const id of routing.to) {
  if (!registry.exists(id)) throw new RouterError("UNKNOWN_AGENT", id);
}
// 멱등키로 중복 드롭하며 적재
routing.to.forEach(id => jobQueue.enqueue(id, { ...envelope, role: "to" }));
routing.cc?.forEach(id => {
  if (registry.exists(id)) jobQueue.enqueue(id, { ...envelope, role: "cc", mode: "listen_only" });
});
return { ok: true, accepted: true };   // 202 — 적재 완료, 응답은 result로 비동기 귀환
```

```javascript
// ❌ v6.8에서 금지 — 라우터가 에이전트를 직접 호출 (push 폐기)
const results = await Promise.allSettled(
  routing.to.map(id => fetch(registry.getUrl(id), { ... }))  // 절대 금지
);
```

> `Promise.allSettled` 병렬 원칙은 여전히 유효하나, "에이전트 직접 호출"에는 더 이상 쓰지 않는다. 큐 내부 동시 처리 등 라우터 내부 작업에만 사용한다.

---

## 4. 롱폴링 / 결과 제출 핸들러 패턴 (v6.8 신규)

```javascript
// GET /agents/:id/poll — 에이전트가 일감을 가져감 (롱폴링)
async function handlePoll(id, req, res) {
  if (!verifyToken(id, req)) return res.status(401).json({ error: "UNAUTHORIZED_POLL" });
  if (!registry.exists(id)) return res.status(404).json({ error: "UNKNOWN_AGENT" });

  const job = await jobQueue.takeOrWait(id, registry.system.poll.long_poll_timeout_ms);
  if (!job) return res.status(204).end();          // 보류 만료 → 에이전트 즉시 재폴링
  return res.status(200).json({ job_id: job.id, envelope: job.envelope });
}

// POST /agents/:id/result — 에이전트가 결과 제출 → 어댑터로 전달
async function handleResult(id, req, res) {
  if (!verifyToken(id, req)) return res.status(401).json({ error: "UNAUTHORIZED_POLL" });
  const { job_id, result } = req.body;
  const job = jobQueue.consume(id, job_id);        // 미발급 job_id면 null
  if (!job) return res.status(404).json({ error: "UNKNOWN_JOB" });
  await deliverToAdapter(job.envelope, result);    // 라우터가 Telegram 직접 호출 금지 — 어댑터가 게시
  return res.status(200).json({ ok: true });
}
```

> 결과 귀환은 `/result` 단일 경로로 통일. 기존 callback 서버(8798)는 v6.8에서 폐기.

---

## 5. 등록 토큰 검증 패턴 (v6.8 신규)

```javascript
// router-core/auth-token.js
// 토큰은 env로만 관리. 예: OLYMPUS_AGENT_TOKEN_ZEUS
// agents.yaml·코드에 토큰을 절대 쓰지 않는다 (Zero Hardcoding 연장)
function verifyToken(id, req) {
  const presented = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const expected = process.env[`OLYMPUS_AGENT_TOKEN_${id.toUpperCase()}`];
  if (!expected || !presented) return false;
  // 토큰 ↔ agent_id 바인딩: zeus 토큰으로 hera 폴링 차단
  return timingSafeEqual(presented, expected);
}
```

> 토큰↔agent_id 바인딩이 핵심. 한 에이전트의 토큰으로 다른 에이전트의 큐를 폴링할 수 없어야 한다.

---

## 6. context_key 생성 패턴 (어댑터 책임)

플랫폼별로 어댑터가 생성. topic/thread 없으면 `root`.

```javascript
// Telegram
function telegramContextKey(msg) {
  if (msg.chat.type === 'private')
    return `telegram:dm:${msg.chat.id}:root`;
  if (msg.chat.is_forum && msg.message_thread_id) {
    const topic = msg.message_thread_id === 1 ? 'root' : msg.message_thread_id;
    return `telegram:forum:${msg.chat.id}:${topic}`;
  }
  return `telegram:group:${msg.chat.id}:root`;
}

// Slack
function slackContextKey(event) {
  const thread = event.thread_ts ?? 'root';
  const type = event.channel_type === 'im' ? 'dm' : 'channel';
  return `slack:${type}:${event.channel}:${thread}`;
}

// Discord
function discordContextKey(msg) {
  if (msg.channel.isThread())
    return `discord:forum:${msg.channel.parentId}:${msg.channel.id}`;
  return `discord:channel:${msg.channel.id}:root`;
}
```

> 규격: `{platform}:{space_type}:{space_id}:{topic_or_thread_id}`
> (v6.8) 어댑터는 `payload.user_id`(플랫폼 사용자 ID)를 항상 포함한다. DM은 `chat_id === user_id`.
> (v6.10 tenant 확장 여지) 키 조립은 향후 `tenant_id` prefix 주입이 가능한 형태로 유지한다. 단일 테넌트는 `tenant_id` 없이 동작하며 **지금 코드에 tenant_id를 넣지 않는다.** 하드코딩된 키 조립(문자열 직접 연결 고정) 금지 — 확장 시 키 생성 지점 1곳만 바꿔 `{tenant_id}:{platform}:...`가 되도록 한다.
> **(v6.12) `space_type==dm` 여부가 공통 분기 기준**: 메모리 라이프사이클(DM→Mem0 / DM외→Obsidian, 16절), Raw 드롭 DM 스킵(12절), 보안감사 대상 판정(17절)이 모두 이 값으로 갈린다. 어댑터가 정확히 생성해야 한다.

---

## 7. memory_scope 주입 패턴 (라우터 책임)

```javascript
// to 에이전트: 인격 + 공간 둘 다
const scope = {
  space_key: context_key,
  persona_key: id          // ★ 플랫폼 prefix 없음. agent_id 그대로
};

// cc 에이전트: 공간만, 인격 미기록
const ccScope = {
  space_key: context_key,
  persona_key: null        // null = Mem0 기록 안 함
};
```

> ❌ `persona_key: \`${platform}:${id}\`` — 절대 금지 (플랫폼 격리 아님)
> ✅ `persona_key: id` — 플랫폼 초월 공유
> (v6.10 tenant 확장 여지) 향후 테넌트 도입 시 `persona_key`는 `{tenant_id}:{agent_id}`로만 확장한다. **플랫폼 prefix 금지 원칙은 불변** — tenant prefix는 허용되나 platform prefix는 어떤 경우에도 붙이지 않는다.

---

## 8. A2A 엔벨롭 구조

### SINGLE (기본값, 1문1답)
```javascript
a2a: {
  enabled: true,
  mode: "single",
  origin_agent: "<개시자>",
  caller: "<현재 호출자>",
  session_id: "<라우터 생성 SSOT>",   // v6.8: 라우터가 생성/관리
  parent_platform: "<플랫폼>"
}
// payload._source_url 필수 (재진입 스푸핑 방지)
// max_speaker_calls/max_rounds는 라우터가 agents.yaml에서 강제 주입 — 엔벨롭값 무시
```

### DIALOGUE (티키타카)
```javascript
a2a: {
  enabled: true,
  mode: "dialogue",
  origin_agent: "<개시자>",
  caller: "<현재 호출자>",
  session_id: "<라우터 생성 SSOT>",
  round: 1,
  last_caller: "<직전 호출자>",
  parent_platform: "<플랫폼>"
}
// a2a_status: "resolved" | "out" → 종료, "continue"/undefined → 진행
```

> v6.8: 발화 카운터·라운드·한도는 라우터의 session_store가 SSOT. 에이전트 제출값은 세션 초기화 시에만 참조.

---

## 9. A2A 가드 패턴 (정답 코드)

> (v6.11) 본 A2A 가드는 **Olympus 독자 규격**(SINGLE/DIALOGUE, 발화자 한도, resolved/out 신호)이다. Google이 발표하고 Linux Foundation에 이관한 **Google A2A 표준**(`a2a-protocol.org`)과는 별개다. Olympus 내부 에이전트 간 통신에는 Google A2A를 적용하지 않는다. 외부 에이전트(타 벤더·프레임워크) 연동이 필요해질 경우의 호환 레이어(Agent Card 노출 등)는 **미결·보류**(PRD 14절). 혼용 금지.

검증 순서를 반드시 지킨다. (v6.8 순서: 자기호출 → 권한 → 교차플랫폼 → 스푸핑 → resolved/out → 라운드 → 발화자)

```javascript
// router-core/a2a-guard.js
function validateA2A(a2a, routing, currentCaller, payload, response) {
  const agent = registry.getAgent(currentCaller);

  // 1. 자기호출
  if (routing.to.includes(currentCaller))
    throw new A2AError("A2A_SELF_CALL");

  // 2. 권한
  if (!agent?.a2a?.can_initiate)
    throw new A2AError("A2A_INITIATION_DENIED");
  resolveTargets(currentCaller, routing.to);   // allowed_targets 검증

  // 3. 교차플랫폼 (절대 차단)
  if (a2a.parent_platform !== payload.origin_platform)
    throw new A2AError("A2A_CROSS_PLATFORM_DENIED");

  // 4. 스푸핑 방지 (v6.8) — _source_url 필수 + registry url origin 정확 일치
  if (!payload._source_url ||
      new URL(payload._source_url).origin !== new URL(registry.getUrl(currentCaller)).origin)
    throw new A2AError("A2A_SPOOF_DETECTED");

  // 5. 조기종료 — 최우선 (resolved/out > round > speaker)
  if (a2a.mode === "dialogue" &&
      (response?.a2a_status === "resolved" || response?.a2a_status === "out"))
    throw new A2AResolved("A2A_EARLY_TERMINATION");   // 정상 종료

  // 6. 라운드 한도 (DIALOGUE 전용, 라우터 yaml 기준)
  if (a2a.mode === "dialogue" && a2a.round > registry.system.a2a.max_rounds)
    throw new A2AError("A2A_ROUND_LIMIT_EXCEEDED");

  // 7. 발화자 한도 — session_store 기준 (단일 증가 지점), 라우터 yaml 한도
  const next = sessionStore.increment(a2a.session_id, currentCaller);
  if (next > registry.system.a2a.max_speaker_calls)
    throw new A2AError("A2A_SPEAKER_LIMIT_EXCEEDED");

  return next;
}
```

> 종료 우선순위: **resolved/out > 라운드 > 발화자**. resolved/out을 먼저 체크해 합의 종료가 한도 에러로 처리되는 것을 방지(T5.6).
> v6.8: 한도·카운터는 session_store(라우터 SSOT)에서 관리. 엔벨롭 제출값을 신뢰하지 않는다.

---

## 10. allowed_targets 해석 패턴

```javascript
function resolveTargets(callerId, requested) {
  const caller = registry.getAgent(callerId);
  const allowed = caller.a2a.allowed_targets;

  // "*" = 자기 제외 전체
  const resolved = allowed === "*"
    ? registry.getAllIds().filter(id => id !== callerId)
    : allowed;

  const bad = requested.filter(t => !resolved.includes(t));
  if (bad.length) throw new A2AError("A2A_UNAUTHORIZED");
}
```

---

## 11. 에러 코드 목록 (고정)

| 코드 | 의미 |
|------|------|
| `UNKNOWN_AGENT` | routing 대상이 registry에 없음 |
| `UNKNOWN_JOB` | (v6.8) result 제출 시 미발급/소비된 job_id |
| `UNAUTHORIZED_POLL` | (v6.8) poll/result 토큰 누락·불일치 (HTTP 401) |
| `A2A_INITIATION_DENIED` | can_initiate:false 에이전트가 A2A 시도 |
| `A2A_UNAUTHORIZED` | allowed_targets 위반 |
| `A2A_SELF_CALL` | 자기 자신 호출 |
| `A2A_CROSS_PLATFORM_DENIED` | 플랫폼 간 A2A |
| `A2A_SPOOF_DETECTED` | `_source_url` 누락 또는 origin 불일치 |
| `A2A_SPEAKER_LIMIT_EXCEEDED` | 발화자 10회 초과 |
| `A2A_ROUND_LIMIT_EXCEEDED` | DIALOGUE 10라운드 초과 |
| `A2A_EARLY_TERMINATION` | resolved/out 정상 조기종료 (에러 아님, 종료 신호) |

에러 응답 포맷:
```json
{ "ok": false, "context_key": "...", "error": { "code": "...", "message": "...", "meta": {} } }
```

---

## 12. Raw 저장 패턴 (옵션) — 백엔드 추상화 (v6.9)

Raw 저장은 `raw-sink` 인터페이스 뒤에서 백엔드를 교체한다. 기본 `file`(JSONL), 옵션 `sqlite`.
어느 백엔드든 **fire-and-forget·코어 블로킹 금지**를 지킨다.

```javascript
// router-core/raw-logger.js — 백엔드 선택 + 공통 진입점
function makeSink(system) {
  if (!system.wiki?.raw_logging_enabled) return null;     // 옵션 OFF
  return system.wiki.raw_backend === "sqlite"
    ? new SqliteSink(system.wiki.sqlite_path)
    : new FileSink(system.wiki.raw_path);                 // 기본 file
}

function dropToRaw(sink, envelope) {
  if (!sink) return;                                       // OFF면 skip
  // (v6.12) DM은 사적 — 조직 지식 파이프라인 스킵. context_key의 space_type으로 판별.
  if (isDM(envelope.context_key)) return;                  // DM 드롭 안 함 (16절)
  const record = {
    timestamp: new Date().toISOString(),
    targets: envelope.routing.to,
    meta: { platform: envelope.payload.origin_platform, space_key: envelope.context_key },
    text: envelope.payload.text
  };
  sink.write(record).catch(() => {});                      // 비동기, 실패해도 코어 영향 0
}
```

```javascript
// FileSink — 현행 동작 (JSONL append)
class FileSink {
  constructor(dir) { this.dir = dir; }
  write(record) {
    return fs.promises.appendFile(
      `${this.dir}${Date.now()}_${record.meta.space_key}.jsonl`,
      JSON.stringify(record) + '\n'
    );
  }
}

// SqliteSink — 옵션 (node:sqlite 우선, 외부의존 better-sqlite3는 별도 승인)
// SQLite는 동시 쓰기 락이 있으므로 단일 직렬 큐로 write를 직렬화한다.
class SqliteSink {
  constructor(path) {
    // const { DatabaseSync } = require('node:sqlite');  // Node 22+
    // this.db = new DatabaseSync(path);
    // this.db.exec('CREATE TABLE IF NOT EXISTS raw (ts TEXT, platform TEXT, space_key TEXT, payload TEXT)');
    this._chain = Promise.resolve();   // 직렬화 체인
  }
  write(record) {
    // 비정형 text는 payload(JSON 문자열) 컬럼에 통째로. 정형 키는 별도 컬럼.
    this._chain = this._chain.then(() => this._insert(record)).catch(() => {});
    return this._chain;
  }
  _insert(record) {
    // this.db.prepare('INSERT INTO raw VALUES (?,?,?,?)')
    //   .run(record.timestamp, record.meta.platform, record.meta.space_key, JSON.stringify(record));
    return Promise.resolve();
  }
}
```

> 두 백엔드 모두 동일한 `write(record)` 계약을 따른다. 라우터 코어는 어느 백엔드인지 몰라야 한다(추상화 유지).
> ❌ `await sink.write(...)`로 코어를 멈추면 안 된다. fire-and-forget.

---

## 13. 금지 안티패턴 모음

```javascript
// ❌ 하드코딩
if (id === "zeus") { ... }
const AGENTS = ["zeus", "hera", "athena"];

// ❌ 라우터에서 텍스트 파싱
if (text.includes("@zeus")) { ... }   // 어댑터 책임이다

// ❌ persona_key 플랫폼 격리
persona_key: `${platform}:${id}`

// ❌ 라우터에서 외부 인프라 직접 호출
await mem0.write(...);     // 라우터 금지
await obsidian.save(...);  // 라우터 금지

// ❌ (v6.8) 라우터가 에이전트를 직접 호출 (push 폐기)
await fetch(registry.getUrl(id), { ... });   // pull 모델 위반

// ❌ (v6.8) 토큰 하드코딩
const ZEUS_TOKEN = "abc123";              // env 전용

// ❌ Raw 드롭이 코어 블로킹
await fs.appendFile(...);  // await로 코어 멈추면 안 됨

// ❌ (v6.12) audit-sink에 fire-and-forget 적용 (감사 무손실 위반)
auditSink.write(...).catch(() => {});     // 감사 기록은 실패를 삼키면 안 됨 (17절)
```

---

## 14. 테스트 작성 패턴 (node:test)

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import registry from '../registry/agent-registry.js';

test('T1.1 — yaml 3기 로드', () => {
  registry.load('./harness/fixtures/agents.test.yaml');
  assert.strictEqual(registry.getAllIds().length, 3);
});

test('T1.3 — 미존재 에이전트 거부', async () => {
  await assert.rejects(
    () => route({ routing: { to: ['ghost'], cc: [] } }),
    /UNKNOWN_AGENT/
  );
});
```

실행: `node --test harness/tests/`
> Windows + Node v24에서 디렉터리 인자는 MODULE_NOT_FOUND로 실패하므로 glob 사용: `node --test harness/tests/*.test.js`

---

## 15. 에이전트 SDK 클라이언트 패턴 (v6.10 — 9-A 계약)

에이전트 개발자가 폴링 루프·토큰 헤더·`/result` 제출·재폴링을 직접 구현하지 않도록, SDK가 라우터 통신 프로토콜을 감춘다. **SDK는 편의 레이어일 뿐 필수가 아니다 — 직접 HTTP로도 동일 계약이 동작해야 한다(PRD T11.4).** 참조 구현 언어는 Node.js(라우터와 동일 스택).

### 15.1 SDK가 감추는 것 (에이전트가 몰라도 되는 것)
- 롱폴링 루프 (`GET /agents/:id/poll`, `204`면 즉시 재폴링)
- `Authorization: Bearer <등록 토큰>` 헤더 부착
- 결과 제출 (`POST /agents/:id/result`, `{ job_id, result }`)
- A2A 재진입 시 `payload._source_url` 자동 첨부
- 네트워크 단절 시 백오프 재접속

### 15.2 SDK 노출 인터페이스 (정답 코드)

```javascript
// sdk/olympus-agent.js — 에이전트가 import해서 쓰는 클라이언트
import { setTimeout as sleep } from 'node:timers/promises';

export class OlympusAgent {
  constructor({ router_url, agent_id, token, source_url }) {
    // 설정값 4개가 전부. 에이전트는 통신을 몰라도 된다.
    this.router_url = router_url;     // 예: https://router.frameq.io
    this.agent_id = agent_id;         // registry 등록 id와 일치
    this.token = token;               // env에서 주입 (SDK가 헤더 처리)
    this.source_url = source_url;     // 자기 URL (A2A _source_url 자동 첨부용)
    this._running = false;
  }

  onJob(handler) { this._handler = handler; return this; }

  async start() {
    this._running = true;
    let backoff = 500;
    while (this._running) {
      try {
        const res = await fetch(`${this.router_url}/agents/${this.agent_id}/poll`, {
          headers: { authorization: `Bearer ${this.token}` }
        });
        if (res.status === 204) { backoff = 500; continue; }   // 큐 비면 즉시 재폴링
        if (res.status === 401) throw new Error('UNAUTHORIZED_POLL — 토큰 확인');
        if (!res.ok) { await sleep(backoff); backoff = Math.min(backoff * 2, 15000); continue; }

        const { job_id, envelope } = await res.json();
        backoff = 500;
        let result;
        try {
          result = await this._handler(envelope);   // 에이전트는 이 핸들러만 구현
        } catch (err) {
          // 핸들러 예외 → error result로 변환·제출 (T11.2). 라우터가 어댑터로 실패 전달.
          result = { status: 'error', response_text: String(err?.message ?? err) };
        }
        // A2A 재진입 시 _source_url 자동 첨부 (T11.3) — 에이전트가 신경 쓸 필요 없음
        await this._submit(job_id, result);
      } catch (err) {
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 15000);     // 네트워크 단절 시 백오프
      }
    }
  }

  async _submit(job_id, result) {
    await fetch(`${this.router_url}/agents/${this.agent_id}/result`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ job_id, result })
    });
  }

  stop() { this._running = false; }
}
```

### 15.3 에이전트 사용 예 (핸들러만 구현)

```javascript
// 에이전트 개발자가 작성하는 전부 — 통신 코드 0줄
const client = new OlympusAgent({
  router_url: process.env.OLYMPUS_ROUTER_URL,
  agent_id: 'zeus',
  token: process.env.OLYMPUS_AGENT_TOKEN_ZEUS,   // 토큰은 env로만 (코드·yaml 금지)
  source_url: process.env.ZEUS_SOURCE_URL
});

client.onJob(async (envelope) => {
  // 일감 처리에만 집중. envelope.payload.text 등 사용.
  return {
    status: 'success',
    response_text: '검토 완료...',
    a2a_status: 'resolved',          // 또는 'out' | 'continue'
    activities: [{ tool: 'terminal', detail: 'kubectl get pods' }]
  };
});

client.start();
```

> **직접 HTTP 동등성(T11.4)**: SDK가 하는 일은 위 두 fetch + 폴링 루프뿐이다. 타 언어(Python 등)나 SDK 미사용 에이전트도 `poll`/`result` 두 엔드포인트 + Bearer 토큰 + `_source_url` 규약만 지키면 동일하게 동작한다.
> **(v6.11 확장 여지)** SDK는 향후 Google A2A `Agent Card`(`/.well-known/agent.json`) 노출 인터페이스를 **선택적으로** 추가할 수 있는 구조로 둔다. 단 현재 구현 대상 아님(PRD 14절 미결).

---

## 16. 메모리 라이프사이클 패턴 (v6.12 — PRD 4-A 정합)

**규칙**: DM = Mem0(사적 보좌) / DM 외(그룹·포럼·A2A) = Obsidian(조직 지식). 인격 자체는 공간 무관 항상 Mem0. 분기 기준은 `context_key`의 `space_type`.

### 16.1 DM 판별 (공통 헬퍼 — 정답 코드)

```javascript
// context_key = {platform}:{space_type}:{space_id}:{topic_id}
// space_type 위치만 보면 된다. 텍스트 파싱 아님(Dumb Pipe 유지).
function isDM(contextKey) {
  return contextKey.split(':')[1] === 'dm';
}
```

> 이 단순 매칭이 Raw 드롭 스킵(12절)·감사 판정(17절)의 공통 기준이다. LLM·의도분석 금지 원칙 유지.

### 16.2 회의 종료 → Obsidian 반영 트리거 (라우터 책임)

라우터는 Obsidian을 **직접 쓰지 않는다**(원칙 6). A2A `resolved`/`out` 종료 시 Raw에 **종료 마커**만 떨군다. Obsidian 기록은 Gemini 워커가 마커를 보고 수행(eventual).

```javascript
// A2A 세션이 resolved/out으로 종료될 때 (settled 이후, 6.5 가드 통과 후)
function onA2ATerminated(sink, envelope, termination) {
  if (isDM(envelope.context_key)) return;                  // DM은 조직 반영 안 함
  // 일반 Raw 레코드에 종료 마커를 실어 우선 처리 신호를 준다.
  sink?.write({
    timestamp: new Date().toISOString(),
    marker: 'a2a_resolved',                                // Gemini 워커 우선 처리 신호
    reason: termination.reason,                            // "resolved" | "out" | limit
    meta: { space_key: envelope.context_key, speakers: termination.speaker_counts },
    text: envelope.payload.text
  }).catch(() => {});                                      // 여전히 fire-and-forget (지식용 sink)
}
```

> 반영은 **eventual**. 워커는 폴링 기본 + 이 마커를 우선 처리한다. 즉시 보장 아님.
> **에이전트 응답 합성은 에이전트 책임**(라우터 코드 아님): 응답 시 `Mem0[agent_id]` + `Obsidian(읽기)` + `SPACE_MEMORY[context_key]`를 합성한다(PRD 4.5/4-A). DM의 에이전트가 Obsidian을 읽어 회의 결정을 알고 대화를 잇는다.

---

## 17. 보안감사 audit-sink 패턴 (v6.12 — PRD 9-D, **Phase 12 계약만·미구현**)

> ⚠️ **[Phase 12 미구현]** 본 절은 계약·골격만. 실제 구현은 Phase 12. 켜기 전(`audit.enabled:false`)엔 없는 것과 동일.

### 17.1 audit-sink는 Raw Sink와 구현이 다르다 (핵심)

지식용 Raw Sink(12절)는 fire-and-forget·휘발 허용·빠름. 감사용은 정반대 — **불변·무손실·동기 쓰기 확인**. 인터페이스(`write`)는 공유하되 구현 분리.

```javascript
// audit-sink: write 실패를 무시하지 않는다 (Raw Sink와 정반대)
class AuditSink {
  async write(record) {
    // 동기 쓰기 + 확인. 실패 시 throw(무손실 보장). append-only(불변).
    const ok = await this._appendImmutable(record);        // 구현 Phase 12
    if (!ok) throw new Error('AUDIT_WRITE_FAILED');         // 무시 금지
    return ok;
  }
  // _appendImmutable: WORM(append-only) 저장. 변조/삭제 불가 보장.
}
```

> ❌ `auditSink.write(...).catch(() => {})` — 감사 기록은 실패를 삼키면 안 된다. Raw Sink의 fire-and-forget 패턴을 audit-sink에 쓰지 말 것.

### 17.2 감사 대상 판정 (default-on opt-out)

기본 전수 감사(1), 명시 제외 목록(0)만 면제. "블랙리스트" 아님 — **default-on opt-out**.

```javascript
// audit 정책은 agents.yaml의 audit 섹션(관리자 전용). 판정은 context_key 매칭.
function shouldAudit(contextKey, policy) {
  if (!policy?.enabled) return false;                      // 모듈 OFF
  if (isDM(contextKey)) return policy.dm === true;         // DM은 별도 토글(기본 false)
  // DM 외(조직): 전수 감사가 기본, exclusions에 든 space_id만 면제
  if (!policy.org?.enabled) return false;
  const spaceId = contextKey.split(':')[2];
  const excluded = (policy.org.exclusions ?? []).includes(spaceId);
  return policy.org.default !== false && !excluded;        // default-on, 명시 제외만 0
}
```

> **상태↔UI**: `1=감사 대상=UI 체크(기본)` / `0=면제=체크 해제`. 면제는 관리자만.
> **권한 분리**: 감사 정책 변경은 `/admin/*` 전용. 피감사자 접근·변경 불가(separation of duties).
> **메타 감사**: 정책 변경 이력(누가·언제·어느 채널 면제)도 audit-sink에 기록.
> **판정은 단순 매칭**(파싱·LLM 아님) → Dumb Pipe 유지. 정책은 런타임 재로드.
