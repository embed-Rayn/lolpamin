-- CreateTable
CREATE TABLE "ChampionMastery" (
    "riotAccountId" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "ChampionMastery_pkey" PRIMARY KEY ("riotAccountId","championId")
);

-- AddForeignKey
ALTER TABLE "ChampionMastery" ADD CONSTRAINT "ChampionMastery_riotAccountId_fkey" FOREIGN KEY ("riotAccountId") REFERENCES "RiotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "SiteSetting" ADD COLUMN "masteryRefreshedAt" TIMESTAMP(3);
