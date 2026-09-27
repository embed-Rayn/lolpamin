import type { Lane, MemberTier, PrismaClient } from "@lolpamin/db";
import { fullBirthYear, kakaoBirthYear, tierScore, topMasteries, type MasteryEntry } from "@lolpamin/core";
import { toLocalDate } from "@/lib/local-date";
import type { MemberInfoRiotAccount } from "./member-info";

export type MemberAdminSort = "realName" | "age" | "peakTier" | "tier" | "lastActive";
export type MemberAdminSortDirection = "asc" | "desc";

const MEMBER_ADMIN_SORTS: MemberAdminSort[] = ["realName", "age", "peakTier", "tier", "lastActive"];

export function parseMemberAdminSort(value: string | undefined): MemberAdminSort {
  return MEMBER_ADMIN_SORTS.includes(value as MemberAdminSort) ? (value as MemberAdminSort) : "realName";
}

export function parseMemberAdminDirection(value: string | undefined): MemberAdminSortDirection {
  return value === "desc" ? "desc" : "asc";
}

export interface MemberAdminRow {
  id: string;
  // "-" when unknown — MemberRealNameCell's convention.
  realName: string;
  // Stored Member.age, two digits. null means the screens read the nickname instead.
  age: number | null;
  // The shown value: age first, else the nickname's birth year.
  birthYear: number | null;
  peakTier: MemberTier;
  tier: MemberTier;
  mainLane: Lane | null;
  subLane: Lane | null;
  riotAccounts: MemberInfoRiotAccount[];
  masteries: MasteryEntry[];
  // YYYY-MM-DD, local — what InactiveLastActiveCell's date input takes.
  lastActiveDate: string;
  daysSinceActive: number;
  note: string | null;
}

type SortableRow = MemberAdminRow & { activeAt: number };

const DAY_MS = 86_400_000;

// Unknown values go last whichever way the column is sorted — the same rule /member-info uses.
function compareNullable(a: number | string | null, b: number | string | null, sign: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return String(a).localeCompare(String(b)) * sign;
}

// MemberTier sorts by score, not by enum declaration order — see member-info.ts compareRows.
function compareRows(a: SortableRow, b: SortableRow, sort: MemberAdminSort, sign: number): number {
  let byKey = 0;
  switch (sort) {
    case "realName":
      byKey = compareNullable(a.realName === "-" ? null : a.realName, b.realName === "-" ? null : b.realName, sign);
      break;
    case "age":
      byKey = compareNullable(a.birthYear, b.birthYear, sign);
      break;
    case "peakTier":
      byKey = (tierScore(a.peakTier) - tierScore(b.peakTier)) * sign;
      break;
    case "tier":
      byKey = (tierScore(a.tier) - tierScore(b.tier)) * sign;
      break;
    case "lastActive":
      byKey = (a.activeAt - b.activeAt) * sign;
      break;
  }
  return byKey !== 0 ? byKey : a.id.localeCompare(b.id);
}

/**
 * /member-admin의 행. 활성 회원(묘비 제외)만. 모스트는 회원에게 붙은 모든 라이엇 계정의
 * 숙련도를 합산한 상위 3개다 — 흡수는 RiotAccount.memberId를 생존자로 옮기므로 묘비를 따로
 * 볼 필요가 없다. 활동일은 getInactiveMembers와 같은 계산(lastActiveAt ?? createdAt에서
 * 지금까지 내림한 일수)이다.
 */
export async function getMemberAdminRows(
  prisma: PrismaClient,
  sort: MemberAdminSort = "realName",
  dir: MemberAdminSortDirection = "asc",
  now: Date = new Date(),
): Promise<MemberAdminRow[]> {
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    include: {
      // 최신순 — 흡수해도 카톡 닉네임은 묘비에 남으므로 출생연도를 거기서 읽는다.
      absorbed: { select: { kakaoNickname: true }, orderBy: { createdAt: "desc" } },
      riotAccounts: {
        select: {
          id: true,
          gameName: true,
          tagLine: true,
          masteries: { select: { championId: true, level: true, points: true } },
        },
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });

  const rows: SortableRow[] = members.map((m) => {
    const nickname = m.kakaoNickname ?? m.absorbed.find((a) => a.kakaoNickname !== null)?.kakaoNickname ?? null;
    const activeAt = m.lastActiveAt ?? m.createdAt;
    return {
      id: m.id,
      realName: m.realName ?? "-",
      age: m.age,
      // 읽을 수 없는 저장값(옛 연결 때 들어간 150 같은 수)은 닉네임 값을 가리지 않는다.
      birthYear: (m.age !== null ? fullBirthYear(m.age) : null) ?? (nickname ? kakaoBirthYear(nickname) : null),
      peakTier: m.peakTier,
      tier: m.tier,
      mainLane: m.mainLane,
      subLane: m.subLane,
      riotAccounts: m.riotAccounts.map(({ id, gameName, tagLine }) => ({ id, gameName, tagLine })),
      masteries: topMasteries(m.riotAccounts.flatMap((a) => a.masteries)),
      lastActiveDate: toLocalDate(activeAt),
      daysSinceActive: Math.floor((now.getTime() - activeAt.getTime()) / DAY_MS),
      note: m.note,
      activeAt: activeAt.getTime(),
    };
  });

  const sign = dir === "desc" ? -1 : 1;
  return rows.sort((a, b) => compareRows(a, b, sort, sign)).map(({ activeAt: _activeAt, ...row }) => row);
}
