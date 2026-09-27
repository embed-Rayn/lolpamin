import type { BannerVariant, PrismaClient } from "@lolpamin/db";

export const BANNER_SLOT_COUNT = 4;
export const BANNER_MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_BANNER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const BANNER_VARIANTS: BannerVariant[] = ["DESKTOP", "MOBILE"];

export class HomeBannerValidationError extends Error {}

export interface BannerUpload {
  bytes: Buffer;
  type: string;
}

// 변형·슬롯은 브라우저가 보내는 값이라 타입만으로는 막히지 않는다.
function validateTarget(variant: BannerVariant, slot: number): void {
  if (!BANNER_VARIANTS.includes(variant) || !Number.isInteger(slot) || slot < 0 || slot >= BANNER_SLOT_COUNT) {
    throw new HomeBannerValidationError("잘못된 배너 위치입니다.");
  }
}

export async function setHomeBanner(
  prisma: PrismaClient,
  variant: BannerVariant,
  slot: number,
  upload: BannerUpload,
  adminId: string | null,
): Promise<void> {
  validateTarget(variant, slot);
  if (!ALLOWED_BANNER_TYPES.includes(upload.type)) {
    throw new HomeBannerValidationError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
  }
  if (upload.bytes.byteLength > BANNER_MAX_BYTES) {
    throw new HomeBannerValidationError("이미지 용량은 5MB를 넘을 수 없습니다.");
  }
  const data = { bytes: upload.bytes, type: upload.type, updatedById: adminId };
  await prisma.homeBanner.upsert({
    where: { variant_slot: { variant, slot } },
    create: { variant, slot, ...data },
    update: data,
  });
}

export async function deleteHomeBanner(prisma: PrismaClient, variant: BannerVariant, slot: number): Promise<void> {
  validateTarget(variant, slot);
  await prisma.homeBanner.deleteMany({ where: { variant, slot } });
}
