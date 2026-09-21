-- CreateEnum
CREATE TYPE "MemberLane" AS ENUM ('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "primaryLane" "MemberLane",
ADD COLUMN     "secondaryLane" "MemberLane";
