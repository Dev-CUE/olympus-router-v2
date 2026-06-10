import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import registry from '../../registry/agent-registry.js';
import { route } from '../../router-core/olympus-router.js';

let captured = [];

beforeEach(() => {
  captured = [];
  registry.agents.clear();
  registry.agents.set('agentA', { id: 'agentA', url: 'http://localhost:9401' });
  registry.agents.set('agentB', { id: 'agentB', url: 'http://localhost:9402' });

  global.fetch = async (url, opts) => {
    captured.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
});

// T4.1
test('T4.1 — context_key가 다른 두 요청의 space_key 격리 (MESSAGE 격리)', async () => {
  const envA = { context_key: 'slack:channel:C1:root', routing: { to: ['agentA'], cc: [] } };
  const envB = { context_key: 'telegram:group:G2:root', routing: { to: ['agentA'], cc: [] } };

  captured = [];
  await route(envA);
  const spaceA = captured[0].body.route_context.session_key;

  captured = [];
  await route(envB);
  const spaceB = captured[0].body.route_context.session_key;

  assert.notStrictEqual(spaceA, spaceB);
  assert.strictEqual(spaceA, 'slack:channel:C1:root');
  assert.strictEqual(spaceB, 'telegram:group:G2:root');
});

// T4.2
test('T4.2 — 슬랙·텔레그램 동일 에이전트의 persona_key 동일 (PERSONA 공유)', async () => {
  const slackEnv = { context_key: 'slack:channel:C1:root', routing: { to: ['agentA'], cc: [] } };
  const tgEnv    = { context_key: 'telegram:group:G2:root', routing: { to: ['agentA'], cc: [] } };

  captured = [];
  await route(slackEnv);
  const slackPersona = captured[0].body.route_context.persona;

  captured = [];
  await route(tgEnv);
  const tgPersona = captured[0].body.route_context.persona;

  assert.strictEqual(slackPersona, tgPersona);
  assert.strictEqual(slackPersona, 'agentA');
});

// T4.3
test('T4.3 — 텔레그램 space_key가 슬랙 space_key로 새지 않음', async () => {
  const slackEnv = { context_key: 'slack:channel:C1:root', routing: { to: ['agentA'], cc: [] } };
  const tgEnv    = { context_key: 'telegram:group:G2:root', routing: { to: ['agentA'], cc: [] } };

  captured = [];
  await route(slackEnv);
  const slackSpace = captured[0].body.route_context.session_key;

  captured = [];
  await route(tgEnv);
  const tgSpace = captured[0].body.route_context.session_key;

  assert.notStrictEqual(slackSpace, tgSpace);
});

// T4.4
test('T4.4 — to persona_key 형식 = agent_id (플랫폼 prefix ":" 없음)', async () => {
  await route({ context_key: 'telegram:dm:123:root', routing: { to: ['agentA'], cc: [] } });
  const personaKey = captured[0].body.route_context.persona;
  assert.ok(!String(personaKey).includes(':'), 'persona_key에 ":" 포함 금지');
  assert.strictEqual(personaKey, 'agentA');
});

// T4.5
test('T4.5 — cc 에이전트의 persona_key === null', async () => {
  await route({
    context_key: 'telegram:group:G1:root',
    routing: { to: ['agentA'], cc: ['agentB'] }
  });
  const ccCapture = captured.find(c => c.url.includes('9402'));
  assert.ok(ccCapture, 'cc 에이전트(agentB)가 호출됨');
  assert.strictEqual(ccCapture.body.route_context.persona, null);
  assert.strictEqual(ccCapture.body.reason, 'cc');
  assert.strictEqual(ccCapture.body.is_cc_only, true);
  assert.strictEqual(ccCapture.body.mode, 'listen_only');
});
