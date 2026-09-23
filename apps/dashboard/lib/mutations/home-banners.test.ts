import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { DEFAULT_BANNER_SRC, getHomeBanners, resolveHomeBannerSources } from "../queries/home-banners";
import { BANNER_MAX_BYTES, deleteHomeBanner, HomeBannerValidationError, setHomeBanner } from "./home-banners";

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

const png = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: "image/png" };

describe("setHomeBanner", () => {
  it("fills slots independently and lists them in slot order", async () => {
    await setHomeBanner(prisma, "DESKTOP", 2, png, null);
    await setHomeBanner(prisma, "DESKTOP", 0, png, null);
    await setHomeBanner(prisma, "MOBILE", 1, png, null);

    const banners = await getHomeBanners(prisma);
    expect(banners.desktop.map((b) => b.slot)).toEqual([0, 2]);
    expect(banners.mobile.map((b) => b.slot)).toEqual([1]);
    expect(banners.desktop[0].src).toMatch(/^\/api\/branding\/banners\/desktop\/0\?v=\d+$/);
  });

  it("replacing a slot keeps one row and changes its cache-busting src", async () => {
    await setHomeBanner(prisma, "DESKTOP", 0, png, null);
    const before = (await getHomeBanners(prisma)).desktop[0].src;
    await new Promise((r) => setTimeout(r, 5));
    await setHomeBanner(prisma, "DESKTOP", 0, { bytes: Buffer.from([1, 2, 3]), type: "image/webp" }, null);

    const after = await getHomeBanners(prisma);
    expect(after.desktop).toHaveLength(1);
    expect(after.desktop[0].src).not.toBe(before);
  });

  it("rejects slots outside 0..3 and unknown variants", async () => {
    await expect(setHomeBanner(prisma, "DESKTOP", 4, png, null)).rejects.toThrow(HomeBannerValidationError);
    await expect(setHomeBanner(prisma, "DESKTOP", -1, png, null)).rejects.toThrow(HomeBannerValidationError);
    await expect(setHomeBanner(prisma, "DESKTOP", 1.5, png, null)).rejects.toThrow(HomeBannerValidationError);
    // @ts-expect-error — the server action receives this from the browser unchecked
    await expect(setHomeBanner(prisma, "TABLET", 0, png, null)).rejects.toThrow(HomeBannerValidationError);
  });

  it("rejects a disallowed type or an oversized file", async () => {
    await expect(setHomeBanner(prisma, "DESKTOP", 0, { bytes: png.bytes, type: "image/svg+xml" }, null)).rejects.toThrow(
      HomeBannerValidationError,
    );
    const huge = { bytes: Buffer.alloc(BANNER_MAX_BYTES + 1), type: "image/png" };
    await expect(setHomeBanner(prisma, "DESKTOP", 0, huge, null)).rejects.toThrow(HomeBannerValidationError);
  });
});

describe("deleteHomeBanner", () => {
  it("empties only that slot and is a no-op on an empty one", async () => {
    await setHomeBanner(prisma, "DESKTOP", 0, png, null);
    await setHomeBanner(prisma, "DESKTOP", 1, png, null);
    await deleteHomeBanner(prisma, "DESKTOP", 0);
    await deleteHomeBanner(prisma, "DESKTOP", 3);

    expect((await getHomeBanners(prisma)).desktop.map((b) => b.slot)).toEqual([1]);
  });
});

describe("resolveHomeBannerSources", () => {
  it("falls back to the default image, and mobile to the desktop set", () => {
    expect(resolveHomeBannerSources({ desktop: [], mobile: [] })).toEqual({
      desktop: [DEFAULT_BANNER_SRC],
      mobile: [DEFAULT_BANNER_SRC],
    });
    const desktop = [{ slot: 0, src: "d0" }, { slot: 2, src: "d2" }];
    expect(resolveHomeBannerSources({ desktop, mobile: [] })).toEqual({ desktop: ["d0", "d2"], mobile: ["d0", "d2"] });
  });

  it("uses the mobile set whole once any mobile banner exists", () => {
    const resolved = resolveHomeBannerSources({
      desktop: [{ slot: 0, src: "d0" }, { slot: 1, src: "d1" }],
      mobile: [{ slot: 3, src: "m3" }],
    });
    expect(resolved.mobile).toEqual(["m3"]);
  });
});
