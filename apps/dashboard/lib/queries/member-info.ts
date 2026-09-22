import { prisma } from "@/lib/prisma";
import type { Member, MemberTier } from "@lolpamin/db";
import { displayedRating, tierScore } from "@lolpamin/core";
import { getCountedGameFilter } from "./counted-games";

export interface MemberInfoRiotAccount {
  id: string;
  gameName: string;
  tagLine: string;
}

type MemberWithAbsorbed = Member & {
  absorbed: Array<{ id: string; kakaoNickname: string | null }>;
  // getMemberInfoSummary는 싣지 않는다 — 집계에 필요 없다.
  riotAccounts?: MemberInfoRiotAccount[];
};

export type MemberInfoSort =
  | "realName"
  | "kakaoNickname"
  | "tier"
  | "riftMmr"
  | "riftGames"
  | "riftWinRate"
  | "aramMmr"
  | "aramGames"
  | "aramWinRate";
export type SortDirection = "asc" | "desc";

const MEMBER_INFO_SORTS: MemberInfoSort[] = [
  "realName",
  "kakaoNickname",
  "tier",
  "riftMmr",
  "riftGames",
  "riftWinRate",
  "aramMmr",
  "aramGames",
  "aramWinRate",
];

export function parseMemberInfoSort(value: string | undefined): MemberInfoSort {
  return MEMBER_INFO_SORTS.includes(value as MemberInfoSort) ? (value as MemberInfoSort) : "realName";
}

export function parseSortDirection(value: string | undefined): SortDirection {
  return value === "desc" ? "desc" : "asc";
}

export interface ModeRecord {
  // 화면용 점수. 판이 0이면 저장값(기본 1000)과 무관하게 0 — /rift, /aram과 같은 규칙
  // (displayedRating).
  mmr: number;
  games: number;
  wins: number;
  losses: number;
  // 판이 0이면 승률은 없다 — 0%과 구분해야 정렬에서 "기록 없음"을 항상 뒤로 보낼 수 있다.
  winRate: number | null;
}

export interface MemberInfoRow {
  id: string;
  realName: string;
  kakaoNickname: string;
  tier: MemberTier;
  rift: ModeRecord;
  aram: ModeRecord;
  note: string | null;
  // 검증된 PUUID로 등록된 라이엇 계정. 묘비의 계정은 absorbMember가 생존자로 옮기므로
  // 자기 것만 보면 된다. 최근 관측순.
  riotAccounts: MemberInfoRiotAccount[];
}

// 흡수해도 카톡 닉네임은 묘비에 남는다 — queries/members.ts의 displayKakaoNickname과
// 같은 이유로 여기서도 묘비를 본다.
function displayKakaoNickname(m: MemberWithAbsorbed): string {
  return (
    m.kakaoNickname ??
    m.absorbed.find((a) => a.kakaoNickname !== null)?.kakaoNickname ??
    m.kakaoUserId ??
    "-"
  );
}

function toModeRecord(rating: number, wins: number, losses: number): ModeRecord {
  const games = wins + losses;
  return {
    mmr: displayedRating(rating, games),
    games,
    wins,
    losses,
    winRate: games === 0 ? null : Math.round((wins / games) * 100),
  };
}

export interface MemberInfoSummary {
  totalCount: number;
  // 그 모드에서 집계된 판이 있는 회원의 저장 점수 평균. 한 판도 안 뛴 회원은 화면에서
  // 0점이라 평균에 넣으면(0으로든 1000으로든) 숫자가 실제 판 뛴 사람들과 어긋난다.
  // 판 뛴 회원이 없으면 0.
  averageRiftMmr: number;
  averageAramMmr: number;
}

function averageOf(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** 상단 카드용 집계. 검색어와 무관하게 전체 회원을 본다. */
export async function getMemberInfoSummary(): Promise<MemberInfoSummary> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    include: { absorbed: { select: { id: true, kakaoNickname: true } } },
  });
  const records = await tallyByMode(members);

  const played = (pick: (r: { rift: ModeRecord; aram: ModeRecord }) => ModeRecord, field: "mmr" | "aramMmr") =>
    members.filter((m) => (pick(records.get(m.id)!)?.games ?? 0) > 0).map((m) => m[field]);

  return {
    totalCount: members.length,
    averageRiftMmr: averageOf(played((r) => r.rift, "mmr")),
    averageAramMmr: averageOf(played((r) => r.aram, "aramMmr")),
  };
}

/**
 * 회원별 협곡·칼바람 판/승/패. queries/members.ts의 tallyRecords와 같은 규칙(되돌린
 * 경기·리셋 이전 경기 제외, 묘비 몫을 생존자로 합산)을 두 모드 모두에 대해 한 번에 낸다.
 */
