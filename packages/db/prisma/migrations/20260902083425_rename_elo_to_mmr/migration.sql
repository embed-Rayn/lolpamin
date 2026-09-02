-- Rename, not drop-and-add: these columns hold every member's accumulated
-- rating and the per-game history behind it.
ALTER TABLE "Member" RENAME COLUMN "elo" TO "mmr";
ALTER TABLE "GameParticipant" RENAME COLUMN "eloBefore" TO "mmrBefore";
ALTER TABLE "GameParticipant" RENAME COLUMN "eloAfter" TO "mmrAfter";
