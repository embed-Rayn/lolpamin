-- CreateTable
CREATE TABLE "MmrSetting" (
    "id" TEXT NOT NULL,
    "k" INTEGER NOT NULL DEFAULT 40,
    "winPoint" INTEGER NOT NULL DEFAULT 3,
    "lossPoint" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "MmrSetting_pkey" PRIMARY KEY ("id")
);
