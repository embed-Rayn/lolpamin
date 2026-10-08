-- CreateTable
CREATE TABLE "MeetingNote" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "MeetingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingNoteImage" (
    "id" TEXT NOT NULL,
    "noteId" TEXT,
    "bytes" BYTEA NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "MeetingNoteImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingNote_meetingDate_idx" ON "MeetingNote"("meetingDate");

-- CreateIndex
CREATE INDEX "MeetingNoteImage_noteId_idx" ON "MeetingNoteImage"("noteId");

-- AddForeignKey
ALTER TABLE "MeetingNoteImage" ADD CONSTRAINT "MeetingNoteImage_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "MeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
