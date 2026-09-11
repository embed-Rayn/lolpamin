-- AlterTable
ALTER TABLE "GameParticipant" ADD COLUMN     "absorbedFromId" TEXT;

-- AlterTable
ALTER TABLE "GameResult" ADD COLUMN     "replayKey" TEXT;

-- CreateTable
CREATE TABLE "RiotAccount" (
    "id" TEXT NOT NULL,
    "memberId" TEXT,
    "puuid" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "tagLine" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "absorbedFromId" TEXT,

    CONSTRAINT "RiotAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiotAccount_puuid_key" ON "RiotAccount"("puuid");

-- CreateIndex
CREATE INDEX "RiotAccount_memberId_idx" ON "RiotAccount"("memberId");

-- CreateIndex
CREATE INDEX "RiotAccount_absorbedFromId_idx" ON "RiotAccount"("absorbedFromId");

-- CreateIndex
CREATE INDEX "GameParticipant_absorbedFromId_idx" ON "GameParticipant"("absorbedFromId");

-- CreateIndex
CREATE UNIQUE INDEX "GameResult_replayKey_key" ON "GameResult"("replayKey");

-- AddForeignKey
ALTER TABLE "RiotAccount" ADD CONSTRAINT "RiotAccount_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
