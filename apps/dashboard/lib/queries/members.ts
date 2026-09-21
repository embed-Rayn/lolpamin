import { prisma } from "@/lib/prisma";
import type { GameMode, Member, MemberTier, Prisma } from "@lolpamin/db";
import { displayedRating, tierScore } from "@lolpamin/core";
import { getCountedGameFilter } from "./counted-games";
import { ratingField } from "../rating-field";

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

// "played"는 해당 모드에서 집계된 판수가 있는 회원(점수가 보이는 사람), "unranked"는 판수
// 0인 회원(0점으로 보이는 사람). 연결 상태·미활동 필터는 /link-accounts와 /inactive가
// 각자 맡는다.
export type MemberFilter = "all" | "played" | "unranked";

const MEMBER_FILTERS: MemberFilter[] = ["all", "played", "unranked"];

export function parseMemberFilter(value: string | undefined): MemberFilter {
  return MEMBER_FILTERS.includes(value as MemberFilter) ? (value as MemberFilter) : "all";
}

export type MemberSort = "mmr" | "realName" | "kakaoNickname" | "tier";
export type SortDirection = "asc" | "desc";

const MEMBER_SORTS: MemberSort[] = ["mmr", "realName", "kakaoNickname", "tier"];

export function parseMemberSort(value: string | undefined): MemberSort {
  return MEMBER_SORTS.includes(value as MemberSort) ? (value as MemberSort) : "mmr";
}

export function parseSortDirection(value: string | undefined): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

// 값이 비어 있는 행은 방향과 무관하게 마지막에 둔다 — 실명 없는 회원이 목록 맨 위를
// 차지하면 정렬이 쓸모없어진다. id 2차 정렬은 동점일 때 순서를 고정하기 위한 것이다.
//
// MMR은 화면에 띄우는 값(displayedRating — 판수 0이면 0)으로 정렬해야 하므로 DB 정렬은
// 순서만 고정하고 실제 정렬은 조회 뒤 sortByDisplayedMmr가 한다. 저장된 값으로 정렬하면
// 한 판도 안 뛴 회원이 0점을 달고 1000점 사이에 끼어 있게 된다.
function orderByFor(sort: MemberSort, dir: SortDirection): Prisma.MemberOrderByWithRelationInput[] {
  if (sort === "mmr") return [{ id: "asc" }];
  if (sort === "realName") return [{ realName: { sort: dir, nulls: "last" } }, { id: "asc" }];
  // 티어는 점수 순으로 정렬해야 하는데 Postgres는 enum을 선언 순서로 정렬한다. 지금은
  // 두 순서가 우연히 같지만 그 우연에 기대면 enum 순서를 바꾸는 순간 정렬이 조용히
  // 틀어진다. 여기서는 순서를 고정만 하고, 실제 정렬은 조회 뒤 sortByTierScore가 한다.
  if (sort === "tier") return [{ id: "asc" }];
  return [{ kakaoNickname: { sort: dir, nulls: "last" } }, { id: "asc" }];
}

function sortByTierScore(rows: MemberRow[], dir: SortDirection): MemberRow[] {
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const byScore = (tierScore(a.tier) - tierScore(b.tier)) * sign;
    // 동점(아이언·언랭, 그리고 같은 티어)일 때 순서를 고정한다 — 다른 정렬 기준들이
    // id를 2차 키로 쓰는 것과 같다.
    return byScore !== 0 ? byScore : a.id.localeCompare(b.id);
  });
}

function sortByDisplayedMmr(rows: MemberRow[], dir: SortDirection): MemberRow[] {
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const byMmr = (a.mmr - b.mmr) * sign;
    return byMmr !== 0 ? byMmr : a.id.localeCompare(b.id);
  });
}

