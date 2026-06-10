# [프로젝트 강화 섹션] Olympus Router

> 글로벌 지침 + 개발용 지침(본체 1~5) 위에 얹는, Olympus Router 전용 강화 규칙이다.
> 본체와 충돌하면 이 섹션이 우선한다.
> **정합 기준: Olympus_PRD_Plan.md v6.11** (VPS 이전 / push→pull 통신모델 / 등록토큰 / /result 통일 / Stateless 완화 / Raw 백엔드 추상화 / 에이전트 SDK 계약(9-A) / tenant_id 키 확장 여지(9-B) / 온보딩(9-C) / Google A2A 관계 명시)

---

## 환경

- 언어 / 런타임: Node.js (ESM, `import`/`export`. CommonJS 금지)
- 프레임워크: 없음 (순수 Node)
- 병렬 처리: `Promise.allSettled` (직렬 await 루프 금지) — 단 에이전트 직접 호출에는 사용하지 않음(pull 모델)
- HTTP: Node 내장 `fetch`
- 설정: YAML (`js-yaml`, `config/agents.yaml`)
- 테스트 프레임워크: `node:test` + `node:assert` (내장, 외부 의존 없음)
- 테스트 실행: `node --test harness/tests/*.test.js`
  (Windows + Node v24에서 디렉터리 인자는 MODULE_NOT_FOUND로 실패하므로 glob 사용)
- 배포(v6.8): Docker (Hostinger VPS). 사용자 진입은 frameq.io / Cloudflare Tunnel
- Raw 저장(v6.9): 백엔드 추상화. 기본 `file`(JSONL), 옵션 `sqlite`. SQLite는 node:sqlite 우선(외부의존 별도승인)

---

## 원칙

**설계**
- **Dumb Pipe**: 라우터 코어는 텍스트 파싱·LLM 호출·의도 분석을 하지 않는다. 목적지(to/cc) 검증 + 큐 적재 + 폴링 전달만. (v6.8: "상태 0%"는 완화 — 일감 큐 보유 허용. 파싱·LLM 금지는 불변. A2A 발화 카운터 통제도 라우터 책임.)
- **Zero Hardcoding**: 에이전트 이름(zeus/hera/athena 등)을 코드에 직접 쓰지 않는다. `config/agents.yaml`에서만 정의하고 registry로 동적 조회한다. 토큰·시크릿도 코드/yaml에 쓰지 않는다(env 전용).
- **Pull 통신 (v6.8)**: 라우터는 에이전트를 직접 호출하지 않는다. 에이전트가 `GET /agents/:id/poll`로 일감을 수령하고 `POST /agents/:id/result`로 결과를 제출한다. 에이전트는 라우터 URL + 등록 토큰만 알면 된다. 에이전트측 inbound 포트·터널(SSH/Cloudflare 역방향) 불필요.
- **컴포넌트 독립성**: 라우터/어댑터는 Mem0·Obsidian·Gemini를 직접 호출하지 않는다. 유일한 Wiki 접점은 Raw 폴더 드롭(옵션)뿐.
- **플랫폼 절대 격리**: 플랫폼 간 메시지 교차·A2A 호출 금지.
- **3축 격리**: 메시지=방마다 격리 / 인격(persona_key=agent_id)=플랫폼 초월 공유 / 지식=플랫폼 초월 공용. persona_key에 플랫폼 prefix 금지.
- **PRD 선행**: 작업 시작 전 `Olympus_PRD_Plan.md` 최신 버전을 확인한다. 설계 변경이 필요하면 코드보다 PRD를 먼저 갱신한다.
- **Admin UI 준비**: 신규 코드 작성 시 향후 관리 UI가 붙을 것을 전제한다. 설정·상태·에이전트 정보는 `/admin/*` API로 노출 가능한 구조로 설계한다.
- **Agent SDK (v6.10)**: 에이전트는 SDK(`OlympusAgent`) 또는 직접 HTTP 둘 다 가능. SDK는 폴링 루프·토큰 헤더·`/result` 제출·`_source_url` 자동 첨부를 감추는 **편의 레이어일 뿐 필수 아님**. 직접 HTTP로도 동일 계약이 동작해야 한다(T11.4).
- **Tenant-Ready Keys (v6.10)**: 모든 격리 키(`context_key`, `persona_key`, `session_id`)는 향후 `tenant_id` prefix 확장이 가능한 구조로 유지한다. **지금 코드에 tenant_id를 삽입하지 않는다.** 단일 테넌트는 prefix 없이 동작. 키 생성 지점 1곳만 수정해 확장 가능하도록 하드코딩 키 조립 금지.
- **Google A2A (v6.11)**: Olympus A2A는 독자 설계 규격(SINGLE/DIALOGUE, 발화자 한도, resolved/out 신호)이다. Google이 발표하고 Linux Foundation에 이관한 Google A2A 표준(`a2a-protocol.org`)과는 **별개**다. 내부 에이전트 간 통신에는 적용하지 않는다. 외부 에이전트(타 벤더·프레임워크) 연동 시 호환 레이어(Agent Card 노출 등) 도입을 검토한다. **현재 보류**. 혼용 금지.

