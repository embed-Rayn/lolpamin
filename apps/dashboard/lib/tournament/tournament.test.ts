import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import {
  getTournamentImageForViewer,
  getTournamentStandings,
  getTournamentTeamNames,
  isTournamentEnabled,
  listTournamentImageIds,
} from "./queries";
import {
  addTournamentImage,
  deleteTournamentImage,
  moveTournamentImage,
  renameTournamentTeam,
  setTournamentEnabled,
  TOURNAMENT_IMAGE_MAX,
  TournamentValidationError,
} from "./mutations";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const png = (n = 1) => ({ bytes: Buffer.from([n]), type: "image/png" });

function statRow(team: "BLUE" | "RED", kills: number, i: number): Prisma.ReplayPlayerStatCreateWithoutGameResultInput {
  return {
    puuid: `p-${team}-${i}`,
    gameName: "n",
    tagLine: "t",
    team,
    position: "TOP",
    champion: "Ahri",
    level: 18,
    kills,
    deaths: 0,
    assists: 0,
    cs: 0,
    spell1: 4,
    spell2: 14,
    keystone: 0,
    subStyle: 0,
    items: [],
    damageDealt: 0,
    damageTaken: 0,
    controlWards: 0,
    wardsPlaced: 0,
    wardsKilled: 0,
    gold: 0,
    baronKills: 0,
    dragonKills: 0,
    heraldKills: 0,
    hordeKills: 0,
    atakhanKills: 0,
    turretKills: 0,
    inhibitorKills: 0,
  };
}

async function game(
  kind: "INTERNAL" | "TOURNAMENT" | "SCRIM",
  blue: number,
  red: number,
  winner: "BLUE" | "RED",
  opts: { cancelled?: boolean; blueKills?: number[]; redKills?: number[]; createdAt?: Date } = {},
) {
  return prisma.gameResult.create({
    data: {
      playedAt: new Date(),
      winner,
      kind,
      blueTeamSlot: blue,
      redTeamSlot: red,
      cancelledAt: opts.cancelled ? new Date() : null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      replayStats: {
        create: [
          ...(opts.blueKills ?? []).map((k, i) => statRow("BLUE", k, i)),
          ...(opts.redKills ?? []).map((k, i) => statRow("RED", k, i)),
        ],
      },
    },
  });
}

describe("standings", () => {
  it("counts only live tournament games, ignoring the rating reset", async () => {
    await prisma.ratingReset.create({ data: { kind: "HARD", memberCount: 0, resetAt: new Date() } });
    await game("TOURNAMENT", 1, 2, "BLUE", { createdAt: new Date(Date.now() - 86_400_000) });
    await game("TOURNAMENT", 3, 4, "RED");
    await game("SCRIM", 1, 2, "BLUE");
    await game("TOURNAMENT", 1, 3, "BLUE", { cancelled: true });
    await game("INTERNAL", 1, 2, "BLUE");
    const rows = await getTournamentStandings(prisma);
    expect(rows.reduce((s, r) => s + r.played, 0)).toBe(4);
    expect(rows.find((r) => r.slot === 1)?.wins).toBe(1);
    expect(rows.find((r) => r.slot === 4)?.wins).toBe(1);
    expect(rows.find((r) => r.slot === 3)?.played).toBe(1);
  });

  it("derives kill difference from replay stats", async () => {
    await game("TOURNAMENT", 1, 2, "BLUE", { blueKills: [10, 8], redKills: [6, 5] });
    const rows = await getTournamentStandings(prisma);
    expect(rows.find((r) => r.slot === 1)?.killDiff).toBe(7);
    expect(rows.find((r) => r.slot === 2)?.killDiff).toBe(-7);
  });
});

describe("team names", () => {
  it("defaults, renames with trim, and validates", async () => {
    await setTournamentEnabled(prisma, true, null);
    expect(await getTournamentTeamNames(prisma)).toEqual({ 1: "1팀", 2: "2팀", 3: "3팀", 4: "4팀" });
    await renameTournamentTeam(prisma, 2, "  불꽃 ", "admin1");
    expect((await getTournamentTeamNames(prisma))[2]).toBe("불꽃");
    expect((await prisma.tournamentTeam.findUnique({ where: { slot: 2 } }))?.updatedById).toBe("admin1");
    await expect(renameTournamentTeam(prisma, 2, "", null)).rejects.toThrow("팀 이름은 1~20자입니다.");
    await expect(renameTournamentTeam(prisma, 2, "가".repeat(21), null)).rejects.toThrow(TournamentValidationError);
    await expect(renameTournamentTeam(prisma, 5, "x", null)).rejects.toThrow("없는 팀입니다.");
  });
});

describe("switch", () => {
  it("refuses mutations while off", async () => {
    expect(await isTournamentEnabled(prisma)).toBe(false);
    await expect(renameTournamentTeam(prisma, 1, "a", null)).rejects.toThrow("대회 페이지가 꺼져 있습니다.");
    await expect(addTournamentImage(prisma, png())).rejects.toThrow("대회 페이지가 꺼져 있습니다.");
    await setTournamentEnabled(prisma, true, null);
    expect(await isTournamentEnabled(prisma)).toBe(true);
    await renameTournamentTeam(prisma, 1, "a", null);
  });
});

describe("images", () => {
  it("adds, moves, deletes and enforces limits", async () => {
    await setTournamentEnabled(prisma, true, null);
    const a = await addTournamentImage(prisma, png(1));
    const b = await addTournamentImage(prisma, png(2));
    const c = await addTournamentImage(prisma, png(3));
    await moveTournamentImage(prisma, c, "up");
    expect(await listTournamentImageIds(prisma)).toEqual([a, c, b]);
    await moveTournamentImage(prisma, a, "up");
    expect(await listTournamentImageIds(prisma)).toEqual([a, c, b]);
    await deleteTournamentImage(prisma, c);
    expect(await listTournamentImageIds(prisma)).toEqual([a, b]);
    await deleteTournamentImage(prisma, c);
    await expect(addTournamentImage(prisma, { bytes: Buffer.from("x"), type: "text/plain" })).rejects.toThrow(
      TournamentValidationError,
    );
  });

  it("rejects the 21st image", async () => {
    await setTournamentEnabled(prisma, true, null);
    for (let i = 0; i < TOURNAMENT_IMAGE_MAX; i++) await addTournamentImage(prisma, png(i));
    await expect(addTournamentImage(prisma, png(99))).rejects.toThrow(TournamentValidationError);
  });

  it("hides images from visitors while off", async () => {
    await setTournamentEnabled(prisma, true, null);
    const id = await addTournamentImage(prisma, png(7));
    await setTournamentEnabled(prisma, false, null);
    expect(await getTournamentImageForViewer(prisma, id, false)).toBeNull();
    expect((await getTournamentImageForViewer(prisma, id, true))?.type).toBe("image/png");
    await setTournamentEnabled(prisma, true, null);
    expect(await getTournamentImageForViewer(prisma, id, false)).not.toBeNull();
    expect(await getTournamentImageForViewer(prisma, "missing", true)).toBeNull();
  });
});
