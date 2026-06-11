# Olympus Router — Implementation Plan (구현 계획·테스트)

> **설계 SSOT는 `Olympus_PRD.md`.** 이 문서는 구현 순서·Exit Criteria·진행 상태만 담는다.
> 코드 현황: ~v6.4 수준(push/callback/file-only). Phase 1~7 + E2E 구현 완료(mock 55/55), 단 **mock 통과 ≠ 완료**.

---

## 1. 구현 게이트 순서 (의존성 기준 — LB-11)

Phase 번호는 역사적 도입순이며 실행 순서가 아니다. 구현 게이트는 아래 의존성 순서를 따른다. 각 게이트는 Exit Criteria 100% 통과 후 다음으로 진행한다.

| 게이트 | 내용 | 흡수하는 구 Phase | PRD 절 |
|--------|------|------------------|--------|
| G-A. 저장소 계층 | 저장소 인터페이스·better-sqlite3·WAL·단일 writer·마이그레이션 | (신규) | 14 |
| G-B. 전송·큐·인증 | SSE+POST 전환, Job Queue 영속, 등록 토큰, egress 계약 | 구 Phase 10 (재정의) | 6, 7, 8.1 |
| G-C. A2A 엔진 | 토큰 바인딩 신원, ULID 세션, cc listen, 기록 규율, 가드 6단계 | 구 Phase 8 (재정의) | 8.2, 9 |
| G-D. 재시작·복구 | 부팅 시퀀스, 복구 트랜잭션, /health·/ready | (신규) | 10 |
| G-E. Admin·다중 사용자 | /admin/*, user_id, dry-run, 온보딩 | 구 Phase 9 | 11 |
| G-F. 유량·관측 | rate limit·quota, /metrics, 시스템 로그, 관측 워커 | (신규) | 12, 13 |
| G-G. 실연동 검증 | 실제 에이전트 1기 왕복 (T10.10) — **이 게이트 전까지 어떤 것도 "완료" 아님** | — | — |
| G-H. SDK·상용 골격 | Agent SDK, 온보딩 완성, tenant 키 검증 | 구 Phase 11 | 21.2, 4.2 |
| G-I. audit·보존 | audit 모듈, 롤오버·retention·배치 워커 | 구 Phase 12 (확장) | 17, 18 |
| G-J. Wiki 파이프라인 | Gemini 워커·마커·SLA | 구 Phase 7 잔여 | 16 |

> G-B 착수 시점에 **v7.0** 부여 (Pull→SSE 모델이 코드로 전환되는 시점).
> G-G(실연동)는 G-B 직후 최소 구성으로 1차 수행 권장 — 전송 계약(Cloudflare Tunnel SSE 통과)을 조기 검증.

---

## 2. 테스트 ID 대역

| 대역 | 관심사 |
|------|--------|
| T5 | A2A |
| T7 | wiki·Obsidian |
| T9 | admin·다중 사용자 |
| T10 | 큐·전송·재시작 |
| TA | audit |
| TR | rate limit·quota |
| TO | 관측성·어댑터 metrics |
| TS | 저장소·tenant 키·수평전환 가드 |
| TD | 보존·삭제·롤오버·배치 |

신규 테스트는 해당 관심사 대역에 붙인다. 다른 대역 임의 연장 금지.

---

## 3. Exit Criteria (게이트별)

### G-A. 저장소 계층 (TS.1~8)
- TS.1 WAL 모드 활성 / TS.2 쓰기 중 읽기 비차단 / TS.3 단일 writer로 SQLITE_BUSY 미발생 / TS.4 busy_timeout 동작 / TS.5 단일 queue.db 원자 복구 / TS.6 audit·raw 파일 분리 / TS.7 user_version 마이그레이션 게이트 / TS.8 백엔드 교체 시 코어 무수정

### G-B. 전송·큐·인증 (T10.x)
- T10.1 SSE 스트림 수립·일감 push (구 poll 정의 대체) / T10.2 토큰 누락·불일치 401 / T10.3 라우터의 에이전트 직접 호출 코드 0 / T10.4 result→어댑터 게시 (callback 8798 미사용) / T10.5 idempotency 중복 드롭 / T10.7 A2A 재진입도 큐·SSE 경로 / T10.8 미등록 agent 404 / T10.9 job TTL 만료 처리
- T10.11~17 상태머신 6종 전이·불변 규칙 / T10.18~22 토큰(해시 저장·grace·fail-closed·DoS 상한·스트림 1개 대체) / T10.23~29 egress(동기 ACK·재시도 스케줄·dedup·FIFO·실패 통지·shared secret) / T10.31 queued 상태 result 수용
- ~~T10.6 (큐 휘발 허용)~~ **폐기** — durable로 대체

### G-C. A2A 엔진 (T5.x)
- T5.1 SINGLE 즉시 종료 / T5.2 발화 11회째 SPEAKER_LIMIT / T5.5 resolved 조기종료 / **T5.6 resolved가 speaker 에러보다 정상종료 우선 반환 (가드 5번 자리 평가, 6번 에러 미발생)** / T5.7 INITIATION_DENIED / T5.8 UNAUTHORIZED / T5.9 SELF_CALL / T5.10 CROSS_PLATFORM / T5.11 cc listen 수신·게시 없음 / T5.12 SPOOF(토큰 불일치) / T5.13 세션 중 persona_key null / T5.14 종료 결과 기록 — DM이면 Mem0, 그룹이면 Obsidian(Raw 경로) / T5.15 cc 미기록 / T5.16 모드 기본값 single
- T5.17 세션 라우터 ULID 단독 발급 / T5.19 out=resolved 동일 효력 / T5.20 limits yaml 강제(에이전트 제출값 무시) / T5.22 세션 TTL(sliding+cap) / T5.23~24 토큰 바인딩·전용 엔드포인트 / T5.25~29 세션 3중 검증·영속·복구
- ~~T5.4 (11라운드 ROUND_LIMIT)~~ **삭제** — 라운드 개념 폐기 / ~~T5.21 (_source_url)~~ **대체** — 토큰 바인딩(T5.12)
- T10.32~34 listen 생명주기 / T10.35 종료 마커 4종

### G-D. 재시작·복구 (T10.36~39, TA.6)
- T10.36~38 부팅 시퀀스·delivered 회수·Last-Event-ID 재push / T10.39 복구 트랜잭션 egress pending 재개 / TA.6 audit closed 모드 ready 게이팅

### G-E. Admin·다중 사용자 (T9.x)
- T9.1 user_id 항상 추출 / T9.2 DM=user_id·그룹=chat_id 귀환 / T9.3 agents 목록+연결 상태(SSE 기준) / T9.4 연결 테스트 / T9.5 dry-run / T9.6 sessions 조회(메타만) / T9.7 status / T9.8~12 admin 토큰·scope·부트스트랩·reload·audit 연계

### G-F. 유량·관측 (TR.1~8, TO.1~9)
- TR.1 버킷 소진 429 / TR.2 Retry-After / TR.3 quota 리셋 / TR.4 재시작 영속 / TR.5 fail-open / TR.6 override(tenant 키 정합) / TR.7 A2A 세션 미파괴 / TR.8 cc quota 비계상
- TO.1~2 /metrics·/metrics.json 유효성 / TO.3 골든 시그널 카운터 / TO.4 dead_letter 알람 / TO.5 SLA 위반 카운트 / TO.6 비공개 바인딩 / TO.7 관측 워커 원칙6 격리 / TO.8 시스템 로그 일단위 롤링 / TO.9 어댑터 /metrics

### G-G. 실연동 (완료 게이트)
- T10.10 실제 에이전트 1기 DM/그룹 실메시지 왕복. Cloudflare Tunnel SSE 스트리밍 통과 + 유휴 연결 유지 포함. **mock 통과는 완료 불인정.**
- T7.5 Obsidian 마커 60s 실연동

### G-H. SDK·상용 골격 (T11.x, TS.9~16)
- T11.1 SDK connect/onJob/start / T11.2 핸들러 예외→error result / T11.4 SDK 없이 직접 HTTP 호환 / T11.6 온보딩 흐름 / T11.7 토큰 재발급
- ~~T11.3 (_source_url 자동 첨부)~~ **삭제** / ~~T11.5 (prefix 없는 단일 테넌트)~~ **대체** → TS.9 항상 prefix(default)
- TS.9~14 tenant 키(prefix·정규화·격리·persona 양축·예약어·default 동작) / TS.15~16 저장소 인터페이스 경유(수평 전환 가드)

### G-I. audit·보존 (TA.1~5, T12.x, TD.1~15)
- TA.1~5 동기 기록·closed 503·해시 체인·audit.db 분리·이벤트 4종
- T12.1 enabled:false=없는 것과 동일 / T12.3 default-on opt-out / T12.4 dm 토글 / T12.5 관리자 전용 / T12.6 메타 감사 / T12.7 런타임 재로드 / T12.8 배치 감사 워커 비차단
- TD.1~15 롤오버·세그먼트 prev_hash 인계·기준시·retention·세그먼트 단위 삭제(당월 보호·레코드 금지)·WAL 3파일·tenant 연쇄·해지 배치 멱등·배치잡 yaml→워커·Mem0/Obsidian 비책임 경계

### G-J. Wiki 파이프라인 (T7.x)
- T7.4 Gemini 분류(resolved/out=결론 / speaker_limit·expired=미결 안건) / T7.6~8 장애 누적·백로그·멱등·후속 세션 연결

---

## 4. E2E 시나리오

- E1 그룹 다중 멘션 병렬 응답 + cc 청취
- E2 SINGLE A2A 통합 응답, speaker_counts 정확
- E3 DIALOGUE 2기 — resolved 조기종료, 전 과정 표시, 종료 결과만 기록(공간 분기)
- E4 DIALOGUE 3기 — 각자 10회 발화 보장 (라운드 없음, 발화 한도만)
- E5 플랫폼 간: 결정사항 인지(PERSONA 공유) + 로그 미노출(MESSAGE 격리)
- E6 포럼 토픽 간 격리
- E7 재시도 폭격 + 에이전트 1기 다운 무중단
- E8 Raw 드롭 → Gemini → Obsidian, 코어 무영향
- (신규) E9 라우터 재시작 — 유실 0·중복 0·수동 0
- (신규) E10 해지 tenant 익일 연쇄 삭제 + audit 보존 확인

---

## 5. 구현 상태·버전 갭

| | 버전 | 상태 |
|---|---|---|
| 설계 (Olympus_PRD.md) | v6.13 | 확정 (전 항목+LB) |
| 코드 | ~v6.4 | push/callback/file-only. G-A~G-J 전체 미구현 |

- 기존 mock 55/55는 구 계약(push·라운드·_source_url) 기준 — 신 계약 구현 시 충돌 테스트는 PRD 정합 수정 허용(before/after 보고 필수, 테스트 무결성 규칙 유지).
- 구현 완료 시 본 문서 해당 게이트에 "구현 완료 + 커밋 sha" 기록 의무.

---

## 6. 작업 프로토콜 (구현자 C용 요약)

1. `[작업금지] 브리핑 → 승인 → 구현`. 승인 없는 코드 생성 금지.
2. 코드를 설계(PRD)에 맞춘다. 테스트를 구현에 맞춰 고치지 않는다. PRD가 틀렸으면 코드가 아니라 PRD 갱신을 먼저 제안.
3. 게이트 순서 준수. Exit Criteria 100% 전 "완료" 선언 금지.
4. 하드코딩 grep 0건 (에이전트 이름).
5. 실연동(G-G) 전 어떤 게이트도 최종 완료로 간주하지 않는다.
