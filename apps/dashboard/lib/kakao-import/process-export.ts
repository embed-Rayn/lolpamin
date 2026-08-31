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
        // 묘비(과거 닉네임)에 히트했으면 활동은 생존자에게 올린다. 닉네임을 바꾼
        // 회원의 활동이 끊기지 않게 하는 지점이다. 멘션 로그는 히트한 행에 그대로
        // 달아, 나중에 연결을 끊으면 로그도 함께 돌아가게 한다.
        // realName은 건드리지 않는다 — 사람이 고쳐둔 값을 재업로드가 되돌리면 안 된다.
        const activeId = existing.mergedIntoId ?? existing.id;
        await tx.member.update({ where: { id: activeId }, data: { lastActiveAt: mention.mentionedAt } });
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
