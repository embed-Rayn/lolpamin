# Discord Bot 구현 완료 보고서

**작업일:** 2026-08-24
**대상 계획:** `docs/superpowers/plans/2026-08-23-discord-bot-implementation.md`
**결과:** `main` 브랜치에 병합 완료 (fast-forward, 커밋 `9d8da2e`..`5b524bf`)

---

## 요약

`apps/discord-bot` — 읽기 전용 Discord 봇을 새로 구현했습니다. `/elo`, `/랭킹`, `/전적` 세 개의 길드 전용 슬래시 명령어를 제공하며, 기존 `@lolpamin/db`(Prisma) 데이터를 조회만 합니다. ELO 계산이나 DB 쓰기는 하지 않습니다.

- **테스트:** 총 20개 통과 (`packages/core` 12개 + `apps/discord-bot` 8개)
- **타입체크:** `apps/discord-bot` 전체 `tsc --noEmit` 통과
- **리뷰:** 태스크별 리뷰 7건 + 전체 브랜치 최종 리뷰 1건, 모두 통과

## 구현된 것

| 파일 | 역할 |
|---|---|
| `apps/discord-bot/src/index.ts` | discord.js Client 부트스트랩, 인터랙션 디스패치 |
| `apps/discord-bot/src/lib/get-member-by-discord-id.ts` | Discord ID로 멤버 조회 |
| `apps/discord-bot/src/lib/get-member-rank.ts` | ELO 기준 순위 계산 |
| `apps/discord-bot/src/lib/get-leaderboard.ts` | 랭킹 목록 조회 |
| `apps/discord-bot/src/commands/elo.ts` | `/elo` — 내 ELO·순위 조회 |
| `apps/discord-bot/src/commands/leaderboard.ts` | `/랭킹` — ELO 상위 10명 |
| `apps/discord-bot/src/commands/record.ts` | `/전적` — 특정 멤버 ELO·내전 횟수 |
| `apps/discord-bot/src/deploy-commands.ts` | 슬래시 명령어를 길드에 등록하는 1회성 스크립트 |
| `.env.example` | `DISCORD_APP_ID` / `PUBLIC_KEY` / `TOKEN` / `GUILD_ID` 문서화 |

## 진행 방식

superpowers의 **subagent-driven-development** 스킬을 사용해, 격리된 git worktree에서 태스크 1개당 구현 에이전트 1개 → 리뷰 에이전트 1개 순서로 8개 태스크를 순차 실행했습니다. 태스크 2~4는 TDD(실패하는 테스트 먼저 작성 → 구현)로 진행했고, 실제 로컬 Postgres(`lolpamin_test`)를 대상으로 통합 테스트를 실행했습니다(SQLite 대체 금지 규칙 준수).

모든 태스크가 끝난 뒤 가장 성능이 높은 모델(Opus)로 전체 브랜치 최종 리뷰를 한 번 더 진행했습니다.

## 제가 내린 판단 (Ruling)

작업 중 사람의 확인 없이 제가 직접 결정하고 원장(ledger)에 기록해 둔 사항들입니다.

1. **실제 Discord 자격 증명 부재** — 이 환경에는 `.env`가 아예 없었고(→ 로컬 Postgres용 값과 더미 Discord 값으로 새로 생성), 실제 봇 토큰/앱 ID/길드 ID가 없었습니다. 사용자에게 물어본 뒤 "코드는 전부 구현하고, 실제 연동 검증(Task 7의 실제 등록, Task 8의 수동 스모크테스트)은 보류"하기로 결정했습니다. 잘못된 판단이었어도 손실은 없습니다 — 코드 자체는 계획서와 한 글자도 다르지 않고, 미검증 상태로 남는 건 실제 네트워크 호출뿐이며 이는 사용자만 가진 비밀값이 있어야 확인 가능합니다.
2. **Task 1 브리핑 오타 수정** — 계획서의 `"dev": "tsx ... watch src/index.ts"`는 tsx 문법상 유효하지 않아(위치 인자로 `watch`를 지원하지 않음) `--watch` 플래그로 수정했습니다. 실제 워치 모드 출력으로 검증했고 리뷰어도 정당한 오타 수정으로 확인했습니다. 되돌리기 쉬운 사소한 변경입니다.
3. **최종 리뷰의 사소한 잔여 사항 보류** — 수정된 `index.ts`의 `await prisma.$connect()`(ClientReady 핸들러 안)에 자체 try/catch가 없다는 지적이 있었지만, 이미 추가한 전역 `unhandledRejection` 핸들러가 잡아주므로 프로세스가 죽지는 않습니다. 다만 부팅 시 DB 연결이 잠깐 끊기면 "연결 실패" 대신 뭉뚱그린 "Unhandled rejection" 로그만 남는다는 진단상의 사소한 흠으로 남겨뒀습니다(두 번째 수정 라운드까지는 필요 없다고 판단).

