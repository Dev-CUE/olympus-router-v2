# Olympus_Harness.md — 테스트 하네스 명세

> 코딩 에이전트가 **스스로 구현을 검증**하기 위한 테스트 골격. PRD의 Exit Criteria를 node:test로 실행 가능한 형태로 매핑한다.
> 에이전트는 각 Phase 구현 후 해당 테스트를 직접 실행하고 통과율을 보고해야 한다.
> **정합 기준: Olympus_PRD_Plan.md v6.8** (Phase 8~10 매핑 추가)

---

## 0. 하네스 사용 지침 (에이전트용)

1. 각 Phase 구현 직후, 해당 Phase 테스트를 `node --test harness/tests/phaseN.test.js`로 실행한다.
   (Windows + Node v24에서 디렉터리 인자는 MODULE_NOT_FOUND로 실패하므로 glob 사용: `node --test harness/tests/*.test.js`)
2. 100% 통과하지 못하면 "Phase 완료"를 선언하지 않는다.
3. 실패 시: 원인을 기술하고 재수정 → 재실행. PRD와 모순이면 코드를 고치지 말고 보고.
4. mock은 실제 에이전트 없이도 라우터/어댑터를 검증하기 위한 가짜 컴포넌트다.
5. **mock 통과 ≠ 완료.** 실제 에이전트 왕복 검증이 필요한 항목(T10.10 등)은 mock 통과만으로 완료로 보지 않는다.

---

## 1. 하네스 목표 & 비범위

**목표**: PRD의 모든 Exit Criteria를 재현 가능하게 자동 검증.
**비범위**: 실제 LLM 추론, 실제 Mem0/Obsidian/Gemini 연동(이들은 mock 또는 호출 여부만 검증).

---

## 2. 디렉터리 구조

```
harness/
├── tests/
│   ├── phase1.test.js   # T1.x
│   ├── phase2.test.js   # T2.x
│   ├── phase3.test.js   # T3.x
│   ├── phase4.test.js   # T4.x
│   ├── phase5.test.js   # T5.x
│   ├── phase6.test.js   # T6.x
│   ├── phase7.test.js   # T7.x
│   ├── phase8.test.js   # T5.17~T5.22 (Agora 동기화)   [v6.8 미구현]
│   ├── phase9.test.js   # T9.x (다중 사용자·Admin)       [v6.8 미구현]
│   ├── phase10.test.js  # T10.x (Pull 통신·보안)         [v6.8 미구현]
│   └── e2e.test.js      # E1~E8
├── mocks/
│   ├── mock-agent.js    # 설정 가능한 가짜 에이전트
│   └── mock-adapter.js  # 엔벨롭 주입기
└── fixtures/
    ├── agents.test.yaml # 테스트용 에이전트 정의
    └── envelopes/       # 시나리오별 입력 JSON
```

---

## 3. Mock 컴포넌트 명세

### 3.1 mock-agent — 행동 설정형 (Zero Hardcoding 준수)

에이전트 이름이 아니라 **behavior**로 정의한다. 어떤 id를 줘도 동작한다.

```javascript
// harness/mocks/mock-agent.js
export function createMockAgent(behavior = {}) {
  const {
    delayMs = 0,            // 응답 지연 (타임아웃 테스트용)
    fail = false,           // 강제 실패 (장애 격리 테스트용)
    a2aInitiate = null,     // { to, mode } — A2A 개시 시뮬레이션
    resolveAtRound = null,  // 이 라운드에서 resolved 반환
    response = "ok"
  } = behavior;

  return async function handleInvoke(envelope) {
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    if (fail) throw new Error("mock failure");

    const round = envelope.a2a?.round ?? 0;
    const a2a_status =
      (resolveAtRound && round >= resolveAtRound) ? "resolved" : "continue";

    return {
      status: "success",
      response_text: response,
      a2a_status,
      activities: [{ tool: "mock", detail: "executed" }]
    };
  };
}
```

