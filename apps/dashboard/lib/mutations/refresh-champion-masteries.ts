import type { MemberTier, PrismaClient } from "@lolpamin/db";
import { isHigherTier } from "@lolpamin/core";
import type { LookupRiotAccount } from "@/lib/riot-api/account";
import type { LookupSoloRank } from "@/lib/riot-api/league";
import type { LookupChampionMasteries } from "@/lib/riot-api/mastery";
import { withApiPuuid } from "./api-puuid";
import { SITE_SETTING_ID } from "../queries/site-theme";
import { REFRESH_COOLDOWN_MS } from "./refresh-riot-account-ids";

export interface MasteryRefreshResult {
  // 새 목록으로 교체한 계정.
  refreshed: number;
  // 404 — 이름#태그로 API PUUID를 못 찾았거나 계정이 사라졌다. 옛 숙련도를 그대로 둔다.
  notFound: number;
  // 다시 받아도 복호화되지 않는 PUUID, 라이엇 쪽 일시 오류. 옛 숙련도를 그대로 둔다.
  failed: number;
  // 앞선 행과 같은 라이엇 계정(API PUUID가 같다) — 리플레이 행과 이름#태그 조회 행이 한 계정을
  // 둘로 들고 있는 경우다. 합산이 두 번 되지 않게 이 행의 숙련도는 비운다.
  duplicates: number;
  // 현재 솔로랭크가 저장된 최고티어보다 높아 최고티어를 올린 회원 수.
  peakRaised: number;
  // 키 만료·부재로 중단됐다. 위 숫자는 중단 전까지의 집계다.
  unauthorized: boolean;
}

export const REFRESH_MASTERIES_ERRORS = {
  tooSoon: "최근 1시간 안에 이미 숙련도를 갱신했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

const RATE_LIMIT_BACKOFF_MS = 2000;

export interface MasteryRefreshAvailability {
  allowed: boolean;
  lastRefreshedAt: Date | null;
  accountCount: number;
}

export async function getMasteryRefreshAvailability(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<MasteryRefreshAvailability> {
  const [row, accountCount] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { id: SITE_SETTING_ID }, select: { masteryRefreshedAt: true } }),
    prisma.riotAccount.count({ where: { memberId: { not: null } } }),
  ]);
  const lastRefreshedAt = row?.masteryRefreshedAt ?? null;
  const allowed = lastRefreshedAt === null || now.getTime() - lastRefreshedAt.getTime() >= REFRESH_COOLDOWN_MS;
  return { allowed, lastRefreshedAt, accountCount };
}

/**
 * 회원에게 붙은 계정마다 숙련도 목록을 새로 받아 통째로 바꾼다. 외부인 계정은 화면에 나갈
 * 일이 없어 호출 한도를 쓰지 않는다. API PUUID가 없거나 복호화되지 않으면 withApiPuuid가
 * 이름#태그로 다시 받는다. 한도·시각 기록 규칙은 refreshRiotAccountIds와 같다 — 한 계정이라도
 * 갱신한 실행만 하루를 쓴다.
 *
 * 같은 실행에서 계정마다 현재 솔로랭크도 받아, 회원의 계정 중 가장 높은 티어가 저장된
 * 최고티어보다 높으면 올린다(내리지는 않는다). 랭크 조회가 실패해도 숙련도 결과는 그대로다 —
 * 그 계정의 티어만 이번에 건너뛴다.
 */
