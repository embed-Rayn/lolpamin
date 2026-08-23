export interface MemberLike {
  id: string;
  realName: string | null;
  riotId: string | null;
  discordUserId: string | null;
  kakaoUserId: string | null;
  elo: number;
  lastActiveAt: Date | null;
}

export function mergeMembers(
  primary: MemberLike,
  secondary: MemberLike
): Omit<MemberLike, "id"> {
  const laterOf = (a: Date | null, b: Date | null): Date | null => {
    if (!a) return b;
    if (!b) return a;
    return a.getTime() >= b.getTime() ? a : b;
  };

  return {
    realName: primary.realName ?? secondary.realName,
    riotId: primary.riotId ?? secondary.riotId,
    discordUserId: primary.discordUserId ?? secondary.discordUserId,
    kakaoUserId: primary.kakaoUserId ?? secondary.kakaoUserId,
    elo: Math.max(primary.elo, secondary.elo),
    lastActiveAt: laterOf(primary.lastActiveAt, secondary.lastActiveAt),
  };
}
