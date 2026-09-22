-- AlterTable
ALTER TABLE "SiteSetting" ADD COLUMN "logoSvg" TEXT;
ALTER TABLE "SiteSetting" ADD COLUMN "siteName" TEXT;
ALTER TABLE "SiteSetting" ADD COLUMN "siteTagline" TEXT;
ALTER TABLE "SiteSetting" ADD COLUMN "homeBannerDesktop" BYTEA;
ALTER TABLE "SiteSetting" ADD COLUMN "homeBannerDesktopType" TEXT;
ALTER TABLE "SiteSetting" ADD COLUMN "homeBannerMobile" BYTEA;
ALTER TABLE "SiteSetting" ADD COLUMN "homeBannerMobileType" TEXT;
