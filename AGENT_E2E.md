# AGENT.md — 현재 작업 지시서 (E2E 통합 테스트)

> ⚠️ 이 파일은 **E2E 전용**이다. Phase 7 완료 후 교체된 최종 지시서다.
> 작업 시작 전 `CLAUDE.md`(헌법)와 `SKILLS.md`(기술 패턴)를 먼저 읽었다고 가정한다.
> 자기완결형 — 이 파일만으로 E2E 작업이 완결되도록 핵심을 인라인 포함한다.

---

## 1. 너의 역할

너는 Olympus Router의 **전체 통합 검증** 담당 코딩 에이전트다.
Phase 1~7이 모두 완료된 상태에서, PRD 섹션 10의 E1~E8 시나리오를 **단일 e2e.test.js**에 구현하고 전부 통과시킨다.

E2E의 목적은 **Phase별 단위 테스트가 놓친 컴포넌트 간 연동 오류**를 잡는 것이다.
mock을 최소화하고, 실제 라우터 코어 + guard + registry + raw-logger가 함께 동작하는지 검증한다.

---

## 2. 반드시 지킬 불변 원칙

1. **Dumb Pipe / Zero Hardcoding**: 코드에 zeus/hera/athena 직접 기재 금지. yaml에서만.
2. **이 파일만 생성**: e2e.test.js 1개만. 다른 파일 수정 금지.
3. **mock 최소화**: 실제 HTTP 서버 없으므로 `dispatchToAgent`만 mock. 나머지(registry, guard, raw-logger)는 실제 모듈 사용.
4. **모순 발견 시 보고**: 임의 수정 금지.
5. **E1~E8 전부 통과 후에만 완료 선언**.

---

## 3. 작업 범위 (화이트리스트)

```
생성:
  harness/tests/e2e.test.js    ← E1~E8 통합 시나리오
수정:
  없음
```

---

## 4. 절대 건드리지 말 것 (블랙리스트)

```
router-core/olympus-router.js
router-core/a2a-guard.js
router-core/idempotency-store.js
router-core/raw-logger.js
registry/agent-registry.js
harness/tests/phase1~7.test.js
harness/mocks/
config/agents.yaml
SKILLS.md, CLAUDE.md, PRD
```

---

## 5. E2E 시나리오별 검증 상세

### E1 — 다중 멘션 병렬 응답 + cc 청취
**시나리오**: 텔레그램 그룹에서 `@agentA @agentB` 동시 멘션, agentC는 cc

**검증 포인트**:
- `to: [agentA, agentB]`, `cc: [agentC]`
- agentA, agentB 병렬 호출 (총시간 ≈ max(개별), 직렬 아님)
- agentC는 fire-and-forget (응답 대기 안 함)
- 결과: `results` 배열에 agentA, agentB 각각 `status: "success"`

```javascript
assert.strictEqual(results.filter(r => r.status === 'success').length, 2);
assert.ok(elapsed < agentADelay + agentBDelay); // 병렬 증명
```

---

### E2 — SINGLE A2A: 1문1답 통합
**시나리오**: agentA가 agentB에게 SINGLE A2A 질의

**검증 포인트**:
- `a2a.enabled: true`, `mode: "single"`, `caller: "agentA"`
- `speaker_counts: { agentA: 1 }` 정확히 기록
- agentB 응답 후 즉시 종료 (라운드 카운트 없음)
- 결과에 agentB response 포함

```javascript
assert.strictEqual(result.ok, true);
assert.strictEqual(result.results[0].agent, 'agentB');
assert.strictEqual(result.results[0].status, 'success');
```

---

### E3 — DIALOGUE 2기: 3라운드 resolved 조기종료
**시나리오**: agentA ↔ agentB DIALOGUE, 3라운드에서 resolved

**검증 포인트**:
- `mode: "dialogue"`, mock이 round >= 3에서 `a2a_status: "resolved"` 반환
- 라운드 한도(10) 도달 전 조기종료
- `a2a_termination.reason: "resolved"`, `rounds_used: 3`
- resolved 체크가 round/speaker 한도보다 먼저 동작함 확인

```javascript
assert.strictEqual(termination.reason, 'resolved');
assert.strictEqual(termination.rounds_used, 3);
assert.ok(termination.rounds_used < 10);
```

---

### E4 — DIALOGUE 3기: 각자 10회 발화 보장
**시나리오**: agentA ↔ agentB ↔ agentC 순환, 각자 10회 발화

**검증 포인트**:
- 3기 순환 30회 (각자 10회)
- `speaker_counts: { agentA: 10, agentB: 10, agentC: 10 }`
- ROUND_LIMIT(10) 도달로 종료
- 어느 에이전트도 10회 이전에 차단되지 않음

```javascript
assert.deepStrictEqual(termination.speaker_counts,
  { agentA: 10, agentB: 10, agentC: 10 });
assert.strictEqual(termination.reason, 'round_limit');
```

---

### E5 — 플랫폼 간 인격 공유 + 메시지 격리
**시나리오**: 텔레그램과 슬랙에서 동일 에이전트(agentA) 호출

**검증 포인트**:
- 텔레그램 `context_key`: `telegram:group:CTEST:root`
- 슬랙 `context_key`: `slack:channel:CSLACK:root`
- 두 엔벨롭 모두 `persona_key: "agentA"` (플랫폼 prefix 없음 — 인격 공유)
- `space_key`가 서로 다름 (메시지 격리)

```javascript
assert.strictEqual(telegramEnv.memory_scope.persona_key, 'agentA');
assert.strictEqual(slackEnv.memory_scope.persona_key, 'agentA');
assert.notStrictEqual(
  telegramEnv.memory_scope.space_key,
  slackEnv.memory_scope.space_key
);
```

