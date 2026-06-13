# Athena Vocabulary Lock — olympus-router-v2

> 목적: Kevin과 Athena가 합의한 구현 의도와 용어를 잠가 Codex/Claude Code/Antigravity 2.0의 의도 이탈을 조기 감지한다.

## 기준 문서

- 설계 SSOT: `Olympus_PRD.md`
- 구현 계획: `Olympus_Plan.md`
- 현재 위치: `HANDOFF.md`

## 허용 용어와 금지 용어

| 금지/폐기 | 사용해야 할 표현 | 이유 |
|---|---|---|
| `poll` | `SSE events`, `GET /agents/:id/events` | v6.13은 SSE + POST 계약 |
| `pull model` | `outbound SSE connection` | 에이전트 inbound 불필요, SSE 수신 |
| `callback` | `egress`, `POST {adapter_url}/egress` | result 이후 adapter egress 계약 |
| `round`, `max_rounds`, `ROUND_LIMIT` | `speaker_counts`, `max_speaker_calls` | 라운드 개념 폐기. 발화 횟수만 router가 통제 |
| `_source_url` | `Bearer token-bound caller` | 자기신고/URL 기반 신원 폐기. caller는 token에서 도출 |
| `agents.yaml url` | `router_url, agent_id, token` | 라우터는 agent 직접 호출하지 않음 |
| `volatile queue` | `durable SQLite job queue` | queue 상태는 durable이어야 함 |
| `persona_key` without tenant | `{tenant_id}:{agent_id}` | Tenant-Always-Prefix |
| `mock pass = complete` | `real integration required` | 실연동 전 완료 선언 금지 |

## 핵심 구현 의도

### SSE + POST

목적:

- 에이전트 위치 무관
- 에이전트측 inbound 포트·터널 불필요
- 라우터가 agent를 직접 호출하지 않음
- Cloudflare Tunnel 환경에서 push 기반 지연 최소화

금지:

- `/poll` 재도입
- agent URL 직접 호출
- callback server 전제

### Token-bound caller

목적:

- agent 자기신고를 믿지 않음
- 외부 입력의 spoof 방지
- caller는 Bearer token에서만 도출

금지:

- `_source_url` 검증 부활
- envelope의 `caller` 신뢰
- URL 기반 agent identity

### Router-owned speaker counts

목적:

- A2A 발화 한도는 router DB가 SSOT
- agent가 제출한 count는 무시
- dialogue는 round가 아니라 speaker별 발화 횟수로 통제

금지:

- round 필드 추가
- max_rounds 설정
- ROUND_LIMIT 에러 부활

### Tenant-always-prefix

목적:

- 단일 tenant라도 `default:` prefix 사용
- 미래 멀티테넌시 전환 시 코드 분기 제거
- MESSAGE/PERSONA/KNOWLEDGE 격리 기준 명확화

금지:

- 단일 tenant라는 이유로 prefix 생략
- platform prefix를 persona_key에 붙임

### External A2A Gateway 후보

Kevin 추가 요구:

- 내부 A2A만으로는 부족
- 협력사/외부 LLM agent가 Olympus에 요청할 수 있어야 함
- Olympus도 외부 partner agent에 요청할 수 있어야 함

잠정 용어:

- `External A2A Gateway`
- `Partner Adapter`
- `external caller namespace`
- `conversation_ref` instead of external `context_key`

보류:

- Google/Linux Foundation A2A 호환은 adapter로 검토
- 내부 A2A 신뢰 모델을 Google A2A에 종속시키지 않음

## 의도 이탈 감지 규칙

아래가 diff에 등장하면 Athena는 구현 중단 또는 재검토를 요청한다.

```text
poll
callback
round
max_rounds
ROUND_LIMIT
_source_url
agents.yaml url
volatile queue
persona_key without tenant prefix
```

예외:

- 아카이브/마이그레이션 설명에서 폐기 개념을 언급하는 경우
- Vocabulary Lock이나 정합화 문서에서 “금지어”로 설명하는 경우
