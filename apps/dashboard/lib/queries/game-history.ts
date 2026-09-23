import { prisma } from "@/lib/prisma";
import type { GameMode } from "@lolpamin/db";
import type { GameDetail } from "@/lib/game-detail/types";

export interface GameHistoryPlayer {
  name: string;
  mmrBefore: number;
  mmrAfter: number;
  delta: number;
}

export interface GameHistoryRow {
  id: string;
  mode: GameMode;
  playedAt: Date;
  winner: "BLUE" | "RED";
  createdByLabel: string;
  cancelledByLabel: string | null;
  isCancelled: boolean;
  // 되돌리기 버튼을 붙일 한 판. cancelGameResult가 받아들이는 것과 같은 조건이다 —
  // 모드별로 「살아 있는 것 중 가장 나중에 입력된 판」이므로 협곡과 칼바람에 하나씩 있다.
  canCancel: boolean;
  winners: GameHistoryPlayer[];
  losers: GameHistoryPlayer[];
  // 리플레이로 저장한 판의 상세 보드. 손으로 입력한 판과 이 기능 이전에 올린 판은 null이다.
  detail: GameDetail | null;
}

// "all"은 두 모드를 한 목록에 섞는다. 모드 값은 URL에서 오므로 parseGameHistoryMode로 거른다.
export type GameHistoryMode = "all" | GameMode;

const GAME_HISTORY_MODES: GameHistoryMode[] = ["all", "RIFT", "ARAM"];

export function parseGameHistoryMode(value: string | undefined): GameHistoryMode {
  return GAME_HISTORY_MODES.includes(value as GameHistoryMode) ? (value as GameHistoryMode) : "all";
}

export const GAME_HISTORY_PAGE_SIZE = 20;

// 1 미만·정수 아님·숫자 아님은 전부 1쪽. 마지막 쪽을 넘는 값은 조회 쪽에서 마지막 쪽으로 당긴다.
export function parseGameHistoryPage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export interface GameHistoryPage {
  rows: GameHistoryRow[];
  mode: GameHistoryMode;
  // 요청한 쪽이 범위를 벗어나면 마지막 쪽으로 당긴 값. 링크를 만들 때 이 값을 써야 한다.
  page: number;
  pageCount: number;
  // 필터를 적용한 전체 판수와 그중 살아 있는 판수 — 상단 안내문용.
  totalCount: number;
  liveCount: number;
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

export async function getGameHistory(
  options: { mode?: GameHistoryMode; page?: number } = {},
): Promise<GameHistoryPage> {
  const mode = options.mode ?? "all";
  const where = mode === "all" ? {} : { mode };

  const [totalCount, liveCount, latestLive] = await Promise.all([
    prisma.gameResult.count({ where }),
    prisma.gameResult.count({ where: { ...where, cancelledAt: null } }),
    // 되돌리기 대상은 모드별 최신 판이다. 필터·쪽과 무관하게 전체에서 찾아야 한다 —
    // 2쪽에 있는 판은 어차피 최신이 아니지만, 필터를 "협곡"으로 걸었을 때 칼바람 최신 판을
    // 놓치는 일은 없어야 하므로 두 모드를 모두 본다.
    prisma.gameResult.groupBy({
      by: ["mode"],
      where: { cancelledAt: null },
      _max: { createdAt: true },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(totalCount / GAME_HISTORY_PAGE_SIZE));
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);

  // 입력 순서(createdAt)가 곧 mmr이 쌓인 순서다. 경기 날짜를 과거로 적을 수 있으므로
  // playedAt으로 정렬하면 되돌리기 순서와 화면 순서가 어긋난다.
  const games = await prisma.gameResult.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * GAME_HISTORY_PAGE_SIZE,
    take: GAME_HISTORY_PAGE_SIZE,
    include: {
      replayStats: true,
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

  // groupBy는 createdAt만 주므로 (mode, createdAt) 쌍으로 판을 알아본다. createdAt은
  // 밀리초 단위라 같은 모드에서 겹칠 일이 사실상 없다.
  const latestLiveKey = new Set(
    latestLive
      .filter((g) => g._max.createdAt !== null)
      .map((g) => `${g.mode}:${g._max.createdAt!.getTime()}`),
  );

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

  const rows = games.map((game) => {
    const players = game.participants.map((p) => ({
      team: p.team,
      name: playerName(p.member),
      mmrBefore: p.mmrBefore,
      mmrAfter: p.mmrAfter,
      delta: p.mmrAfter - p.mmrBefore,
    }));
    const isWinner = (team: string) => team === game.winner;

    // 보드의 회원·MMR은 그 판을 뛴 계정(replayPuuid)으로 찾는다. 읽는 시점의 RiotAccount가
    // 아니라서 계정 주인이 나중에 바뀌어도 과거 경기의 표시는 그대로이고, 흡수는
    // GameParticipant.memberId를 옮기므로 생존자 이름이 자연스럽게 따라온다.
    const participantByPuuid = new Map(
      game.participants.filter((p) => p.replayPuuid !== null).map((p) => [p.replayPuuid!, p]),
    );
    const detail: GameDetail | null =
      game.replayStats.length === 0 || game.gameLengthMs === null
        ? null
        : {
            winner: game.winner as "BLUE" | "RED",
            mode: game.mode,
            gameLengthMs: game.gameLengthMs,
            players: game.replayStats.map(({ id: _id, gameResultId: _gameResultId, ...stat }) => {
              const participant = participantByPuuid.get(stat.puuid);
              return {
                ...stat,
                member: participant
                  ? {
                      name: playerName(participant.member),
                      mmrBefore: participant.mmrBefore,
                      mmrAfter: participant.mmrAfter,
                    }
                  : null,
              };
            }),
          };

    return {
      id: game.id,
      mode: game.mode,
      playedAt: game.playedAt,
      winner: game.winner as "BLUE" | "RED",
      createdByLabel: adminLabel(game.createdById),
      cancelledByLabel: game.cancelledAt === null ? null : adminLabel(game.cancelledById),
      isCancelled: game.cancelledAt !== null,
      canCancel:
        game.cancelledAt === null && latestLiveKey.has(`${game.mode}:${game.createdAt.getTime()}`),
      winners: players.filter((p) => isWinner(p.team)).map(({ team: _team, ...rest }) => rest),
      losers: players.filter((p) => !isWinner(p.team)).map(({ team: _team, ...rest }) => rest),
      detail,
    };
  });

  return { rows, mode, page, pageCount, totalCount, liveCount };
}
