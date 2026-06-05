# AGENT.md — 현재 작업 지시서 (Phase 7)

> ⚠️ 이 파일은 **Phase 7 전용**이다. Phase 6 완료 후 교체된 지시서다.
> 작업 시작 전 `CLAUDE.md`(헌법)와 `SKILLS.md`(기술 패턴)를 먼저 읽었다고 가정한다.
> 자기완결형 — 이 파일만으로 Phase 7 작업이 완결되도록 핵심을 인라인 포함한다.

---

## 1. 너의 역할

너는 Olympus Router의 **분리형 Wiki 파이프라인** 담당 코딩 에이전트다.
이번 Phase의 목표: **라우터 Raw 드롭 모듈을 완성하고, Gemini 분류 → Obsidian 병합 연동을 mock으로 검증한다.**

핵심은 세 가지다:
1. Raw 드롭이 yaml 토글(`raw_logging_enabled`)로 ON/OFF 된다.
2. Raw 드롭이 코어 응답을 **단 1ms도 블로킹하지 않는다**.
3. Gemini·Obsidian은 **라우터가 직접 호출하지 않는다** — mock으로 "호출 여부"만 검증.

---

## 2. 반드시 지킬 불변 원칙 (요약 — 전문은 CLAUDE.md)

1. **Dumb Pipe**: 라우터는 텍스트 파싱·LLM 호출 금지. Raw 드롭은 단순 파일 기록일 뿐.
2. **Zero Hardcoding**: zeus/hera/athena 코드 직접 기재 절대 금지.
3. **컴포넌트 독립성**: 라우터/어댑터는 Mem0·Obsidian·Gemini를 **직접 호출하지 않는다**.
   - 라우터의 유일한 Wiki 접점 = `data/wiki/raw/`에 JSONL 파일 드롭(옵션).
   - Gemini·Obsidian 연동은 **별도 워커** 책임. 라우터 코드에서 `import gemini` 금지.
4. **비차단 드롭**: `fs.promises.appendFile(...).catch(() => {})` 패턴 필수. `await` 금지.
5. **이 Phase만**: Phase 완료 후 선언 전 T7.1~T7.4 전부 통과 확인 필수.

---

## 3. 작업 범위 (화이트리스트 — 이 파일들만 생성/수정)

```
생성:
  router-core/raw-logger.js       ← Raw 드롭 모듈 (정식 버전)
  harness/tests/phase7.test.js    ← T7.1~T7.4 테스트
수정:
  (없음 — olympus-router.js는 Phase 6에서 logToSpool 연동 완료)
```

> ⚠️ `olympus-router.js`는 이미 `logToSpool(...).catch(() => {})` 비동기 연동이 되어 있다.
> Phase 7에서 추가 수정 불필요. raw-logger.js만 새로 작성한다.

---

## 4. 절대 건드리지 말 것 (블랙리스트)

```
router-core/olympus-router.js   ← Phase 6 완료, 수정 금지
router-core/a2a-guard.js        ← Phase 5 완료, 수정 금지
router-core/idempotency-store.js← Phase 6 완료, 수정 금지
adapters/                        ← Phase 3 완료, 수정 금지
harness/tests/phase1~6.test.js  ← 기존 테스트 수정 금지
SKILLS.md, CLAUDE.md, PRD       ← 문서 수정 금지
config/agents.yaml               ← yaml 수정 금지 (토글 검증은 registry mock으로)
```

---

## 5. 구현할 것

### 5.1 router-core/raw-logger.js

`SKILLS.md` 섹션 10의 패턴을 정식으로 구현한다.

