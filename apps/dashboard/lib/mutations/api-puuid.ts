import type { PrismaClient } from "@lolpamin/db";
import type { LookupFailure, LookupRiotAccount } from "@/lib/riot-api/account";

export interface ApiAccount {
  id: string;
  apiPuuid: string | null;
  gameName: string;
  tagLine: string;
}

type Failure = { ok: false; reason: LookupFailure };

/**
 * Riot API를 이 계정의 API PUUID로 부른다. API PUUID가 없거나(리플레이로만 등록된 계정)
 * 호출이 invalid_id(400, 다른 앱이 암호화한 PUUID)로 돌아오면 저장된 이름#태그로 한 번 다시
 * 받아 RiotAccount.apiPuuid에 쓰고 한 번 더 부른다. 같은 앱이면 키를 새로 발급해도 값이 같아서,
 * 계정마다 사실상 처음 한 번만 다시 받는다.
 *
 * account.apiPuuid를 새 값으로 바꿔 놓는다 — 호출자가 rate limit 뒤에 같은 객체로 다시 부를 때
 * 이름 조회를 반복하지 않게.
 */
export async function withApiPuuid<R extends { ok: true } | Failure>(
  prisma: PrismaClient,
  account: ApiAccount,
  lookupByRiotId: LookupRiotAccount,
  call: (apiPuuid: string) => Promise<R>,
): Promise<R | Failure> {
  if (account.apiPuuid !== null) {
    const first = await call(account.apiPuuid);
    if (first.ok || first.reason !== "invalid_id") return first;
  }

  const found = await lookupByRiotId(account.gameName, account.tagLine);
  if (!found.ok) return found;

  account.apiPuuid = found.account.puuid;
  await prisma.riotAccount.update({ where: { id: account.id }, data: { apiPuuid: found.account.puuid } });
  return call(found.account.puuid);
}
