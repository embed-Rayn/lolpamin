# Kakao Bot 구현 완료 보고서 (Task 8 보류)

**작업일:** 2026-08-25
**대상 계획:** `docs/superpowers/plans/2026-08-24-kakao-bot-implementation.md`
**결과:** `main` 브랜치에 Task 1~7 구현 완료·커밋됨 (커밋 `459907b`..`28e2315`). **Task 8(실제 계정 스모크테스트)는 상위 라이브러리 문제로 보류.**

---

## 요약

`apps/kakao-bot` — 읽기 전용 카카오톡 오픈채팅방 감시 봇의 계획서상 자동화 가능한 모든 태스크(1~7)가 이미 구현·커밋되어 있었습니다. 이번 세션에서 그 구현을 처음부터 다시 검증했습니다:

- **타입체크:** `apps/kakao-bot` 전체 `tsc --noEmit` 통과 (index.ts, register-device.ts, list-channels.ts 포함)
- **테스트:** 총 11개 통과 — `extractMentionedKakaoUserIds` 5개, `computeReconnectDelayMs` 3개(이상 순수 함수 단위테스트), `recordMemberActivity` 3개(로컬 Postgres `lolpamin_test` 대상 통합테스트, Docker Desktop을 새로 기동하고 기존 컨테이너의 DB를 사용해 직접 실행·확인)
- **의존성:** `node-kakao@4.5.0`이 `node_modules`에 정상 설치되어 있음을 확인

## Task 8에서 발견한 차단 요인

`.env`에 이미 실제 카카오 계정 자격 증명과 등록된 `KAKAO_DEVICE_UUID`가 들어 있어(이전 세션에서 Task 8 Step 1 완료 추정), 사용자 승인 하에 `list-channels` 스크립트를 실제 계정으로 실행했습니다.

**결과: 로그인이 `-999` (`KnownAuthStatusCode.UPGRADE_REQUIRED`)로 거부됨.**

원인을 추적한 결과:
- `node_modules/node-kakao/dist/config.js`에 PC 카카오톡 클라이언트 버전이 `appVersion: '3.2.3.2698'`로 하드코딩되어 있음 — 이 라이브러리가 마지막으로 npm에 배포된 시점(2021-11-21)의 값.
- 카카오 서버가 이 구버전 클라이언트를 더 이상 허용하지 않아 로그인 단계에서 즉시 거부됨.
- 업스트림 저장소(`storycraft/node-kakao`)를 확인한 결과 저장소 자체가 **"Not Maintained"** 배지를 달고 있고, "This implementation can stop working anytime"라고 경고하고 있음. npm에도 4.5.0(2021) 이후 새 버전이 없고, 알려진 유지보수 포크도 확인되지 않음.

즉, 이번에 작성한 코드(멘션 파싱, DB 기록, 재연결 백오프, 두 개의 1회성 스크립트)의 문제가 아니라, **계획의 기술 스택으로 선택된 `node-kakao` 자체가 현재 카카오 서버 프로토콜과 더 이상 호환되지 않는 상태**입니다. 카카오톡 오픈채팅방을 비공식 프로토콜로 읽기 위한 라이브러리라는 특성상 언제든 이런 식으로 깨질 수 있다는 점이 계획서의 "unofficial, reverse-engineered client" 설명에도 이미 명시되어 있었습니다.

사용자 요청으로 `list-channels`를 한 번 더 재실행했으나 동일하게 `-999`로 거부되어, 일시적 오류가 아니라 구조적 문제임을 재확인했습니다.

## 사용자 판단 (Ruling)

`appVersion` 문자열을 직접 패치해서 최신값으로 실험적으로 올려보는 방법, 대체 라이브러리를 조사하는 방법을 포함해 세 가지 선택지를 제시했고, **사용자가 "여기서 멈추기"를 선택**했습니다. 실제 계정으로 반복 실험하는 것은 계획서 자체가 명시한 "계정 제재 위험"을 키울 수 있어(버전 문자열 스푸핑은 정상적인 사용 패턴이 아님), 사용자 승인 없이 임의로 진행하지 않았습니다.

## 남은 작업 (사용자가 판단해야 함)

1. `node-kakao`를 대체할 유지보수 중인 비공식 카카오톡 Node.js 클라이언트가 있는지 조사 — 있다면 `lib/*.ts`(순수 함수, 이미 라이브러리 비의존적으로 작성됨)는 그대로 두고 `index.ts`/`register-device.ts`/`list-channels.ts`의 `node-kakao` 임포트 부분만 교체
2. 또는 `appVersion` 등 프로토콜 버전 값을 최신 카카오톡 클라이언트에 맞게 실험적으로 패치 — 단, 실제 계정 제재 위험을 감수하는 결정이므로 사용자가 직접 진행 여부를 결정
3. 두 방법 모두 여의치 않다면, "오픈채팅방을 비공식 프로토콜로 읽기"라는 접근 자체를 재검토 (예: 스펙 문서의 다른 데이터 수집 경로 검토)

## 구현된 것 (변경 없음, 검증만 완료)

| 파일 | 역할 |
|---|---|
| `apps/kakao-bot/src/index.ts` | node-kakao 클라이언트 부트스트랩, chat 이벤트 필터링·디스패치, 재연결 백오프 |
| `apps/kakao-bot/src/lib/extract-mentions.ts` | 멘션 목록에서 카카오 사용자 ID 추출(중복 제거) |
| `apps/kakao-bot/src/lib/compute-reconnect-delay.ts` | 지수 백오프 지연 계산(1초~5분 상한) |
| `apps/kakao-bot/src/lib/record-member-activity.ts` | Member upsert + MentionLog 기록 |
| `apps/kakao-bot/src/register-device.ts` | 1회성 디바이스 등록 스크립트 |
| `apps/kakao-bot/src/list-channels.ts` | 1회성 채널 ID 조회 스크립트 |
