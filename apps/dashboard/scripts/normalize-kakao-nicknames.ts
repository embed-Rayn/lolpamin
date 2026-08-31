// npx tsx scripts/normalize-kakao-nicknames.ts  (apps/dashboard 에서 실행)
// tsx는 tsconfig의 "@/" 별칭을 해석하지 않으므로 상대 경로로 임포트한다.
import { prisma } from "@lolpamin/db";
import { normalizeKakaoNicknames } from "../lib/mutations/normalize-kakao-nicknames";

async function main(): Promise<void> {
  const before = {
    members: await prisma.member.count(),
    mentionLogs: await prisma.mentionLog.count(),
  };
  console.log("before:", before);

  const result = await normalizeKakaoNicknames(prisma);
  console.log("result:", result);

  console.log("after:", {
    members: await prisma.member.count(),
    mentionLogs: await prisma.mentionLog.count(),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
