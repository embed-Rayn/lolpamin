import type { GameMode, PrismaClient } from "@lolpamin/db";
import type { ReplayPlayer } from "@lolpamin/core";
import { saveGameResultTx, type SaveGameResultOutput } from "./save-game-result";
import { computeReplayKey } from "../replay-import/replay-key";

export interface ReplayAssignment {
  puuid: string;
  gameName: string;
  tagLine: string;
  team: "BLUE" | "RED";
  /** null이면 "회원 아님"으로 확정한 외부인이다. */
  memberId: string | null;
}

export interface SaveReplayImportInput {
  replayKey: string;
  /**
   * 미리보기가 파일에서 읽은 그대로의 경기 정보. 파일을 다시 올리지 않으려고 클라이언트가
   * 돌려보내므로, 저장 전에 replayKey를 다시 계산해 같은 경기인지 확인한다.
   */
  replay: { gameLengthMs: number; players: ReplayPlayer[] };
  /** 리플레이에 벽시계 시각이 없어 관리자가 고른 값이다(기본값은 파일의 lastModified). */
  playedAt: Date;
  winner: "BLUE" | "RED";
  assignments: ReplayAssignment[];
  createdById?: string | null;
  // 리플레이에 큐 정보가 없어 관리자가 업로드 화면에서 직접 고른다. 기본은 협곡.
  mode?: GameMode;
}

export const SAVE_REPLAY_IMPORT_ERRORS = {
  alreadyImported: "이미 등록된 경기입니다.",
  duplicateMember: "같은 회원이 두 슬롯에 배정돼 있습니다.",
  emptyTeam: "한 팀에 회원이 한 명도 없습니다. 최소 한 명은 회원이어야 합니다.",
  replayMismatch: "리플레이 정보가 일치하지 않습니다.",
} as const;

/**
 * 확정된 매칭을 저장한다. 계정 등록·경기 저장·활동 갱신이 한 트랜잭션 안에서 끝난다 —
 * 셋 중 하나만 성공하면 계정만 등록되고 경기는 없는 상태가 되어 다음 업로드가 조용히 어긋난다.
 *
 * 계정을 먼저 등록하는 것은 의도적이다. 그 순간 배정된 회원은 RiotAccount를 갖게 되어
 * saveGameResult의 완화 조건("PUUID로 확인된 계정이 붙어 있으면 디코·카톡 양쪽 연결을 갈음")을
 * 충족한다. 리플레이가 그 사람이 그 경기를 뛰었다는 1차 증거라는 설계를 그대로 옮긴 것이다.
 */
