-- CreateEnum
CREATE TYPE "EventImageKind" AS ENUM ('MAIN', 'HIDDEN');

-- CreateTable
CREATE TABLE "EventPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EventPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "kind" "EventImageKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventImage_postId_idx" ON "EventImage"("postId");

-- AddForeignKey
ALTER TABLE "EventImage" ADD CONSTRAINT "EventImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "EventPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
