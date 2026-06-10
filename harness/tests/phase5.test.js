import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import registry from '../../registry/agent-registry.js';
import { validateA2A, A2AError, A2AResolved } from '../../router-core/a2a-guard.js';
import { route } from '../../router-core/olympus-router.js';

let captured = [];

function makeA2A(overrides = {}) {
  return {
    enabled: true,
    mode: 'single',
    caller: 'zeus',
    parent_platform: 'telegram',
    max_speaker_calls: 10,
    max_rounds: 10,
    round: 1,
    speaker_counts: {},
    ...overrides
  };
}

function makePayload(overrides = {}) {
  return { origin_platform: 'telegram', ...overrides };
}

beforeEach(() => {
  captured = [];
  registry.agents.clear();
  registry.agents.set('zeus',   { id: 'zeus',   url: 'http://zeus-agent:3001',   a2a: { can_initiate: true,  allowed_targets: '*' } });
  registry.agents.set('hera',   { id: 'hera',   url: 'http://hera-agent:3002',   a2a: { can_initiate: true,  allowed_targets: '*' } });
  registry.agents.set('athena', { id: 'athena', url: 'http://athena-agent:3003', a2a: { can_initiate: false, allowed_targets: [] } });

  global.fetch = async (url, opts) => {
    captured.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
});

test('T5.1 — SINGLE zeus→hera → 즉시 종료, speaker_counts 1', () => {
  const counts = validateA2A(
    makeA2A({ mode: 'single', caller: 'zeus' }),
    { to: ['hera'], cc: [] },
    makePayload(),
    null
  );
  assert.strictEqual(counts['zeus'], 1);
});

test('T5.2 — SINGLE 연쇄 11회 → A2A_SPEAKER_LIMIT_EXCEEDED (10까지만)', () => {
  let speaker_counts = {};
  for (let i = 0; i < 10; i++) {
    const counts = validateA2A(
      makeA2A({ mode: 'single', caller: 'zeus', speaker_counts }),
      { to: ['hera'], cc: [] },
      makePayload(),
      null
    );
    speaker_counts = counts;
  }
  assert.throws(
    () => validateA2A(
      makeA2A({ mode: 'single', caller: 'zeus', speaker_counts }),
      { to: ['hera'], cc: [] },
      makePayload(),
      null
    ),
    (err) => err instanceof A2AError && err.code === 'A2A_SPEAKER_LIMIT_EXCEEDED'
  );
});

test('T5.3 — 3기 DIALOGUE 각자 10회 발화 보장 (라운드 10 도달)', () => {
  registry.agents.set('hermes', { id: 'hermes', url: 'http://hermes-agent:3004', a2a: { can_initiate: true, allowed_targets: '*' } });
  const agents = ['zeus', 'hera', 'hermes'];
  let speaker_counts = {};

  for (let round = 1; round <= 10; round++) {
    for (const caller of agents) {
      const target = agents.find(a => a !== caller);
      const counts = validateA2A(
        makeA2A({ mode: 'dialogue', caller, round, speaker_counts }),
        { to: [target], cc: [] },
        makePayload(),
        null
      );
      speaker_counts = counts;
    }
  }

  for (const agent of agents) {
    assert.strictEqual(speaker_counts[agent], 10, `${agent} should have 10 calls`);
  }
});

test('T5.4 — DIALOGUE 11라운드 → A2A_ROUND_LIMIT_EXCEEDED', () => {
  assert.throws(
    () => validateA2A(
      makeA2A({ mode: 'dialogue', caller: 'zeus', round: 11 }),
      { to: ['hera'], cc: [] },
      makePayload(),
      null
    ),
    (err) => err instanceof A2AError && err.code === 'A2A_ROUND_LIMIT_EXCEEDED'
  );
});

test('T5.5 — DIALOGUE resolved → 조기종료 (라운드·발화 한도 전)', () => {
  assert.throws(
    () => validateA2A(
      makeA2A({ mode: 'dialogue', caller: 'zeus', round: 5, speaker_counts: { zeus: 5 } }),
      { to: ['hera'], cc: [] },
      makePayload(),
      { a2a_status: 'resolved' }
    ),
    (err) => err instanceof A2AResolved && err.code === 'A2A_EARLY_TERMINATION'
  );
});

test('T5.6 — resolved가 라운드·발화보다 먼저 체크됨 (round=11, speaker=10 동시 도달)', () => {
  assert.throws(
    () => validateA2A(
      makeA2A({ mode: 'dialogue', caller: 'zeus', round: 11, speaker_counts: { zeus: 10 } }),
      { to: ['hera'], cc: [] },
      makePayload(),
      { a2a_status: 'resolved' }
    ),
    (err) => err instanceof A2AResolved
  );
});

test('T5.7 — can_initiate:false → A2A_INITIATION_DENIED', () => {
  assert.throws(
    () => validateA2A(
      makeA2A({ caller: 'athena' }),
      { to: ['zeus'], cc: [] },
      makePayload(),
      null
    ),
    (err) => err instanceof A2AError && err.code === 'A2A_INITIATION_DENIED'
  );
});

test('T5.8 — allowed_targets 위반 → A2A_UNAUTHORIZED', () => {
  registry.agents.set('hermes', { id: 'hermes', url: 'http://hermes-agent:3004', a2a: { can_initiate: true, allowed_targets: ['hera'] } });
  assert.throws(
    () => validateA2A(
      makeA2A({ caller: 'hermes' }),
      { to: ['zeus'], cc: [] },
      makePayload(),
      null
    ),
    (err) => err instanceof A2AError && err.code === 'A2A_UNAUTHORIZED'
  );
});

test('T5.9 — 자기호출 → A2A_SELF_CALL', () => {
  assert.throws(
    () => validateA2A(
      makeA2A({ caller: 'zeus' }),
      { to: ['zeus'], cc: [] },
      makePayload(),
      null
    ),
    (err) => err instanceof A2AError && err.code === 'A2A_SELF_CALL'
  );
});

test('T5.10 — telegram→slack A2A → A2A_CROSS_PLATFORM_DENIED', () => {
  assert.throws(
    () => validateA2A(
      makeA2A({ caller: 'zeus', parent_platform: 'telegram' }),
      { to: ['hera'], cc: [] },
      makePayload({ origin_platform: 'slack' }),
      null
    ),
    (err) => err instanceof A2AError && err.code === 'A2A_CROSS_PLATFORM_DENIED'
  );
});

test('T5.11 — cc 에이전트 A2A 개시 → 차단 (can_initiate:false)', () => {
  assert.throws(
    () => validateA2A(
      makeA2A({ caller: 'athena' }),
      { to: ['hera'], cc: [] },
      makePayload(),
      null
    ),
    (err) => err instanceof A2AError && err.code === 'A2A_INITIATION_DENIED'
  );
});

test('T5.12 — 위조 caller → A2A_SPOOF_DETECTED', () => {
  assert.throws(
    () => validateA2A(
      makeA2A({ caller: 'zeus' }),
      { to: ['hera'], cc: [] },
      makePayload({ _source_url: 'http://fake-agent:9999' }),
      null
    ),
    (err) => err instanceof A2AError && err.code === 'A2A_SPOOF_DETECTED'
  );
});

test('T5.13 — DIALOGUE 중간 라운드 → persona_key 없음 (Mem0 미기록)', async () => {
  const envelope = {
    context_key: 'telegram:group:G1:root',
    routing: { to: ['hera'], cc: [] },
    payload: { origin_platform: 'telegram' },
    a2a: makeA2A({ mode: 'dialogue', caller: 'zeus', round: 3 })
  };
  await route(envelope);
  const dispatched = captured.find(c => c.url.includes('hera-agent'));
  assert.ok(dispatched, 'hera가 호출됨');
  assert.strictEqual(dispatched.body.route_context.persona, null);
});

test('T5.14 — DIALOGUE resolved → 최종만 Mem0 기록 (persona_key 설정됨)', async () => {
  const envelope = {
    context_key: 'telegram:group:G1:root',
    routing: { to: ['hera'], cc: [] },
    payload: { origin_platform: 'telegram' },
    a2a: makeA2A({ mode: 'dialogue', caller: 'zeus', round: 5, is_resolved: true })
  };
  await route(envelope);
  const dispatched = captured.find(c => c.url.includes('hera-agent'));
  assert.ok(dispatched, 'hera가 호출됨');
  assert.strictEqual(dispatched.body.route_context.persona, 'hera');
});

test('T5.15 — cc가 DIALOGUE 매 라운드 청취 (is_cc_only:true 확인)', async () => {
  const envelope = {
    context_key: 'telegram:group:G1:root',
    routing: { to: ['hera'], cc: ['athena'] },
    payload: { origin_platform: 'telegram' },
    a2a: makeA2A({ mode: 'dialogue', caller: 'zeus', round: 2 })
  };
  await route(envelope);
  const ccCapture = captured.find(c => c.url.includes('athena-agent'));
  assert.ok(ccCapture, 'athena(cc) 호출됨');
  assert.strictEqual(ccCapture.body.is_cc_only, true);
  assert.strictEqual(ccCapture.body.mode, 'listen_only');
});

test('T5.16 — 모드 미지정 → 기본값 single 적용', () => {
  const a2a = {
    enabled: true,
    caller: 'zeus',
    parent_platform: 'telegram',
    max_speaker_calls: 10,
    max_rounds: 10,
    round: 11,
    speaker_counts: {}
  };
  const counts = validateA2A(a2a, { to: ['hera'], cc: [] }, makePayload(), null);
  assert.strictEqual(counts['zeus'], 1);
});
