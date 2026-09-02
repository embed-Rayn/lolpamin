import { prisma } from "@/lib/prisma";

export interface GameHistoryPlayer {
  name: string;
  mmrBefore: number;
  mmrAfter: number;
  delta: number;
}

export interface GameHistoryRow {
  id: string;
  playedAt: Date;
  winner: "BLUE" | "RED";
  createdByLabel: string;
  cancelledByLabel: string | null;
  isCancelled: boolean;
  // 되돌리기 버튼을 붙일 한 판. cancelGameResult가 받아들이는 것과 같은 조건이다.
  canCancel: boolean;
  winners: GameHistoryPlayer[];
  losers: GameHistoryPlayer[];
}

const SCRIPT_LABEL = "스크립트";
const DELETED_ADMIN_LABEL = "삭제된 관리자";

// 참가자 이름. 실명이 없으면 서버 별명, 그것도 없으면 핸들 순서로 본다 — 핸들("k._.dj")은
// 사람을 알아볼 수 없으므로 마지막이다.
function playerName(m: {
  realName: string | null;
  discordDisplayName: string | null;
  discordHandle: string | null;
  kakaoNickname: string | null;
}): string {
  return m.realName ?? m.discordDisplayName ?? m.discordHandle ?? m.kakaoNickname ?? "이름 미확인";
}

export async function getGameHistory(): Promise<GameHistoryRow[]> {
  // 입력 순서(createdAt)가 곧 mmr이 쌓인 순서다. 경기 날짜를 과거로 적을 수 있으므로
  // playedAt으로 정렬하면 되돌리기 순서와 화면 순서가 어긋난다.
  const games = await prisma.gameResult.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      participants: {
        include: {
          member: {
            select: {
              realName: true,
              discordDisplayName: true,
              discordHandle: true,
              kakaoNickname: true,
            },
          },
        },
      },
    },
  });

  const adminIds = [
    ...new Set(
      games.flatMap((g) => [g.createdById, g.cancelledById]).filter((id): id is string => id !== null),
    ),
  ];
  const admins = await prisma.admin.findMany({
    where: { id: { in: adminIds } },
    select: { id: true, username: true },
  });
  const usernameById = new Map(admins.map((a) => [a.id, a.username]));

  // adminId는 FK가 아니라 조회가 실패할 수 있다. null은 세션 없이 실행된 것이고,
  // 값이 있는데 못 찾으면 그 관리자가 삭제된 것이다 — 둘을 구분해서 보여준다.
  function adminLabel(id: string | null): string {
    if (id === null) return SCRIPT_LABEL;
    return usernameById.get(id) ?? DELETED_ADMIN_LABEL;
  }

  const latestLiveId = games.find((g) => g.cancelledAt === null)?.id ?? null;

  return games.map((game) => {
    const players = game.participants.map((p) => ({
      team: p.team,
      name: playerName(p.member),
      mmrBefore: p.mmrBefore,
      mmrAfter: p.mmrAfter,
      delta: p.mmrAfter - p.mmrBefore,
    }));
    const isWinner = (team: string) => team === game.winner;

    return {
      id: game.id,
      playedAt: game.playedAt,
      winner: game.winner as "BLUE" | "RED",
      createdByLabel: adminLabel(game.createdById),
      cancelledByLabel: game.cancelledAt === null ? null : adminLabel(game.cancelledById),
      isCancelled: game.cancelledAt !== null,
      canCancel: game.id === latestLiveId,
      winners: players.filter((p) => isWinner(p.team)).map(({ team: _team, ...rest }) => rest),
      losers: players.filter((p) => !isWinner(p.team)).map(({ team: _team, ...rest }) => rest),
    };
  });
}
