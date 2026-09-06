// npx tsx scripts/normalize-kakao-nicknames.ts  (apps/dashboard 에서 실행)
// tsx는 tsconfig의 "@/" 별칭을 해석하지 않으므로 상대 경로로 임포트한다.
import { prisma } from "@lolpamin/db";
import { normalizeKakaoNicknames } from "../lib/mutations/normalize-kakao-nicknames";

async function main(): Promise<void> {
  const before = {
    members: await prisma.member.count(),
    activeMembers: await prisma.member.count({ where: { mergedIntoId: null } }),
    mentionLogs: await prisma.mentionLog.count(),
  };
  console.log("before:", before);

  const result = await normalizeKakaoNicknames(prisma);
  console.log("result:", result);
  console.log("mergedPairs:");
  for (const pair of result.mergedPairs) {
    console.log(`  ${pair.loserId} (${JSON.stringify(pair.loserNickname)}) -> ${pair.survivorId} (${JSON.stringify(pair.survivorNickname)})` +
      ` [묘비에 남은 mentionLogs=${pair.loserMentionLogs}, gameParticipants=${pair.loserGameParticipants}]`);
  }

  console.log("skippedGroups:");
  for (const group of result.skippedGroups) {
    console.log(`  ${JSON.stringify(group.matchKey)} [${group.memberIds.join(", ")}] — ${group.reason}`);
  }

  console.log("after:", {
    members: await prisma.member.count(),
    activeMembers: await prisma.member.count({ where: { mergedIntoId: null } }),
    mentionLogs: await prisma.mentionLog.count(),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
