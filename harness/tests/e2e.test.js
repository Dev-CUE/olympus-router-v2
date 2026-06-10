import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import registry from '../../registry/agent-registry.js';
import { route } from '../../router-core/olympus-router.js';
import { dropToRaw } from '../../router-core/raw-logger.js';
import idempotencyStore from '../../router-core/idempotency-store.js';

const RAW_TEST_PATH = 'harness/tmp/raw-e2e/';

// appendFile 원본 보존 — E8에서 실제 I/O 필요
const _originalAppendFile = fs.promises.appendFile;

before(() => {
  registry.load('./harness/fixtures/agents.test.yaml');
  registry.system.wiki = { raw_logging_enabled: true, raw_path: RAW_TEST_PATH };
  fs.rmSync(RAW_TEST_PATH, { recursive: true, force: true });
});

beforeEach(() => {
  idempotencyStore.clear();
  // logToSpool(olympus-router 내부) 실제 파일 쓰기 방지
  fs.promises.appendFile = async () => {};
});

after(() => {
  fs.promises.appendFile = _originalAppendFile;
  fs.rmSync(RAW_TEST_PATH, { recursive: true, force: true });
});

test('E1 — 다중 멘션 병렬 응답 + cc 청취', async () => {
  const DELAY_A = 100;
  const DELAY_B = 100;

  global.fetch = async (url, _opts) => {
    if (url.includes('9101')) await new Promise(r => setTimeout(r, DELAY_A));
    else if (url.includes('9102')) await new Promise(r => setTimeout(r, DELAY_B));
    return { ok: true, json: async () => ({ ok: true }) };
  };

  const start = Date.now();
  const result = await route({
    context_key: 'telegram:group:CTEST:root',
    routing: { to: ['agentA', 'agentB'], cc: ['agentC'] },
    payload: { origin_platform: 'telegram', text: 'hello all' }
  });
  const elapsed = Date.now() - start;

  assert.strictEqual(result.results.filter(r => r.status === 'success').length, 2);
  assert.ok(elapsed < DELAY_A + DELAY_B,
    `병렬 증명: elapsed ${elapsed}ms < ${DELAY_A + DELAY_B}ms`);
});

test('E2 — SINGLE A2A: 1문1답 통합', async () => {
  const dispatched = [];
  global.fetch = async (_url, opts) => {
    dispatched.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ ok: true, answer: '42' }) };
  };

  const result = await route({
    context_key: 'telegram:group:CTEST:root',
    routing: { to: ['agentB'], cc: [] },
    payload: { origin_platform: 'telegram', text: 'question?' },
    a2a: {
      enabled: true,
      mode: 'single',
      caller: 'agentA',
      parent_platform: 'telegram',
      max_speaker_calls: 10,
      max_rounds: 10,
      round: 1,
      speaker_counts: {}
    }
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.results[0].agent, 'agentB');
  assert.strictEqual(result.results[0].status, 'success');
  assert.strictEqual(dispatched[0].route_context.a2a.speaker_counts['agentA'], 1);
});

test('E3 — DIALOGUE 2기: resolved 조기종료', async () => {
  const MAX_ROUNDS = 10;
  let round = 1;
  let termination = null;

  while (round <= MAX_ROUNDS) {
    const willResolve = round >= 3;

    global.fetch = async (_url, _opts) => ({
      ok: true,
      json: async () => ({ ok: true, ...(willResolve ? { a2a_status: 'resolved' } : {}) })
    });

    const result = await route({
      context_key: 'telegram:group:CTEST:root',
      routing: { to: ['agentB'], cc: [] },
      payload: { origin_platform: 'telegram', text: `round ${round}` },
      a2a: {
        enabled: true,
        mode: 'dialogue',
        caller: 'agentA',
        parent_platform: 'telegram',
        max_speaker_calls: MAX_ROUNDS,
        max_rounds: MAX_ROUNDS,
        round,
        speaker_counts: {}
      }
    });

    if (result.results?.some(r => r.a2a_status === 'resolved')) {
      termination = { reason: 'resolved', rounds_used: round };
      break;
    }
    round++;
  }

  assert.ok(termination !== null, '조기종료 발생해야 함');
  assert.strictEqual(termination.reason, 'resolved');
  assert.strictEqual(termination.rounds_used, 3);
  assert.ok(termination.rounds_used < MAX_ROUNDS);
});

test('E4 — DIALOGUE 3기: 각자 10회 보장', async () => {
  registry.agents.set('agentA', { id: 'agentA', url: 'http://localhost:9101', a2a: { can_initiate: true, allowed_targets: '*' } });
  registry.agents.set('agentB', { id: 'agentB', url: 'http://localhost:9102', a2a: { can_initiate: true, allowed_targets: '*' } });
  registry.agents.set('agentC', { id: 'agentC', url: 'http://localhost:9103', a2a: { can_initiate: true, allowed_targets: '*' } });

  let lastBody = null;
  global.fetch = async (_url, opts) => {
    lastBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };

  const agents = ['agentA', 'agentB', 'agentC'];
  const MAX_ROUNDS = 10;
  let speaker_counts = {};

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    for (const caller of agents) {
      const target = agents[(agents.indexOf(caller) + 1) % agents.length];
      await route({
        context_key: 'telegram:group:CTEST:root',
        routing: { to: [target], cc: [] },
        payload: { origin_platform: 'telegram' },
        a2a: {
          enabled: true,
          mode: 'dialogue',
          caller,
          parent_platform: 'telegram',
          max_speaker_calls: MAX_ROUNDS,
          max_rounds: MAX_ROUNDS,
          round,
          speaker_counts
        }
      });
      if (lastBody?.route_context?.a2a?.speaker_counts) {
        speaker_counts = lastBody.route_context.a2a.speaker_counts;
      }
    }
  }

  assert.deepStrictEqual(speaker_counts,
    { agentA: 10, agentB: 10, agentC: 10 });
  assert.ok(Object.values(speaker_counts).every(c => c <= MAX_ROUNDS));
});

