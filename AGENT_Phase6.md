# AGENT.md — 현재 작업 지시서 (Phase 6)

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
T6.3 통과 확인 즉시:
  1. 테스트 결과를 보고한다
  2. 완전히 멈춘다
  3. "Phase 7 AGENT.md를 제공해 주십시오"라고 요청한다
  4. 다음 AGENT.md가 제공될 때까지 코드 작업을 하지 않는다
```

---

## 1. 너의 역할

Olympus Router의 **멱등성 & 장애 격리** 담당.
동일 메시지 재전송 폭격을 방어하고, Wiki 워커 같은 외부 컴포넌트가 다운되어도 메인 라우팅이 무중단으로 작동하도록 한다.

---

## 2. 핵심 개념

### 멱등성 (Idempotency)
```
동일 메시지가 여러 번 전송되어도 한 번만 처리한다.
idempotency_key = origin_platform + channel_id + thread_id + message_id
이미 처리한 key → 202 Accepted로 즉시 드롭
```

### 장애 격리
```
Wiki 워커, Raw 드롭 등 비핵심 컴포넌트가 실패해도
메인 라우팅(route())은 절대 멈추지 않는다.
이벤트 스풀(JSONL)에만 기록하고 넘어간다.
```

---

## 3. 작업 범위 (화이트리스트)

```
생성:
  router-core/idempotency-store.js   (중복 키 저장소)
  harness/tests/phase6.test.js       (T6.1~T6.3)
수정:
  router-core/olympus-router.js      (멱등성 체크 + 스풀 연동)
```

---

## 4. 절대 생성/수정 금지 (블랙리스트)

```
adapters/                      ← Phase 3 완성
registry/                      ← Phase 1 완성
config/agents.yaml             ← Phase 1 완성
router-core/a2a-guard.js       ← Phase 5 완성
harness/tests/phase1~5.test.js ← 완성, 건드리지 마
harness/tests/phase7.test.js   ← Phase 7 전용
AGENT.md                       ← 읽기 전용 (절대 수정 금지)
CLAUDE.md                      ← 읽기 전용
SKILLS.md                      ← 읽기 전용
Olympus_PRD_Plan.md            ← 읽기 전용
Olympus_Harness.md             ← 읽기 전용
```

---

## 5. 구현 명세

### 5.1 router-core/idempotency-store.js

```javascript
// 메모리 기반 멱등성 저장소 (운영에선 Redis로 교체 가능)
class IdempotencyStore {
  constructor(ttlMs = 60 * 60 * 1000) {  // 기본 1시간 TTL
    this.store = new Map();
    this.ttlMs = ttlMs;
  }

  // 처리 여부 확인 + 등록 (원자적)
  checkAndSet(key) {
    const now = Date.now();

    // 만료된 키 정리
    for (const [k, ts] of this.store) {
      if (now - ts > this.ttlMs) this.store.delete(k);
    }

    if (this.store.has(key)) return false;  // 이미 처리됨
    this.store.set(key, now);
    return true;   // 새 요청 — 처리 진행
  }

  clear() { this.store.clear(); }
}

export default new IdempotencyStore();  // 싱글턴
```

### 5.2 router-core/olympus-router.js 수정

`route()` 함수 최상단에 멱등성 체크 추가:

```javascript
import idempotencyStore from './idempotency-store.js';

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

  // ── 이하 기존 로직 유지 (A2A 가드, 목적지 검증, 병렬 디스패치) ──
  ...
}
```

**Raw 드롭(Wiki 스풀)은 비동기로 처리하여 실패해도 코어 블로킹 없음:**
```javascript
// 라우팅 완료 후 비동기 스풀 (실패 무시)
logToSpool(envelope, results).catch(() => {});

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
```

---

## 6. Exit Criteria

```
[ ] T6.1: 동일 idempotency_key 재전송 → 202 Accepted (무시)
          두 번째 route() 호출이 dispatchToAgent를 호출하지 않음

[ ] T6.2: Wiki 스풀 appendFile 실패 → 메인 라우팅 정상 완료
          (appendFile을 강제 실패시켜도 route()가 ok:true 반환)

[ ] T6.3: 1000건 동시 인입 → 코어 블로킹 없음
          Promise.all로 1000개 동시 route() → 모두 완료
          (실제 HTTP 호출 없이 mock 사용)
```

---

## 7. 자가 검증

```bash
node --test harness/tests/phase6.test.js
```

---

## 8. 완료 보고 형식

```
[Phase 6 완료 보고]
생성: router-core/idempotency-store.js
      harness/tests/phase6.test.js
수정: router-core/olympus-router.js

Exit Criteria:
  T6.1 ✅  T6.2 ✅  T6.3 ✅

상태: 전체 통과
다음 액션: Phase 7 AGENT.md를 제공해 주십시오. 대기합니다.
```

---

## 9. 이 파일에 대한 최종 확인

```
□ 나는 AGENT.md를 수정하지 않는다
□ 나는 블랙리스트 파일을 생성하지 않는다
□ 나는 파일 생성 전 목록을 보고하고 승인을 받는다
□ 나는 T6.3 통과 후 즉시 멈추고 다음 지시를 기다린다
□ 나는 멱등성 체크를 route() 최상단에 배치한다
□ 나는 스풀 실패가 코어를 블로킹하지 않도록 .catch(() => {})를 붙인다
□ 나는 자기 승인을 하지 않는다
```