```javascript
// router-core/raw-logger.js
import fs from 'node:fs';
import registry from '../registry/agent-registry.js';

/**
 * Raw 드롭 — 옵션 모듈
 * raw_logging_enabled=true 일 때만 data/wiki/raw/ 에 JSONL 기록.
 * 코어 블로킹 절대 금지 — Promise를 반환하지 않고 .catch(() => {}) fire-and-forget.
 */
export function dropToRaw(envelope) {
  // 1. yaml 토글 확인 — false면 즉시 반환 (코어 부하 0)
  if (!registry.system?.wiki?.raw_logging_enabled) return;

  const rawPath = registry.system.wiki.raw_path ?? 'data/wiki/raw/';

  const record = {
    timestamp: new Date().toISOString(),
    targets: envelope.routing?.to ?? [],
    meta: {
      platform: envelope.payload?.origin_platform ?? 'unknown',
      space_key: envelope.context_key ?? ''
    },
    text: envelope.payload?.text ?? ''
  };

  const filename = `${rawPath}${Date.now()}_${envelope.idempotency_key ?? 'noid'}.jsonl`;

  // 2. 비동기 fire-and-forget — await 절대 금지
  fs.promises.mkdir(rawPath, { recursive: true })
    .then(() => fs.promises.appendFile(filename, JSON.stringify(record) + '\n'))
    .catch(() => {});  // 실패해도 코어 영향 0
}
```

**핵심 포인트**:
- 함수가 `void` 반환 (Promise 아님) → 코어가 await할 수 없어 블로킹 불가
- `mkdir` recursive로 raw 폴더 없어도 자동 생성
- 실패 시 `.catch(() => {})` — 코어 에러 전파 0

---

### 5.2 T7.4 — Gemini·Obsidian mock 검증 원칙

T7.4는 **라우터가 직접 Gemini/Obsidian을 호출하는 것을 검증하는 게 아니다.**
라우터는 Raw만 드롭하고, **별도 워커(wiki-worker)**가 Raw를 감시해 Gemini → Obsidian을 호출한다.

테스트에서는:
1. mock `wiki-worker`가 Raw 파일을 감지했다고 가정
2. mock `gemini.classify()`와 mock `obsidian.merge()` 호출 여부만 assert
3. 라우터 코드에 Gemini/Obsidian import가 없는지 grep으로 확인

```javascript
// T7.4 검증 구조 (테스트 내 mock)
const geminiCalled = { value: false };
const obsidianCalled = { value: false };

const mockGemini = { classify: async (record) => { geminiCalled.value = true; return { category: 'decision' }; } };
const mockObsidian = { merge: async (classified) => { obsidianCalled.value = true; } };

// mock wiki-worker 실행 (라우터와 분리된 별도 로직)
async function mockWikiWorker(rawRecord) {
  const classified = await mockGemini.classify(rawRecord);
  await mockObsidian.merge(classified);
}

await mockWikiWorker({ text: 'test', meta: {} });
assert.ok(geminiCalled.value, 'Gemini classify 호출됨');
assert.ok(obsidianCalled.value, 'Obsidian merge 호출됨');

// 라우터 코드에 Gemini/Obsidian 직접 호출 없는지 확인
// (grep은 bash로 보조 검증)
```

---

## 6. harness/tests/phase7.test.js 구조

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import registry from '../../registry/agent-registry.js';
import { dropToRaw } from '../../router-core/raw-logger.js';

const RAW_TEST_PATH = 'harness/tmp/raw-phase7/';

// 테스트 전 fixtures yaml 로드 + tmp 폴더 정리
before(() => {
  registry.load('./harness/fixtures/agents.test.yaml');
  // raw_path를 테스트 전용 tmp로 오버라이드 (실제 data/ 오염 방지)
  registry.system.wiki = {
    raw_logging_enabled: true,
    raw_path: RAW_TEST_PATH
  };
  fs.rmSync(RAW_TEST_PATH, { recursive: true, force: true });
});

after(() => {
  fs.rmSync(RAW_TEST_PATH, { recursive: true, force: true });
});

// T7.1 — raw_logging_enabled=true → 파일 생성
test('T7.1 — raw_logging_enabled=true → JSONL 파일 생성', async () => { ... });