test('E5 — 플랫폼 간 인격 공유 + 메시지 격리', async () => {
  const calls = [];
  global.fetch = async (_url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ ok: true }) };
  };

  await route({
    context_key: 'telegram:group:CTEST:root',
    routing: { to: ['agentA'], cc: [] },
    payload: { origin_platform: 'telegram' }
  });
  const telegramEnv = calls[0];

  calls.length = 0;

  await route({
    context_key: 'slack:channel:CSLACK:root',
    routing: { to: ['agentA'], cc: [] },
    payload: { origin_platform: 'slack' }
  });
  const slackEnv = calls[0];

  assert.strictEqual(telegramEnv.route_context.persona, 'agentA');
  assert.strictEqual(slackEnv.route_context.persona, 'agentA');
  assert.notStrictEqual(
    telegramEnv.route_context.session_key,
    slackEnv.route_context.session_key
  );
});

test('E6 — 포럼 토픽1↔2 격리', async () => {
  const calls = [];
  global.fetch = async (_url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ ok: true }) };
  };

  await route({
    context_key: 'telegram:forum:CFORUM:root',
    routing: { to: ['agentA'], cc: [] },
    payload: { origin_platform: 'telegram' }
  });
  const topic1Key = calls[0].route_context.session_key;

  calls.length = 0;

  await route({
    context_key: 'telegram:forum:CFORUM:42',
    routing: { to: ['agentA'], cc: [] },
    payload: { origin_platform: 'telegram' }
  });
  const topic2Key = calls[0].route_context.session_key;

  assert.match(topic1Key, /telegram:forum:CFORUM:root/);
  assert.match(topic2Key, /telegram:forum:CFORUM:42/);
  assert.notStrictEqual(topic1Key, topic2Key);
});

test('E7 — 재시도 폭격 + 에이전트 다운', async () => {
  global.fetch = async (url, _opts) => {
    if (url.includes('9101')) throw new Error('agentA_DOWN');
    return { ok: true, json: async () => ({ ok: true }) };
  };

  const envelope = {
    context_key: 'telegram:group:CTEST:root',
    routing: { to: ['agentA', 'agentB', 'agentC'], cc: [] },
    payload: { origin_platform: 'telegram', text: 'hello' },
    idempotency_key: 'e7-idempotency-key'
  };

  const mainResult = await route(envelope);
  const second    = await route(envelope);
  const third     = await route(envelope);

  assert.strictEqual(second.status, 202);
  assert.strictEqual(third.status, 202);

  const successes = mainResult.results.filter(r => r.status === 'success');
  assert.strictEqual(successes.length, 2, 'agentB, agentC만 성공');
});

test('E8 — Raw 드롭 코어 성능 무영향', async () => {
  fs.promises.appendFile = _originalAppendFile;

  registry.system.wiki = { raw_logging_enabled: true, raw_path: RAW_TEST_PATH };
  fs.rmSync(RAW_TEST_PATH, { recursive: true, force: true });

  const envelope = {
    context_key: 'telegram:group:CTEST:root',
    routing: { to: ['agentA'] },
    payload: { origin_platform: 'telegram', text: 'e2e raw drop test' },
    idempotency_key: 'e8-raw-drop-key'
  };

  const start = Date.now();
  dropToRaw(envelope);
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 10, `dropToRaw() 동기 경과 ${elapsed}ms < 10ms`);

  await new Promise(r => setTimeout(r, 300));

  const files = fs.readdirSync(RAW_TEST_PATH);
  assert.ok(files.length > 0, 'JSONL 파일 생성됨');

  let geminiCalled = false;
  let obsidianCalled = false;
  const mockGemini   = { classify: async (_rec) => { geminiCalled = true; return { category: 'decision' }; } };
  const mockObsidian = { merge: async (_cls) => { obsidianCalled = true; } };

  const raw = JSON.parse(fs.readFileSync(`${RAW_TEST_PATH}${files[0]}`, 'utf8').trim());
  const classified = await mockGemini.classify(raw);
  await mockObsidian.merge(classified);

  assert.ok(geminiCalled, 'Gemini classify 호출됨');
  assert.ok(obsidianCalled, 'Obsidian merge 호출됨');

  const rawLoggerSrc = fs.readFileSync('router-core/raw-logger.js', 'utf8');
  assert.ok(!rawLoggerSrc.toLowerCase().includes('gemini'), 'raw-logger에 gemini 없음');
  assert.ok(!rawLoggerSrc.toLowerCase().includes('obsidian'), 'raw-logger에 obsidian 없음');
});
