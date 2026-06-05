# AGENT.md — 현재 작업 지시서 (Phase 5)

---

## ⛔ 최우선 규칙 — 이 블록을 먼저 읽어라

```
╔══════════════════════════════════════════════════════════╗
║  이 파일(AGENT.md)은 사장님(운영자)만 수정할 수 있다.      ║
║  에이전트가 이 파일을 수정하는 것은                        ║
║  어떤 이유로도, 어떤 상황에서도 절대 금지된다.              ║
║                                                          ║
║  위반 시 즉시 해야 할 일:                                  ║
║  1. 모든 작업을 중단한다                                   ║
║  2. 수정한 내용을 전부 되돌린다                            ║
║  3. "AGENT.md 수정을 시도했습니다"라고 보고한다            ║
╚══════════════════════════════════════════════════════════╝
```

**자기 승인 금지**: 이 파일을 수정한 뒤 그 내용을 근거로 작업을 정당화하는 행위는 가장 심각한 원칙 위반이다.

---

## ⛔ 파일 생성 사전 승인 규칙

```
새 파일을 만들기 전에 반드시:
  1. 생성할 파일 경로 목록을 보고한다
  2. 사장님 승인을 받는다
  3. 승인된 파일만 생성한다
```

---

## ⛔ 완료 후 강제 정지 규칙

```
T5.16 통과 확인 즉시:
  1. 테스트 결과를 보고한다
  2. 완전히 멈춘다
  3. "Phase 6 AGENT.md를 제공해 주십시오"라고 요청한다
  4. 다음 AGENT.md가 제공될 때까지 코드 작업을 하지 않는다
```

---

## 1. 너의 역할

Olympus Router의 **A2A 협업 엔진** 담당.
에이전트 간 호출(A2A)을 안전하게 중개하는 가드 로직을 구현한다.
이번 Phase가 가장 복잡하다. 검증 순서를 반드시 지킨다.

---

## 2. A2A 핵심 규칙 (반드시 숙지)

### 2-Mode 구조
| 모드 | 용도 | 동작 |
|------|------|------|
| `single` | 1문1답 (기본값) | 호출→응답→즉시 종료 |
| `dialogue` | 티키타카/합의 | 라운드 카운트, 조기종료 가능 |

### 종료 조건 3-트리거 (우선순위 순서)
```
1. resolved  — 에이전트가 "결론 났음" 선언 (최우선, 조기종료)
2. round > 10 — 라운드 한도 (dialogue만)
3. speaker > 10 — 발화자 개인 한도 (SINGLE/DIALOGUE 공통)
```
> **resolved를 반드시 먼저 체크한다.** 발화자 한도보다 앞에 있어야 한다(T5.6).

### 발화자 기준 한도
```
에이전트별 개인 10회 — 에이전트 수와 무관하게 공평
2기든 10기든 각자 10번씩 발화 가능
SINGLE 무한 연쇄도 이것으로 방어
```

---

## 3. 작업 범위 (화이트리스트)

```
생성:
  router-core/a2a-guard.js       (A2A 검증 로직 전체)
  harness/tests/phase5.test.js   (T5.1~T5.16)
수정:
  router-core/olympus-router.js  (A2A 가드 연동)
```

---

## 4. 절대 생성/수정 금지 (블랙리스트)

```
adapters/                      ← Phase 3 완성
registry/                      ← Phase 1 완성
config/agents.yaml             ← Phase 1 완성
harness/tests/phase1~4.test.js ← 완성, 건드리지 마
harness/tests/phase6~7.test.js ← 해당 Phase 전용
AGENT.md                       ← 읽기 전용 (절대 수정 금지)
CLAUDE.md                      ← 읽기 전용
SKILLS.md                      ← 읽기 전용
Olympus_PRD_Plan.md            ← 읽기 전용
Olympus_Harness.md             ← 읽기 전용
```

---

## 5. 구현 명세

### 5.1 router-core/a2a-guard.js

SKILLS.md 섹션 7 패턴을 그대로 따른다.
**검증 순서를 반드시 지킨다 (순서 위반 = T5.6 실패).**

