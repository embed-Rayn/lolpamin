-- DropForeignKey
ALTER TABLE "RiotAccount" DROP CONSTRAINT "RiotAccount_memberId_fkey";

-- AddForeignKey
ALTER TABLE "RiotAccount" ADD CONSTRAINT "RiotAccount_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
