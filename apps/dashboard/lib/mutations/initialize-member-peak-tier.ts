import { Prisma, type PrismaClient, type MemberTier } from "@lolpamin/db";
import { parseRiotId, tierScore } from "@lolpamin/core";
import { lookupRiotAccount } from "../riot-api/account";
import { lookupSoloRank } from "../riot-api/solo-rank";
import { withApiPuuid } from "./api-puuid";

export class PeakInitializationError extends Error {
  constructor(message: string, public stopBatch = false) { super(message); }
}

export async function initializeMemberPeakTier(prisma: PrismaClient, memberId: string,
  deps = { account: lookupRiotAccount, rank: lookupSoloRank },
): Promise<{ skipped: boolean }> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, include: { riotAccounts: { orderBy: { id: "asc" } } } });
  if (!member || member.mergedIntoId) throw new PeakInitializationError("활동 회원을 찾지 못했습니다.");
  if (member.peakTierManual || member.peakTierInitializedAt || member.peakTier !== "UNRANKED") return { skipped: true };
  const ranks: MemberTier[] = [];
  function requireRank(result: Awaited<ReturnType<typeof lookupSoloRank>>) {
    if (result.ok) { ranks.push(result.tier); return; }
    const reason = result.reason;
    throw new PeakInitializationError(reason === "unauthorized" ? "Riot API 키를 확인해 주세요." : reason === "rate_limited" ? "Riot 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요." : "계정의 솔로랭크를 조회하지 못했습니다. 기존 값은 유지됩니다.", ["unauthorized", "rate_limited", "unavailable"].includes(reason));
  }
  if (member.riotAccounts.length) {
    for (const account of member.riotAccounts) requireRank(await withApiPuuid(prisma, { ...account }, deps.account, deps.rank));
  } else {
    const id = member.riotId && parseRiotId(member.riotId);
    if (!id) throw new PeakInitializationError("먼저 Riot 계정을 등록해 주세요.");
    const found = await deps.account(id.gameName, id.tagLine);
    if (!found.ok) requireRank(found);
    else requireRank(await deps.rank(found.account.puuid));
  }
  const score = (tier: MemberTier) => tierScore(tier) + (tier === "IRON" ? 0.5 : 0);
  const peakTier = ranks.reduce((best, tier) => score(tier) > score(best) ? tier : best, "UNRANKED" as MemberTier);
  await prisma.$transaction(async tx => {
    const accounts = await tx.riotAccount.findMany({ where: { memberId }, orderBy: { id: "asc" } });
    const signature = (list: typeof accounts) => JSON.stringify(list.map(a => [a.id, a.gameName, a.tagLine]));
    if (signature(accounts) !== signature(member.riotAccounts)) throw new PeakInitializationError("조회 중 연결 계정이 변경되었습니다. 다시 시도해 주세요.");
    const result = await tx.member.updateMany({
      where: { id: memberId, mergedIntoId: null, updatedAt: member.updatedAt, peakTier: "UNRANKED", peakTierManual: false, peakTierInitializedAt: null },
      data: { peakTier, peakTierInitializedAt: new Date() },
    });
    if (result.count !== 1) throw new PeakInitializationError("조회 중 회원 정보가 변경되었습니다. 다시 시도해 주세요.");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { skipped: false };
}
