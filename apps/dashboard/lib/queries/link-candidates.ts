import { prisma } from "@/lib/prisma";
import { isSoleCandidate, scoreAccountMatch } from "@lolpamin/core";

/** 한 카톡 계정에 붙일 수 있는 상대 후보. */
export interface LinkCandidate {
  memberId: string;
  handle: string;
  displayName: string;
  /** discord-only는 아직 카톡이 없는 계정, linked는 이미 연결된 회원(=닉네임 변경 경로). */
  kind: "discord-only" | "linked";
  score: number;
  reasons: string[];
  isSole: boolean;
}

export interface KakaoAccountWithCandidates {
  id: string;
  kakaoNickname: string;
  realName: string;
  candidates: LinkCandidate[];
}

export interface MemberAlias {
  id: string;
  kakaoNickname: string;
}

export interface MemberWithAliases {
  id: string;
  label: string;
  aliases: MemberAlias[];
}

/** 화면에 보여줄 후보 수. 점수가 붙은 후보가 이보다 많아도 상위 몇 개만 낸다. */
const MAX_CANDIDATES = 5;

export async function getKakaoAccountsWithCandidates(): Promise<KakaoAccountWithCandidates[]> {
  const [kakaoAccounts, discordMembers] = await Promise.all([
    prisma.member.findMany({
      where: { mergedIntoId: null, discordUserId: null, kakaoNickname: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.member.findMany({
      where: { mergedIntoId: null, discordUserId: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return kakaoAccounts.map((account) => {
    const scored = discordMembers
      .map((d) => {
        // 표시 이름이 없으면 핸들로라도 대본다. 핸들은 대개 매칭에 쓸모없지만,
        // 가끔 "김복건/96/뚜비뚜밥#뚜비얌"처럼 쓰는 사람이 있다.
        const displayName = d.discordDisplayName ?? d.discordHandle ?? "";
        const { score, reasons } = scoreAccountMatch(account.kakaoNickname!, displayName);
        return {
          memberId: d.id,
          handle: d.discordHandle ?? d.discordUserId!,
          displayName,
          kind: (d.kakaoNickname === null ? "discord-only" : "linked") as LinkCandidate["kind"],
          score,
          reasons,
          isSole: false,
        };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || a.handle.localeCompare(b.handle));

    const candidates = scored.slice(0, MAX_CANDIDATES);
    if (candidates.length > 0) {
      candidates[0].isSole = isSoleCandidate(candidates[0].score, candidates[1]?.score ?? 0);
    }

    return {
      id: account.id,
      kakaoNickname: account.kakaoNickname!,
      realName: account.realName ?? "-",
      candidates,
    };
  });
}

export async function getMembersWithAliases(): Promise<MemberWithAliases[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null, absorbed: { some: {} } },
    include: { absorbed: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  return members.map((m) => ({
    id: m.id,
    label: m.realName ?? m.discordHandle ?? m.kakaoNickname ?? m.id,
    aliases: m.absorbed.map((a) => ({ id: a.id, kakaoNickname: a.kakaoNickname ?? "(닉네임 없음)" })),
  }));
}
