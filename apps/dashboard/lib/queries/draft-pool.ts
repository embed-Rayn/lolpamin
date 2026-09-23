import type { Lane, PrismaClient } from "@lolpamin/db";
import { topMasteries, type MasteryEntry } from "@lolpamin/core";
import { getLinkedMembers } from "./linked-members";

export interface DraftPoolMember {
  id: string;
  name: string;
  mmr: number;
  wins: number;
  losses: number;
  mainLane: Lane | null;
  subLane: Lane | null;
  // 대표 계정 "이름#태그". 계정이 없으면 손으로 적은 Member.riotId, 그것도 없으면 null.
  riotId: string | null;
  // 대표 계정 외 계정 수 — 화면의 "+N".
  extraAccounts: number;
  // 모든 계정을 합산한 상위 3개.
  masteries: MasteryEntry[];
}

/**
 * 내전 팀 빌더의 후보. 누가 뛸 수 있는지·MMR·협곡 승패는 getLinkedMembers가 이미 정하므로
 * 그 결과에 라인·계정·숙련도만 붙인다 — 두 화면이 서로 다른 회원 목록을 말하지 않게.
 */
export async function getDraftPool(prisma: PrismaClient): Promise<DraftPoolMember[]> {
  const linked = await getLinkedMembers();
  const details = await prisma.member.findMany({
    where: { id: { in: linked.map((m) => m.id) } },
    select: {
      id: true,
      mainLane: true,
      subLane: true,
      riotId: true,
      riotAccounts: {
        orderBy: { firstSeenAt: "asc" },
        select: {
          gameName: true,
          tagLine: true,
          masteries: { select: { championId: true, level: true, points: true } },
        },
      },
    },
  });
  const byId = new Map(details.map((d) => [d.id, d]));

  return linked.map((m) => {
    const detail = byId.get(m.id)!;
    const accounts = detail.riotAccounts;

    // 숙련 포인트가 가장 많은 계정을 대표로 — 사람들이 "그 사람 계정"으로 아는 쪽이다.
    // 동점이면 먼저 본 계정.
    let representative = accounts[0] ?? null;
    let best = -1;
    for (const account of accounts) {
      const total = account.masteries.reduce((sum, row) => sum + row.points, 0);
      if (total > best) {
        best = total;
        representative = account;
      }
    }

    return {
      id: m.id,
      name: m.name,
      mmr: m.mmr,
      wins: m.wins,
      losses: m.losses,
      mainLane: detail.mainLane,
      subLane: detail.subLane,
      riotId: representative ? `${representative.gameName}#${representative.tagLine}` : detail.riotId,
      extraAccounts: Math.max(0, accounts.length - 1),
      masteries: topMasteries(accounts.flatMap((account) => account.masteries)),
    };
  });
}
