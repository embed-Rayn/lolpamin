export const INACTIVITY_THRESHOLD_DAYS = 14;
export const LONG_INACTIVITY_THRESHOLD_DAYS = 30;

export interface MemberActivity {
  id: string;
  kakaoUserId: string | null;
  kakaoNickname: string | null;
  lastActiveAt: Date | null;
  createdAt: Date;
}

export interface InactiveMemberResult {
  id: string;
  daysSinceActive: number;
}

export function getInactiveMembers(
  members: MemberActivity[],
  now: Date
): InactiveMemberResult[] {
  return members
    .filter((m) => m.kakaoUserId !== null || m.kakaoNickname !== null)
    .map((m) => {
      const referenceDate = m.lastActiveAt ?? m.createdAt;
      const daysSinceActive = Math.floor(
        (now.getTime() - referenceDate.getTime()) / 86_400_000
      );
      return { id: m.id, daysSinceActive };
    })
    .filter((m) => m.daysSinceActive >= INACTIVITY_THRESHOLD_DAYS)
    .sort((a, b) => b.daysSinceActive - a.daysSinceActive);
}
