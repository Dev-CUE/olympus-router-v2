# AGENT.md — 현재 작업 지시서 (Phase 3)

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
T3.9 통과 확인 즉시:
  1. 테스트 결과를 보고한다
  2. 완전히 멈춘다
  3. "Phase 4 AGENT.md를 제공해 주십시오"라고 요청한다
  4. 다음 AGENT.md가 제공될 때까지 코드 작업을 하지 않는다
```

---

## 1. 너의 역할

Olympus Router의 **유니버셜 스마트 어댑터** 담당.
플랫폼별(Telegram/Slack/Discord) 이벤트를 표준 Ingress Envelope로 변환하고, Egress 결과를 플랫폼에 맞게 렌더링한다.

---

## 2. 불변 원칙 요약

1. **Smart Edge**: 텍스트 파싱·@멘션 감지·context_key 생성은 어댑터 책임.
2. **Zero Hardcoding**: 어댑터 코드에 에이전트 이름(zeus/hera/athena) 직접 금지. registry 동적 조회만.
3. **persona_key**: 반드시 `{agent_id}` — 플랫폼 prefix 절대 금지. (`telegram:zeus` ❌ → `zeus` ✅)
4. **Dumb Pipe 유지**: 라우터 코어(olympus-router.js)는 건드리지 않는다.

---

## 3. 작업 범위 (화이트리스트)

```
생성:
  adapters/telegram-adapter.js
  adapters/slack-adapter.js
  adapters/discord-adapter.js
  harness/tests/phase3.test.js
```

---

## 4. 절대 생성/수정 금지 (블랙리스트)

```
router-core/olympus-router.js  ← Phase 1~2 완성, 건드리지 마
router-core/a2a-guard.js       ← Phase 5 전용
registry/                      ← Phase 1 완성
config/agents.yaml             ← Phase 1 완성
harness/tests/phase1.test.js   ← 건드리지 마
harness/tests/phase2.test.js   ← 건드리지 마
harness/tests/phase4~7.test.js ← 해당 Phase 전용
AGENT.md                       ← 읽기 전용 (절대 수정 금지)
CLAUDE.md                      ← 읽기 전용
SKILLS.md                      ← 읽기 전용
Olympus_PRD_Plan.md            ← 읽기 전용
Olympus_Harness.md             ← 읽기 전용
```

---

## 5. 구현 명세

### 5.1 context_key 생성 규칙 (SKILLS.md §4 그대로)

```
platform:space_type:space_id:topic_or_thread_id

topic/thread 없으면 → "root"

Telegram:
  DM:           telegram:dm:{chat_id}:root
  일반 그룹:    telegram:group:{chat_id}:root
  포럼 토픽:    telegram:forum:{chat_id}:{message_thread_id}
                (General Topic = thread_id 1 → root 정규화)
                ※ 포럼 응답 시 message_thread_id 필수

Slack:
  DM:           slack:dm:{channel_id}:root
  채널:         slack:channel:{channel_id}:root
  채널 스레드:  slack:channel:{channel_id}:{thread_ts}

Discord:
  일반 채널:    discord:channel:{channel_id}:root
  포럼/스레드:  discord:forum:{parent_id}:{thread_id}
```

### 5.2 라우팅 규칙

| 상황 | to | cc |
|------|----|----|
| DM | [이 봇의 agentId 1기] | [] |
| 그룹 @멘션 있음 | 멘션된 agent 목록 | 방의 나머지 전원 |
| 그룹 멘션 없음 | [] | 전원 |

@멘션 파싱: `/@(\w+)/g` 패턴으로 추출 → `registry.getAllIds()`와 대조. **이름 하드코딩 금지.**

### 5.3 memory_scope

```javascript
// to 에이전트
{ space_key: context_key, persona_key: id }  // id = 순수 agent_id

