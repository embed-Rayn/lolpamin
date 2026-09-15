-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('RIFT', 'ARAM');

-- AlterTable
ALTER TABLE "GameResult" ADD COLUMN     "mode" "GameMode" NOT NULL DEFAULT 'RIFT';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "aramMmr" INTEGER NOT NULL DEFAULT 1000;
