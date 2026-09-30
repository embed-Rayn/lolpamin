-- AlterTable
ALTER TABLE "EventPost" ADD COLUMN     "revealLabel" TEXT,
ADD COLUMN     "thumbnailImageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EventPost_thumbnailImageId_key" ON "EventPost"("thumbnailImageId");

-- AddForeignKey
ALTER TABLE "EventPost" ADD CONSTRAINT "EventPost_thumbnailImageId_fkey" FOREIGN KEY ("thumbnailImageId") REFERENCES "EventImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

