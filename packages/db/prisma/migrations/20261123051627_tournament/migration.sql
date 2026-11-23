-- CreateEnum
CREATE TYPE "GameKind" AS ENUM ('INTERNAL', 'TOURNAMENT', 'SCRIM');

-- AlterTable
ALTER TABLE "GameResult" ADD COLUMN     "blueTeamSlot" INTEGER,
ADD COLUMN     "kind" "GameKind" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "redTeamSlot" INTEGER;

-- AlterTable
ALTER TABLE "SiteSetting" ADD COLUMN     "tournamentEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TournamentTeam" (
    "slot" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "TournamentTeam_pkey" PRIMARY KEY ("slot")
);

-- CreateTable
CREATE TABLE "TournamentImage" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameResult_kind_cancelledAt_idx" ON "GameResult"("kind", "cancelledAt");
