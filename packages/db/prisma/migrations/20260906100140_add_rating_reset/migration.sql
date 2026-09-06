-- CreateEnum
CREATE TYPE "RatingResetKind" AS ENUM ('SOFT', 'HARD');

-- CreateTable
CREATE TABLE "RatingReset" (
    "id" TEXT NOT NULL,
    "kind" "RatingResetKind" NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memberCount" INTEGER NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "RatingReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RatingReset_resetAt_idx" ON "RatingReset"("resetAt");
