import { prisma } from "@/lib/prisma";
import { getInactiveMembers, LONG_INACTIVITY_THRESHOLD_DAYS } from "@lolpamin/core";

export interface InactiveRow {
  id: string;
  name: string;
  kakaoNickname: string;
  daysSinceActive: number;
  lastActiveDate: string;
  mmr: number;
  gameCount: number;
}

export interface InactiveReportData {
  rows: InactiveRow[];
  totalInactive: number;
  longInactiveCount: number;
  ratioLabel: string;
}

/**
 * 카톡 연결 여부와 화면에 띄울 닉네임의 기준값. 흡수해도 카톡 닉네임은 생존자에게
 * 복사되지 않고 묘비에 남으므로(활동 기록을 옮기지 않으려고), 자기 값이 없으면 아직
 * 붙어 있는 묘비의 값을 대신 쓴다. packages/core는 DB를 모르므로 이 대체는 여기서 끝낸다.
 */
export function effectiveKakaoNickname(m: {
  kakaoNickname: string | null;
  absorbed: Array<{ kakaoNickname: string | null }>;
}): string | null {
  return m.kakaoNickname ?? m.absorbed.find((a) => a.kakaoNickname !== null)?.kakaoNickname ?? null;
}

export async function getInactiveReportData(): Promise<InactiveReportData> {
  const now = new Date();
  const members = await prisma.member.findMany({
    where: { mergedIntoId: null },
    include: {
      _count: { select: { participants: true } },
      absorbed: { select: { kakaoNickname: true }, orderBy: { createdAt: "asc" } },
    },
  });

  const inactive = getInactiveMembers(
    members.map((m) => ({
      id: m.id,
      kakaoUserId: m.kakaoUserId,
      kakaoNickname: effectiveKakaoNickname(m),
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
      kakaoNickname: effectiveKakaoNickname(m) ?? "카톡 미연결",
      daysSinceActive,
      lastActiveDate: lastActiveDate.toISOString().slice(0, 10),
      mmr: m.mmr,
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
