import { prisma } from "@/lib/prisma";
import type { Member, Prisma } from "@lolpamin/db";

type ActivityCounts = { mentionLogs: number; participants: number };
type MemberWithCounts = Member & {
  _count: ActivityCounts;
  absorbed: Array<{ id: string; kakaoNickname: string | null; _count: ActivityCounts }>;
};

export interface MemberRecord {
  wins: number;
  losses: number;
}

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
//
// 묘비가 둘 이상일 수 있다 — 라이엇 아이디를 바꾸면 카톡 닉네임이 따라 바뀌고, 임포트가
// 만든 새 행이 같은 회원에게 또 흡수된다. 그래서 조회는 묘비를 최신순으로 실어 오고
// (getMemberListData의 orderBy) 여기서 첫 번째를 집는다. 오래된 쪽을 집으면 이름을
// 바꿀 때마다 목록이 옛 닉네임으로 굳는다.
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
  // 되돌린 경기를 뺀 전적. gameCount와 다른 숫자다 — gameCount는 삭제 확인창용이라
  // 되돌린 경기까지 포함해 "함께 지워지는 기록 수"를 세지만, 이쪽은 전적표라 빠져야 한다.
  wins: number;
  losses: number;
  playedCount: number;
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

function toRow(m: MemberWithCounts, now: Date, record: MemberRecord): MemberRow {
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
    wins: record.wins,
    losses: record.losses,
    playedCount: record.wins + record.losses,
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

/**
 * 회원별 승/패. 흡수한 회원의 참가 기록은 묘비 쪽에 남으므로(absorbMember가 기록을
 * 옮기지 않는다) 묘비의 경기도 생존자에게 더한다.
 *
 * 되돌린 경기는 제외한다 — MMR은 원복되는데 전적만 남으면 같은 화면 안에서 두 숫자가
 * 어긋난다. queries/linked-members.ts와 같은 규칙이다.
 */
async function tallyRecords(members: MemberWithCounts[]): Promise<Map<string, MemberRecord>> {
  // 묘비 id → 생존자 id. 조회는 둘을 한꺼번에 하고, 집계할 때 생존자 쪽으로 몰아준다.
  const ownerOf = new Map<string, string>();
  for (const m of members) {
    ownerOf.set(m.id, m.id);
    for (const tombstone of m.absorbed) ownerOf.set(tombstone.id, m.id);
  }

  const record = new Map<string, MemberRecord>(members.map((m) => [m.id, { wins: 0, losses: 0 }]));
  if (ownerOf.size === 0) return record;

  const participations = await prisma.gameParticipant.findMany({
    where: { memberId: { in: [...ownerOf.keys()] }, gameResult: { cancelledAt: null } },
    select: { memberId: true, team: true, gameResult: { select: { winner: true } } },
  });

  for (const p of participations) {
    const tally = record.get(ownerOf.get(p.memberId)!);
    if (!tally) continue;
    if (p.team === p.gameResult.winner) tally.wins += 1;
    else tally.losses += 1;
  }

  return record;
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
        select: { id: true, kakaoNickname: true, _count: { select: { mentionLogs: true, participants: true } } },
        // 최신순 — displayKakaoNickname이 첫 번째를 현재 닉네임으로 집는다.
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const record = await tallyRecords(allMembers);

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
    // 묘비의 닉네임을 전부 훑는다. 화면에는 현재 닉네임 하나만 뜨지만, 닉네임을 바꾼
    // 회원을 옛 이름으로 찾는 일이 잦다 — 카톡 대화에 남은 이름이 그것이다.
    return [
      row.realName,
      m.kakaoNickname,
      ...m.absorbed.map((a) => a.kakaoNickname),
      m.discordDisplayName,
      m.discordHandle,
    ].some((v) => v !== null && v.toLowerCase().includes(trimmedQuery));
  }

  const rows = allMembers
    .map((m) => ({ m, row: toRow(m, now, record.get(m.id) ?? { wins: 0, losses: 0 }) }))
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
