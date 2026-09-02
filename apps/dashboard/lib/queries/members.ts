import { prisma } from "@/lib/prisma";
import type { Member, Prisma } from "@lolpamin/db";

type ActivityCounts = { mentionLogs: number; participants: number };
type MemberWithCounts = Member & {
  _count: ActivityCounts;
  absorbed: Array<{ kakaoNickname: string | null; _count: ActivityCounts }>;
};

// 흡수해도 카톡 닉네임은 생존자에게 복사되지 않고 묘비에 남는다(활동 기록을 옮기지
// 않으려고). 자기 행만 보면 연결을 끝낸 회원이 계속 "반쪽"으로 집계되므로 묘비까지 본다.
function hasKakao(m: MemberWithCounts): boolean {
  return (
    m.kakaoUserId !== null ||
    m.kakaoNickname !== null ||
    m.absorbed.some((a) => a.kakaoNickname !== null)
  );
}

function isHalfMember(m: MemberWithCounts): boolean {
  return !m.discordUserId || !hasKakao(m);
}

// 화면에 띄울 카톡 닉네임. 흡수한 회원은 자기 행이 비어 있고 묘비가 값을 들고 있으므로,
// 그대로 두면 연결을 끝낸 회원이 목록에서 "-"로 보인다.
function displayKakaoNickname(m: MemberWithCounts): string {
  return (
    m.kakaoNickname ??
    m.absorbed.find((a) => a.kakaoNickname !== null)?.kakaoNickname ??
    m.kakaoUserId ??
    "-"
  );
}

export type MemberFilter = "all" | "linked" | "kakaoOnly" | "discordOnly" | "inactive";

const MEMBER_FILTERS: MemberFilter[] = ["all", "linked", "kakaoOnly", "discordOnly", "inactive"];

export function parseMemberFilter(value: string | undefined): MemberFilter {
  return MEMBER_FILTERS.includes(value as MemberFilter) ? (value as MemberFilter) : "all";
}

export type MemberSort = "mmr" | "realName" | "kakaoNickname";
export type SortDirection = "asc" | "desc";

const MEMBER_SORTS: MemberSort[] = ["mmr", "realName", "kakaoNickname"];

export function parseMemberSort(value: string | undefined): MemberSort {
  return MEMBER_SORTS.includes(value as MemberSort) ? (value as MemberSort) : "mmr";
}

export function parseSortDirection(value: string | undefined): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

// 값이 비어 있는 행은 방향과 무관하게 마지막에 둔다 — 실명 없는 회원이 목록 맨 위를
// 차지하면 정렬이 쓸모없어진다. id 2차 정렬은 동점일 때 순서를 고정하기 위한 것이다.
function orderByFor(sort: MemberSort, dir: SortDirection): Prisma.MemberOrderByWithRelationInput[] {
  if (sort === "mmr") return [{ mmr: dir }, { id: "asc" }];
  if (sort === "realName") return [{ realName: { sort: dir, nulls: "last" } }, { id: "asc" }];
  return [{ kakaoNickname: { sort: dir, nulls: "last" } }, { id: "asc" }];
}

export interface MemberRow {
  id: string;
  realName: string;
  kakaoNickname: string;
  // 서버 별명. 카톡과 연결되지 않은 계정은 "-"다 — displayDiscordName 참고.
  discordName: string;
  mmr: number;
  lastActiveLabel: string;
  daysSinceActive: number | null;
  isHalf: boolean;
  // 연결 상태 필터용. isHalf 하나로는 "카톡만"과 "디코만"을 가를 수 없다.
  hasDiscord: boolean;
  hasKakao: boolean;
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
  averageMmr: number;
  rows: MemberRow[];
}

function daysSince(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

// 「디코 닉네임」 칸에 띄울 값. 핸들("k._.dj")은 사람을 알아볼 수 없으므로 서버 별명을
// 먼저 본다. 카톡과 연결되지 않은 계정도 채운다 — 그 행은 실명도 카톡 닉네임도 비어
// 있어서, 디코 칸까지 비우면 누구인지 알 수 없는 "-" 세 칸짜리 행이 된다. 연결 여부는
// 「카톡만·디코만」 필터와 빈 카톡 칸이 이미 말해 준다.
function displayDiscordName(m: MemberWithCounts): string {
  if (m.discordUserId === null) return "-";
  return m.discordDisplayName ?? m.discordHandle ?? m.discordUserId;
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
    kakaoNickname: displayKakaoNickname(m),
    discordName: displayDiscordName(m),
    mmr: m.mmr,
    lastActiveLabel: days === null ? "기록 없음" : days === 0 ? "오늘" : `${days}일 전`,
    daysSinceActive: days,
    isHalf: isHalfMember(m),
    hasDiscord: m.discordUserId !== null,
    hasKakao: hasKakao(m),
    mentionCount,
    gameCount,
    aliasCount: m.absorbed.length,
  };
}

export async function getMemberListData(
  filter: MemberFilter,
  query: string,
  sort: MemberSort = "mmr",
  dir: SortDirection = "desc"
): Promise<MemberListData> {
  const now = new Date();
  const allMembers = await prisma.member.findMany({
    where: { mergedIntoId: null },
    orderBy: orderByFor(sort, dir),
    include: {
      _count: { select: { mentionLogs: true, participants: true } },
      // 삭제 확인창 숫자용. 묘비의 활동 기록도 함께 지워지므로 같이 세어 온다.
      // kakaoNickname은 반쪽 회원 판정용 — 흡수한 회원의 닉네임은 묘비에 남는다.
      absorbed: {
        select: { kakaoNickname: true, _count: { select: { mentionLogs: true, participants: true } } },
      },
    },
  });

  const totalCount = allMembers.length;
  const halfCount = allMembers.filter(isHalfMember).length;
  const unassignedCount = halfCount;
  const averageMmr = totalCount === 0
    ? 0
    : Math.round(allMembers.reduce((sum, m) => sum + m.mmr, 0) / totalCount);

  const trimmedQuery = query.trim().toLowerCase();
  // 검색은 화면에 안 띄우는 값까지 훑는다. 미연결 디스코드 계정은 실명도 카톡 닉네임도
  // 비어 있어서, 표시하는 값만 보면 이 목록에서 아예 찾을 수 없는 회원이 된다.
  function matchesQuery(m: MemberWithCounts, row: MemberRow): boolean {
    if (!trimmedQuery) return true;
    return [row.realName, row.kakaoNickname, m.discordDisplayName, m.discordHandle].some(
      (v) => v !== null && v.toLowerCase().includes(trimmedQuery)
    );
  }

  const rows = allMembers
    .map((m) => ({ m, row: toRow(m, now) }))
    .filter(({ m, row }) => {
      if (filter === "linked" && !(row.hasDiscord && row.hasKakao)) return false;
      if (filter === "kakaoOnly" && (row.hasDiscord || !row.hasKakao)) return false;
      if (filter === "discordOnly" && (!row.hasDiscord || row.hasKakao)) return false;
      if (filter === "inactive" && (row.daysSinceActive === null || row.daysSinceActive < 14)) return false;
      return matchesQuery(m, row);
    })
    .map(({ row }) => row);

  return { totalCount, halfCount, unassignedCount, averageMmr, rows };
}