> v6.8 pull 모델 mock: 위 handleInvoke를 "폴링으로 받은 일감을 처리하고 /result로 제출"하는 폴링 루프로 감싸 검증한다(phase10 전용 mock-poller).

### 3.2 mock-adapter — 엔벨롭 주입기

```javascript
// harness/mocks/mock-adapter.js
export function buildEnvelope(overrides = {}) {
  return {
    context_key: "telegram:group:CTEST:root",
    routing: { to: ["agentA"], cc: [] },
    memory_scope: { space_key: "telegram:group:CTEST:root", persona_key: "agentA" },
    payload: { origin_platform: "telegram", text: "test", user_id: "u_test" },
    a2a: { enabled: false },
    idempotency_key: `telegram:CTEST:root:msg_${Date.now()}`,
    ...overrides
  };
}
```

### 3.3 fixtures/agents.test.yaml

```yaml
system:
  a2a:
    max_speaker_calls: 10
    max_rounds: 10
    default_mode: "single"
    allow_self_call: false
    allow_cross_platform: false
    session_ttl_ms: 3600000
  poll:
    long_poll_timeout_ms: 1000     # 테스트는 짧게
    job_queue_ttl_ms: 5000
  wiki:
    raw_logging_enabled: true
    raw_path: "harness/tmp/raw/"

agents:
  - id: "agentA"
    url: "http://localhost:9101"
    a2a: { can_initiate: true,  allowed_targets: "*" }
  - id: "agentB"
    url: "http://localhost:9102"
    a2a: { can_initiate: true,  allowed_targets: "*" }
  - id: "agentC"
    url: "http://localhost:9103"
    a2a: { can_initiate: false, allowed_targets: [] }
```

> 테스트도 Zero Hardcoding을 지킨다. 코드가 아닌 yaml에서 agentA/B/C를 정의한다.
> v6.8: 등록 토큰은 yaml이 아닌 env로 주입(테스트는 `OLYMPUS_AGENT_TOKEN_AGENTA` 등 설정).

---

## 4. Phase별 테스트 매핑

### Phase 1 (phase1.test.js)
| 테스트 | 검증 내용 | 어서션 |
|--------|-----------|--------|
| T1.1 | yaml 3기 로드 | `getAllIds().length === 3` |
| T1.2 | 4번째 추가 시 코드 무수정 4개 | yaml만 바꿔 4 확인 |
| T1.3 | 미존재 to 거부 | `rejects /UNKNOWN_AGENT/` |
| T1.4 | 하드코딩 0건 | `grep` 결과 0 (셸 보조) |
| T1.5 | 유효 to 패스스루 | mock URL 호출 확인 |

### Phase 2 (phase2.test.js)
> ⚠️ v6.8: Phase 2는 push 병렬 디스패치 전제. Phase 10(pull) 구현 시 일부 테스트가 큐 적재 계약으로 바뀐다. 충돌 건은 1회성 수정 허용(before/after 보고 필수).

| 테스트 | 검증 |
|--------|------|
| T2.1 | `to:[A,B,C]` 병렬 → 총시간 ≈ max(개별) |
| T2.2 | A delayMs=무한/fail → B,C success |
| T2.3 | cc 응답 대기 없이 즉시 반환 |
| T2.4 | cc fail → 메인 영향 0 |
| T2.5 | 실패 status:error, 성공 status:success 매핑 |

### Phase 3 (phase3.test.js)
| 테스트 | 검증 |
|--------|------|
| T3.1 | DM → space_type=dm, to=봇1기 |
| T3.2 | 그룹 @멘션 → to/cc 분리 |
| T3.3 | 멘션 없음 → to:[], 전원 cc |
| T3.4 | 포럼 토픽1↔2 context_key 격리 |
| T3.5 | General Topic(1) → root |
| T3.6 | slack thread_ts / discord thread_id 추출 |
| T3.7 | persona_key === agent_id (플랫폼 prefix 없음) |
| T3.8 | activities → 이모지 렌더 |
| T3.9 | 어댑터 하드코딩 0건 |