**코드**
- **하드코딩 금지**: 환경 의존 값(이름, URL, 포트, 토큰)은 `agents.yaml` 또는 환경변수로만 관리한다. 토큰은 반드시 env.
- **변수 중복/재사용 금지**: 하나의 값은 하나의 변수에만. 하나의 변수는 하나의 역할만.
- **간결성**: 의도를 바로 파악할 수 있는 최소한의 코드. 불필요한 중간 변수·중복 로직·과잉 방어 코드 금지.

---

## 운영 시나리오 (v6.8 — Pull 모델)

### 메시지 흐름 (정상)

```
[사장님] → (Telegram 메시지)
    ↓
[어댑터] — Telegram 수신 (VPS Docker 내)
    ↓ context_key / persona_key / user_id 생성
[Olympus Router] — agents.yaml 기반 to/cc 검증 → 에이전트별 큐 적재 → 202 즉시 반환
    │
    │  (에이전트가 자기 큐를 롱폴링으로 가져감)
    ▲ GET  /agents/zeus/poll      Authorization: Bearer <등록토큰>
    │        → 일감 있으면 200 {job_id, envelope}, 없으면 204(재폴링)
[Zeus / Hera / Athena] — 일감 수령 → 에이전트 LLM 처리
    │
    ▼ POST /agents/zeus/result    Authorization: Bearer <등록토큰>
    │        → {job_id, result}
[Olympus Router] — job_id·토큰 검증 → 어댑터로 결과 전달
    ↓ (라우터는 Telegram API 직접 호출 금지 — 어댑터가 게시)
[어댑터] — adapter.send()
    ↓
[사장님] ← (Telegram 응답)
```

> v6.8 변경점: 라우터→에이전트 직접 호출(push) 폐기, 콜백 서버(8798) 폐기. 일감은 큐+폴링, 결과는 `/result` 단일 경로.

### 예상 장애 & 영향 범위 (v6.8)

| 장애 | 영향 | 판별 방법 |
|------|------|-----------|
| 어댑터 크래시 | 전 에이전트 무응답 | Telegram 체크 1개 |
| Olympus Router 다운 | 전 에이전트 무응답 (폴링 실패) | 라우터 health 무응답 |
| 에이전트 폴링 중단 | 해당 에이전트만 무응답, 일감은 큐에서 TTL까지 대기 | `/admin/agents` 폴링 상태 |
| 등록 토큰 불일치 | 해당 에이전트 401, 일감 수령 불가 | 라우터 로그 401 |
| 큐 TTL 만료 | 미수령 일감 소멸 + warning | 라우터 로그 warning |
| 라우터 재시작 | 큐 휘발(메모리), 진행 중 일감 유실(느슨한 멱등성 전제) | 재시작 직후 일감 누락 |
| OpenRouter 401/429 | 해당 에이전트 LLM 호출 실패 | 에이전트 로그 |
| agents.yaml 잘못된 id | 라우팅 검증 단계에서 UNKNOWN_AGENT | 라우터 로그 |
| A2A resolved/out 미반환 | 라운드 한도까지 소모 후 종료 | 라우터 로그 ROUND_LIMIT |

### 디버그 추적 순서

**원칙: 한 번 조회로 판단하고 다음 단계로 넘어간다. 결과 나오기 전에 추가 조회 금지.**

**Step 1 — 전체 상태 한 번에 확인 (가장 먼저)**
- 라우터 health 엔드포인트 1회
- `/admin/status`로 각 에이전트 폴링 활성(`last_poll_ms_ago`) 한 번에 확인

→ 결과 보고. 이것만으로 어느 레이어가 죽었는지 대부분 판별.

**Step 2 — 원인 레이어 로그 (Step 1에서 문제 있는 것만)**
- 라우터 문제면: 라우터 컨테이너 로그 20줄
- 특정 에이전트만 무응답이면: 해당 에이전트 폴링 로그 + 토큰 검증 로그

