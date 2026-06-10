import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import registry from '../../registry/agent-registry.js';
import { route } from '../../router-core/olympus-router.js';

// T1.1~T1.3, T1.5: Phase 1 라우터는 실제 HTTP 호출 없음 — mock 서버 불필요

beforeEach(() => {
  registry.load('./config/agents.yaml');
});

test('T1.1 — registry.load 후 getAllIds().length === 3', () => {
  assert.strictEqual(registry.getAllIds().length, 3);
});

test('T1.2 — 4번째 에이전트 추가 → 코드 수정 없이 length === 4', () => {
  registry.load('./harness/fixtures/agents-t12.yaml');
  assert.strictEqual(registry.getAllIds().length, 4);
});

test('T1.3 — 미존재 에이전트 거부 → UNKNOWN_AGENT', async () => {
  await assert.rejects(
    () => route({
      context_key: 'telegram:group:C123:root',
      routing: { to: ['ghost'], cc: [] },
      payload: { origin_platform: 'telegram', text: 'hello' },
      idempotency_key: 'test:ghost:001'
    }),
    /UNKNOWN_AGENT/
  );
});

test('T1.5 — route({to:[valid]}) → results[0].status === "success"', async () => {
  global.fetch = async (_url, _opts) => ({ ok: true, json: async () => ({ ok: true }) });
  const result = await route({
    context_key: 'telegram:group:C123:root',
    routing: { to: [registry.getAllIds()[0]], cc: [] },
    payload: { origin_platform: 'telegram', text: 'hello' },
    idempotency_key: 'telegram:C123:root:msg_001'
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.results[0].status, 'success');
});
