ALTER TABLE "Member" ADD COLUMN "peakTierManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Member" ADD COLUMN "peakTierInitializedAt" TIMESTAMP(3);
-- Preserve existing manually supplied ranked values.
UPDATE "Member" SET "peakTierManual" = true WHERE "peakTier" <> 'UNRANKED';
