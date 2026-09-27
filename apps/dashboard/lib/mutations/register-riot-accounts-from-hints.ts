import type { PrismaClient } from "@lolpamin/db";
import { discordRiotHint, kakaoRiotHint, parseRiotId, type ParsedRiotId } from "@lolpamin/core";
import type { LookupResult, LookupRiotAccount } from "@/lib/riot-api/account";
import { isOwnedByOtherError, registerRiotAccount } from "./register-riot-account";

export interface HintRegistrationResult {
  // 붙인 계정 수다. 한 회원이 여러 Riot ID를 적어 뒀으면 2 이상 오를 수 있다.
  registered: number;
  notFound: number;
  conflicts: number;
  // 조회할 Riot ID가 하나도 남지 않은 회원 — 힌트가 없거나 전부 이미 등록된 경우다.
  skipped: number;
  // 키 만료·부재로 중단됐다. 위 숫자는 중단 전까지의 집계다.
  unauthorized: boolean;
}

const RATE_LIMIT_BACKOFF_MS = 2000;

const memberSelect = {
  id: true,
  discordDisplayName: true,
  kakaoNickname: true,
  riotId: true,
  absorbed: { select: { kakaoNickname: true }, orderBy: { createdAt: "desc" } },
  riotAccounts: { select: { gameName: true, tagLine: true } },
} as const;

type HintSource = {
  discordDisplayName: string | null;
  kakaoNickname: string | null;
  riotId: string | null;
  absorbed: Array<{ kakaoNickname: string | null }>;
  riotAccounts: Array<{ gameName: string; tagLine: string }>;
};

// Riot ID는 대소문자를 가리지 않는다 — 같은 계정을 두 번 부르지 않도록 접어서 비교한다.
function hintKey(id: { gameName: string; tagLine: string }): string {
  return `${id.gameName.toLowerCase()}#${id.tagLine.toLowerCase()}`;
}

/**
 * 한 회원의 닉네임들에 적힌 Riot ID 전부. 디코 별명, 카톡 닉네임(묘비들 포함), 손으로 적은
 * riotId를 모두 읽는다 — 부계정을 여러 곳에 나눠 적어 두는 사람이 있어서, 예전처럼 첫
 * 힌트 하나만 보면 나머지 계정을 영영 못 찾는다.
 *
 * 이미 등록된 계정과 같은 ID는 빼고 돌려준다. 같은 답을 받으려고 호출 한도를 쓸 이유가
 * 없고, 그래서 배치를 다시 돌려도 새 ID만 조회한다.
 */
function pendingHints(m: HintSource): ParsedRiotId[] {
  const kakaoNicknames = [m.kakaoNickname, ...m.absorbed.map((a) => a.kakaoNickname)];
  const texts = [
    m.discordDisplayName ? discordRiotHint(m.discordDisplayName).riotId : null,
    ...kakaoNicknames.map((n) => (n ? kakaoRiotHint(n) : null)),
    m.riotId,
  ];

  const seen = new Set(m.riotAccounts.map(hintKey));
  const hints: ParsedRiotId[] = [];
  for (const text of texts) {
    const parsed = text ? parseRiotId(text) : null;
    if (!parsed) continue;
    const key = hintKey(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push(parsed);
  }
  return hints;
}

/** 확인창의 "N명" — 배치가 실제로 조회할 회원 수와 같은 조건이다. */
export async function countRiotLookupTargets(prisma: PrismaClient): Promise<number> {
  const members = await prisma.member.findMany({ where: { mergedIntoId: null }, select: memberSelect });
  return members.filter((m) => pendingHints(m).length > 0).length;
}

/**
 * 활성 회원의 닉네임에 적힌 Riot ID를 전부 조회해 계정을 붙인다. 한 사람이 본계정·부계정을
 * 디코 별명과 카톡 닉네임에 따로 적어 두는 일이 흔해서, 회원당 하나가 아니라 찾은 ID 수만큼
 * 계정이 붙는다.
 *
 * 순차 호출이다. 개발 키 한도(20/s, 100/2분)를 병렬로 쏘면 순간에 넘긴다. 한도에 걸리면
 * 한 번 쉬고 재시도하고, 또 걸리면 멈춘다 — 이미 등록된 ID는 다음 실행에서 조회 없이
 * 건너뛰므로 다시 돌리면 남은 것부터 이어서 한다. unauthorized는 즉시 중단 — 키가 죽었는데
 * 나머지를 부를 이유가 없다. 자동으로 돌리지 않는다. 디코 임포트에 끼우면 임포트가 외부
 * API 상태에 묶인다.
 */
export async function registerRiotAccountsFromHints(
  prisma: PrismaClient,
  lookup: LookupRiotAccount,
  deps: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<HintRegistrationResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const result: HintRegistrationResult = { registered: 0, notFound: 0, conflicts: 0, skipped: 0, unauthorized: false };

  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    select: memberSelect,
    orderBy: { createdAt: "asc" },
  });

  // 라벨은 바깥 루프를 끊기 위한 것이다 — 키 만료와 한도 초과는 한 회원이 아니라 배치
  // 전체를 멈춰야 한다.
  members: for (const m of members) {
    const hints = pendingHints(m);
    if (hints.length === 0) {
      result.skipped += 1;
      continue;
    }

    // 표기가 다른 두 힌트가 같은 PUUID로 풀릴 수 있다 — 이름을 바꾼 뒤 옛 표기가 다른
    // 닉네임에 남아 있는 경우다. 같은 계정을 두 번 세지 않는다.
    const registeredPuuids = new Set<string>();

    for (const hint of hints) {
      let outcome: LookupResult = await lookup(hint.gameName, hint.tagLine);
      if (!outcome.ok && outcome.reason === "rate_limited") {
        await sleep(RATE_LIMIT_BACKOFF_MS);
        outcome = await lookup(hint.gameName, hint.tagLine);
      }

      if (!outcome.ok) {
        if (outcome.reason === "unauthorized") {
          result.unauthorized = true;
          break members;
        }
        if (outcome.reason === "rate_limited") break members;
        if (outcome.reason === "not_found") result.notFound += 1;
        // unavailable: 이 한 건은 건너뛰고 계속 간다 — 일시적 오류일 가능성이 크다.
        continue;
      }

      if (registeredPuuids.has(outcome.account.puuid)) continue;

      try {
        await registerRiotAccount(prisma, m.id, outcome.account);
        registeredPuuids.add(outcome.account.puuid);
        result.registered += 1;
      } catch (error) {
        if (!isOwnedByOtherError(error)) throw error;
        result.conflicts += 1;
      }
    }
  }

  return result;
}
