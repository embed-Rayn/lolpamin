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
          // 핸들만 최신으로 맞춘다. 카톡 연결이나 elo 등 다른 필드는 건드리지 않는다.
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

      return { created, updated, skippedBots };
    },
    { timeout: 20000 },
  );
}