// T7.2 — raw_logging_enabled=false → 파일 미생성
test('T7.2 — raw_logging_enabled=false → 드롭 안 함', async () => { ... });

// T7.3 — Raw 드롭이 코어 응답 지연 0
test('T7.3 — Raw 드롭이 route() 지연 유발하지 않음', async () => { ... });

// T7.4 — (mock) Gemini 분류 → Obsidian 병합 호출
test('T7.4 — mock WikiWorker: Gemini 분류 → Obsidian 병합 호출', async () => { ... });
```

> T7.3은 `dropToRaw()` 호출 전후 `Date.now()` 차이가 5ms 미만임을 assert.
> (fire-and-forget이므로 파일 I/O 대기 시간이 경과 시간에 포함되지 않아야 함)

---

## 7. 입출력 규격 (raw 드롭 레코드 포맷)

```json
{
  "timestamp": "2026-06-05T00:00:00.000Z",
  "targets": ["agentA"],
  "meta": {
    "platform": "telegram",
    "space_key": "telegram:group:CTEST:root"
  },
  "text": "테스트 메시지"
}
```

파일명 규격: `{rawPath}{Date.now()}_{idempotency_key}.jsonl`

---

## 8. 자가 검증 (구현 후 반드시 실행)

```bash
# Phase 7 테스트
node --test harness/tests/phase7.test.js

# 라우터 코드에 Gemini/Obsidian 직접 호출 없는지 확인
grep -rE '\b(gemini|obsidian|mem0)\b' router-core/ && echo "T7.4 FAIL — 직접 호출 존재" || echo "T7.4 PASS — 라우터 독립성 확인"

# 전체 회귀 확인 (Phase 1~7)
node --test harness/tests/phase1.test.js harness/tests/phase2.test.js harness/tests/phase3.test.js harness/tests/phase4.test.js harness/tests/phase5.test.js harness/tests/phase6.test.js harness/tests/phase7.test.js
```

---

## 9. 완료 보고 형식

```
[Phase 7 완료 보고]
생성: router-core/raw-logger.js
      harness/tests/phase7.test.js
수정: 없음

Exit Criteria:
  T7.1 ✅ raw_logging_enabled=true → JSONL 파일 생성 확인
  T7.2 ✅ raw_logging_enabled=false → 파일 미생성 확인
  T7.3 ✅ Raw 드롭 코어 지연 0 (Nms < 5ms)
  T7.4 ✅ mock Gemini classify + Obsidian merge 호출 확인

전체 회귀: Phase 1~6 NN개 통과, T1.5 기존 실패 유지 (무관)
상태: 전체 통과 — Phase 7 완료
```

---

## 10. 금지 사항 재확인

- ❌ zeus/hera/athena 하드코딩
- ❌ 라우터 코드에서 Gemini·Obsidian·Mem0 직접 import/호출
- ❌ `await dropToRaw(...)` — 비동기 블로킹 금지, fire-and-forget만
- ❌ olympus-router.js 수정 (Phase 6 완료분 보호)
- ❌ 기존 phase1~6.test.js 수정
- ❌ Exit Criteria 미통과 상태로 완료 선언
- ❌ 승인 없이 다음 작업 진행

---

## 11. 이 파일에 대한 최종 확인

```
□ 나는 AGENT.md를 수정하지 않는다
□ 나는 블랙리스트 파일을 생성/수정하지 않는다
□ 나는 파일 생성 전 목록을 보고하고 승인을 받는다
□ 나는 dropToRaw()를 void 함수로 구현해 코어가 await하지 못하게 한다
□ 나는 라우터 코드에 Gemini/Obsidian import를 추가하지 않는다
□ 나는 T7.4를 mock 워커로만 검증하고 실제 API 호출을 시도하지 않는다
□ 나는 T7.1~T7.4 전부 통과 후에만 완료를 선언한다
□ 나는 자기 승인을 하지 않는다
```
