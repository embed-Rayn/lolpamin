import type { PrismaClient } from "@lolpamin/db";

export interface DiscordGuildMember {
  discordUserId: string;
  username: string;
  displayName: string | null;
  isBot: boolean;
  joinedAt: Date | null;
}

export interface ImportDiscordMembersResult {
  created: number;
  updated: number;
  skippedBots: number;
  /** Discord-only halves of accounts that left the guild, deleted outright. */
  removed: number;
  /** Members that left the guild but hold a record — only their Discord side is cleared. */
  detached: number;
}

export async function importDiscordMembers(
  prisma: PrismaClient,
  members: DiscordGuildMember[]
): Promise<ImportDiscordMembersResult> {
  return prisma.$transaction(
    async (tx) => {
      let created = 0;
      let updated = 0;
      let skippedBots = 0;

      for (const member of members) {
        if (member.isBot) {
          skippedBots++;
          continue;
        }

        const existing = await tx.member.findUnique({ where: { discordUserId: member.discordUserId } });

        if (existing) {
          // 핸들만 최신으로 맞춘다. 카톡 연결이나 mmr 등 다른 필드는 건드리지 않는다.
          await tx.member.update({
            where: { id: existing.id },
            data: {
              discordHandle: member.username,
              discordDisplayName: member.displayName,
              discordJoinedAt: existing.discordJoinedAt ?? member.joinedAt,
            },
          });
          updated++;
        } else {
          await tx.member.create({
            data: {
              discordUserId: member.discordUserId,
              discordHandle: member.username,
              discordDisplayName: member.displayName,
              discordJoinedAt: member.joinedAt,
            },
          });
          created++;
        }
      }

      // A kicked or departed account stays in the guild list no longer. An empty list is
      // more likely a broken response than an empty guild, so it prunes nothing.
      const humans = members.filter((m) => !m.isBot).map((m) => m.discordUserId);
      let removed = 0;
      let detached = 0;
      if (humans.length > 0) {
        const gone = await tx.member.findMany({
          where: { discordUserId: { not: null, notIn: humans } },
          include: {
            _count: { select: { mentionLogs: true, participants: true, riotAccounts: true, absorbed: true } },
          },
        });
        for (const m of gone) {
          const holdsNothing =
            m.kakaoNickname === null &&
            m.kakaoUserId === null &&
            m.realName === null &&
            m.age === null &&
            m.riotId === null &&
            m.note === null &&
            m.mainLane === null &&
            m.subLane === null &&
            m.tier === "UNRANKED" &&
            m.peakTier === "UNRANKED" &&
            Object.values(m._count).every((n) => n === 0);
          if (holdsNothing) {
            await tx.member.delete({ where: { id: m.id } });
            removed++;
          } else {
            // Games, mentions and admin-written values outlive the Discord account; deleting
            // the whole member stays a deliberate act on /member-admin.
            await tx.member.update({
              where: { id: m.id },
              data: { discordUserId: null, discordHandle: null, discordDisplayName: null, discordJoinedAt: null },
            });
            detached++;
          }
        }
      }

      return { created, updated, skippedBots, removed, detached };
    },
    { timeout: 20000 },
  );
}