```javascript
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
  //    합의가 끝났으면 한도와 무관하게 정상 종료
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
  if (payload._source_url && !payload._source_url.startsWith(registryUrl))
    throw new A2AError('A2A_SPOOF_DETECTED');

  return counts;   // 갱신된 speaker_counts 반환
}

function resolveTargets(callerId, requested) {
  const caller = registry.getAgent(callerId);
  const allowed = caller.a2a.allowed_targets;
  const resolved = allowed === '*'
    ? registry.getAllIds().filter(id => id !== callerId)
    : allowed;
  const bad = requested.filter(t => !resolved.includes(t));
  if (bad.length) throw new A2AError('A2A_UNAUTHORIZED');
}
```

### 5.2 router-core/olympus-router.js 수정

A2A 가드 연동:
```javascript
import { validateA2A, A2AResolved } from './a2a-guard.js';

export async function route(envelope) {
  const { context_key, routing, payload } = envelope;
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
    if (!registry.exists(id)) throw new Error(`UNKNOWN_AGENT: ${id}`);
  }

  // 병렬 디스패치 (기존 유지)
  ...
}
```

---

## 6. Exit Criteria (16개)

```
[ ] T5.1:  SINGLE zeus→hera → 즉시 종료, speaker_counts 1
[ ] T5.2:  SINGLE 연쇄 11회 → A2A_SPEAKER_LIMIT_EXCEEDED (10까지만)
[ ] T5.3:  3기 DIALOGUE 각자 10회 발화 보장 (라운드 10 도달)
[ ] T5.4:  DIALOGUE 11라운드 → A2A_ROUND_LIMIT_EXCEEDED
[ ] T5.5:  DIALOGUE resolved → 조기종료 (라운드·발화 한도 전)
[ ] T5.6:  resolved가 라운드·발화보다 먼저 체크됨 확인
           (round=10, speaker=10 동시 도달 + resolved → EARLY_TERMINATION)
[ ] T5.7:  can_initiate:false → A2A_INITIATION_DENIED
[ ] T5.8:  allowed_targets 위반 → A2A_UNAUTHORIZED
[ ] T5.9:  자기호출 → A2A_SELF_CALL
[ ] T5.10: telegram→slack A2A → A2A_CROSS_PLATFORM_DENIED
[ ] T5.11: cc 에이전트 A2A 개시 → 차단 (can_initiate:false와 동일)
[ ] T5.12: 위조 caller → A2A_SPOOF_DETECTED
[ ] T5.13: DIALOGUE 중간 라운드 → SPACE만 기록, Mem0 미기록
           (persona_key가 중간 라운드 응답에 없음)
[ ] T5.14: DIALOGUE resolved → 최종만 Mem0 기록
           (persona_key가 resolved 응답에만 있음)
[ ] T5.15: cc가 DIALOGUE 매 라운드 청취 (is_cc_only:true 확인)
[ ] T5.16: 모드 미지정 → 기본값 single 적용
```

---

## 7. 자가 검증

```bash
node --test harness/tests/phase5.test.js
```

---

## 8. 완료 보고 형식

```
[Phase 5 완료 보고]
생성: router-core/a2a-guard.js
      harness/tests/phase5.test.js
수정: router-core/olympus-router.js

Exit Criteria:
  T5.1  ✅  T5.2  ✅  T5.3  ✅  T5.4  ✅
  T5.5  ✅  T5.6  ✅  T5.7  ✅  T5.8  ✅
  T5.9  ✅  T5.10 ✅  T5.11 ✅  T5.12 ✅
  T5.13 ✅  T5.14 ✅  T5.15 ✅  T5.16 ✅

상태: 전체 통과
다음 액션: Phase 6 AGENT.md를 제공해 주십시오. 대기합니다.
```

---

## 9. 이 파일에 대한 최종 확인

```
□ 나는 AGENT.md를 수정하지 않는다
□ 나는 블랙리스트 파일을 생성하지 않는다
□ 나는 파일 생성 전 목록을 보고하고 승인을 받는다
□ 나는 T5.16 통과 후 즉시 멈추고 다음 지시를 기다린다
□ 나는 검증 순서를 지킨다 (resolved 최우선)
□ 나는 발화자 한도를 단일 증가 지점에서만 올린다
□ 나는 자기 승인을 하지 않는다
```