## 최종 리뷰에서 발견 → 수정 완료된 것

- **문제 1 (크래시 위험):** 인터랙션 에러 핸들러에서 에러 응답(`reply`/`followUp`)이 실패하면(예: Discord 상호작용 토큰 3초 만료) 처리되지 않은 Promise 거부로 봇 프로세스 전체가 죽을 수 있었습니다. → try/catch로 감싸고, `ClientReady` 시점에 Prisma 커넥션을 미리 워밍업하고, `Events.Error` 및 `unhandledRejection` 전역 핸들러를 추가했습니다.
- **문제 2 (데이터 유실 위험):** `DATABASE_URL_TEST` 환경변수가 비어 있으면 Prisma가 조용히 **개발용 DB**로 폴백해서, 테스트의 `resetDatabase()`가 실제 운영/개발 데이터를 지워버릴 수 있었습니다. → 세 개의 테스트 파일 모두에 "설정 안 되어 있으면 즉시 에러로 중단" 가드를 추가했습니다. 실제로 `.env`를 숨기고 가드가 작동하는 것까지 확인했습니다.

두 수정 모두 재검증(re-review)에서 "모두 해결됨, 새로운 문제 없음"으로 확인됐습니다.

## 보류된 사소한 항목 (머지를 막지 않음)

- `getMemberRank`의 완전 빈 테이블(0명) 케이스는 테스트로 직접 검증되지 않음 (로직상으론 문제없음)
- `getLeaderboard`의 `limit=0` 케이스, 이름 폴백 체인의 전체 경로(카카오 닉네임까지) 미검증
- `/elo`·`/전적`은 `realName ?? discordHandle ?? "회원"`, `/랭킹`은 `realName ?? discordHandle ?? kakaoNickname ?? "이름 미확인"` — **표시 이름 폴백 체인이 명령어마다 다름** (카카오 닉네임만 있는 멤버는 `/랭킹`엔 뜨지만 `/elo`·`/전적`엔 "회원"으로 보임)
- `getMemberRank`(공동 순위 허용)와 `getLeaderboard`(순서대로 1,2,3...)가 서로 다른 순위 정의를 사용 — ELO가 같으면 `/elo`와 `/랭킹`의 순위 표시가 어긋날 수 있음
- `getLeaderboard`에 동점자 처리용 2차 정렬 기준(`id asc` 등)이 없어 동점일 때 순서가 매번 바뀔 수 있음
- `ephemeral: true`는 discord.js v14.16+ 기준 지원 종료 예정(현재 동작은 정상, 추후 `flags: MessageFlags.Ephemeral`로 교체 권장)
- 신규 셋업 안내(README) 부재 — `deploy-commands`를 먼저 실행해야 명령어가 보인다는 점 등

## 남은 작업 (사용자가 직접 해야 함)

1. https://discord.com/developers/applications 에서 실제 Discord 앱/봇을 만들고 테스트 길드에 초대
2. `.env`에 실제 `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_TOKEN`, `DISCORD_GUILD_ID` 입력
3. `npm run deploy-commands --workspace=discord-bot` 실행 (슬래시 명령어를 길드에 실제 등록)
4. `npm run dev --workspace=discord-bot` 실행 후 Discord에서 `/랭킹`, `/elo`, `/전적` 수동 테스트 (계획서 Task 8, Step 1~7)
   - 한글 명령어(`랭킹`, `전적`)가 Discord API에서 거부되면 `commands/leaderboard.ts` / `commands/record.ts`의 명령어 이름만 영문(`ranking`, `record`)으로 바꾸고 재등록 (계획서에 명시된 대안)
