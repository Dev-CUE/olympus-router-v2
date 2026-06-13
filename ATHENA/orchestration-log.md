# Athena Orchestration Log — olympus-router-v2

> 이 파일은 Athena가 프로젝트 운영 중 남겨야 하는 요약 로그다. 세부 토큰/비밀/인증 정보는 기록하지 않는다.

## 2026-06-13 — Athena 기록 폴더 초기화

### Kevin 결정

- `olympus-router-v2`를 Athena 오케스트레이터 워크플로우의 첫 프로젝트로 삼는다.
- Kevin과 Athena가 먼저 기획안/설계서/작업계획을 함께 검토해 용어와 구현 의도를 맞춘다.
- 구현은 Codex, Claude Code, Antigravity 2.0에 위임할 수 있다.
- Athena는 직접 코딩자보다 개발 관리자, 의도 보존자, 품질 게이트키퍼, QA 담당자로 동작한다.
- Athena는 프로젝트 전체 지도를 들고 있다가 구현 에이전트에게 정확한 파일/함수/테스트 위치를 지정한다.
- 개발 관련 인프라 세팅은 로컬/원격 모두 Athena가 담당한다. Zeus에게 위임하지 않는다.
- Hostinger Docker 생성/세팅도 개발/배포 인프라라면 Athena 담당이다.
- 필요한 기록은 Memory와 GitHub repo 내부 Athena 전용 폴더에 관리한다.
- Athena 기록은 사람이 읽어 이해 가능해야 하며, 동시에 LLM/코딩 에이전트가 착오하지 않을 만큼 정확해야 한다.
- 변경점은 꼼꼼히 기록하고, 사유는 기술적 이유와 운영상 이유를 모두 남긴다.
- Athena의 핵심 유지보수 역할은 버그픽스/기능개선 요청 시 기록과 코드 지도를 찾아 작업 위치를 특정하고, Opus에게 자기완결형 작업지시서/하네스/brief 생성을 지시한 뒤, Codex에게 그 작업지시서를 보고 실제 수정(코딩)하도록 지휘하는 것이다.

### 설계 검토 중 발견한 주요 항목

- PRD/Plan 방향은 좋다.
- `CLAUDE.md`, `AGENT.md`, `SKILLS.md`, `Olympus_Harness.md`는 v2용 현행 문서가 아니라 v1 산출물이므로, v2 PRD와 안 맞는 것이 정상이다.
- 다음 작업은 v1 문서를 단순 정합화 patch하는 것이 아니라, 정리된 `Olympus_PRD.md` 기준으로 v2 하네스와 phase별 자기완결형 작업지시 체계를 새로 만드는 방향이다.
- 하네스 파일은 Opus에게 생성 지시할 계획이다.
- 코드 생성과 구현은 Codex가 phase 단위 agent 작업지시 파일을 생성/수행하는 방식으로 진행한다.
- 각 phase는 코드 완성 → 테스트 통과 → 새 세션에서 다음 작업 시작 순서로 진행한다.
- 이 룰의 핵심 조건은 각 phase/task handoff가 자기완결형이어야 한다는 점이다.
- 새 세션으로 phase를 시작하는 이유는 v1 MVP 작업 경험상 이전 시행착오와 폐기된 맥락이 구현 에이전트 판단을 오염시키지 않아 더 클린한 코드가 나왔기 때문이다.
- `중복 0` 표현과 `at-least-once 중복 가능` 표현은 범위 조정이 필요하다.
- G-G 실연동은 G-B 직후 최소 실연동과 최종 통합 실연동으로 나누는 방안이 적합하다.
- External A2A Gateway 요구가 추가되었다.

### External A2A Gateway 요구 초안

- 내부 A2A만으로는 부족하다.
- 협력사/외부 LLM agent가 Olympus에 요청할 수 있어야 한다.
- Olympus 내부 agent도 외부 partner agent에게 요청할 수 있어야 한다.
- 외부 caller는 내부 agent와 다른 namespace와 신뢰 경계를 가져야 한다.
- 외부에는 내부 `context_key`를 직접 노출하지 않고 `conversation_ref` 같은 opaque reference를 사용해야 한다.
- 외부 A2A는 audit 기본 ON이 적합하다.

### 생성된 Athena 운영 파일

- `ATHENA/README.md`
- `ATHENA/project-map.md`
- `ATHENA/vocabulary-lock.md`
- `ATHENA/task-brief-template.md`
- `ATHENA/review-gate-checklist.md`
- `ATHENA/orchestration-log.md`

### 다음 권장 작업

1. Kevin과 `ATHENA/*` 기록 구조 확인
2. “킵” 승인 후 GitHub push 여부 결정
3. Project Map을 실제 함수 단위까지 확장
4. Opus용 v2 하네스 생성 브리핑 작성
5. Codex용 phase별 자기완결형 작업지시 생성 브리핑 작성
6. 각 phase/task handoff 자기완결성 체크리스트 작성
