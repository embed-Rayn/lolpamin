-- CreateEnum
CREATE TYPE "Team" AS ENUM ('BLUE', 'RED');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "realName" TEXT,
    "riotId" TEXT,
    "discordUserId" TEXT,
    "discordHandle" TEXT,
    "discordJoinedAt" TIMESTAMP(3),
    "kakaoUserId" TEXT,
    "kakaoNickname" TEXT,
    "elo" INTEGER NOT NULL DEFAULT 1000,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameResult" (
    "id" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "winner" "Team" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameParticipant" (
    "id" TEXT NOT NULL,
    "gameResultId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "team" "Team" NOT NULL,
    "eloBefore" INTEGER NOT NULL,
    "eloAfter" INTEGER NOT NULL,

    CONSTRAINT "GameParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentionLog" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "mentionedAt" TIMESTAMP(3) NOT NULL,
    "rawMessage" TEXT,

    CONSTRAINT "MentionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_discordUserId_key" ON "Member"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_kakaoUserId_key" ON "Member"("kakaoUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GameParticipant_gameResultId_memberId_key" ON "GameParticipant"("gameResultId", "memberId");

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_gameResultId_fkey" FOREIGN KEY ("gameResultId") REFERENCES "GameResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentionLog" ADD CONSTRAINT "MentionLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
