import type { PrismaClient } from "@lolpamin/db";
import type { LookupChampionMasteries, MasteryLookupResult } from "@/lib/riot-api/mastery";
import { SITE_SETTING_ID } from "../queries/site-theme";
import { REFRESH_COOLDOWN_MS } from "./refresh-riot-account-ids";

export interface MasteryRefreshResult {
  // 새 목록으로 교체한 계정.
  refreshed: number;
  // 404 — 옛 숙련도를 그대로 둔다.
  notFound: number;
  // 키 만료·부재로 중단됐다. 위 숫자는 중단 전까지의 집계다.
  unauthorized: boolean;
}

export const REFRESH_MASTERIES_ERRORS = {
  tooSoon: "오늘은 이미 숙련도를 갱신했습니다. 24시간 뒤에 다시 시도해 주세요.",
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
 * 일이 없어 호출 한도를 쓰지 않는다. 한도·시각 기록 규칙은 refreshRiotAccountIds와 같다.
 */
export async function refreshChampionMasteries(
  prisma: PrismaClient,
  lookup: LookupChampionMasteries,
  deps: { now?: Date; sleep?: (ms: number) => Promise<void> } = {},
): Promise<MasteryRefreshResult> {
  const now = deps.now ?? new Date();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const { allowed } = await getMasteryRefreshAvailability(prisma, now);
  if (!allowed) throw new Error(REFRESH_MASTERIES_ERRORS.tooSoon);

  const result: MasteryRefreshResult = { refreshed: 0, notFound: 0, unauthorized: false };
  const accounts = await prisma.riotAccount.findMany({
    where: { memberId: { not: null } },
    select: { id: true, puuid: true },
    orderBy: { firstSeenAt: "asc" },
  });

  let spentCalls = false;

  for (const account of accounts) {
    spentCalls = true;
    let outcome: MasteryLookupResult = await lookup(account.puuid);
    if (!outcome.ok && outcome.reason === "rate_limited") {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      outcome = await lookup(account.puuid);
    }

    if (!outcome.ok) {
      if (outcome.reason === "unauthorized") {
        result.unauthorized = true;
        return result;
      }
      if (outcome.reason === "rate_limited") break;
      if (outcome.reason === "not_found") result.notFound += 1;
      continue;
    }

    await prisma.$transaction([
      prisma.championMastery.deleteMany({ where: { riotAccountId: account.id } }),
      prisma.championMastery.createMany({
        data: outcome.masteries.map((m) => ({ riotAccountId: account.id, ...m })),
      }),
    ]);
    result.refreshed += 1;
  }

  if (spentCalls) {
    await prisma.siteSetting.upsert({
      where: { id: SITE_SETTING_ID },
      create: { id: SITE_SETTING_ID, masteryRefreshedAt: now },
      update: { masteryRefreshedAt: now },
    });
  }

  return result;
}
