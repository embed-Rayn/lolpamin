-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "discordDisplayName" TEXT,
ADD COLUMN     "mergedIntoId" TEXT;

-- CreateIndex
CREATE INDEX "Member_mergedIntoId_idx" ON "Member"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
