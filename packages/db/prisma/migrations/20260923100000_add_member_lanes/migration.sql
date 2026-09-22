-- CreateEnum
CREATE TYPE "Lane" AS ENUM ('TOP', 'JUG', 'MID', 'AD', 'SUP');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "mainLane" "Lane",
ADD COLUMN     "subLane" "Lane";