export async function saveReplayImport(
  prisma: PrismaClient,
  input: SaveReplayImportInput
): Promise<SaveGameResultOutput> {
  const { replayKey, replay, playedAt, winner, assignments, createdById = null, mode = "RIFT" } = input;

  // 클라이언트가 돌려보낸 스탯이 이 키의 경기인지 확인한다. 수치 조작까지 막지는 않는다 —
  // 관리자 전용 경로이고, 막으려는 것은 다른 경기(오래된 탭, 재업로드)의 스탯이 끼어드는 일이다.
  const replayPuuids = new Set(replay.players.map((p) => p.puuid));
  if (computeReplayKey(replay) !== replayKey || assignments.some((a) => !replayPuuids.has(a.puuid))) {
    throw new Error(SAVE_REPLAY_IMPORT_ERRORS.replayMismatch);
  }

  const memberIds = assignments.map((a) => a.memberId).filter((id): id is string => id !== null);
  if (new Set(memberIds).size !== memberIds.length) {
    throw new Error(SAVE_REPLAY_IMPORT_ERRORS.duplicateMember);
  }

  const blueMemberIds = assignments.filter((a) => a.team === "BLUE" && a.memberId).map((a) => a.memberId!);
  const redMemberIds = assignments.filter((a) => a.team === "RED" && a.memberId).map((a) => a.memberId!);
  // 회원이 0명인 팀은 평균 레이팅이 없어 calculateTeamMmrChange가 NaN을 낸다.
  if (blueMemberIds.length === 0 || redMemberIds.length === 0) {
    throw new Error(SAVE_REPLAY_IMPORT_ERRORS.emptyTeam);
  }

  return prisma.$transaction(
    async (tx) => {
      const already = await tx.gameResult.findUnique({ where: { replayKey } });
      if (already) throw new Error(SAVE_REPLAY_IMPORT_ERRORS.alreadyImported);

      // RiotAccount.memberId는 Member.id를 참조하는 FK다(onDelete: Restrict). 존재하지 않는
      // memberId로 먼저 계정을 만들면 saveGameResultTx가 내는 "do not exist" 대신 FK 제약
      // 위반이 터진다 — 계정 등록보다 먼저 확인해서 같은 메시지로 실패하게 한다.
      if (memberIds.length > 0) {
        const existingCount = await tx.member.count({ where: { id: { in: memberIds } } });
        if (existingCount !== memberIds.length) {
          throw new Error("One or more participants do not exist");
        }
      }

      for (const a of assignments) {
        const existing = await tx.riotAccount.findUnique({ where: { puuid: a.puuid } });
        if (!existing) {
          await tx.riotAccount.create({
            data: {
              puuid: a.puuid,
              memberId: a.memberId,
              gameName: a.gameName,
              tagLine: a.tagLine,
              lastSeenAt: playedAt,
            },
          });
          continue;
        }
        await tx.riotAccount.update({
          where: { puuid: a.puuid },
          data: {
            memberId: a.memberId,
            // 닉변을 반영한다. 표시용이며 매칭의 근거가 아니므로 덮어도 잃는 것이 없다.
            gameName: a.gameName,
            tagLine: a.tagLine,
            lastSeenAt: playedAt,
            // 관리자가 주인을 바꿨다면 흡수 표식은 의미를 잃는다. 남겨 두면 나중에 해제할 때
            // 이 계정이 엉뚱한 묘비로 돌아간다.
            absorbedFromId: existing.memberId === a.memberId ? existing.absorbedFromId : null,
          },
        });
      }

      const result = await saveGameResultTx(tx, {
        playedAt,
        blueMemberIds,
        redMemberIds,
        winner,
        createdById,
        replayKey,
        mode,
      });

      for (const a of assignments) {
        if (a.memberId === null) continue;
        await tx.gameParticipant.update({
          where: { gameResultId_memberId: { gameResultId: result.gameResultId, memberId: a.memberId } },
          data: { replayPuuid: a.puuid },
        });
      }
      await tx.gameResult.update({
        where: { id: result.gameResultId },
        data: { gameLengthMs: replay.gameLengthMs },
      });
      // 필드를 하나씩 고른다 — 클라이언트가 보낸 객체를 그대로 펼치면 모르는 키가 섞여 들어와
      // createMany가 거부한다.
      await tx.replayPlayerStat.createMany({
        data: replay.players.map((p) => ({
          gameResultId: result.gameResultId,
          puuid: p.puuid,
          gameName: p.gameName,
          tagLine: p.tagLine,
          team: p.team,
          position: p.position,
          champion: p.champion,
          level: p.level,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          cs: p.cs,
          spell1: p.spell1,
          spell2: p.spell2,
          keystone: p.keystone,
          subStyle: p.subStyle,
          items: p.items,
          damageDealt: p.damageDealt,
          damageTaken: p.damageTaken,
          controlWards: p.controlWards,
          wardsPlaced: p.wardsPlaced,
          wardsKilled: p.wardsKilled,
          gold: p.gold,
          baronKills: p.baronKills,
          dragonKills: p.dragonKills,
          heraldKills: p.heraldKills,
          hordeKills: p.hordeKills,
          atakhanKills: p.atakhanKills,
          turretKills: p.turretKills,
          inhibitorKills: p.inhibitorKills,
        })),
      });

      // 같이 게임을 했는데 카톡에 글을 안 썼다고 비활동으로 잡히는 구멍을 메운다.
      // 날짜를 뒤로 당기지는 않는다 — 관리자가 지난 경기를 소급 입력할 수 있다.
      await tx.member.updateMany({
        where: { id: { in: memberIds }, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: playedAt } }] },
        data: { lastActiveAt: playedAt },
      });

      return result;
    },
    { timeout: 20000 },
  );
}