**Step 3 — 에이전트 폴링 직접 확인 (Step 2에서도 불명 시)**
- 해당 에이전트가 `GET /poll`을 실제로 호출하는지(아웃바운드) 에이전트 측에서 확인
- 라우터 `/admin/queues`로 해당 에이전트 큐에 일감이 쌓여있는지 확인 (쌓였는데 안 가져가면 에이전트 폴링 문제, 안 쌓였으면 라우팅/어댑터 문제)

**비용 급등 시**
- 라우터 로그에서 A2A round/speaker/session 관련 라인 확인 → A2A 루프 감지. OpenRouter 대시보드와 교차 확인.

### 핵심 제약 (v6.8 — 기존 제약 번복 반영)

- 어댑터는 Telegram 수신·게시 담당. 라우터는 Telegram API 직접 호출 금지(어댑터가 게시).
- **Olympus Router + 어댑터는 Hostinger VPS Docker에서 실행.** (기존 "로컬 soyo 고정" 제약 폐기 — 16절 R1)
- **에이전트는 위치 무관.** 라우터로 outbound 롱폴링만 한다. 에이전트측 inbound 설정 불필요. (기존 Hera SSH 터널 폐기 — 16절 R4)
- **결과 귀환은 `/result` 단일 경로.** (기존 callback 서버 8798 폐기 — 16절 R5)
- 발화 카운터·라운드·세션은 라우터 session_store가 SSOT. 에이전트 제출값 무시.
- A2A 재진입은 반드시 `_source_url` 포함. 누락/origin 불일치 시 즉시 `A2A_SPOOF_DETECTED`.
- 등록 토큰은 env 전용. yaml/코드/로그에 노출 금지.

---

## 확정 설계 결정 (재논의 금지 — v6.8 기준)

- A2A 한도는 라우터가 `agents.yaml`의 `system.a2a`에서 읽어 통제한다. 엔벨롭 한도값은 신뢰하지 않는다.
- 발화 카운터는 `a2a.session_id` 단위로 관리한다 (`session-store.js`). resolved/out 시 정리, 미종료 세션은 TTL 만료.
- resolved/out 종료 판단은 라우터가 settled 이후 수행한다.
- 멱등성은 느슨하게 관리한다 (키 선소비, 재시작 전제. 큐도 재시작 시 휘발 허용).
- 스푸핑 방어: A2A 재진입 시 `_source_url` 필수, URL origin 정확 일치 비교.
- persona_key 주입은 라우터 책임. 어댑터는 항상 `persona_key: null`.
- registry는 런타임 재로드 가능 (재시작 없이 반영).
- `config/agents.yaml`은 Git 추적 해제. `config/agents.example.yaml`(placeholder)만 추적.
- **통신은 pull(롱폴링).** 라우터가 에이전트를 직접 호출하지 않는다. (v6.8 신규)
- **응답 귀환은 `/result` 단일 경로.** (v6.8 — callback 8798 폐기)
- **에이전트 인증은 등록 토큰(env, 토큰↔agent_id 바인딩).** (v6.8 신규)
- **Raw 저장은 백엔드 추상화(raw-sink).** 기본 file / 옵션 sqlite. 어느 백엔드든 fire-and-forget·코어 블로킹 금지·컴포넌트 독립성 유지. DB 1순위 서버리스 SQLite, PostgreSQL·NoSQL은 향후 가능성(별도 서버 필요 → 단순 운영 의도와 충돌하므로 현재 1순위 아님). (v6.9 신규)
- **user_id**: 어댑터가 플랫폼 사용자 ID를 항상 `payload.user_id`로 추출·포함. DM은 `user_id`로 응답, 그룹/포럼은 `chat_id`(방 전체)로 응답.
- **Admin UI 준비**: 설정·상태 노출은 `/admin/*` 네임스페이스. 민감값(토큰·시크릿)은 env로만, yaml/API에 노출 금지. 에이전트 등록 시 폴링 수신 여부로 연결 테스트.
- **에이전트 SDK (v6.10)**: SDK 없이 직접 HTTP(`poll`/`result` + Bearer 토큰 + `_source_url`)로도 동일 계약 동작(T11.4). SDK는 필수 아님. 참조 구현 Node.js.
- **tenant_id 키 확장 여지 (v6.10)**: 키 생성 함수는 `tenant_id` prefix 주입이 가능한 형태로 유지. 단일 테넌트는 미사용. 본격 멀티테넌시 설계는 보류 — 향후 도입 시 키 구조를 갈아엎지 않는 것이 목표.
- **온보딩 흐름 (v6.10)**: `POST /admin/agents` → 등록 토큰 발급(1회 노출, 이후 조회 불가) → 에이전트 SDK에 `router_url + agent_id + token + source_url` 주입 → `client.start()` → `POST /admin/agents/:id/test`로 폴링 수신 확인. 토큰 분실 시 `/admin/agents/:id/token`으로 재발급(기존 무효화).
- **agents.yaml git 미추적 (확정)**: `config/agents.yaml`은 `.gitignore` 추적 해제. `config/agents.example.yaml`(공개 구조 템플릿)만 리포에 포함. README에 "복사 후 agents.yaml 작성" 안내 필수.
- **Google A2A (v6.11)**: Olympus A2A는 독자 규격. Google A2A(Linux Foundation 표준)와 별개. 내부 에이전트 간 통신에 적용하지 않는다. 외부 연동 필요 시 호환 레이어 검토(현재 보류).

