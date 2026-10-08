import type { MemberTier, PrismaClient } from "@lolpamin/db";
import { isHigherTier } from "@lolpamin/core";
import type { LookupRiotAccount } from "@/lib/riot-api/account";
import type { LookupSoloRank } from "@/lib/riot-api/league";
import { withApiPuuid } from "./api-puuid";
import { SITE_SETTING_ID } from "../queries/site-theme";
import { REFRESH_COOLDOWN_MS } from "./refresh-riot-account-ids";

export interface PeakTierRefreshResult {
  // 현재 솔로랭크가 저장된 최고티어보다 높아 올린 회원.
  raised: number;
  // 랭크를 읽었지만 저장된 값이 같거나 더 높거나, 언랭이었던 회원.
  unchanged: number;
  // 404 — 이름#태그로 API PUUID를 못 찾았거나 계정이 사라졌다.
  notFound: number;
  // 다시 받아도 복호화되지 않는 PUUID, 라이엇 쪽 일시 오류.
  failed: number;
  // 키 만료·부재로 중단됐다. 위 숫자는 중단 전까지의 집계다.
  unauthorized: boolean;
}

export const REFRESH_PEAK_TIERS_ERRORS = {
  tooSoon: "최근 1시간 안에 이미 최고티어를 갱신했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

const RATE_LIMIT_BACKOFF_MS = 2000;

export interface PeakTierRefreshAvailability {
  allowed: boolean;
  lastRefreshedAt: Date | null;
  accountCount: number;
}

export async function getPeakTierRefreshAvailability(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<PeakTierRefreshAvailability> {
  const [row, accountCount] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { id: SITE_SETTING_ID }, select: { tierRefreshedAt: true } }),
    prisma.riotAccount.count({ where: { memberId: { not: null } } }),
  ]);
  const lastRefreshedAt = row?.tierRefreshedAt ?? null;
  const allowed = lastRefreshedAt === null || now.getTime() - lastRefreshedAt.getTime() >= REFRESH_COOLDOWN_MS;
  return { allowed, lastRefreshedAt, accountCount };
}

/**
 * 회원에게 붙은 계정마다 현재 솔로랭크를 받아, 회원의 계정 중 가장 높은 티어가 저장된
 * 최고티어보다 높으면 올린다 — 내리지는 않는다. League-V4는 현재 시즌만 주므로 지난 시즌
 * 기록은 채울 수 없고, 최고티어는 이 배치를 돌릴 때마다 올라갈 수만 있다.
 *
 * 숙련도 배치와 따로 둔 이유: 티어는 자주 볼 일이 없는데, 함께 돌리면 모스트를 갱신할
 * 때마다 호출이 두 배가 된다. API PUUID 처리·한도·시각 기록 규칙은 숙련도 배치와 같다.
 */
export async function refreshPeakTiers(
  prisma: PrismaClient,
  lookupByRiotId: LookupRiotAccount,
  lookupRank: LookupSoloRank,
  deps: { now?: Date; sleep?: (ms: number) => Promise<void> } = {},
): Promise<PeakTierRefreshResult> {
  const now = deps.now ?? new Date();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const { allowed } = await getPeakTierRefreshAvailability(prisma, now);
  if (!allowed) throw new Error(REFRESH_PEAK_TIERS_ERRORS.tooSoon);

  const result: PeakTierRefreshResult = { raised: 0, unchanged: 0, notFound: 0, failed: 0, unauthorized: false };
  const accounts = await prisma.riotAccount.findMany({
    where: { memberId: { not: null } },
    select: { id: true, memberId: true, apiPuuid: true, gameName: true, tagLine: true },
    orderBy: { firstSeenAt: "asc" },
  });

  // 리플레이 행과 이름#태그 조회 행이 한 라이엇 계정을 둘로 들고 있을 수 있다 — 한 번만 묻는다.
  const seenApiPuuids = new Set<string>();
  // 랭크를 읽어 낸 회원 → 그 회원 계정 중 가장 높은 현재 티어(전부 언랭이면 null).
  const bestTiers = new Map<string, MemberTier | null>();

  for (const account of accounts) {
    // API PUUID를 이미 아는 중복 행은 부르기 전에 거른다. 모르는 행은 받아 본 뒤에야 안다.
    if (account.apiPuuid !== null && seenApiPuuids.has(account.apiPuuid)) continue;

    let outcome = await withApiPuuid(prisma, account, lookupByRiotId, lookupRank);
    if (!outcome.ok && outcome.reason === "rate_limited") {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      outcome = await withApiPuuid(prisma, account, lookupByRiotId, lookupRank);
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
    if (seenApiPuuids.has(apiPuuid)) continue;
    seenApiPuuids.add(apiPuuid);

    // 쿼리가 memberId: not null만 골랐다.
    const memberId = account.memberId!;
    const best = bestTiers.get(memberId) ?? null;
    const tier = outcome.tier;
    bestTiers.set(memberId, tier !== null && (best === null || isHigherTier(tier, best)) ? tier : best);
  }

  // 키가 죽어 중단됐어도 그 전까지 읽은 티어는 쓴다 — 버릴 이유가 없다.
  if (bestTiers.size > 0) {
    const members = await prisma.member.findMany({
      where: { id: { in: [...bestTiers.keys()] } },
      select: { id: true, peakTier: true },
    });
    const raises = members.flatMap((member) => {
      const tier = bestTiers.get(member.id) ?? null;
      return tier !== null && isHigherTier(tier, member.peakTier) ? [{ id: member.id, tier }] : [];
    });
    if (raises.length > 0) {
      await prisma.$transaction(
        raises.map(({ id, tier }) => prisma.member.update({ where: { id }, data: { peakTier: tier } })),
      );
    }
    result.raised = raises.length;
    result.unchanged = members.length - raises.length;
  }

  // 한 계정도 읽지 못한 실행, 키가 죽어 중단된 실행은 한 시간을 쓰지 않는다 — 원인을 고친 뒤
  // 바로 다시 돌릴 수 있어야 한다.
  if (bestTiers.size > 0 && !result.unauthorized) {
    await prisma.siteSetting.upsert({
      where: { id: SITE_SETTING_ID },
      create: { id: SITE_SETTING_ID, tierRefreshedAt: now },
      update: { tierRefreshedAt: now },
    });
  }

  return result;
}