export interface MemberRow {
  id: string;
  realName: string;
  kakaoNickname: string;
  // 서버 별명. 카톡과 연결되지 않은 계정은 "-"다 — displayDiscordName 참고.
  discordName: string;
  // 화면용 점수. 판수가 0이면 저장된 값(기본 1000)과 무관하게 0이다 — displayedRating 참고.
  mmr: number;
  // 이 모드의 MMR 순위(1부터). 정렬·필터·검색과 무관하게 전체 회원 기준이라, 이름순으로
  // 보거나 검색으로 좁혀도 같은 사람에게 같은 순위가 붙어 있다. 0점(판수 0)은 순위 밖(null).
  rank: number | null;
  tier: MemberTier;
  riotId: string | null;
  // 되돌린 경기와 마지막 리셋 이전 경기를 뺀 전적. gameCount와 다른 숫자다 — gameCount는
  // 삭제 확인창용이라 실제로 함께 지워지는 기록 수를 세지만, 이쪽은 전적표라 빠져야 한다.
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

function toRow(m: MemberWithCounts, now: Date, record: MemberRecord, mode: GameMode): MemberRow {
  const days = daysSince(m.lastActiveAt, now);
  // 카톡 멘션은 닉네임을 가진 행에 붙으므로(processKakaoExport), 흡수한 뒤에는 묘비 쪽에
  // 쌓인다. 생존자 자기 _count만 보면 "0건"이라 안내하고 실제로는 수십 건을 지우게 된다.
  const mentionCount = m.absorbed.reduce((sum, a) => sum + a._count.mentionLogs, m._count.mentionLogs);
  const gameCount = m.absorbed.reduce((sum, a) => sum + a._count.participants, m._count.participants);
  const playedCount = record.wins + record.losses;
  return {
    id: m.id,
    realName: m.realName ?? "-",
    kakaoNickname: displayKakaoNickname(m),
    discordName: displayDiscordName(m),
    mmr: displayedRating(m[ratingField(mode)], playedCount),
    rank: null,
    tier: m.tier,
    riotId: m.riotId,
    wins: record.wins,
    losses: record.losses,
    playedCount,
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
 * 회원별 승/패. absorbMember는 이제 참가 기록을 생존자에게 옮기지만, 이 branch 이전에
 * 병합된 묘비는 그때는 옮겨지지 않았으므로 여전히 자기 몫의 기록을 들고 있을 수 있다.
 * 한 GameParticipant 행은 언제나 정확히 한 쪽(생존자 또는 그 묘비)에만 있으므로 자기
 * 것과 묘비 것을 더해도 이중 계산이 아니다 — 새 병합은 묘비 쪽이 0건이라 자기 몫만
 * 더해지는 것과 같은 결과다.
 *
 * 되돌린 경기와 마지막 리셋 이전 경기는 제외한다 — MMR은 움직였는데 전적만 남으면 같은
 * 화면 안에서 두 숫자가 어긋난다. getCountedGameFilter가 그 규칙이고,
 * queries/linked-members.ts와 apps/discord-bot도 같은 것을 쓴다.
 */
async function tallyRecords(members: MemberWithCounts[], mode: GameMode): Promise<Map<string, MemberRecord>> {
  // 묘비 id → 생존자 id. 조회는 둘을 한꺼번에 하고, 집계할 때 생존자 쪽으로 몰아준다.
  const ownerOf = new Map<string, string>();
  for (const m of members) {
    ownerOf.set(m.id, m.id);
    for (const tombstone of m.absorbed) ownerOf.set(tombstone.id, m.id);
  }

  const record = new Map<string, MemberRecord>(members.map((m) => [m.id, { wins: 0, losses: 0 }]));
  if (ownerOf.size === 0) return record;

  const countedGame = await getCountedGameFilter(prisma);
  const participations = await prisma.gameParticipant.findMany({
    where: { memberId: { in: [...ownerOf.keys()] }, gameResult: countedGame },
    select: { memberId: true, team: true, gameResult: { select: { winner: true, mode: true } } },
  });

  for (const p of participations) {
    if (p.gameResult.mode !== mode) continue;
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
  dir: SortDirection = "desc",
  mode: GameMode = "RIFT",
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

  const record = await tallyRecords(allMembers, mode);

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

  const allRows = allMembers.map((m) => ({
    m,
    row: toRow(m, now, record.get(m.id) ?? { wins: 0, losses: 0 }, mode),
  }));
  // 순위는 필터를 적용하기 전, 전체 회원 위에서 매긴다. 동점은 MMR 정렬과 같은 기준
  // (id)으로 가른다 — 정렬해서 보이는 순서와 순위 번호가 어긋나면 안 된다.
  sortByDisplayedMmr(
    allRows.map(({ row }) => row).filter((row) => row.mmr > 0),
    "desc",
  ).forEach((row, i) => {
    row.rank = i + 1;
  });

  const rows = allRows
    .filter(({ m, row }) => {
      if (filter === "played" && row.playedCount === 0) return false;
      if (filter === "unranked" && row.playedCount > 0) return false;
      return matchesQuery(m, row);
    })
    .map(({ row }) => row);

  const sortedRows =
    sort === "tier" ? sortByTierScore(rows, dir) : sort === "mmr" ? sortByDisplayedMmr(rows, dir) : rows;

  return { rows: sortedRows };
}