---

## 해킹 방어 (보안) 검토 — v6.8 신규

> VPS 외부 노출 + 토큰 인증 + pull 모델로 전환되며 새로 생긴 공격면을 정리한다.
> 상태 표기: **[반영]** = v6.8 PRD에 이미 설계 / **[구현필요]** = 문서엔 있으나 코드 미구현 / **[정책미정]** = 운영 정책 결정 필요.
> ⚠️ 이 표에 적혀 있다고 "방어됨"이 아니다. [구현필요]·[정책미정]은 아직 막혀 있지 않다.

### 보안 위협 매트릭스

| # | 위협 | 설명 | 방어 | 상태 |
|---|------|------|------|------|
| S1 | 토큰 탈취/재사용 | 등록 토큰 유출 시 가짜 에이전트가 일감 수령 | 토큰 env 전용, HTTPS 강제, 정기 로테이션 | [반영] env / [정책미정] 로테이션 |
| S2 | 일감 가로채기 | 공격자가 남의 에이전트 큐를 `GET /poll` | 토큰↔agent_id 바인딩 (zeus 토큰으로 hera 폴링 차단) | [구현필요] |
| S3 | 결과 위조 | 가짜 `/result` 제출로 거짓 응답 게시 | job_id + 토큰 + agent_id 3중 대조, 미발급 job_id 거부(`UNKNOWN_JOB`) | [구현필요] |
| S4 | A2A 스푸핑 | 위조 caller가 권한 우회 재진입 | `_source_url` 필수 + registry url origin 정확 일치 | [반영] PRD 6.5 |
| S5 | DoS — 폴링 폭격 | 무한 폴링으로 라우터 연결 고갈 | 토큰별 rate limit, 롱폴링 동시연결 상한 | [구현필요] |
| S6 | DoS — 큐 적재 폭격 | 멱등 우회 대량 일감으로 메모리 고갈 | 큐 크기 상한 + TTL, 풀 시 거부 | [반영] TTL / [구현필요] 크기상한 |
| S7 | Admin API 노출 | `/admin/*` 무인증 노출 시 에이전트 조작 | Admin 별도 인증(토큰/IP 화이트리스트), 민감값 비노출 | [구현필요] |
| S8 | 평문 도청 | VPS↔에이전트 구간 평문 전송 도청 | HTTPS/TLS 강제, 평문 HTTP 거부 | [정책미정] |
| S9 | 토큰 로그 유출 | 토큰이 로그·에러메시지에 노출 | 로그 마스킹, Authorization 헤더 비기록 | [구현필요] |
| S10 | 재전송 공격 | 탈취한 정상 요청 재전송 | 멱등키(느슨) + 단기 nonce 검토 | [정책미정] |

### 방어 구현 우선순위 (제안)

1. **즉시(Phase 10 동반)**: S2(토큰 바인딩), S3(job_id 대조), S9(로그 마스킹) — pull/토큰 핵심과 한 몸. 빠지면 인증이 사실상 무력.
2. **Phase 10 직후**: S5/S6(DoS 상한), S7(Admin 인증) — 외부 노출 시 필수.
3. **운영 정책 결정**: S1 로테이션, S8 TLS 강제, S10 재전송 방어 — 인프라/정책 합의 후.

### 검증 (Harness 매핑)

