-- AlterTable
ALTER TABLE "GameParticipant" ADD COLUMN     "replayPuuid" TEXT;

-- AlterTable
ALTER TABLE "GameResult" ADD COLUMN     "gameLengthMs" INTEGER;

-- CreateTable
CREATE TABLE "ReplayPlayerStat" (
    "id" TEXT NOT NULL,
    "gameResultId" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "tagLine" TEXT NOT NULL,
    "team" "Team" NOT NULL,
    "position" TEXT NOT NULL,
    "champion" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "cs" INTEGER NOT NULL,
    "spell1" INTEGER NOT NULL,
    "spell2" INTEGER NOT NULL,
    "keystone" INTEGER NOT NULL,
    "subStyle" INTEGER NOT NULL,
    "items" INTEGER[],
    "damageDealt" INTEGER NOT NULL,
    "damageTaken" INTEGER NOT NULL,
    "controlWards" INTEGER NOT NULL,
    "wardsPlaced" INTEGER NOT NULL,
    "wardsKilled" INTEGER NOT NULL,
    "gold" INTEGER NOT NULL,
    "baronKills" INTEGER NOT NULL,
    "dragonKills" INTEGER NOT NULL,
    "heraldKills" INTEGER NOT NULL,
    "hordeKills" INTEGER NOT NULL,
    "atakhanKills" INTEGER NOT NULL,
    "turretKills" INTEGER NOT NULL,
    "inhibitorKills" INTEGER NOT NULL,

    CONSTRAINT "ReplayPlayerStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReplayPlayerStat_gameResultId_puuid_key" ON "ReplayPlayerStat"("gameResultId", "puuid");

-- AddForeignKey
ALTER TABLE "ReplayPlayerStat" ADD CONSTRAINT "ReplayPlayerStat_gameResultId_fkey" FOREIGN KEY ("gameResultId") REFERENCES "GameResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

