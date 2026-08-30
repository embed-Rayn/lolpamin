import { prisma } from "@/lib/prisma";
import type { Member } from "@lolpamin/db";

export type MemberFilter = "all" | "half" | "inactive";

export interface MemberRow {
  id: string;
  realName: string;
  kakaoNickname: string;
  discordHandle: string;
  elo: number;
  lastActiveLabel: string;
  daysSinceActive: number | null;
  isHalf: boolean;
}

export interface MemberListData {
  totalCount: number;
  halfCount: number;
  unassignedCount: number;
  averageElo: number;
  rows: MemberRow[];
}

function daysSince(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

function toRow(m: Member, now: Date): MemberRow {
  const days = daysSince(m.lastActiveAt, now);
  return {
    id: m.id,
    realName: m.realName ?? "-",
    kakaoNickname: m.kakaoNickname ?? m.kakaoUserId ?? "-",
    discordHandle: m.discordHandle ?? m.discordUserId ?? "-",
    elo: m.elo,
    lastActiveLabel: days === null ? "기록 없음" : days === 0 ? "오늘" : `${days}일 전`,
    daysSinceActive: days,
    isHalf: !m.discordUserId || !(m.kakaoUserId || m.kakaoNickname),
  };
}

export async function getMemberListData(
  filter: MemberFilter,
  query: string
): Promise<MemberListData> {
  const now = new Date();
  const allMembers = await prisma.member.findMany({ orderBy: { createdAt: "asc" } });

  const totalCount = allMembers.length;
  const halfCount = allMembers.filter((m) => !m.discordUserId || !(m.kakaoUserId || m.kakaoNickname)).length;
  const unassignedCount = halfCount;
  const averageElo = totalCount === 0
    ? 0
    : Math.round(allMembers.reduce((sum, m) => sum + m.elo, 0) / totalCount);

  const trimmedQuery = query.trim().toLowerCase();
  const rows = allMembers
    .map((m) => toRow(m, now))
    .filter((row) => {
      if (filter === "half" && !row.isHalf) return false;
      if (filter === "inactive" && (row.daysSinceActive === null || row.daysSinceActive < 14)) return false;
      if (
        trimmedQuery &&
        !row.realName.toLowerCase().includes(trimmedQuery) &&
        !row.kakaoNickname.toLowerCase().includes(trimmedQuery) &&
        !row.discordHandle.toLowerCase().includes(trimmedQuery)
      ) {
        return false;
      }
      return true;
    });

  return { totalCount, halfCount, unassignedCount, averageElo, rows };
}