위 위협 중 자동 검증 가능한 항목은 `phase10.test.js`에 보안 테스트로 매핑:
- T10.S1 (S2): zeus 토큰으로 hera `/poll` → 401
- T10.S2 (S3): 미발급 job_id `/result` → `UNKNOWN_JOB`
- T10.S3 (S5): 토큰별 rate limit 초과 → 429
- T10.S4 (S6): 큐 크기 상한 초과 → 거부
- T10.S5 (S8): 평문 HTTP 폴링 거부

> S1 로테이션·S7 Admin 인증·S9 로그 마스킹·S10 재전송은 운영/정책 영역이라 단위 테스트보다 점검 체크리스트로 관리 권장.

---

## 수정 범위 규칙

- 작업 지시서(AGENT.md 등)에 명시된 화이트리스트 파일만 수정한다.
- `harness/tests/`는 기본 블랙리스트(수정 금지). 단, 설계 변경으로 낡은 계약을 검증하던 테스트가 충돌하는 경우(예: Phase 2 push→pull), 그 건에 한해 1회성 수정 허용 + before/after 보고 필수.
- 문서(CLAUDE.md, SKILLS.md, PRD)는 임의 수정 금지.

---

## 헌법 문서

- 이 프로젝트에는 `CLAUDE.md`(헌법), `SKILLS.md`(기술 패턴), `Olympus_PRD_Plan.md`(SSOT, v6.11), `Olympus_Harness.md`(테스트 명세)가 있다.
- 코드와 문서가 충돌하면 문서가 정답이다. 모순 발견 시 코드를 임의 수정하지 말고 보고한다.
- 최신 상태와 결정사항은 가장 최근 핸드오프 문서의 결정사항 원장을 우선 참조한다.

---

## GitHub

- 레포: https://github.com/Dev-CUE/olympus-router-v2 (master)
- 코드 검증 시 `github:get_file_contents`로 직접 읽어 확인한다.

---

## 부록: v6.8 확정 결정 번복 기록 (PRD 16절 동기화)

| # | 기존 확정 결정 | v6.8 번복 후 | 사유 |
|---|------|------|------|
| R1 | Olympus Router 로컬(soyo) 고정, VPS 아님 | 라우터+어댑터 Hostinger VPS Docker 이전 | 외부 접속·범용 운영 전제 |
| R2 | 라우터가 에이전트 직접 호출(push) | push 폐기, 에이전트 롱폴링(pull) | 에이전트측 inbound 설정 제거 |
| R3 | Stateless 코어 상태 0% | Thin Core with Job Queue (큐 허용) | pull은 큐 불가피. 파싱·LLM 금지는 유지 |
| R4 | Hera SSH 터널(9002) | SSH 폐기, 전부 outbound 롱폴링 | SSH는 사전 키 교환 필요, 외부·무설정 부적합 |
| R5 | 응답 귀환 callback(8798) | `/result` 단일 경로 통일 | 에이전트가 라우터 URL 하나만 알도록 |

## 부록: v6.10 상용화 골격 (신규 결정)

| 항목 | 내용 |
|------|------|
| 9-A 에이전트 SDK | `OlympusAgent({router_url, agent_id, token, source_url})` + `onJob` 핸들러. SDK는 편의 레이어, 필수 아님. 직접 HTTP도 동일 계약. |
| 9-B tenant_id | 키 구조에 prefix 자리만 예약. 지금은 미사용. 본격 설계 보류. |
| 9-C 온보딩 | Admin API 기반 5단계 흐름. 토큰 1회 발급 + 폴링 수신 확인으로 완료 판정. |
| Phase 11 | T11.1~7 — SDK 구현·핸들러 예외 처리·_source_url 자동 첨부·직접 HTTP 호환·tenant 키 구조·온보딩·토큰 재발급 |

## 부록: v6.11 Google A2A 관계 명시

| 항목 | 내용 |
|------|------|
| Olympus A2A | 독자 설계 규격(SINGLE/DIALOGUE, 발화자 한도, resolved/out 신호). 내부 에이전트 간 통신에 사용. |
| Google A2A | Google 발표·Linux Foundation 이관 표준(`a2a-protocol.org`). Olympus A2A와 별개. 혼용 금지. |
| 호환 레이어 | 외부 에이전트(타 벤더·프레임워크) 연동 필요 시 Agent Card 노출 + Task 위임 수신 검토. **현재 보류.** |
| SDK 확장 여지 | SDK에 `/.well-known/agent.json` 노출 인터페이스를 선택적으로 추가할 수 있는 구조로 설계. 현재 구현 대상 아님. |
