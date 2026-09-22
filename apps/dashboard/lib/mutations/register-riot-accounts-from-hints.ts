import type { PrismaClient } from "@lolpamin/db";
import { discordRiotHint, kakaoRiotHint, parseRiotId, type ParsedRiotId } from "@lolpamin/core";
import type { LookupResult, LookupRiotAccount } from "@/lib/riot-api/account";
import { isOwnedByOtherError, registerRiotAccount } from "./register-riot-account";

export interface HintRegistrationResult {
  registered: number;
  notFound: number;
  conflicts: number;
  // 세 힌트 어디에도 파싱 가능한 Riot ID가 없던 회원.
  skipped: number;
  // 키 만료·부재로 중단됐다. 위 숫자는 중단 전까지의 집계다.
  unauthorized: boolean;
}

const RATE_LIMIT_BACKOFF_MS = 2000;

const targetWhere = { mergedIntoId: null, riotAccounts: { none: {} } } as const;

/** 확인창의 "N명" — 배치가 실제로 조회할 회원 수와 같은 조건이다. */
export async function countMembersWithoutRiotAccount(prisma: PrismaClient): Promise<number> {
  return prisma.member.count({ where: targetWhere });
}

// 디코 별명 → 카톡 닉네임(묘비 최신 것 포함) → 손으로 적은 riotId. 첫 번째로 파싱되는 것 하나.
// 디코 별명이 가장 앞인 이유: 세 힌트 중 유일하게 "게임닉#태그"가 관례의 고정 자리에 있다.
function firstHint(m: {
  discordDisplayName: string | null;
  kakaoNickname: string | null;
  riotId: string | null;
  absorbed: Array<{ kakaoNickname: string | null }>;
}): ParsedRiotId | null {
  const kakao = m.kakaoNickname ?? m.absorbed.find((a) => a.kakaoNickname !== null)?.kakaoNickname ?? null;
  const candidates = [
    m.discordDisplayName ? discordRiotHint(m.discordDisplayName).riotId : null,
    kakao ? kakaoRiotHint(kakao) : null,
    m.riotId,
  ];
  for (const text of candidates) {
    const parsed = text ? parseRiotId(text) : null;
    if (parsed) return parsed;
  }
  return null;
}

/**
 * 라이엇 계정이 하나도 없는 활성 회원의 닉네임 힌트로 Riot API를 조회해 계정을 붙인다.
 * 부계정까지 찾는 기능이 아니다 — 이미 계정이 있는 회원은 건드리지 않는다.
 *
 * 순차 호출이다. 개발 키 한도(20/s, 100/2분)에 40명은 여유지만 병렬로 쏘면 그 한도를
 * 순간에 넘긴다. unauthorized는 즉시 중단 — 키가 죽었는데 나머지를 부를 이유가 없다.
 * 자동으로 돌리지 않는다. 디코 임포트에 끼우면 임포트가 외부 API 상태에 묶인다.
 */
export async function registerRiotAccountsFromHints(
  prisma: PrismaClient,
  lookup: LookupRiotAccount,
  deps: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<HintRegistrationResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const result: HintRegistrationResult = { registered: 0, notFound: 0, conflicts: 0, skipped: 0, unauthorized: false };

  const members = await prisma.member.findMany({
    where: targetWhere,
    select: {
      id: true,
      discordDisplayName: true,
      kakaoNickname: true,
      riotId: true,
      absorbed: { select: { kakaoNickname: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const m of members) {
    const hint = firstHint(m);
    if (!hint) {
      result.skipped += 1;
      continue;
    }

    let outcome: LookupResult = await lookup(hint.gameName, hint.tagLine);
    if (!outcome.ok && outcome.reason === "rate_limited") {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      outcome = await lookup(hint.gameName, hint.tagLine);
    }

    if (!outcome.ok) {
      if (outcome.reason === "unauthorized") {
        result.unauthorized = true;
        break;
      }
      if (outcome.reason === "rate_limited") break;
      if (outcome.reason === "not_found") result.notFound += 1;
      // unavailable: 이 한 명은 건너뛰고 계속 간다 — 일시적 오류일 가능성이 크다.
      continue;
    }

    try {
      await registerRiotAccount(prisma, m.id, outcome.account);
      result.registered += 1;
    } catch (error) {
      if (!isOwnedByOtherError(error)) throw error;
      result.conflicts += 1;
    }
  }

  return result;
}
