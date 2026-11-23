import { aggregateTournamentStandings, defaultTournamentTeamName, TOURNAMENT_SLOTS } from "@lolpamin/core";
import type { TournamentGame, TournamentStanding } from "@lolpamin/core";
import type { PrismaClient } from "@lolpamin/db";
import { SITE_SETTING_ID } from "@/lib/queries/site-theme";

export async function isTournamentEnabled(prisma: PrismaClient): Promise<boolean> {
  const row = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTING_ID },
    select: { tournamentEnabled: true },
  });
  return row?.tournamentEnabled ?? false;
}

// Every slot is present; slots without a stored row get the default name.
export async function getTournamentTeamNames(prisma: PrismaClient): Promise<Record<number, string>> {
  const rows = await prisma.tournamentTeam.findMany({ select: { slot: true, name: true } });
  const stored = new Map(rows.map((r) => [r.slot, r.name]));
  const names: Record<number, string> = {};
  for (const slot of TOURNAMENT_SLOTS) names[slot] = stored.get(slot) ?? defaultTournamentTeamName(slot);
  return names;
}

// No rating-reset baseline: a tournament is not part of the quarterly MMR season.
export async function getTournamentStandings(prisma: PrismaClient): Promise<TournamentStanding[]> {
  const [names, results] = await Promise.all([
    getTournamentTeamNames(prisma),
    prisma.gameResult.findMany({
      where: { kind: "TOURNAMENT", cancelledAt: null },
      select: {
        winner: true,
        blueTeamSlot: true,
        redTeamSlot: true,
        replayStats: { select: { team: true, kills: true } },
      },
    }),
  ]);
  const games: TournamentGame[] = [];
  for (const r of results) {
    if (r.blueTeamSlot === null || r.redTeamSlot === null) continue;
    let blueKills = 0;
    let redKills = 0;
    for (const s of r.replayStats) {
      if (s.team === "BLUE") blueKills += s.kills;
      else redKills += s.kills;
    }
    games.push({ blueTeamSlot: r.blueTeamSlot, redTeamSlot: r.redTeamSlot, winner: r.winner, blueKills, redKills });
  }
  return aggregateTournamentStandings(games, names);
}

export async function listTournamentImageIds(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.tournamentImage.findMany({ orderBy: { position: "asc" }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function getTournamentImageForViewer(
  prisma: PrismaClient,
  id: string,
  isAdmin: boolean,
): Promise<{ bytes: Buffer; type: string } | null> {
  if (!isAdmin && !(await isTournamentEnabled(prisma))) return null;
  const image = await prisma.tournamentImage.findUnique({ where: { id }, select: { bytes: true, type: true } });
  return image ? { bytes: image.bytes, type: image.type } : null;
}
