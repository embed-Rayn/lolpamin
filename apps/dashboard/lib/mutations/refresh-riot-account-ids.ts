import type { PrismaClient } from "@lolpamin/db";
import type { LookupRiotAccount, LookupRiotAccountByPuuid } from "@/lib/riot-api/account";
import { withApiPuuid } from "./api-puuid";
import { SITE_SETTING_ID } from "../queries/site-theme";

export interface RiotIdRefreshResult {
  // 표기가 실제로 달라져 고쳐 쓴 계정.
  updated: number;
  // 라이엇이 준 표기가 저장된 것과 같았다.
  unchanged: number;
  // 404 — 계정이 사라졌거나, API PUUID가 없는데 저장된 이름#태그로도 못 찾았다. 행은 그대로 둔다.
  notFound: number;
  // 다시 받아도 복호화되지 않는 PUUID, 라이엇 쪽 일시 오류.
  failed: number;
  // 키 만료·부재로 중단됐다. 위 숫자는 중단 전까지의 집계다.
  unauthorized: boolean;
}

export const REFRESH_RIOT_IDS_ERRORS = {
  tooSoon: "최근 1시간 안에 이미 갱신했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

const RATE_LIMIT_BACKOFF_MS = 2000;

// 한 시간에 한 번. 호출 속도는 riotGet 앞의 제한기(1초 20회, 2분 100회)가 지키고, 이 제한은
// 한 실행이 2분 창을 거의 다 쓰는 배치를 연달아 누르지 못하게만 한다. 이름·숙련도는 한 시간보다
// 자주 바뀔 일이 없다.
export const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

export interface RiotIdRefreshAvailability {
  allowed: boolean;
  lastRefreshedAt: Date | null;
  // 갱신 대상 계정 수 — 확인창의 "N개"다.
  accountCount: number;
}

export async function getRiotIdRefreshAvailability(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<RiotIdRefreshAvailability> {
  const [row, accountCount] = await Promise.all([
    prisma.siteSetting.findUnique({
      where: { id: SITE_SETTING_ID },
      select: { riotIdRefreshedAt: true },
    }),
    prisma.riotAccount.count({ where: { memberId: { not: null } } }),
  ]);

  const lastRefreshedAt = row?.riotIdRefreshedAt ?? null;
  const allowed = lastRefreshedAt === null || now.getTime() - lastRefreshedAt.getTime() >= REFRESH_COOLDOWN_MS;
  return { allowed, lastRefreshedAt, accountCount };
}

/**
 * 저장해 둔 API PUUID로 현재 Riot ID를 되읽어 표기를 고친다. 인게임에서 이름을 바꿔도
 * PUUID는 그대로라, 회원 화면의 "이름#태그"가 옛 이름으로 남는 걸 이 배치가 푼다. API PUUID가
 * 없거나 복호화되지 않으면 withApiPuuid가 저장된 이름#태그로 다시 받는다.
 *
 * 회원에게 붙은 계정만 본다 — `memberId = null`은 "우리 회원이 아님을 확인함"이라 화면에
 * 이름이 나갈 일이 없고, 그 표기를 최신으로 유지하려고 호출 한도를 쓸 이유가 없다.
 *
 * REFRESH_COOLDOWN_MS에 한 번으로 묶는다. 시각은 한 계정이라도 읽어 낸 실행만 기록한다 —
 * 대상이 없거나 키가 죽었거나 전부 실패한 실행까지 제한 시간을 잡아먹으면, 원인을 고친 뒤
 * 바로 다시 못 돌린다.
 */
export async function refreshRiotAccountIds(
  prisma: PrismaClient,
  lookupByRiotId: LookupRiotAccount,
  lookupByPuuid: LookupRiotAccountByPuuid,
  deps: { now?: Date; sleep?: (ms: number) => Promise<void> } = {},
): Promise<RiotIdRefreshResult> {
  const now = deps.now ?? new Date();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const { allowed } = await getRiotIdRefreshAvailability(prisma, now);
  if (!allowed) throw new Error(REFRESH_RIOT_IDS_ERRORS.tooSoon);

  const result: RiotIdRefreshResult = { updated: 0, unchanged: 0, notFound: 0, failed: 0, unauthorized: false };
  const accounts = await prisma.riotAccount.findMany({
    where: { memberId: { not: null } },
    select: { id: true, apiPuuid: true, gameName: true, tagLine: true },
    orderBy: { firstSeenAt: "asc" },
  });

  for (const account of accounts) {
    let outcome = await withApiPuuid(prisma, account, lookupByRiotId, lookupByPuuid);
    if (!outcome.ok && outcome.reason === "rate_limited") {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      outcome = await withApiPuuid(prisma, account, lookupByRiotId, lookupByPuuid);
    }

    if (!outcome.ok) {
      if (outcome.reason === "unauthorized") {
        result.unauthorized = true;
        return result;
      }
      if (outcome.reason === "rate_limited") break;
      if (outcome.reason === "not_found") result.notFound += 1;
      // unavailable·invalid_id: 이 한 건은 건너뛰고 계속 간다.
      else result.failed += 1;
      continue;
    }

    const { gameName, tagLine } = outcome.account;
    if (gameName === account.gameName && tagLine === account.tagLine) {
      result.unchanged += 1;
      continue;
    }

    await prisma.riotAccount.update({
      where: { id: account.id },
      data: { gameName, tagLine },
    });
    result.updated += 1;
  }

  // 한 계정도 읽지 못한 실행은 제한 시간을 쓰지 않는다 — 원인을 없앤 뒤 바로 다시 돌릴 수 있게.
  if (result.updated + result.unchanged > 0) {
    await prisma.siteSetting.upsert({
      where: { id: SITE_SETTING_ID },
      create: { id: SITE_SETTING_ID, riotIdRefreshedAt: now },
      update: { riotIdRefreshedAt: now },
    });
  }

  return result;
}