### Phase 4 (phase4.test.js)
| 테스트 | 검증 |
|--------|------|
| T4.1 | 그룹A↔B raw 로그 미노출 (space_key 다름) |
| T4.2 | persona_key 동일 → 기억 공유 확인 |
| T4.3 | space_key 다름 → 로그 격리 확인 |
| T4.4 | persona_key 형식 = agent_id |
| T4.5 | cc → persona_key:null |

### Phase 5 (phase5.test.js) — 가장 중요
| 테스트 | 검증 |
|--------|------|
| T5.1 | SINGLE → 즉시 종료, speaker_counts 1 |
| T5.2 | SINGLE 연쇄 11회 → SPEAKER_LIMIT |
| T5.3 | 3기 DIALOGUE 각자 10회 → 10라운드 도달 |
| T5.4 | 11라운드 → ROUND_LIMIT |
| T5.5 | resolveAtRound=3 → 조기종료 |
| T5.6 | resolved가 라운드·발화보다 먼저 체크 |
| T5.7 | can_initiate:false(agentC) → INITIATION_DENIED |
| T5.8 | allowed_targets 위반 → UNAUTHORIZED |
| T5.9 | 자기호출 → SELF_CALL |
| T5.10 | telegram→slack → CROSS_PLATFORM_DENIED |
| T5.11 | cc A2A 개시 → 차단 |
| T5.12 | 위조 caller → 스푸핑 실패 |
| T5.13 | 중간 라운드 → SPACE만, Mem0 미기록 |
| T5.14 | resolved → 최종만 Mem0 기록 |
| T5.15 | cc 매 라운드 청취, 게시·기록 없음 |
| T5.16 | 모드 미지정 → single 기본값 |

### Phase 6 (phase6.test.js)
| 테스트 | 검증 |
|--------|------|
| T6.1 | 동일 idempotency_key 재전송 → 202 무시 |
| T6.2 | Wiki 워커 다운 → 라우팅 정상 |
| T6.3 | 1000건 동시 → 블로킹 없음 |

### Phase 7 (phase7.test.js)
| 테스트 | 검증 |
|--------|------|
| T7.1 | raw_logging_enabled=true → 파일 생성 |
| T7.2 | =false → 파일 미생성 |
| T7.3 | Raw 드롭 코어 지연 0 |
| T7.4 | (mock) Gemini 분류 → Obsidian 병합 호출 |

### Phase 8 (phase8.test.js) — Agora 동기화 [v6.8 미구현]
| 테스트 | 검증 |
|--------|------|
| T5.17 | session_id 없으면 라우터 자동 생성 후 주입 |
| T5.18 | 발화 카운터를 session_store에서 관리 (엔벨롭값 아님) |
| T5.19 | `a2a_status:"out"` → resolved와 동일 종료 |
| T5.20 | max_speaker_calls/max_rounds agents.yaml 강제 교체 (엔벨롭 제출 무시) |
| T5.21 | `_source_url` 누락 → `A2A_SPOOF_DETECTED` |
| T5.22 | session TTL 만료 → session_store 자동 삭제 |

### Phase 9 (phase9.test.js) — 다중 사용자 & Admin [v6.8 미구현]
| 테스트 | 검증 |
|--------|------|
| T9.1 | 어댑터가 `payload.user_id` 항상 추출·포함 |
| T9.2 | DM 응답 → user_id / 그룹 응답 → chat_id(전체) |
| T9.3 | `GET /admin/agents` → 목록 + 폴링 상태 집계 |
| T9.4 | `POST /admin/agents/:id/test` → 폴링 수신 확인 |
| T9.5 | `POST /admin/dry-run` → 라우팅 경로 + 폴링 활성 검증 |
| T9.6 | `GET /admin/sessions` → 활성 A2A 세션 목록 |
| T9.7 | `GET /admin/status` → 전체 컴포넌트 상태 |

