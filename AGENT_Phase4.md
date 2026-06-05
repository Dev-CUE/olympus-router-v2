# AGENT.md — 현재 작업 지시서 (Phase 4)

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
T4.5 통과 확인 즉시:
  1. 테스트 결과를 보고한다
  2. 완전히 멈춘다
  3. "Phase 5 AGENT.md를 제공해 주십시오"라고 요청한다
  4. 다음 AGENT.md가 제공될 때까지 코드 작업을 하지 않는다
```

---

## 1. 너의 역할

Olympus Router의 **메모리 스코프 주입** 담당.
라우터가 `memory_scope`를 에이전트에 올바르게 주입하고, 3축 격리 원칙이 실제로 작동하는지 검증한다.

---

## 2. 3축 격리 원칙 (반드시 숙지)

```
축1 MESSAGE  → context_key 기준 완전 격리 (방마다 다른 space_key)
축2 PERSONA  → agent_id 기준 플랫폼 초월 공유 (Mem0, 플랫폼 prefix 없음)
축3 KNOWLEDGE→ Obsidian 공용 (라우터 무관, 이번 Phase 비범위)

핵심:
  to  에이전트: memory_scope = { space_key: context_key, persona_key: agent_id }
  cc  에이전트: memory_scope = { space_key: context_key, persona_key: null }
                                                          ↑ null = Mem0 미기록
```

---

## 3. 작업 범위 (화이트리스트)

```
수정:
  router-core/olympus-router.js   (memory_scope 주입 추가)
생성:
  harness/tests/phase4.test.js
```

---

## 4. 절대 생성/수정 금지 (블랙리스트)

```
adapters/                      ← Phase 3 완성, 건드리지 마
registry/                      ← Phase 1 완성
config/agents.yaml             ← Phase 1 완성
router-core/a2a-guard.js       ← Phase 5 전용
harness/tests/phase1~3.test.js ← 완성, 건드리지 마
harness/tests/phase5~7.test.js ← 해당 Phase 전용
AGENT.md                       ← 읽기 전용 (절대 수정 금지)
CLAUDE.md                      ← 읽기 전용
SKILLS.md                      ← 읽기 전용
Olympus_PRD_Plan.md            ← 읽기 전용
Olympus_Harness.md             ← 읽기 전용
```

---

## 5. 구현 명세

### 5.1 router-core/olympus-router.js 수정

`route()` 함수에서 `to` 에이전트 디스패치 시 `memory_scope`를 엔벨롭에 주입한다.

```javascript
// to 에이전트: space_key + persona_key 둘 다
const toEnvelope = {
  ...envelope,
  memory_scope: {
    space_key: context_key,           // MESSAGE 격리축
    persona_key: id                   // PERSONA 공유축 (플랫폼 prefix 없음)
  },
  mode: 'respond'
};

// cc 에이전트: space_key만, persona_key는 null (Mem0 미기록)
const ccEnvelope = {
  ...envelope,
  memory_scope: {
    space_key: context_key,
    persona_key: null                 // null = 인격 미기록
  },
  is_cc_only: true,
  mode: 'listen_only'
};
```

> 라우터는 memory_scope의 키만 주입한다. 실제 Mem0 조회/기록은 에이전트가 수행(Dumb Pipe 유지).

### 5.2 검증 방식

실제 Mem0 연동 없이 **라우터가 올바른 memory_scope를 주입하는지** mock으로 검증한다.

```javascript
// mock 에이전트가 수신한 envelope의 memory_scope를 캡처해 검증
assert.strictEqual(received.memory_scope.persona_key, agentId);    // to: agent_id
assert.strictEqual(ccReceived.memory_scope.persona_key, null);     // cc: null
assert.strictEqual(received.memory_scope.space_key, context_key);  // space_key 일치
```

---

## 6. Exit Criteria

```
[ ] T4.1: 그룹A와 그룹B의 space_key가 다름 (MESSAGE 격리)
          → context_key가 다른 두 요청의 memory_scope.space_key가 각각 다름

[ ] T4.2: 슬랙과 텔레그램 동일 에이전트의 persona_key가 동일
          → slack:channel:C1:root 요청과 telegram:group:C2:root 요청 모두
             memory_scope.persona_key === agent_id (플랫폼 prefix 없음)

[ ] T4.3: 텔레그램 대화 로그가 슬랙 space_key로 새지 않음
          → 두 요청의 memory_scope.space_key가 서로 다름

[ ] T4.4: persona_key 형식 = agent_id (플랫폼 prefix 없음)
          → memory_scope.persona_key에 ":" 포함 여부 검사
          → "telegram:agentA" ❌  "agentA" ✅

[ ] T4.5: cc 에이전트의 memory_scope.persona_key === null
          → cc로 전달된 엔벨롭의 persona_key가 null임을 확인
```

---

## 7. 자가 검증

```bash
node --test harness/tests/phase4.test.js
```

---

## 8. 완료 보고 형식

```
[Phase 4 완료 보고]
수정: router-core/olympus-router.js (memory_scope 주입)
생성: harness/tests/phase4.test.js

Exit Criteria:
  T4.1 ✅  T4.2 ✅  T4.3 ✅
  T4.4 ✅  T4.5 ✅

상태: 전체 통과
다음 액션: Phase 5 AGENT.md를 제공해 주십시오. 대기합니다.
```

---

## 9. 이 파일에 대한 최종 확인

```
□ 나는 AGENT.md를 수정하지 않는다
□ 나는 블랙리스트 파일을 생성하지 않는다
□ 나는 파일 생성 전 목록을 보고하고 승인을 받는다
□ 나는 T4.5 통과 후 즉시 멈추고 다음 지시를 기다린다
□ 나는 to의 persona_key에 플랫폼 prefix를 붙이지 않는다
□ 나는 cc의 persona_key를 null로 설정한다
□ 나는 자기 승인을 하지 않는다
```