---

### E6 — 포럼 토픽1 ↔ 토픽2 대화 격리
**시나리오**: 텔레그램 포럼의 두 토픽이 독립된 context_key를 가짐

**검증 포인트**:
- General Topic(1) → `context_key: "telegram:forum:CFORUM:root"` (root 정규화)
- 토픽42 → `context_key: "telegram:forum:CFORUM:42"`
- 두 context_key가 달라 격리 확인

```javascript
assert.match(topic1Key, /telegram:forum:CFORUM:root/);
assert.match(topic2Key, /telegram:forum:CFORUM:42/);
assert.notStrictEqual(topic1Key, topic2Key);
```

---

### E7 — 재시도 폭격 + 에이전트 다운 무중단
**시나리오**: 동일 idempotency_key 3회 재전송 + agentA fail

**검증 포인트**:
- 1회차: 정상 처리
- 2, 3회차: `{ ok: true, status: 202 }` 즉시 반환 (dispatchToAgent 미호출)
- agentA fail + agentB, agentC 정상 → results에 agentB, agentC만 success

```javascript
assert.strictEqual(second.status, 202);
assert.strictEqual(third.status, 202);
const successes = mainResult.results.filter(r => r.status === 'success');
assert.strictEqual(successes.length, 2); // agentB, agentC
```

---

### E8 — Raw 드롭 + Wiki 파이프라인, 코어 성능 무영향
**시나리오**: 메시지 처리 → Raw 드롭 → mock WikiWorker

**검증 포인트**:
- `raw_logging_enabled: true` → route() 완료 후 비동기로 JSONL 파일 생성
- route() 응답 시간 ≪ Raw I/O 시간 (fire-and-forget 증명)
- mock WikiWorker: Gemini classify → Obsidian merge 순서 호출 확인
- 라우터 코드에 Gemini/Obsidian 직접 호출 없음

```javascript
const start = Date.now();
const result = route(envelope);       // await 하지 않음
const routeMs = Date.now() - start;
assert.ok(routeMs < 10);              // 드롭 I/O 대기 없음
await new Promise(r => setTimeout(r, 300)); // 비동기 I/O 완료 대기
const files = fs.readdirSync(RAW_TEST_PATH);
assert.ok(files.length > 0);
```

---

## 6. e2e.test.js 전체 골격

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import registry from '../../registry/agent-registry.js';
import { route } from '../../router-core/olympus-router.js';
import { createMockAgent } from '../mocks/mock-agent.js';
import { buildEnvelope } from '../mocks/mock-adapter.js';

const RAW_TEST_PATH = 'harness/tmp/raw-e2e/';

before(() => {
  registry.load('./harness/fixtures/agents.test.yaml');
  registry.system.wiki = { raw_logging_enabled: true, raw_path: RAW_TEST_PATH };
  fs.rmSync(RAW_TEST_PATH, { recursive: true, force: true });
});

after(() => {
  fs.rmSync(RAW_TEST_PATH, { recursive: true, force: true });
});

test('E1 — 다중 멘션 병렬 응답 + cc 청취', async () => { /* ... */ });
test('E2 — SINGLE A2A: 1문1답 통합',        async () => { /* ... */ });
test('E3 — DIALOGUE 2기: resolved 조기종료', async () => { /* ... */ });
test('E4 — DIALOGUE 3기: 각자 10회 보장',   async () => { /* ... */ });
test('E5 — 플랫폼 간 인격 공유 + 메시지 격리', async () => { /* ... */ });
test('E6 — 포럼 토픽1↔2 격리',             async () => { /* ... */ });
test('E7 — 재시도 폭격 + 에이전트 다운',    async () => { /* ... */ });
test('E8 — Raw 드롭 코어 성능 무영향',      async () => { /* ... */ });
```

> mock 주입 전략: `olympus-router.js`가 내부적으로 사용하는 `fetch` 또는
> `dispatchToAgent` 구조를 먼저 확인한 뒤, 적합한 방식(globalThis.fetch mock 또는
> 직접 주입)으로 결정한다. 구조 확인 없이 임의 가정 금지.

---

## 7. 자가 검증

```bash
# E2E 단독
node --test harness/tests/e2e.test.js

# 전체 (Phase 1~7 + E2E)
node --test harness/tests/

# 하드코딩 최종 검사
grep -rE '\b(zeus|hera|athena)\b' router-core/ adapters/ registry/ && echo "FAIL" || echo "PASS"
```

---

## 8. 완료 보고 형식

```
[E2E 완료 보고]
생성: harness/tests/e2e.test.js
수정: 없음

Exit Criteria:
  E1 ✅  E2 ✅  E3 ✅  E4 ✅
  E5 ✅  E6 ✅  E7 ✅  E8 ✅

전체 회귀: Phase 1~7 + E2E 전체 통과
하드코딩 검사: 0건
상태: 전체 통과 — Olympus Router V6 구현 완료 🎉
```

---

## 9. 금지 사항 재확인

- ❌ zeus/hera/athena 하드코딩
- ❌ 기존 phase1~7.test.js 수정
- ❌ router-core / registry / adapters 수정
- ❌ E1~E8 미통과 상태로 완료 선언
- ❌ dispatchToAgent mock 방식 구조 확인 없이 임의 가정

---

## 10. 이 파일에 대한 최종 확인

```
□ 나는 e2e.test.js 1개만 생성한다
□ 나는 블랙리스트 파일을 수정하지 않는다
□ 나는 dispatchToAgent mock 방식을 실제 코드 구조 확인 후 결정한다
□ 나는 E1~E8 전부 통과 후에만 완료를 선언한다
□ 나는 하드코딩 grep 검사를 마지막에 실행한다
□ 나는 자기 승인을 하지 않는다
```
