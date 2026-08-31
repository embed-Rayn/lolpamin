import type { Member, PrismaClient } from "@lolpamin/db";
import { normalizeKakaoNickname, realNameFromKakaoNickname } from "@lolpamin/core";

export interface NormalizeResult {
  normalized: number;
  merged: number;
  realNamesFilled: number;
}

// 병합에서 살아남을 회원: 디스코드까지 연결된 쪽을 우선하고, 그다음 먼저 만들어진 쪽.
// 연결된 레코드를 지우면 계정 연결 작업을 다시 해야 하므로 그쪽을 남긴다.
function pickSurvivor(members: Member[]): Member {
  const sorted = [...members].sort((a, b) => {
    const aLinked = a.discordUserId !== null ? 0 : 1;
    const bLinked = b.discordUserId !== null ? 0 : 1;
    if (aLinked !== bLinked) return aLinked - bLinked;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted[0];
}

function latest(dates: Array<Date | null>): Date | null {
  const present = dates.filter((d): d is Date => d !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

function datesDiffer(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a !== b;
  return a.getTime() !== b.getTime();
}

export async function normalizeKakaoNicknames(prisma: PrismaClient): Promise<NormalizeResult> {
  return prisma.$transaction(async (tx) => {
    const members = await tx.member.findMany({ where: { kakaoNickname: { not: null } } });

    const groups = new Map<string, Member[]>();
    let normalized = 0;
    for (const member of members) {
      const normalizedNickname = normalizeKakaoNickname(member.kakaoNickname!);
      if (normalizedNickname.length === 0) continue;
      if (normalizedNickname !== member.kakaoNickname) normalized++;
      const group = groups.get(normalizedNickname);
      if (group) group.push(member);
      else groups.set(normalizedNickname, [member]);
    }

    let merged = 0;

    for (const [nickname, group] of groups) {
      const survivor = pickSurvivor(group);
      const losers = group.filter((m) => m.id !== survivor.id);

      for (const loser of losers) {
        await tx.mentionLog.updateMany({ where: { memberId: loser.id }, data: { memberId: survivor.id } });
        await tx.gameParticipant.updateMany({ where: { memberId: loser.id }, data: { memberId: survivor.id } });
        await tx.member.delete({ where: { id: loser.id } });
        merged++;
      }

      // elo는 생존자 값을 유지한다 — 경기 기록에서 계산된 값이라 병합으로 만들어낼 수 없다.
      const nextLastActiveAt = latest([survivor.lastActiveAt, ...losers.map((l) => l.lastActiveAt)]);
      const nextRealName = survivor.realName ?? losers.find((l) => l.realName !== null)?.realName ?? null;
      const nextAge = survivor.age ?? losers.find((l) => l.age !== null)?.age ?? null;
      const nextRiotId = survivor.riotId ?? losers.find((l) => l.riotId !== null)?.riotId ?? null;

      // 아무 값도 바뀌지 않는 no-op UPDATE라도 Prisma는 @updatedAt을 갱신한다.
      // 재실행이 진짜 아무것도 안 건드리도록, 실제로 달라지는 그룹에서만 UPDATE를 낸다.
      const survivorChanged =
        losers.length > 0 ||
        nickname !== survivor.kakaoNickname ||
        datesDiffer(nextLastActiveAt, survivor.lastActiveAt) ||
        nextRealName !== survivor.realName ||
        nextAge !== survivor.age ||
        nextRiotId !== survivor.riotId;

      if (survivorChanged) {
        await tx.member.update({
          where: { id: survivor.id },
          data: {
            kakaoNickname: nickname,
            lastActiveAt: nextLastActiveAt,
            realName: nextRealName,
            age: nextAge,
            riotId: nextRiotId,
          },
        });
      }
    }

    const blankRealNames = await tx.member.findMany({
      where: { realName: null, kakaoNickname: { not: null } },
    });
    let realNamesFilled = 0;
    for (const member of blankRealNames) {
      const realName = realNameFromKakaoNickname(member.kakaoNickname!);
      if (realName === null) continue;
      await tx.member.update({ where: { id: member.id }, data: { realName } });
      realNamesFilled++;
    }

    return { normalized, merged, realNamesFilled };
  });
}
