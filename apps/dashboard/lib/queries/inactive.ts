import { prisma } from "@/lib/prisma";
import { getInactiveMembers, LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";

export interface InactiveRow {
  id: string;
  name: string;
  kakaoNickname: string;
  daysSinceActive: number;
  lastActiveDate: string;
  elo: number;
  gameCount: number;
}

export interface InactiveReportData {
  rows: InactiveRow[];
  totalInactive: number;
  longInactiveCount: number;
  ratioLabel: string;
}

export async function getInactiveReportData(): Promise<InactiveReportData> {
  const now = new Date();
  const members = await prisma.member.findMany({
    include: { _count: { select: { participants: true } } },
  });

  const inactive = getInactiveMembers(
    members.map((m) => ({
      id: m.id,
      kakaoUserId: m.kakaoUserId,
      kakaoNickname: m.kakaoNickname,
      lastActiveAt: m.lastActiveAt,
      createdAt: m.createdAt,
    })),
    now
  );

  const byId = new Map(members.map((m) => [m.id, m]));

  const rows: InactiveRow[] = inactive.map(({ id, daysSinceActive }) => {
    const m = byId.get(id)!;
    const lastActiveDate = new Date(now.getTime() - daysSinceActive * 86_400_000);
    return {
      id,
      name: m.realName ?? m.discordHandle ?? "이름 미확인",
      kakaoNickname: m.kakaoNickname ?? "카톡 미연결",
      daysSinceActive,
      lastActiveDate: lastActiveDate.toISOString().slice(0, 10),
      elo: m.elo,
      gameCount: m._count.participants,
    };
  });

  const totalMembers = members.length || 1;

  return {
    rows,
    totalInactive: rows.length,
    longInactiveCount: rows.filter((r) => r.daysSinceActive >= LONG_INACTIVITY_THRESHOLD_DAYS).length,
    ratioLabel: `${Math.round((rows.length / totalMembers) * 100)}%`,
  };
}
