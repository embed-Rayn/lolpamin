import type { PrismaClient } from "@lolpamin/db";
import { buildMonthCalendar, gameDayKey, gameMonthRange, type MonthCalendar, type YearMonth } from "@lolpamin/core";

export interface MatchCalendar extends MonthCalendar {
  // 그달 살아 있는 경기를 한 판이라도 뛴 회원 수. 외부인은 GameParticipant가 없어 빠진다.
  memberCount: number;
}

/**
 * /match-calendar의 한 달. 되돌린 판은 세지 않는다 — 기록 화면에는 남아 있지만 「그날
 * 내전이 있었다」는 홍보 숫자에 넣을 판은 아니다. 날짜는 playedAt의 게임일(서울 새벽 6시 경계)이다.
 */
export async function getMatchCalendar(prisma: PrismaClient, ym: YearMonth, now: Date): Promise<MatchCalendar> {
  const { start, end } = gameMonthRange(ym);
  const where = { cancelledAt: null, playedAt: { gte: start, lt: end } };

  const [games, participants] = await Promise.all([
    prisma.gameResult.findMany({ where, select: { playedAt: true, mode: true } }),
    prisma.gameParticipant.findMany({
      where: { gameResult: where },
      distinct: ["memberId"],
      select: { memberId: true },
    }),
  ]);

  return { ...buildMonthCalendar(ym, games, gameDayKey(now)), memberCount: participants.length };
}
