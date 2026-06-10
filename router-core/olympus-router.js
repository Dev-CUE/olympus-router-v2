import fs from 'node:fs';
import registry from '../registry/agent-registry.js';
import { validateA2A, A2AResolved } from './a2a-guard.js';
import idempotencyStore from './idempotency-store.js';

async function dispatchToAgent(id, envelope) {
  const url = registry.getUrl(id);
  const secret = process.env.OLYMPUS_ROUTER_SECRET ?? '';
  const provider = process.env.OLYMPUS_PROVIDER ?? 'openai-codex';
  const model = process.env.OLYMPUS_MODEL ?? 'gpt-5.5';
  const originPlatform = envelope.payload?.origin_platform ?? '';
  const originChatId = envelope.payload?.chat_id ?? envelope.payload?.origin_chat_id ?? '';
  const originThreadId = envelope.payload?.message_thread_id ?? envelope.memory_scope?.space_key ?? '';
  const text = envelope.payload?.text ?? '';
  const routeType = envelope.is_cc_only ? 'cc' : 'to';
    const personaKey = envelope.memory_scope != null ? envelope.memory_scope.persona_key : id;
    const body = {
      role: id,
      reason: envelope.mode === 'listen_only' ? 'cc' : envelope.a2a?.enabled ? 'collaboration' : 'route',
      source: originPlatform || 'unknown',
      text,
      original_text: envelope.payload?.original_text ?? text,
      user: envelope.payload?.user ?? null,
      channel: envelope.payload?.channel ?? null,
      thread_ts: envelope.payload?.thread_ts ?? null,
      ts: envelope.payload?.ts ?? null,
      mode: envelope.mode ?? null,
      is_cc_only: envelope.is_cc_only ?? false,
      memory_scope: envelope.memory_scope ?? null,
      route_context: {
        router: 'olympus-router-v2',
        model_hint: `${provider}/${model}`,
        persona: personaKey,
        session_key: envelope.context_key ?? '',
      origin_platform: originPlatform || null,
      origin_chat_id: originChatId || null,
      origin_thread_id: originThreadId || null,
      message_thread_id: envelope.payload?.message_thread_id ?? null,
      route_type: routeType,
      a2a: envelope.a2a ?? null
    },
    skip_mem0: envelope.payload?.skip_mem0 ?? false
  };
  const res = await fetch(`${url}/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zeus-secret': secret
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000)
  });
  if (!res.ok) throw new Error(`HTTP_ERROR: ${res.status}`);
  return await res.json();
}

async function logToSpool(envelope, results) {
  const record = JSON.stringify({
    ts: new Date().toISOString(),
    context_key: envelope.context_key,
    platform: envelope.payload?.origin_platform,
    targets: envelope.routing.to,
    results_count: results?.length ?? 0
  }) + '\n';
  await fs.promises.appendFile('data/wiki/raw/spool.jsonl', record);
}

export async function route(envelope) {
  const { context_key, routing, payload } = envelope;

  // ── 멱등성 체크 (최상단, A2A 가드보다 앞) ──
  if (envelope.idempotency_key) {
    const isNew = idempotencyStore.checkAndSet(envelope.idempotency_key);
    if (!isNew) {
      return { ok: true, context_key, status: 202,
               message: 'Duplicate request ignored' };
    }
  }

  let a2a = envelope.a2a;

  // A2A 가드 (a2a.enabled 시에만)
  if (a2a?.enabled) {
    try {
      const updatedCounts = validateA2A(a2a, routing, payload, null);
      a2a = { ...a2a, speaker_counts: updatedCounts };
    } catch (err) {
      if (err instanceof A2AResolved) {
        return { ok: true, context_key,
          a2a_termination: { reason: 'resolved' }, results: [] };
      }
      return { ok: false, context_key,
        error: { code: err.code, message: err.message } };
    }
  }

  // 목적지 검증 (기존 유지)
  for (const id of routing.to) {
    if (!registry.exists(id)) {
      throw new Error(`UNKNOWN_AGENT: ${id}`);
    }
  }

  // DIALOGUE 중간 라운드는 persona_key=null (Mem0 미기록)
  const isDialogueMidRound = a2a?.enabled && a2a?.mode === 'dialogue' && !a2a?.is_resolved;

  const toPromises = routing.to.map(id =>
    dispatchToAgent(id, {
      ...envelope,
      a2a,
      memory_scope: {
        space_key: context_key,
        persona_key: isDialogueMidRound ? null : id
      },
      mode: 'respond'
    })
  );

  (routing.cc ?? []).forEach(id => {
    if (registry.exists(id)) {
      dispatchToAgent(id, {
        ...envelope,
        a2a,
        memory_scope: {
          space_key: context_key,
          persona_key: null
        },
        is_cc_only: true,
        mode: 'listen_only'
      }).catch(() => {});
    }
  });

  const settled = await Promise.allSettled(toPromises);

  const results = settled.map((result, i) => {
    const id = routing.to[i];
    if (result.status === 'fulfilled') {
      return { agent: id, status: 'success', ...result.value };
    }
    return {
      agent: id,
      status: 'error',
      error_message: result.reason?.message ?? 'unknown error'
    };
  });

  logToSpool(envelope, results).catch(() => {});

  // callback_url 있으면 결과를 POST로 전송, 실패 시 무시
  const callbackUrl = envelope.callback_url ?? envelope.payload?.callback_url;
  if (callbackUrl) {
    const agentText = results.find(r => r.status === 'success')?.response_text ?? '';
    const callbackBody = JSON.stringify({ ok: true, context_key, results, chat_id: envelope.chat_id ?? envelope.payload?.chat_id ?? '', text: agentText });
    (async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: callbackBody,
            signal: AbortSignal.timeout(5000)
          });
          if (res.ok) break;
          if (attempt < 3) await new Promise(r => setTimeout(r, 300));
        } catch {
          if (attempt < 3) await new Promise(r => setTimeout(r, 300));
        }
      }
    })().catch(() => {});
  }

  if (a2a?.mode === 'dialogue') {
    const isResolved = results.some(r => r.status === 'success' && r.a2a_status === 'resolved');
    if (isResolved) {
      return { ok: true, context_key, a2a_termination: { reason: 'resolved' }, results };
    }
  }

  return { ok: true, context_key, results };
}
