import { prisma } from "@/lib/prisma";
import type { Member, Prisma } from "@lolpamin/db";

type ActivityCounts = { mentionLogs: number; participants: number };
type MemberWithCounts = Member & {
  _count: ActivityCounts;
  absorbed: Array<{ _count: ActivityCounts }>;
};

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
  // 삭제 확인창에 보여줄 숫자. deleteMember는 이 회원이 흡수한 묘비와 그 묘비의 기록까지
  // 함께 지우므로, 세 값 모두 묘비 몫을 합산한 것이다.
  mentionCount: number;
  gameCount: number;
  aliasCount: number;
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
  // 카톡 멘션은 닉네임을 가진 행에 붙으므로(processKakaoExport), 흡수한 뒤에는 묘비 쪽에
  // 쌓인다. 생존자 자기 _count만 보면 "0건"이라 안내하고 실제로는 수십 건을 지우게 된다.
  const mentionCount = m.absorbed.reduce((sum, a) => sum + a._count.mentionLogs, m._count.mentionLogs);
  const gameCount = m.absorbed.reduce((sum, a) => sum + a._count.participants, m._count.participants);
  return {
    id: m.id,
    realName: m.realName ?? "-",
    kakaoNickname: m.kakaoNickname ?? m.kakaoUserId ?? "-",
    discordHandle: m.discordHandle ?? m.discordUserId ?? "-",
    elo: m.elo,
    lastActiveLabel: days === null ? "기록 없음" : days === 0 ? "오늘" : `${days}일 전`,
    daysSinceActive: days,
    isHalf: !m.discordUserId || !(m.kakaoUserId || m.kakaoNickname),
    mentionCount,
    gameCount,
    aliasCount: m.absorbed.length,
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
    where: { mergedIntoId: null },
    orderBy: orderByFor(sort, dir),
    include: {
      _count: { select: { mentionLogs: true, participants: true } },
      // 삭제 확인창 숫자용. 묘비의 활동 기록도 함께 지워지므로 같이 세어 온다.
      absorbed: { select: { _count: { select: { mentionLogs: true, participants: true } } } },
    },
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