// cc 에이전트
{ space_key: context_key, persona_key: null }  // 인격 미기록
```

> ❌ `persona_key: \`telegram:${id}\`` — 절대 금지
> ✅ `persona_key: id` — 플랫폼 prefix 없음

### 5.4 activities 이모지 렌더링

```javascript
const ACTIVITY_EMOJI = {
  terminal:   '🖥️',
  write_file: '📄',
  read_file:  '📖',
  web_search: '🔍',
  api_call:   '🔗',
  mock:       '🤖'
};
// 미정의 tool → '⚙️'
// 출력 형식: "🖥️ terminal: kubectl get pods"
```

### 5.5 어댑터 구조 (3개 공통 패턴)

```javascript
// adapters/{platform}-adapter.js
import registry from '../registry/agent-registry.js';

export function buildEnvelope(platformEvent) {
  const context_key = buildContextKey(platformEvent);
  const { to, cc } = resolveRouting(platformEvent, context_key);

  return {
    context_key,
    routing: { to, cc },
    memory_scope: {
      space_key: context_key,
      persona_key: to[0] ?? null   // 플랫폼 prefix 없는 순수 agent_id
    },
    payload: {
      origin_platform: '{platform}',
      text: extractText(platformEvent),
      raw: platformEvent
    },
    a2a: { enabled: false },
    idempotency_key: buildIdempotencyKey(platformEvent)
  };
}

export function renderActivities(activities = []) {
  return activities.map(a => {
    const emoji = ACTIVITY_EMOJI[a.tool] ?? '⚙️';
    return `${emoji} ${a.tool}: ${a.detail}`;
  }).join('\n');
}
```

---

## 6. Exit Criteria

```
[ ] T3.1: 텔레그램 DM → context_key=telegram:dm:...:root, to=[봇agentId], cc=[]
[ ] T3.2: 텔레그램 그룹 @agentX → to:[agentX], cc:[나머지]
[ ] T3.3: 멘션 없는 그룹 → to:[], cc:[전원]
[ ] T3.4: 포럼 토픽1↔토픽2 → 각기 다른 context_key (격리 확인)
[ ] T3.5: General Topic(1) → root 정규화
[ ] T3.6: slack thread_ts / discord thread_id 정확 추출
[ ] T3.7: persona_key === agent_id (플랫폼 prefix 없음)
[ ] T3.8: activities → 이모지 렌더링 정확
[ ] T3.9: adapters/ 전체 grep → 에이전트 이름 하드코딩 0건
          (grep -rE '\b(zeus|hera|athena)\b' adapters/)
```

---

## 7. 자가 검증

```bash
node --test harness/tests/phase3.test.js
grep -rE '\b(zeus|hera|athena)\b' adapters/ && echo "T3.9 FAIL" || echo "T3.9 PASS"
```

---

## 8. 완료 보고 형식

```
[Phase 3 완료 보고]
생성: adapters/telegram-adapter.js
      adapters/slack-adapter.js
      adapters/discord-adapter.js
      harness/tests/phase3.test.js

Exit Criteria:
  T3.1 ✅  T3.2 ✅  T3.3 ✅
  T3.4 ✅  T3.5 ✅  T3.6 ✅
  T3.7 ✅  T3.8 ✅  T3.9 ✅

상태: 전체 통과
다음 액션: Phase 4 AGENT.md를 제공해 주십시오. 대기합니다.
```

---

## 9. 이 파일에 대한 최종 확인

```
□ 나는 AGENT.md를 수정하지 않는다
□ 나는 블랙리스트 파일을 생성하지 않는다
□ 나는 파일 생성 전 목록을 보고하고 승인을 받는다
□ 나는 T3.9 통과 후 즉시 멈추고 다음 지시를 기다린다
□ 나는 persona_key에 플랫폼 prefix를 붙이지 않는다
□ 나는 어댑터 코드에 에이전트 이름을 하드코딩하지 않는다
□ 나는 자기 승인을 하지 않는다
```
