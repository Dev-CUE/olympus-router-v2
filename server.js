import http from 'node:http';
import registry from './registry/agent-registry.js';
import { route } from './router-core/olympus-router.js';

registry.load('./config/agents.yaml');

const PORT = parseInt(process.env.OLYMPUS_ROUTER_PORT ?? '8799', 10);
const HOST = process.env.OLYMPUS_ROUTER_HOST ?? '127.0.0.1';
const SECRET = process.env.OLYMPUS_ROUTER_SECRET ?? '';

function authOk(req) {
  if (!SECRET) return true;
  const h = req.headers['x-olympus-secret'] ?? req.headers['x-zeus-secret'] ?? '';
  return h === SECRET;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  // ── Health ──
  if (method === 'GET' && url === '/health') {
    return send(res, 200, {
      ok: true,
      service: 'olympus-router-v2',
      agents: registry.getAllIds(),
      endpoints: ['/v1/route', '/telegram/message', '/slack/message', '/discord/message']
    });
  }

  // ── Route endpoints ──
  const isRoute = [
    '/v1/route',
    '/telegram/message',
    '/slack/message',
    '/discord/message'
  ].includes(url);

  if (method === 'POST' && isRoute) {
    if (!authOk(req)) {
      return send(res, 401, { error: 'unauthorized' });
    }

    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: 'invalid_json' });
    }

    // 플랫폼별 alias: envelope이 아닌 raw payload면 감싸준다
    if (!body.routing && !body.context_key) {
      const platform = url.split('/')[1]; // telegram | slack | discord
      const spaceId = body.chat_id ?? body.channel ?? 'unknown';
      const topicId = body.thread_ts ?? body.origin_thread_id ?? body.message_thread_id ?? 'root';
      body = {
        context_key: `${platform}:group:${spaceId}:${topicId}`,
        routing: { to: [], cc: [] },
        memory_scope: { space_key: null, persona_key: null },
        payload: { origin_platform: platform, ...body },
        a2a: { enabled: false },
        idempotency_key: `${platform}:${spaceId}:${body.message_id ?? Date.now()}`
      };
    }

    try {
      const result = await route(body);
      const status = result.status === 202 ? 202 : 200;
      return send(res, status, result);
    } catch (err) {
      return send(res, 500, { ok: false, error: err.message });
    }
  }

  return send(res, 404, { error: 'not_found' });
});

server.listen(PORT, HOST, () => {
  console.log(`olympus-router-v2 listening on ${HOST}:${PORT}`);
});
