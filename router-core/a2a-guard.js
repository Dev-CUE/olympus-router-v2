import registry from '../registry/agent-registry.js';

export class A2AError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

export class A2AResolved extends Error {
  constructor() { super('A2A_EARLY_TERMINATION'); this.code = 'A2A_EARLY_TERMINATION'; }
}

export function validateA2A(a2a, routing, payload, response) {
  const currentCaller = a2a.caller;

  // 1. 권한 (공통)
  const agent = registry.getAgent(currentCaller);
  if (!agent?.a2a?.can_initiate)
    throw new A2AError('A2A_INITIATION_DENIED');
  resolveTargets(currentCaller, routing.to);

  // 2. 자기호출 (공통)
  if (routing.to.includes(currentCaller))
    throw new A2AError('A2A_SELF_CALL');

  // 3. 교차플랫폼 (공통) — 절대 차단
  if (a2a.parent_platform !== payload.origin_platform)
    throw new A2AError('A2A_CROSS_PLATFORM_DENIED');

  // 4. 조기종료 — 최우선 (resolved > round > speaker)
  if (a2a.mode === 'dialogue' && response?.a2a_status === 'resolved')
    throw new A2AResolved();

  // 5. 라운드 한도 (dialogue만)
  if (a2a.mode === 'dialogue' && a2a.round > a2a.max_rounds)
    throw new A2AError('A2A_ROUND_LIMIT_EXCEEDED');

  // 6. 발화자 한도 — 단일 증가 지점 (SINGLE/DIALOGUE 공통)
  const counts = {
    ...a2a.speaker_counts,
    [currentCaller]: (a2a.speaker_counts?.[currentCaller] ?? 0) + 1
  };
  if (counts[currentCaller] > a2a.max_speaker_calls)
    throw new A2AError('A2A_SPEAKER_LIMIT_EXCEEDED');

  // 7. 스푸핑 방지 (공통)
  const registryUrl = registry.getUrl(currentCaller);
  if (payload?._source_url && !payload?._source_url.startsWith(registryUrl))
    throw new A2AError('A2A_SPOOF_DETECTED');

  return counts;
}

function resolveTargets(callerId, requested) {
  const caller = registry.getAgent(callerId);
  const allowed = caller.a2a.allowed_targets;
  const resolved = allowed === '*'
    ? registry.getAllIds()
    : allowed;
  const bad = requested.filter(t => !resolved.includes(t));
  if (bad.length) throw new A2AError('A2A_UNAUTHORIZED');
}
