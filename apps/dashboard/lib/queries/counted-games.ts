import type { PrismaClient } from "@lolpamin/db";

/**
 * 판/승/패에 세는 경기를 고르는 GameResult 조건.
 *
 * 두 가지를 건다.
 * - cancelledAt: null — 되돌린 판은 없던 일이다. 참가 기록은 경기 기록 화면에 남아야
 *   해서 지우지 않으므로(cancelGameResult 참고) 세는 쪽에서 걸러야 한다.
 * - createdAt > 마지막 리셋 시각 — 리셋은 전적을 0/0/0으로 만들지만 경기를 지우지는
 *   않는다(resetAllRatings 참고). 리셋 전에 입력된 판은 기록으로만 남고 세지 않는다.
 *
 * playedAt이 아니라 createdAt으로 자른다. 경기 날짜는 과거로 적을 수 있어서 리셋
 * 뒤에 입력한 판이 기준선 아래로 내려갈 수 있다 — cancelGameResult가 「최근」을
 * 입력 순서로 보는 것과 같은 이유다.
 *
 * 리셋이 한 번도 없으면 기준선이 없고 조건은 예전 그대로 취소 여부만 본다.
 * 같은 규칙이 apps/discord-bot/src/lib/get-game-count.ts에도 있다.
 */
export interface CountedGameFilter {
  cancelledAt: null;
  createdAt?: { gt: Date };
}

export async function getCountedGameFilter(prisma: PrismaClient): Promise<CountedGameFilter> {
  const latest = await prisma.ratingReset.findFirst({
    orderBy: { resetAt: "desc" },
    select: { resetAt: true },
  });

  if (!latest) return { cancelledAt: null };
  return { cancelledAt: null, createdAt: { gt: latest.resetAt } };
}
