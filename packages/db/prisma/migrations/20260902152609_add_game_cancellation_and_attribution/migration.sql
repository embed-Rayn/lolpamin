-- AlterTable
ALTER TABLE "GameResult" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "GameResult_cancelledAt_createdAt_idx" ON "GameResult"("cancelledAt", "createdAt");
