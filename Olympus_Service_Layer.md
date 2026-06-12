# Olympus Service Layer — 대고객 계층 + UI 설계

> **버전**: v1.0 | **성격**: 서브프로젝트 설계 SSOT (코어 PRD와 분리 관리)
> **코어측 계약**: `Olympus_PRD.md` 11절(Admin API 확장)·4.2절(tenant 키 규칙)·12절(quota)·17절(audit)·18절(보존·해지) 참조. 충돌 시 코어 영역은 PRD 우선.
> **상태**: 설계 확정 (킵 2026-06-12). **구현은 코어 검증 후 착수** (PRD 22절).

---

## 1. 경계 (코어와의 관계)

- 저장소: **PostgreSQL 별도 DB**. 코어 SQLite와 물리 분리(현 단계). **코어→PostgreSQL 접근 0건** (원칙 6 정합 — 코어는 외부 시스템을 호출하지 않음).
- 서비스 계층→코어 접근은 **Admin API 경유만**. 코어 내부 DB 직접 읽기 금지 (저장소 추상화 보호).
- **조인 전략**: SQLite↔PostgreSQL 교차 조인 수요(과금 리포트·통합 뷰·감사 보고서)는 **사본 후 조인** — 필요 코어 데이터를 배치/API로 복제(usage_snapshot 패턴) 후 PostgreSQL 내 조인. eventual consistency 허용(과금·리포트는 실시간 불요).
  - 전환 경로: 코어 저장소가 PostgreSQL로 전환되는 시점(PRD 15절 신호)에 **동일 인스턴스 별도 스키마** 배치 허용 → DB 내 조인 가능. (기각: FDW로 SQLite 직접 읽기 — 코어 내부 스키마의 외부 계약화)
- tenant 레코드 SSOT = **이 계층**. 코어는 tenant 키 규칙(4.2)만 적용하고 tenant 상태를 보유하지 않는다. 코어측 tenant 작업은 deletion 마킹·limits 주입·usage 조회뿐 (PRD 11절 확장분).

---

## 2. 데이터 모델 (PostgreSQL)

전 엔티티 ID = ULID (코어 session_id 관례 통일).

| 엔티티 | 핵심 필드 | 비고 |
|---|---|---|
| account | account_id, name(표시명), status(active\|suspended\|pending_deletion\|terminated) | B2B 계약 주체. 법인 명의 변경 = name 갱신만 |
| user | user_id, account_id(FK), email(unique), password_hash(argon2id), role(owner\|viewer), totp_secret, recovery_codes(해시 배열), last_login_at | owner 2FA 필수 |
| tenant | tenant_id(PK), account_id(FK), display_name, status(provisioning\|active\|pending_deletion\|deleted), transferred_from_account_id, transferred_at, deleted_at | tenant_id = **시스템 생성 불투명 값** (3절) |
| plan | plan_id, name, rate_capacity, rate_refill_per_sec, quota_window, quota_max_requests, retention_audit_days, **audit_enabled**(feature flag), price_month, status(active\|deprecated) | 코어 12·18절 파라미터의 출처 |
| subscription | subscription_id, tenant_id, plan_id, status(active\|pending_deletion\|terminated), started_at, ends_at, cancel_requested_at, cancel_revoke_deadline | tenant↔plan 바인딩 |
| invoice | invoice_id, account_id, period_start/end, amount, status(draft\|issued\|paid\|void) | PG 자리만 |
| payment | payment_id, invoice_id, method, amount, status, paid_at | PG 어댑터 인터페이스(charge/refund/webhook)만 추상화 |
| usage_snapshot | snapshot_id, tenant_id, agent_id, period(일), request_count, collected_at | 코어 사용량 사본. 보존 13개월(법규 검토 종속·가변) |
| provisioning_log | log_id, tenant_id, action(agent_create\|token_issue\|token_rotate\|limits_update\|deletion_mark\|deletion_revoke\|tenant_transfer\|2fa_reset…), result, created_at | 코어 audit(PRD 17절)와 독립 — 자체 운영 로그 |
| deletion_request | request_id, tenant_id, requested_by(user_id), requested_at, revoke_deadline, status(pending\|revoked\|executed), executed_at, notice_sent_at(신청\|완료별) | 해지·철회·고지 추적 |
| password_reset_token | token_hash, user_id, expires_at, used_at | 평문 미저장, TTL 30분, 1회용 |

