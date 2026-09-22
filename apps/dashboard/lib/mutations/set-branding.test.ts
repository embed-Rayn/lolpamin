import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getBranding } from "../queries/branding";
import {
  ALLOWED_BANNER_TYPES,
  BANNER_MAX_BYTES,
  SetBrandingValidationError,
  SITE_NAME_MAX_LENGTH,
  SITE_TAGLINE_MAX_LENGTH,
  setBranding,
} from "./set-branding";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const VALID_SVG = `<svg viewBox="0 0 10 10"><circle r="5"/></svg>`;

describe("getBranding defaults", () => {
  it("returns defaults when nothing has been saved", async () => {
    expect(await getBranding(prisma)).toEqual({
      logoSvg: null,
      siteName: "롤파민",
      siteTagline: "함께라서 더 즐거운 게임",
      hasDesktopBanner: false,
      hasMobileBanner: false,
    });
  });
});

describe("setBranding logo", () => {
  it("sanitizes and round-trips a logo", async () => {
    await setBranding(prisma, { logoSvg: VALID_SVG }, "admin-1");
    expect((await getBranding(prisma)).logoSvg).toBe(VALID_SVG);
  });

  it("rejects a non-svg root", async () => {
    await expect(setBranding(prisma, { logoSvg: "<div>nope</div>" }, null)).rejects.toThrow(
      SetBrandingValidationError,
    );
  });

  it("resets to default when logoSvg is set to null", async () => {
    await setBranding(prisma, { logoSvg: VALID_SVG }, null);
    await setBranding(prisma, { logoSvg: null }, null);
    expect((await getBranding(prisma)).logoSvg).toBeNull();
  });
});

describe("setBranding name/tagline", () => {
  it("round-trips and empty string resets to default", async () => {
    await setBranding(prisma, { siteName: "테스트팀", siteTagline: "테스트 부제" }, null);
    expect(await getBranding(prisma)).toMatchObject({ siteName: "테스트팀", siteTagline: "테스트 부제" });

    await setBranding(prisma, { siteName: "", siteTagline: "" }, null);
    expect(await getBranding(prisma)).toMatchObject({ siteName: "롤파민", siteTagline: "함께라서 더 즐거운 게임" });
  });

  it("rejects names/taglines over the length cap", async () => {
    await expect(
      setBranding(prisma, { siteName: "a".repeat(SITE_NAME_MAX_LENGTH + 1) }, null),
    ).rejects.toThrow(SetBrandingValidationError);
    await expect(
      setBranding(prisma, { siteTagline: "a".repeat(SITE_TAGLINE_MAX_LENGTH + 1) }, null),
    ).rejects.toThrow(SetBrandingValidationError);
  });
});

describe("setBranding banners", () => {
  const png = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: "image/png" };

  it("stores a banner and reports it present", async () => {
    await setBranding(prisma, { homeBannerDesktop: png }, null);
    expect((await getBranding(prisma)).hasDesktopBanner).toBe(true);
    expect((await getBranding(prisma)).hasMobileBanner).toBe(false);
  });

  it("rejects a disallowed image type", async () => {
    await expect(
      setBranding(prisma, { homeBannerDesktop: { bytes: png.bytes, type: "image/svg+xml" } }, null),
    ).rejects.toThrow(SetBrandingValidationError);
    expect(ALLOWED_BANNER_TYPES).not.toContain("image/svg+xml");
  });

  it("rejects a file over the size cap", async () => {
    const huge = { bytes: Buffer.alloc(BANNER_MAX_BYTES + 1), type: "image/png" };
    await expect(setBranding(prisma, { homeBannerDesktop: huge }, null)).rejects.toThrow(
      SetBrandingValidationError,
    );
  });

  it("resetting one banner leaves the other and other fields untouched", async () => {
    await setBranding(prisma, { logoSvg: VALID_SVG, homeBannerDesktop: png, homeBannerMobile: png }, null);
    await setBranding(prisma, { homeBannerDesktop: null }, null);

    const branding = await getBranding(prisma);
    expect(branding.hasDesktopBanner).toBe(false);
    expect(branding.hasMobileBanner).toBe(true);
    expect(branding.logoSvg).toBe(VALID_SVG);
  });
});