async function tallyByMode(
  members: MemberWithAbsorbed[],
): Promise<Map<string, { rift: ModeRecord; aram: ModeRecord }>> {
  const ownerOf = new Map<string, string>();
  for (const m of members) {
    ownerOf.set(m.id, m.id);
    for (const tombstone of m.absorbed) ownerOf.set(tombstone.id, m.id);
  }

  const tallies = new Map<string, { rift: { wins: number; losses: number }; aram: { wins: number; losses: number } }>(
    members.map((m) => [m.id, { rift: { wins: 0, losses: 0 }, aram: { wins: 0, losses: 0 } }]),
  );
  const ratingOf = new Map(members.map((m) => [m.id, { rift: m.mmr, aram: m.aramMmr }]));
  if (ownerOf.size === 0) return new Map();

  const countedGame = await getCountedGameFilter(prisma);
  const participations = await prisma.gameParticipant.findMany({
    where: { memberId: { in: [...ownerOf.keys()] }, gameResult: countedGame },
    select: { memberId: true, team: true, gameResult: { select: { winner: true, mode: true } } },
  });

  for (const p of participations) {
    const tally = tallies.get(ownerOf.get(p.memberId)!);
    if (!tally) continue;
    const bucket = p.gameResult.mode === "ARAM" ? tally.aram : tally.rift;
    if (p.team === p.gameResult.winner) bucket.wins += 1;
    else bucket.losses += 1;
  }

  return new Map(
    [...tallies].map(([id, t]) => {
      const rating = ratingOf.get(id)!;
      return [
        id,
        {
          rift: toModeRecord(rating.rift, t.rift.wins, t.rift.losses),
          aram: toModeRecord(rating.aram, t.aram.wins, t.aram.losses),
        },
      ];
    }),
  );
}

function compareWinRate(a: number | null, b: number | null, sign: number, aId: string, bId: string): number {
  if (a === null && b === null) return aId.localeCompare(bId);
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * sign || aId.localeCompare(bId);
}

function compareNullableString(a: string, b: string, sign: number, aId: string, bId: string): number {
  const an = a === "-" ? null : a;
  const bn = b === "-" ? null : b;
  if (an === null && bn === null) return aId.localeCompare(bId);
  if (an === null) return 1;
  if (bn === null) return -1;
  return an.localeCompare(bn) * sign || aId.localeCompare(bId);
}

// Postgres는 MemberTier enum을 선언 순서로 정렬한다. 점수 순으로 보이려면 조회 뒤
// JS에서 다시 정렬해야 한다 — queries/members.ts의 sortByTierScore와 같은 이유.
function compareRows(a: MemberInfoRow, b: MemberInfoRow, sort: MemberInfoSort, dir: SortDirection): number {
  const sign = dir === "desc" ? -1 : 1;
  switch (sort) {
    case "realName":
      return compareNullableString(a.realName, b.realName, sign, a.id, b.id);
    case "kakaoNickname":
      return compareNullableString(a.kakaoNickname, b.kakaoNickname, sign, a.id, b.id);
    case "tier": {
      const byScore = (tierScore(a.tier) - tierScore(b.tier)) * sign;
      return byScore !== 0 ? byScore : a.id.localeCompare(b.id);
    }
    case "riftMmr":
      return (a.rift.mmr - b.rift.mmr) * sign || a.id.localeCompare(b.id);
    case "aramMmr":
      return (a.aram.mmr - b.aram.mmr) * sign || a.id.localeCompare(b.id);
    case "riftGames":
      return (a.rift.games - b.rift.games) * sign || a.id.localeCompare(b.id);
    case "aramGames":
      return (a.aram.games - b.aram.games) * sign || a.id.localeCompare(b.id);
    case "riftWinRate":
      return compareWinRate(a.rift.winRate, b.rift.winRate, sign, a.id, b.id);
    case "aramWinRate":
      return compareWinRate(a.aram.winRate, b.aram.winRate, sign, a.id, b.id);
    default:
      return 0;
  }
}

export async function getMemberInfoListData(
  query: string,
  sort: MemberInfoSort = "realName",
  dir: SortDirection = "asc",
): Promise<MemberInfoRow[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    include: {
      absorbed: { select: { id: true, kakaoNickname: true }, orderBy: { createdAt: "desc" } },
      riotAccounts: { select: { id: true, gameName: true, tagLine: true }, orderBy: { lastSeenAt: "desc" } },
    },
  });

  const records = await tallyByMode(members);

  const trimmedQuery = query.trim().toLowerCase();
  function matchesQuery(m: MemberWithAbsorbed, realName: string): boolean {
    if (!trimmedQuery) return true;
    return [realName, m.kakaoNickname, ...m.absorbed.map((a) => a.kakaoNickname)].some(
      (v) => v !== null && v !== "-" && v.toLowerCase().includes(trimmedQuery),
    );
  }

  const rows: MemberInfoRow[] = members
    .map((m) => {
      const realName = m.realName ?? "-";
      const record = records.get(m.id) ?? {
        rift: toModeRecord(m.mmr, 0, 0),
        aram: toModeRecord(m.aramMmr, 0, 0),
      };
      return {
        m,
        realName,
        row: {
          id: m.id,
          realName,
          kakaoNickname: displayKakaoNickname(m),
          tier: m.tier,
          rift: record.rift,
          aram: record.aram,
          note: m.note,
          riotAccounts: m.riotAccounts ?? [],
        },
      };
    })
    .filter(({ m, realName }) => matchesQuery(m, realName))
    .map(({ row }) => row);

  return rows.sort((a, b) => compareRows(a, b, sort, dir));
}
