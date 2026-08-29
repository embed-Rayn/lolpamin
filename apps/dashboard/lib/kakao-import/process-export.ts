import type { PrismaClient } from "@lolpamin/db";
import { parseKakaoExport } from "./parse-export";

export interface ProcessKakaoExportResult {
  newMembers: number;
  activityUpdates: number;
  skippedAsAlreadyProcessed: number;
}

export async function processKakaoExport(
  prisma: PrismaClient,
  exportText: string
): Promise<ProcessKakaoExportResult> {
  const mentions = parseKakaoExport(exportText);

  const watermark = await prisma.mentionLog.aggregate({ _max: { mentionedAt: true } });
  const cutoff = watermark._max.mentionedAt;

  const toProcess = cutoff ? mentions.filter((m) => m.mentionedAt > cutoff) : mentions;
  const skippedAsAlreadyProcessed = mentions.length - toProcess.length;

  return prisma.$transaction(async (tx) => {
    let newMembers = 0;
    let activityUpdates = 0;

    for (const mention of toProcess) {
      const existing = await tx.member.findFirst({ where: { kakaoNickname: mention.mentionedNickname } });

      let memberId: string;
      if (existing) {
        await tx.member.update({ where: { id: existing.id }, data: { lastActiveAt: mention.mentionedAt } });
        memberId = existing.id;
        activityUpdates++;
      } else {
        const created = await tx.member.create({
          data: { kakaoNickname: mention.mentionedNickname, lastActiveAt: mention.mentionedAt },
        });
        memberId = created.id;
        newMembers++;
      }

      await tx.mentionLog.create({
        data: { memberId, mentionedAt: mention.mentionedAt, rawMessage: mention.rawMessage },
      });
    }

    return { newMembers, activityUpdates, skippedAsAlreadyProcessed };
  });
}
