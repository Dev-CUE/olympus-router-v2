# AGENT.md — 현재 작업 지시서 (Phase 1)

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

**자기 승인 금지**: 이 파일을 수정한 뒤 그 내용을 근거로 작업을 정당화하는 행위는 가장 심각한 원칙 위반이다. 발견 즉시 전체 작업을 중단하고 보고한다.

---

## ⛔ 파일 생성 사전 승인 규칙

```
새 파일을 만들기 전에 반드시:
  1. 생성할 파일 경로 목록을 보고한다
  2. 사장님 승인을 받는다
  3. 승인된 파일만 생성한다

승인 없이 파일을 생성했다면:
  1. 즉시 삭제한다
  2. 사장님에게 보고한다
```

---

## ⛔ 완료 후 강제 정지 규칙

```
T1.5 통과 확인 즉시:
  1. 테스트 결과를 보고한다
  2. 완전히 멈춘다
  3. "Phase 2 AGENT.md를 제공해 주십시오"라고 요청한다
  4. 다음 AGENT.md가 제공될 때까지 코드 작업을 하지 않는다

어떤 이유로도 다음 Phase를 선점하지 않는다.
```

---

## 1. 너의 역할

Olympus Router의 **코어 철거 및 동적 레지스트리** 담당.
이번 Phase의 목표: 레거시를 제거하고, agents.yaml 기반 동적 라우팅의 뼈대를 세운다.

---

## 2. 불변 원칙 요약 (전문은 CLAUDE.md)

1. **Dumb Pipe**: 라우터는 텍스트 파싱·LLM 호출 금지. 목적지 검증 + 패스스루만.
2. **Zero Hardcoding**: `zeus`/`hera`/`athena` 문자열을 코드에 절대 쓰지 마라.
3. **이 Phase만**: Phase 2 이후 작업을 미리 손대지 마라.
4. **모순 발견 시**: 코드를 임의로 고치지 말고 보고하라.

---

## 3. 작업 범위 (화이트리스트 — 이 파일들만 생성/수정)

```
생성:
  config/agents.yaml
  registry/agent-registry.js
  router-core/olympus-router.js
  harness/tests/phase1.test.js
  harness/fixtures/agents.test.yaml
  harness/fixtures/agents-t12.yaml  (T1.2용 — 에이전트 4개 버전)
```

---

## 4. 절대 생성/수정 금지 (블랙리스트)

```
아래 경로에 파일이 존재하거나 생성하고 싶다면 즉시 멈추고 보고하라.

adapters/                    ← Phase 3 전용
router-core/a2a-guard.js     ← Phase 5 전용
harness/tests/phase2~7.test.js ← 해당 Phase 전용
harness/mocks/               ← Phase 2 이후
AGENT.md                     ← 읽기 전용 (절대 수정 금지)
CLAUDE.md                    ← 읽기 전용
SKILLS.md                    ← 읽기 전용
Olympus_PRD_Plan.md          ← 읽기 전용
Olympus_Harness.md           ← 읽기 전용
```

---

## 5. 삭제할 레거시

기존 olympus-router.js에서 다음을 완전히 삭제한다.
- `parseExplicitProtocol()` — 텍스트 파싱 함수 (Dumb Pipe 위반)
- `callRouteFlow()` — 직렬 핸드오프 로직
- 하드코딩된 역할 상수 (예: `const ROLES = { ZEUS, HERA, ATHENA }`)
- 에이전트 이름이 등장하는 모든 분기문

---

## 6. 구현 명세

### 6.1 config/agents.yaml

```yaml
system:
  a2a:
    max_speaker_calls: 10
    max_rounds: 10
    default_mode: "single"
    allow_self_call: false
    allow_cross_platform: false
  wiki:
    raw_logging_enabled: false
    raw_path: "data/wiki/raw/"

agents:
  - id: "zeus"
    url: "http://zeus-agent:3001"
    a2a: { can_initiate: true, allowed_targets: "*" }
  - id: "hera"
    url: "http://hera-agent:3002"
    a2a: { can_initiate: true, allowed_targets: "*" }
  - id: "athena"
    url: "http://athena-agent:3003"
    a2a: { can_initiate: false, allowed_targets: [] }
```