### Phase 10 (phase10.test.js) — Pull 통신 & 보안 [v6.8 미구현]
| 테스트 | 검증 |
|--------|------|
| T10.1 | 토큰으로 `GET /poll` → 큐 비면 204 보류, 일감 들어오면 즉시 반환 |
| T10.2 | 잘못된/누락 토큰 폴링 → 401 |
| T10.3 | 라우터가 에이전트 inbound 없이 일감 전달 (push 호출 코드 0건) |
| T10.4 | `POST /result` → 어댑터 전달·게시 (callback 8798 미사용) |
| T10.5 | 큐 적재 시 idempotency_key 중복 드롭 |
| T10.6 | 라우터 재시작 시 큐 휘발 허용 (느슨한 멱등성) |
| T10.7 | A2A 재진입도 폴링 경로로 동작 (DIALOGUE 라운드) |
| T10.8 | 미등록 agent_id 폴링 → 404 |
| T10.9 | 큐 일감 TTL 만료 → 제거 + warning |
| T10.10 | (실연동) 실제 에이전트 1기 DM/그룹 실메시지 왕복 — **mock 통과 불인정** |
| T10.S1 | 보안: zeus 토큰으로 hera `/poll` → 401 (토큰↔agent_id 바인딩) |
| T10.S2 | 보안: 미발급 job_id로 `/result` → `UNKNOWN_JOB` |
| T10.S3 | 보안: 토큰별 rate limit 초과 → 429 |
| T10.S4 | 보안: 큐 크기 상한 초과 적재 → 거부 |
| T10.S5 | 보안: 평문 HTTP 폴링 거부 (HTTPS 강제 환경) |

---

## 5. A2A 핵심 테스트 상세 예시 (T5.3 — 3기 발화자 한도)

```javascript
import { test } from 'node:test';
import assert from 'node:assert';

test('T5.3 — 3기 DIALOGUE 각자 10회 발화 보장', async () => {
  let counts = { agentA: 0, agentB: 0, agentC: 0 };
  const speakers = ['agentA', 'agentB', 'agentC'];
  for (let i = 0; i < 30; i++) {           // 30회 = 각자 10회
    const caller = speakers[i % 3];
    counts[caller]++;
    assert.ok(counts[caller] <= 10, `${caller} 발화 ${counts[caller]}회 — 10 이내`);
  }
  assert.deepStrictEqual(counts, { agentA: 10, agentB: 10, agentC: 10 });
});
```

---

## 6. 실행 명령 & 리포트

```bash
# Phase별 실행
node --test harness/tests/phase1.test.js

# 전체 실행 (Windows + Node v24 호환 glob)
node --test harness/tests/*.test.js

# 하드코딩 검사 (T1.4, T3.9 보조)
grep -rE '\b(zeus|hera|athena)\b' router-core/ adapters/ registry/ # config/ 제외 (yaml id는 정상)
  && echo "FAIL" || echo "PASS"
```

리포트 형식:
```
[Phase N 테스트 리포트]
T_N.1 ✅  T_N.2 ✅  T_N.3 ❌ (원인: ...)
통과율: 12/14
다음 조치: T_N.3, T_N.5 재수정
```

---

## 7. 결함 기록 템플릿 (다듬기 루프)

```
[결함 #001]
테스트: T5.10
증상: telegram→slack A2A가 차단되지 않음
원인: a2a-guard.js에서 parent_platform 비교 누락
조치: 검증 항목 추가
PRD 반영: 불필요 (구현 누락이었음)
```

> PRD 자체가 틀린 경우에만 PRD를 먼저 수정. 구현 실수면 코드만 수정.

---

## 8. 변경 이력

| 버전 | 내용 |
|------|------|
| v1.0 | PRD v6.3 기준 Phase 1~7 + E2E 테스트 매핑 초안 |
| v1.1 | PRD v6.8 정합 — Phase 8(Agora) / Phase 9(다중사용자·Admin) / Phase 10(Pull 통신·보안 T10.S1~S5) 매핑 추가. mock≠완료 명시, user_id·poll 설정 fixture 반영 |