export async function refreshChampionMasteries(
  prisma: PrismaClient,
  lookupByRiotId: LookupRiotAccount,
  lookup: LookupChampionMasteries,
  lookupRank: LookupSoloRank,
  deps: { now?: Date; sleep?: (ms: number) => Promise<void> } = {},
): Promise<MasteryRefreshResult> {
  const now = deps.now ?? new Date();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const { allowed } = await getMasteryRefreshAvailability(prisma, now);
  if (!allowed) throw new Error(REFRESH_MASTERIES_ERRORS.tooSoon);

  const result: MasteryRefreshResult = {
    refreshed: 0,
    notFound: 0,
    failed: 0,
    duplicates: 0,
    peakRaised: 0,
    unauthorized: false,
  };
  const accounts = await prisma.riotAccount.findMany({
    where: { memberId: { not: null } },
    select: { id: true, memberId: true, apiPuuid: true, gameName: true, tagLine: true },
    orderBy: { firstSeenAt: "asc" },
  });

  const seenApiPuuids = new Set<string>();
  // 회원별로 이번 실행에서 본 가장 높은 현재 티어.
  const bestTiers = new Map<string, MemberTier>();

  for (const account of accounts) {
    let outcome = await withApiPuuid(prisma, account, lookupByRiotId, lookup);
    if (!outcome.ok && outcome.reason === "rate_limited") {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      outcome = await withApiPuuid(prisma, account, lookupByRiotId, lookup);
    }

    if (!outcome.ok) {
      if (outcome.reason === "unauthorized") {
        result.unauthorized = true;
        break;
      }
      if (outcome.reason === "rate_limited") break;
      if (outcome.reason === "not_found") result.notFound += 1;
      else result.failed += 1;
      continue;
    }

    // withApiPuuid가 성공했다면 account.apiPuuid는 채워져 있다.
    const apiPuuid = account.apiPuuid!;
    if (seenApiPuuids.has(apiPuuid)) {
      await prisma.championMastery.deleteMany({ where: { riotAccountId: account.id } });
      result.duplicates += 1;
      continue;
    }
    seenApiPuuids.add(apiPuuid);

    await prisma.$transaction([
      prisma.championMastery.deleteMany({ where: { riotAccountId: account.id } }),
      prisma.championMastery.createMany({
        data: outcome.masteries.map((m) => ({ riotAccountId: account.id, ...m })),
      }),
    ]);
    result.refreshed += 1;

    let rank = await lookupRank(apiPuuid);
    if (!rank.ok && rank.reason === "rate_limited") {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      rank = await lookupRank(apiPuuid);
    }
    if (!rank.ok) {
      if (rank.reason === "unauthorized") {
        result.unauthorized = true;
        break;
      }
      continue;
    }
    // 쿼리가 memberId: not null만 골랐다.
    const memberId = account.memberId!;
    const best = bestTiers.get(memberId);
    if (rank.tier !== null && (best === undefined || isHigherTier(rank.tier, best))) {
      bestTiers.set(memberId, rank.tier);
    }
  }

  // 키가 죽어 중단됐어도 그 전까지 받은 티어는 쓴다 — 버릴 이유가 없다.
  await raisePeakTiers(prisma, bestTiers, result);

  // 한 계정도 갱신하지 못한 실행, 키가 죽어 중단된 실행은 하루를 쓰지 않는다 — 키를 고치거나
  // 원인을 없앤 뒤 바로 다시 돌릴 수 있어야 한다.
  if (result.refreshed > 0 && !result.unauthorized) {
    await prisma.siteSetting.upsert({
      where: { id: SITE_SETTING_ID },
      create: { id: SITE_SETTING_ID, masteryRefreshedAt: now },
      update: { masteryRefreshedAt: now },
    });
  }

  return result;
}

async function raisePeakTiers(
  prisma: PrismaClient,
  bestTiers: Map<string, MemberTier>,
  result: MasteryRefreshResult,
): Promise<void> {
  if (bestTiers.size === 0) return;
  const members = await prisma.member.findMany({
    where: { id: { in: [...bestTiers.keys()] } },
    select: { id: true, peakTier: true },
  });
  const raises = members.flatMap((member) => {
    const tier = bestTiers.get(member.id)!;
    return isHigherTier(tier, member.peakTier) ? [{ id: member.id, tier }] : [];
  });
  if (raises.length === 0) return;
  await prisma.$transaction(
    raises.map(({ id, tier }) => prisma.member.update({ where: { id }, data: { peakTier: tier } })),
  );
  result.peakRaised = raises.length;
}