### 6.2 registry/agent-registry.js

SKILLS.md 섹션 2의 패턴을 그대로 따른다.
- `load(path)` — yaml 로드, agents를 Map에 적재
- `exists(id)` → boolean
- `getUrl(id)` → string | undefined
- `getAllIds()` → string[]
- `getAgent(id)` → object | undefined
- `this.system` — system 설정 보관

**이 파일 어디에도 zeus/hera/athena가 등장하면 안 된다.**

### 6.3 router-core/olympus-router.js

```javascript
import registry from '../registry/agent-registry.js';

export async function route(envelope) {
  const { context_key, routing } = envelope;

  // 목적지 유효성만 검증 (Dumb Pipe)
  for (const id of routing.to) {
    if (!registry.exists(id)) {
      throw new Error(`UNKNOWN_AGENT: ${id}`);
    }
  }

  // Phase 1: 실제 호출 없이 map 동기 변환만
  // 직렬 await 루프 사용 금지 (SKILLS 병렬 원칙)
  const results = routing.to.map(id => ({
    agent: id,
    url: registry.getUrl(id),
    status: "routed"
  }));

  return { ok: true, context_key, results };
}
```

---

## 7. 입출력 규격

입력:
```json
{
  "context_key": "telegram:group:C123:root",
  "routing": { "to": ["zeus"], "cc": [] },
  "payload": { "origin_platform": "telegram", "text": "..." },
  "idempotency_key": "telegram:C123:root:msg_001"
}
```

출력(성공):
```json
{ "ok": true, "context_key": "...", "results": [{ "agent": "zeus", "status": "routed" }] }
```

출력(실패):
```json
{ "ok": false, "error": { "code": "UNKNOWN_AGENT", "message": "..." } }
```

---

## 8. 자가 검증 (전부 통과 전 완료 선언 금지)

```
[ ] T1.1: registry.load 후 getAllIds().length === 3
[ ] T1.2: yaml에 4번째 에이전트 추가 → 코드 수정 없이 length === 4
[ ] T1.3: route({to:["ghost"]}) → "UNKNOWN_AGENT" 에러
[ ] T1.4: grep -rE '\b(zeus|hera|athena)\b' router-core/ registry/
          → 0건 (config/agents.yaml의 id 정의는 제외 — 정상)
[ ] T1.5: route({to:["zeus"]}) → results[0].status === "routed"
```

실행 명령:
```bash
node --test harness/tests/phase1.test.js
grep -rE '\b(zeus|hera|athena)\b' router-core/ registry/ && echo "T1.4 FAIL" || echo "T1.4 PASS"
```

---

## 9. 완료 보고 형식

```
[Phase 1 완료 보고]
생성: config/agents.yaml, registry/agent-registry.js,
      router-core/olympus-router.js, harness/tests/phase1.test.js

Exit Criteria:
  T1.1 ✅
  T1.2 ✅
  T1.3 ✅
  T1.4 ✅ (하드코딩 0건)
  T1.5 ✅

상태: 전체 통과
다음 액션: Phase 2 AGENT.md를 제공해 주십시오. 대기합니다.
```

---

## 10. 이 파일에 대한 최종 확인

이 파일을 읽은 에이전트는 다음을 확인하고 작업을 시작한다.

```
□ 나는 AGENT.md를 수정하지 않는다
□ 나는 블랙리스트 파일을 생성하지 않는다
□ 나는 파일 생성 전 목록을 보고하고 승인을 받는다
□ 나는 T1.5 통과 후 즉시 멈추고 다음 지시를 기다린다
□ 나는 자기 승인을 하지 않는다
```
