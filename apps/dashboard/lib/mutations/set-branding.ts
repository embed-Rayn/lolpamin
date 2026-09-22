import type { PrismaClient } from "@lolpamin/db";
import { sanitizeSvg } from "@lolpamin/core";
import { SITE_SETTING_ID } from "../queries/site-theme";

export const SITE_NAME_MAX_LENGTH = 40;
export const SITE_TAGLINE_MAX_LENGTH = 80;
export const BANNER_MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_BANNER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export class SetBrandingValidationError extends Error {}

export interface BannerUpload {
  bytes: Buffer;
  type: string;
}

export interface SetBrandingInput {
  // undefined = 이 필드는 안 건드림. null = 기본값으로 리셋. 값 있음 = 새로 저장.
  logoSvg?: string | null;
  siteName?: string | null;
  siteTagline?: string | null;
  homeBannerDesktop?: BannerUpload | null;
  homeBannerMobile?: BannerUpload | null;
}

function validateBanner(upload: BannerUpload): void {
  if (!ALLOWED_BANNER_TYPES.includes(upload.type)) {
    throw new SetBrandingValidationError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
  }
  if (upload.bytes.byteLength > BANNER_MAX_BYTES) {
    throw new SetBrandingValidationError("이미지 용량은 5MB를 넘을 수 없습니다.");
  }
}

export async function setBranding(
  prisma: PrismaClient,
  input: SetBrandingInput,
  adminId: string | null,
): Promise<void> {
  const data: Record<string, unknown> = { updatedById: adminId };

  if (input.logoSvg !== undefined) {
    if (input.logoSvg === null) {
      data.logoSvg = null;
    } else {
      const sanitized = sanitizeSvg(input.logoSvg);
      if (!sanitized) {
        throw new SetBrandingValidationError("올바른 SVG가 아니거나 허용되지 않는 내용이 포함되어 있습니다.");
      }
      data.logoSvg = sanitized;
    }
  }

  if (input.siteName !== undefined) {
    if (input.siteName !== null && input.siteName.length > SITE_NAME_MAX_LENGTH) {
      throw new SetBrandingValidationError(`이름은 ${SITE_NAME_MAX_LENGTH}자를 넘을 수 없습니다.`);
    }
    data.siteName = input.siteName || null;
  }

  if (input.siteTagline !== undefined) {
    if (input.siteTagline !== null && input.siteTagline.length > SITE_TAGLINE_MAX_LENGTH) {
      throw new SetBrandingValidationError(`부제는 ${SITE_TAGLINE_MAX_LENGTH}자를 넘을 수 없습니다.`);
    }
    data.siteTagline = input.siteTagline || null;
  }

  if (input.homeBannerDesktop !== undefined) {
    if (input.homeBannerDesktop === null) {
      data.homeBannerDesktop = null;
      data.homeBannerDesktopType = null;
    } else {
      validateBanner(input.homeBannerDesktop);
      data.homeBannerDesktop = input.homeBannerDesktop.bytes;
      data.homeBannerDesktopType = input.homeBannerDesktop.type;
    }
  }

  if (input.homeBannerMobile !== undefined) {
    if (input.homeBannerMobile === null) {
      data.homeBannerMobile = null;
      data.homeBannerMobileType = null;
    } else {
      validateBanner(input.homeBannerMobile);
      data.homeBannerMobile = input.homeBannerMobile.bytes;
      data.homeBannerMobileType = input.homeBannerMobile.type;
    }
  }

  await prisma.siteSetting.upsert({
    where: { id: SITE_SETTING_ID },
    create: { id: SITE_SETTING_ID, ...data },
    update: data,
  });
}