- 가입 트랜잭션 = account + owner user + tenant 동시 생성 (운영 1:1, 스키마 1:N 허용).

## 3. tenant_id 규칙 + 법인 변경·이전 시나리오

- tenant_id = **시스템 생성 무작위 값(ULID 소문자)**. 회사명·계정명 유래 slug **금지** — tenant_id는 코어 전 데이터의 격리 prefix라 사후 변경 불가(전 키 재작성). 불투명 값이면 법인명 변경에도 변경 압력 0. 표시명은 display_name 별도.
- 코어 키 규칙 적용: URL-safe, `:` 금지, 예약어 금지 (PRD 4.2).
- **법인 명의 변경** (계약 주체 동일): account.name 갱신 + provisioning_log. tenant 무변동.
- **tenant 이전** (M&A 등 account A→B): tenant.account_id FK만 변경. 코어 데이터 무변동·서비스 무중단. invoice는 이전일 기준 분할. subscription·deletion_request 승계. transferred_from_account_id·transferred_at 기록 + provisioning_log `tenant_transfer`.
- ⚠️ 이전 시 대화 로그·audit 데이터도 함께 승계 — 양도 동의·법적 처리는 법규 백로그 연동.

## 4. 인증·보안

- 인증: email+password, 해시 **argon2id**. 가입 시 email 검증 필수. 소셜 로그인 없음.
- 비밀번호 정책: 최소 12자, 조합 강제 없음 (NIST 방식).
- **2FA(TOTP)**: owner 필수 / viewer 선택. 등록 시 **복구 코드 10개 1회 노출 발급**(해시 저장).
- 로그인 실패 카운터 임계 초과 시 일시 잠금 (코어 8.1 DoS 패턴 동형).
- 세션: idle + absolute 2중 만료 (코어 세션 TTL 패턴 동형).
- **패스워드 복구**: 요청 → 복구 토큰(256-bit random, 해시 저장, TTL 30분, 1회용) → 메일 링크 → 재설정 → **전 세션 무효화 + 변경 고지 메일**. 사용자 열거 방지(미존재 email에도 동일 응답). 복구 요청 rate limit. 복구 코드 소진+TOTP 기기 분실 시 운영자 콘솔 수동 해제(provisioning_log `2fa_reset`).
- 권한: 해지·플랜 변경 = owner만. viewer 조회 전용.
- 기각/보류: SSO·SAML — 엔터프라이즈 수요 발생 시 (9절 미결).

## 5. 코어 인터페이스 계약 4종

| # | 계약 | 경로 | 비고 |
|---|---|---|---|
| 1 | 프로비저닝 | 서비스 계층 → 기존 Admin API (/admin/agents, /token) | 호출 전부 provisioning_log 기록 |
| 2 | 플랜 주입 | plan/subscription 변경 → `PUT /admin/tenants/:id/limits` → yaml overrides + reload | 즉시 반영, 정산은 다음 청구 주기 (proration 없음) |
| 3 | 사용량 수집 | 일 1회 배치가 `GET /admin/usage?tenant&from&to` pull → usage_snapshot | 건수 기반(PRD 12절 정합). 코어는 서비스 계층을 호출하지 않음 |
| 4 | 해지 연쇄 | deletion_request 생성 → 즉시 `POST /admin/tenants/:id/deletion` 마킹 → 익일 자정(Asia/Seoul) 배치 워커 연쇄 삭제 → executed. 철회 = 창 내 `DELETE` | PRD 18절 흐름 준수 |

## 6. 해지 플로우 + 고지 의무

고지 3종 (email + 포털 배너):
1. **신청 접수 즉시**: 삭제 예정 시각(Asia/Seoul 익일 자정)·철회 기한·연쇄 삭제 범위·"audit는 보존 정책에 따라 별도 만료(PRD 18절)" 명시
2. **철회 시**: 철회 확인
3. **삭제 실행 완료 시**: 완료 통지

- 고지 발송 실패는 삭제 스케줄을 막지 않음(재시도만) — ⚠️ 법규 검토 대상 표시.
- 철회 deadline = 익일 자정 직전.

