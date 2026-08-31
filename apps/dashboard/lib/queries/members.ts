import { prisma } from "@/lib/prisma";
import type { Member, Prisma } from "@lolpamin/db";

type MemberWithCounts = Member & { _count: { mentionLogs: number; participants: number } };

export type MemberFilter = "all" | "half" | "inactive";

export type MemberSort = "elo" | "realName" | "kakaoNickname";
export type SortDirection = "asc" | "desc";

const MEMBER_SORTS: MemberSort[] = ["elo", "realName", "kakaoNickname"];

export function parseMemberSort(value: string | undefined): MemberSort {
  return MEMBER_SORTS.includes(value as MemberSort) ? (value as MemberSort) : "elo";
}

export function parseSortDirection(value: string | undefined): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

// 값이 비어 있는 행은 방향과 무관하게 마지막에 둔다 — 실명 없는 회원이 목록 맨 위를
// 차지하면 정렬이 쓸모없어진다. id 2차 정렬은 동점일 때 순서를 고정하기 위한 것이다.
function orderByFor(sort: MemberSort, dir: SortDirection): Prisma.MemberOrderByWithRelationInput[] {
  if (sort === "elo") return [{ elo: dir }, { id: "asc" }];
  if (sort === "realName") return [{ realName: { sort: dir, nulls: "last" } }, { id: "asc" }];
  return [{ kakaoNickname: { sort: dir, nulls: "last" } }, { id: "asc" }];
}

export interface MemberRow {
  id: string;
  realName: string;
  kakaoNickname: string;
  discordHandle: string;
  elo: number;
  lastActiveLabel: string;
  daysSinceActive: number | null;
  isHalf: boolean;
  // Shown in the delete confirmation: both are wiped along with the member.
  mentionCount: number;
  gameCount: number;
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

function toRow(m: MemberWithCounts, now: Date): MemberRow {
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
    mentionCount: m._count.mentionLogs,
    gameCount: m._count.participants,
  };
}

export async function getMemberListData(
  filter: MemberFilter,
  query: string,
  sort: MemberSort = "elo",
  dir: SortDirection = "desc"
): Promise<MemberListData> {
  const now = new Date();
  const allMembers = await prisma.member.findMany({
    orderBy: orderByFor(sort, dir),
    include: { _count: { select: { mentionLogs: true, participants: true } } },
  });

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
