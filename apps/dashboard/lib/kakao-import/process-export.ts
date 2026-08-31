import type { PrismaClient } from "@lolpamin/db";
import { normalizeKakaoNickname, realNameFromKakaoNickname } from "@lolpamin/core";
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
      // 닉네임 뒤에 붙은 "(7시30분 도착)" 같은 메모를 떼고 매칭한다. 메모까지 포함해
      // 매칭하면 같은 사람이 여러 회원으로 갈라진다.
      const nickname = normalizeKakaoNickname(mention.mentionedNickname);
      if (nickname.length === 0) continue;

      const existing = await tx.member.findFirst({ where: { kakaoNickname: nickname } });

      let memberId: string;
      if (existing) {
        // realName은 건드리지 않는다 — 사람이 고쳐둔 값을 재업로드가 되돌리면 안 된다.
        await tx.member.update({ where: { id: existing.id }, data: { lastActiveAt: mention.mentionedAt } });
        memberId = existing.id;
        activityUpdates++;
      } else {
        const created = await tx.member.create({
          data: {
            kakaoNickname: nickname,
            realName: realNameFromKakaoNickname(nickname),
            lastActiveAt: mention.mentionedAt,
          },
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
