import type { GameMode, Prisma, PrismaClient, Team } from "@lolpamin/db";
import { calculateTeamMmrChange } from "@lolpamin/core";
import { getMmrConfig } from "../queries/mmr-config";
import { ratingField } from "../rating-field";

export interface SaveGameResultInput {
  playedAt: Date;
  blueMemberIds: string[];
  redMemberIds: string[];
  winner: "BLUE" | "RED";
  // 입력한 운영진. 스크립트로 넣는 경로가 생기면 null이 된다.
  createdById?: string | null;
  // 리플레이에서 들어온 경기의 내용 해시. 같은 파일을 두 번 올리는 것을 DB가 막는다.
  // 손으로 입력한 경기는 null이다.
  replayKey?: string | null;
  // 어느 레이팅 트랙인지. 기본은 협곡 — 기존 호출부(리플레이 임포트 포함)를 그대로 둔다.
  mode?: GameMode;
}

export interface SaveGameResultOutput {
  gameResultId: string;
  updates: Array<{ memberId: string; mmrBefore: number; mmrAfter: number }>;
}

/**
 * 호출자가 연 트랜잭션 안에서 도는 본문. 리플레이 임포트가 계정 등록·활동 갱신과 이 저장을
 * 한 트랜잭션으로 묶어야 해서 따로 뺐다. 직접 부를 일이 없으면 saveGameResult를 쓴다.
 */
export async function saveGameResultTx(
  tx: Prisma.TransactionClient,
  input: SaveGameResultInput
): Promise<SaveGameResultOutput> {
  const { playedAt, blueMemberIds, redMemberIds, winner, createdById = null, replayKey = null, mode = "RIFT" } = input;
  const field = ratingField(mode);

  const overlap = blueMemberIds.filter((id) => redMemberIds.includes(id));
  if (overlap.length > 0) {
    throw new Error("A participant cannot be on both teams");
  }

  const allIds = [...blueMemberIds, ...redMemberIds];
  // 카톡 닉네임은 흡수해도 묘비에 남으므로(활동 기록을 옮기지 않으려고), 연결 여부를
  // 보려면 묘비의 닉네임도 함께 읽어와야 한다.
  const members = await tx.member.findMany({
    where: { id: { in: allIds } },
    include: { absorbed: { select: { kakaoNickname: true } }, riotAccounts: { select: { id: true } } },
  });

  if (members.length !== allIds.length) {
    throw new Error("One or more participants do not exist");
  }
  for (const member of members) {
    if (member.mergedIntoId !== null) {
      throw new Error(`Participant ${member.id} was absorbed into another member and cannot play`);
    }
    // kakaoUserId는 이 시스템에서 채워지는 경로가 없다(카톡 봇 폐기). 연결은
    // kakaoNickname으로 이뤄지므로 그것을 연결의 근거로 본다 — 자기 행이든, 흡수해 둔 묘비든.
    const hasKakaoNickname =
      member.kakaoNickname !== null || member.absorbed.some((a) => a.kakaoNickname !== null);
    // 리플레이에서 확인된 계정이 붙어 있으면 반쪽 회원도 뛸 수 있다. RiotAccount는
    // PUUID로만 만들어지므로 손으로 위조할 수 없고, "확실히 정착한 한 사람인가"라는
    // 원래 규칙의 목적을 이미 충족한다.
    const hasRiotAccount = member.riotAccounts.length > 0;
    if (!hasRiotAccount && (!member.discordUserId || !hasKakaoNickname)) {
      throw new Error(`Participant ${member.id} must be fully linked to play in a match`);
    }
  }

  const byId = new Map(members.map((m) => [m.id, m]));
  // 설정은 트랜잭션 안에서 읽는다 — 저장 도중 어드민이 K값을 바꿔도 이 경기는
  // 하나의 설정으로만 계산된다.
  const config = await getMmrConfig(tx);
  const { blueDelta, redDelta } = calculateTeamMmrChange({
    blueRatings: blueMemberIds.map((id) => byId.get(id)![field]),
    redRatings: redMemberIds.map((id) => byId.get(id)![field]),
    winner,
    config,
  });

  const gameResult = await tx.gameResult.create({
    data: { playedAt, winner: winner as Team, createdById, replayKey, mode },
  });

  const updates: SaveGameResultOutput["updates"] = [];

  for (const [team, ids, delta] of [
    ["BLUE", blueMemberIds, blueDelta],
    ["RED", redMemberIds, redDelta],
  ] as const) {
    for (const memberId of ids) {
      const mmrBefore = byId.get(memberId)![field];
      const mmrAfter = mmrBefore + delta;
      await tx.gameParticipant.create({
        data: { gameResultId: gameResult.id, memberId, team: team as Team, mmrBefore, mmrAfter },
      });
      await tx.member.update({ where: { id: memberId }, data: { [field]: mmrAfter } });
      updates.push({ memberId, mmrBefore, mmrAfter });
    }
  }

  return { gameResultId: gameResult.id, updates };
}

export async function saveGameResult(
  prisma: PrismaClient,
  input: SaveGameResultInput
): Promise<SaveGameResultOutput> {
  return prisma.$transaction((tx) => saveGameResultTx(tx, input));
}
