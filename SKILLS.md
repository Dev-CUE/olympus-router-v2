# SKILLS.md — Olympus Router 기술 컨벤션 & 패턴

> 구현 전 반드시 참조. 이 프로젝트에서 허용되는 코드 패턴과 금지되는 안티패턴을 정의한다.
> 자기완결형 — 예시 코드를 그대로 따라 작성하면 설계 원칙을 자동으로 지키게 된다.
> **정합 기준: Olympus_PRD_Plan.md v6.8** (pull 통신모델 / Job Queue / 등록토큰)

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

## 12. Raw 드롭 패턴 (옵션)

```javascript
// router-core/raw-logger.js
async function dropToRaw(envelope) {
  if (!registry.system.wiki?.raw_logging_enabled) return;  // 옵션 OFF면 skip
  const record = {
    timestamp: new Date().toISOString(),
    targets: envelope.routing.to,
    meta: { platform: envelope.payload.origin_platform, space_key: envelope.context_key },
    text: envelope.payload.text
  };
  // 플랫폼 무관 단일 폴더. 비동기, 코어 블로킹 금지
  fs.promises.appendFile(
    `${registry.system.wiki.raw_path}${Date.now()}_${envelope.idempotency_key}.jsonl`,
    JSON.stringify(record) + '\n'
  ).catch(() => {});   // 실패해도 코어 영향 0
}
```

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
