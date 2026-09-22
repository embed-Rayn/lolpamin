import type { PrismaClient } from "@lolpamin/db";
import type { RiotAccountLookup } from "@/lib/riot-api/account";

const OWNED_BY_OTHER_PREFIX = "이미 ";
const OWNED_BY_OTHER_SUFFIX = " 회원의 계정입니다.";

export const REGISTER_RIOT_ACCOUNT_ERRORS = {
  memberMissing: "회원이 존재하지 않습니다.",
  ownedByOther: (name: string) => `${OWNED_BY_OTHER_PREFIX}${name}${OWNED_BY_OTHER_SUFFIX}`,
} as const;

/** ownedByOther 메시지는 이름이 들어가 상수 비교가 안 된다. 서버 액션이 안내 문구를 고를 때 쓴다. */
export function isOwnedByOtherError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith(OWNED_BY_OTHER_PREFIX) &&
    error.message.endsWith(OWNED_BY_OTHER_SUFFIX)
  );
}

function displayName(m: {
  realName: string | null;
  kakaoNickname: string | null;
  discordDisplayName: string | null;
}): string {
  return m.realName ?? m.kakaoNickname ?? m.discordDisplayName ?? "다른";
}

/**
 * 검증된 PUUID(리플레이 또는 Riot API 응답)를 회원에게 붙인다. 손으로 적은 문자열로는
 * 부르지 않는다 — 그 문자열은 lookupRiotAccount의 입력이지 이 함수의 입력이 아니다.
 *
 * 다른 회원이 이미 가진 PUUID는 거부한다. 덮어쓰면 한 사람의 계정이 조용히 옮겨간다 —
 * 옮기려면 그쪽에서 먼저 removeRiotAccount로 뗀다. memberId가 null(외부인 확정)이면
 * 관리자의 명시적 등록이 그 확정을 이긴다.
 */
export async function registerRiotAccount(
  prisma: PrismaClient,
  memberId: string,
  account: RiotAccountLookup,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // FK 위반보다 먼저 잡는다 — saveReplayImport와 같은 이유로, Prisma의 긴 에러 대신
    // 한글 안내가 나가야 한다.
    const member = await tx.member.findUnique({ where: { id: memberId }, select: { id: true } });
    if (!member) throw new Error(REGISTER_RIOT_ACCOUNT_ERRORS.memberMissing);

    const now = new Date();
    const existing = await tx.riotAccount.findUnique({
      where: { puuid: account.puuid },
      include: { member: { select: { realName: true, kakaoNickname: true, discordDisplayName: true } } },
    });

    if (!existing) {
      await tx.riotAccount.create({
        data: {
          puuid: account.puuid,
          memberId,
          gameName: account.gameName,
          tagLine: account.tagLine,
          lastSeenAt: now,
        },
      });
      return;
    }

    if (existing.memberId !== null && existing.memberId !== memberId) {
      throw new Error(REGISTER_RIOT_ACCOUNT_ERRORS.ownedByOther(displayName(existing.member!)));
    }

    await tx.riotAccount.update({
      where: { puuid: account.puuid },
      data: {
        memberId,
        gameName: account.gameName,
        tagLine: account.tagLine,
        lastSeenAt: now,
        // 주인이 바뀌면 흡수 표식은 의미를 잃는다 — saveReplayImport와 같은 규칙.
        absorbedFromId: existing.memberId === memberId ? existing.absorbedFromId : null,
      },
    });
  });
}

/**
 * 행을 지운다. memberId = null로 두면 "외부인으로 확정, 다시 묻지 말 것"이 되어 잘못 붙인
 * 계정을 뗀 것과 구별되지 않는다. 지우면 다음 리플레이에서 다시 후보로 뜬다.
 */
export async function removeRiotAccount(prisma: PrismaClient, riotAccountId: string): Promise<void> {
  await prisma.riotAccount.deleteMany({ where: { id: riotAccountId } });
}
