import type { PrismaClient } from "@lolpamin/db";
import type { LookupResult, LookupRiotAccountByPuuid } from "@/lib/riot-api/account";
import { SITE_SETTING_ID } from "../queries/site-theme";

export interface RiotIdRefreshResult {
  // 표기가 실제로 달라져 고쳐 쓴 계정.
  updated: number;
  // 라이엇이 준 표기가 저장된 것과 같았다.
  unchanged: number;
  // 404 — 계정이 사라졌거나 PUUID가 더는 유효하지 않다. 행은 그대로 둔다.
  notFound: number;
  // 키 만료·부재로 중단됐다. 위 숫자는 중단 전까지의 집계다.
  unauthorized: boolean;
}

export const REFRESH_RIOT_IDS_ERRORS = {
  tooSoon: "오늘은 이미 갱신했습니다. 24시간 뒤에 다시 시도해 주세요.",
} as const;

const RATE_LIMIT_BACKOFF_MS = 2000;

// 하루 한 번. 달력 날짜가 아니라 24시간으로 재는 이유: 서버는 UTC로 도는데 사람은 KST로
// 생각해서, 달력으로 끊으면 저녁 9시 이후의 "오늘"이 서버의 내일이 된다. 24시간은 시간대를
// 몰라도 늘 같은 뜻이다.
export const REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
 * 저장해 둔 PUUID로 현재 Riot ID를 되읽어 표기를 고친다. 인게임에서 이름을 바꿔도 PUUID는
 * 그대로라, 회원 화면의 "이름#태그"가 옛 이름으로 남는 걸 이 배치가 푼다.
 *
 * 회원에게 붙은 계정만 본다 — `memberId = null`은 "우리 회원이 아님을 확인함"이라 화면에
 * 이름이 나갈 일이 없고, 그 표기를 최신으로 유지하려고 호출 한도를 쓸 이유가 없다.
 *
 * 하루 한 번으로 묶는다. 40개 계정이면 한 번에 40콜이고, 이름은 그렇게 자주 바뀌지 않는다.
 * 성공 시각은 실제로 호출을 쓴 실행만 기록한다 — 대상이 없어 한 번도 부르지 않았거나 키가
 * 죽어 바로 멈춘 실행까지 하루를 잡아먹으면, 키를 고친 뒤 오늘 안에 다시 못 돌린다.
 */
export async function refreshRiotAccountIds(
  prisma: PrismaClient,
  lookupByPuuid: LookupRiotAccountByPuuid,
  deps: { now?: Date; sleep?: (ms: number) => Promise<void> } = {},
): Promise<RiotIdRefreshResult> {
  const now = deps.now ?? new Date();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const { allowed } = await getRiotIdRefreshAvailability(prisma, now);
  if (!allowed) throw new Error(REFRESH_RIOT_IDS_ERRORS.tooSoon);

  const result: RiotIdRefreshResult = { updated: 0, unchanged: 0, notFound: 0, unauthorized: false };
  const accounts = await prisma.riotAccount.findMany({
    where: { memberId: { not: null } },
    select: { puuid: true, gameName: true, tagLine: true },
    orderBy: { firstSeenAt: "asc" },
  });

  let spentCalls = false;

  for (const account of accounts) {
    spentCalls = true;
    let outcome: LookupResult = await lookupByPuuid(account.puuid);
    if (!outcome.ok && outcome.reason === "rate_limited") {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      outcome = await lookupByPuuid(account.puuid);
    }

    if (!outcome.ok) {
      if (outcome.reason === "unauthorized") {
        result.unauthorized = true;
        return result;
      }
      if (outcome.reason === "rate_limited") break;
      if (outcome.reason === "not_found") result.notFound += 1;
      // unavailable: 이 한 건은 건너뛰고 계속 간다 — 일시적 오류일 가능성이 크다.
      continue;
    }

    const { gameName, tagLine } = outcome.account;
    if (gameName === account.gameName && tagLine === account.tagLine) {
      result.unchanged += 1;
      continue;
    }

    await prisma.riotAccount.update({
      where: { puuid: account.puuid },
      data: { gameName, tagLine },
    });
    result.updated += 1;
  }

  if (spentCalls) {
    await prisma.siteSetting.upsert({
      where: { id: SITE_SETTING_ID },
      create: { id: SITE_SETTING_ID, riotIdRefreshedAt: now },
      update: { riotIdRefreshedAt: now },
    });
  }

  return result;
}
