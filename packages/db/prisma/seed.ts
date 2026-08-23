import { prisma } from "../src/index";

async function main() {
  await prisma.gameParticipant.deleteMany();
  await prisma.gameResult.deleteMany();
  await prisma.mentionLog.deleteMany();
  await prisma.member.deleteMany();

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  const fullMembers = await Promise.all(
    [
      { realName: "김도현", riotId: "칼바람장인#KR1", discordUserId: "d-dohyun", discordHandle: "dohyun_kr", kakaoUserId: "k-dohyun", kakaoNickname: "도현", elo: 1482, days: 0 },
      { realName: "박서준", riotId: "미드갱킹#KR1", discordUserId: "d-seojun", discordHandle: "seojun.p", kakaoUserId: "k-seojun", kakaoNickname: "서준찡", elo: 1618, days: 1 },
      { realName: "정우성", riotId: "정글의왕#KR1", discordUserId: "d-woosung", discordHandle: "woosung", kakaoUserId: "k-woosung", kakaoNickname: "우성", elo: 1701, days: 1 },
      { realName: "신유진", riotId: "유진미드#KR1", discordUserId: "d-yujin", discordHandle: "yujin.s", kakaoUserId: "k-yujin", kakaoNickname: "유진", elo: 1573, days: 17 },
      { realName: "배성민", riotId: "성민탑#KR1", discordUserId: "d-sungmin", discordHandle: "sungmin.b", kakaoUserId: "k-sungmin", kakaoNickname: "성민", elo: 1489, days: 33 },
    ].map((m) =>
      prisma.member.create({
        data: {
          realName: m.realName,
          riotId: m.riotId,
          discordUserId: m.discordUserId,
          discordHandle: m.discordHandle,
          kakaoUserId: m.kakaoUserId,
          kakaoNickname: m.kakaoNickname,
          elo: m.elo,
          lastActiveAt: daysAgo(m.days),
        },
      })
    )
  );

  // Half members: Discord-only (no Kakao yet)
  await prisma.member.create({
    data: { discordUserId: "d-nightowl", discordHandle: "nightowl_92", discordJoinedAt: daysAgo(21) },
  });
  await prisma.member.create({
    data: { discordUserId: "d-ttoro", discordHandle: "ttoro.exe", discordJoinedAt: daysAgo(9) },
  });

  // Half members: Kakao-only (no Discord yet)
  await prisma.member.create({
    data: { kakaoUserId: "k-owl", kakaoNickname: "올빼미", lastActiveAt: daysAgo(2) },
  });
  await prisma.member.create({
    data: { kakaoUserId: "k-ttoro2", kakaoNickname: "또로", lastActiveAt: daysAgo(0) },
  });

  await prisma.mentionLog.create({
    data: { memberId: fullMembers[0].id, mentionedAt: daysAgo(0) },
  });

  const [blue1, blue2, red1, red2] = fullMembers;
  const game = await prisma.gameResult.create({
    data: { playedAt: daysAgo(1), winner: "BLUE" },
  });
  await prisma.gameParticipant.createMany({
    data: [
      { gameResultId: game.id, memberId: blue1.id, team: "BLUE", eloBefore: 1466, eloAfter: 1482 },
      { gameResultId: game.id, memberId: blue2.id, team: "BLUE", eloBefore: 1602, eloAfter: 1618 },
      { gameResultId: game.id, memberId: red1.id, team: "RED", eloBefore: 1717, eloAfter: 1701 },
      { gameResultId: game.id, memberId: red2.id, team: "RED", eloBefore: 1589, eloAfter: 1573 },
    ],
  });

  console.log(`Seeded ${fullMembers.length + 4} members.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