## 7. UI 구획

### 7.1 운영자 콘솔 (Olympus Console)
- 별도 앱 (고객 포털과 분리). 백엔드 = 코어 Admin API + 서비스 계층 DB.
- 배포: VPS 동거 + Cloudflare Access. 인증 2중: Access(망 경계) + admin 토큰(API 경계, 서버측만 보관·브라우저 비노출, 세션 쿠키 httpOnly+secure).
- 스택: 단일 Node 서버렌더 (사용자 1인·화면 소수에 SPA 과투자).
- 화면: ①상태 보드 ②에이전트 관리(토큰 평문 1회 노출 모달 — 서버 로그·provisioning_log 평문 미기록) ③세션 메타 조회 ④알람 규칙 → **MVP (현존 Admin API만으로 동작)**. ⑤테넌트·플랜 ⑥데이터 관리(보존·삭제·백업·추출·배치잡·해지 처리) ⑦audit 정책 → 의존(서비스 계층·배치 워커·audit) 구현 시 증분.
- 로그 표시: provisioning_log·코어 시스템 로그·audit의 저장은 분리, **표시는 통합 뷰 + 소스별 필터** (백엔드 레이어 분리를 UI에 노출하지 않음).

### 7.2 고객 포털 (Customer Portal)
- 사용량 조회·내려받기 / 플랜·구독·청구서 / 해지 신청+철회.
- **옵션 탭 패턴**: 옵션 기능은 feature flag로 탭 단위 조건 노출 — `audit_enabled` ON이면 audit 탭(조회·보고서 내려받기만, 보고서 포맷은 PRD 22절 미결) 표시, OFF면 탭 자체 없음. 향후 옵션 모듈도 동일 패턴.
- audit **정책 편집은 포털에 없음** — 운영자 콘솔 전용 (PRD 17절 separation of duties).
- 스택: 구현 시점 결정 (보류).

### 7.3 관측 대시보드
- 자체 구축 안 함. **Grafana + Prometheus**가 코어·어댑터 /metrics 스크랩. VPS 동거 Docker, 127.0.0.1 바인딩 + Cloudflare Access (Admin 동일 정책).

## 8. 결정 레지스터 (확정 — 재논의 금지)

| # | 결정 | 근거 1줄 |
|---|---|---|
| D1 | 콘솔/포털 별도 앱 2개 | 백엔드·노출면·생명주기 상이 |
| D2 | 콘솔 VPS+Cloudflare Access | PRD 11절 노출 정책 정합 |
| D3 | Grafana+Prometheus | /metrics 포맷 기노출, 구축비 최소 |
| D4 | 콘솔 = Node 서버렌더 | 1인 사용자에 SPA 과투자 |
| D5 | 콘솔 MVP(①~④) 선행 | "코어 검증 후 서브프로젝트" 순서 일치 |
| D6 | 콘솔 인증 2중 | 망 경계 + API 경계 분리 |
| D7 | 결제 PG 자리만 | 상용 시점·시장 미정 |
| D8 | Admin API 확장 PRD 11절 즉시 반영 | 인터페이스 계약과 맞물림 |
| D9 | account당 user N명 (owner/viewer 2단) | B2B 표준, 비용 최소 |
| A-1 | 본 문서 별도 신설 + PRD 11절만 직접 갱신 | PRD 증류 취지 보호 |
| A-2 | tenant SSOT = 서비스 계층, 코어 tenant CRUD 없음 | 코어 관점 tenant=키 prefix뿐 (PRD 4.2 유지) |
| A-3 | 사용량 = GET /admin/usage 신설 | DB 직접 읽기는 저장소 추상화 파괴 |

## 9. 미결 (의도적 보류)

| 항목 | 결정 시점 |
|---|---|
| 결제 PG 선택 (토스/Stripe 등) | 상용화 시점 |
| SSO·SAML | 엔터프라이즈 수요 시 |
| audit 보고서 포맷 | PRD 22절과 동일 (audit 구현 시) |
| usage_snapshot 보존 13개월 확정 | 법규(전자상거래·세법) 검토 시 |
| 고지 발송 실패 시 삭제 차단 여부 | 법규·약관 검토 시 |
| 고객 포털 기술 스택 | 구현 착수 시 |
