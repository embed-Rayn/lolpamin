-- CreateEnum
CREATE TYPE "BannerVariant" AS ENUM ('DESKTOP', 'MOBILE');

-- CreateTable
CREATE TABLE "HomeBanner" (
    "variant" "BannerVariant" NOT NULL,
    "slot" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "type" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "HomeBanner_pkey" PRIMARY KEY ("variant","slot")
);

-- Carry the single banner each variant had into slot 0 before dropping the columns.
INSERT INTO "HomeBanner" ("variant", "slot", "bytes", "type", "updatedAt", "updatedById")
SELECT 'DESKTOP', 0, "homeBannerDesktop", COALESCE("homeBannerDesktopType", 'image/png'), "updatedAt", "updatedById"
FROM "SiteSetting" WHERE "homeBannerDesktop" IS NOT NULL;

INSERT INTO "HomeBanner" ("variant", "slot", "bytes", "type", "updatedAt", "updatedById")
SELECT 'MOBILE', 0, "homeBannerMobile", COALESCE("homeBannerMobileType", 'image/png'), "updatedAt", "updatedById"
FROM "SiteSetting" WHERE "homeBannerMobile" IS NOT NULL;

-- AlterTable
ALTER TABLE "SiteSetting" DROP COLUMN "homeBannerDesktop",
DROP COLUMN "homeBannerDesktopType",
DROP COLUMN "homeBannerMobile",
DROP COLUMN "homeBannerMobileType";
