"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createAdmin, deleteAdmin } from "@/lib/mutations/admins";
import { resetAllRatings } from "@/lib/mutations/reset-ratings";
import { setSiteTheme } from "@/lib/mutations/set-site-theme";
import { SetBrandingValidationError, setBranding } from "@/lib/mutations/set-branding";
import { deleteHomeBanner, HomeBannerValidationError, setHomeBanner } from "@/lib/mutations/home-banners";
import { MmrConfigValidationError, updateMmrConfig } from "@/lib/mutations/update-mmr-config";
import type { BannerVariant, RatingResetKind } from "@lolpamin/db";

interface AdminActionResult {
  error: string | null;
}

// createAdmin/deleteAdmin이 의도적으로 던지는 한글 검증 메시지들. 이 목록에 없는 에러
// (예: Prisma가 던지는 P2025 같은 원문 영어 메시지)는 아래에서 짧은 한글 문구로 대체된다.
const KNOWN_CREATE_ADMIN_ERRORS = ["아이디는 3자 이상이어야 합니다", "비밀번호는 8자 이상이어야 합니다", "이미 사용 중인 아이디입니다"];
const KNOWN_DELETE_ADMIN_ERRORS = ["자기 자신은 삭제할 수 없습니다", "마지막 관리자는 삭제할 수 없습니다"];

function toKnownMessage(error: unknown, knownMessages: string[], fallback: string): string {
  if (error instanceof Error && knownMessages.some((known) => error.message.includes(known))) {
    return error.message;
  }
  return fallback;
}

export async function createAdminAction(formData: FormData): Promise<AdminActionResult> {
  const acting = await requireAdmin();

  try {
    await createAdmin(prisma, {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      createdById: acting.id,
    });
  } catch (error) {
    return { error: toKnownMessage(error, KNOWN_CREATE_ADMIN_ERRORS, "관리자를 추가하지 못했습니다") };
  }

  revalidatePath("/admins");
  return { error: null };
}

export async function deleteAdminAction(targetId: string): Promise<AdminActionResult> {
  const acting = await requireAdmin();

  try {
    await deleteAdmin(prisma, targetId, acting.id);
  } catch (error) {
    return { error: toKnownMessage(error, KNOWN_DELETE_ADMIN_ERRORS, "관리자를 삭제하지 못했습니다") };
  }

  revalidatePath("/admins");
  return { error: null };
}

export interface ResetRatingsActionResult {
  error: string | null;
  count: number;
}

// 서버 액션의 인자는 브라우저가 보내는 값이라 타입만으로는 막히지 않는다. 모르는
// 값이 SOFT로 새어 들어가지 않게 여기서 끊는다.
const RESET_KINDS: RatingResetKind[] = ["SOFT", "HARD"];

export async function resetRatingsAction(kind: RatingResetKind): Promise<ResetRatingsActionResult> {
  const acting = await requireAdmin();
  if (!RESET_KINDS.includes(kind)) return { error: "알 수 없는 리셋 종류입니다", count: 0 };

  let count = 0;
  try {
    ({ count } = await resetAllRatings(prisma, { kind, adminId: acting.id }));
  } catch {
    return { error: "리셋하지 못했습니다", count: 0 };
  }

  // 순위 배지와 회원 목록이 모두 옛 mmr을 들고 있고, 전적을 세는 화면들은 옛 기준선을
  // 들고 있으므로 대시보드까지 함께 무효화한다.
  revalidatePath("/admins");
  revalidatePath("/rift");
  revalidatePath("/inactive");
  revalidatePath("/matches");
  revalidatePath("/team-builder");
  revalidatePath("/");
  return { error: null, count };
}

export interface MmrConfigActionResult {
  error: string | null;
}

export async function updateMmrConfigAction(input: {
  k: number;
  winPoint: number;
  lossPoint: number;
}): Promise<MmrConfigActionResult> {
  const acting = await requireAdmin();

  try {
    await updateMmrConfig(prisma, { ...input, updatedById: acting.id });
  } catch (error) {
    // 검증 에러만 그대로 보여 준다 — 나머지(Prisma 원문 등)는 짧은 한글로 대체한다.
    if (error instanceof MmrConfigValidationError) {
      return { error: error.errors.join("\n") };
    }
    return { error: "MMR 설정을 저장하지 못했습니다" };
  }

  revalidatePath("/admins");
  // 경기 입력 화면은 이 값으로 프리뷰와 시뮬레이터를 그리므로 함께 무효화한다.
  revalidatePath("/matches");
  return { error: null };
}

// 스킨은 <html data-theme>로 layout에서 붙으므로 layout 단위로 재검증해야 모든 페이지가
// 다음 요청부터 새 스킨으로 나온다. 페이지 하나만 revalidate하면 나머지는 옛 스킨이다.
export async function setSiteThemeAction(theme: string): Promise<{ error: string | null }> {
  const acting = await requireAdmin();
  await setSiteTheme(prisma, theme, acting.id);
  revalidatePath("/", "layout");
  return { error: null };
}

// FormData로 받는 이유: BrandingPanel이 <form>에서 직접 만든 FormData를 넘긴다.
export async function setBrandingAction(formData: FormData): Promise<{ error: string | null }> {
  const acting = await requireAdmin();

  const logoSvgRaw = formData.get("logoSvg");
  const siteNameRaw = formData.get("siteName");
  const siteTaglineRaw = formData.get("siteTagline");

  try {
    await setBranding(
      prisma,
      {
        logoSvg: typeof logoSvgRaw === "string" && logoSvgRaw.trim() ? logoSvgRaw : null,
        siteName: typeof siteNameRaw === "string" ? siteNameRaw.trim() || null : undefined,
        siteTagline: typeof siteTaglineRaw === "string" ? siteTaglineRaw.trim() || null : undefined,
      },
      acting.id,
    );
  } catch (error) {
    if (error instanceof SetBrandingValidationError) return { error: error.message };
    return { error: "브랜딩 설정을 저장하지 못했습니다." };
  }

  // 로고·이름은 사이드바/드로어(모든 페이지)에 나온다 — 스킨과 같은 이유로
  // layout 단위로 재검증한다.
  revalidatePath("/", "layout");
  return { error: null };
}

// 배너 칸 하나를 바로 올리거나 비운다 — 브랜딩 폼의 "저장"과 묶지 않는다.
export async function setHomeBannerAction(formData: FormData): Promise<{ error: string | null }> {
  const acting = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "이미지 파일을 골라주세요." };

  try {
    await setHomeBanner(
      prisma,
      String(formData.get("variant")) as BannerVariant,
      Number(formData.get("slot")),
      { bytes: Buffer.from(await file.arrayBuffer()), type: file.type },
      acting.id,
    );
  } catch (error) {
    if (error instanceof HomeBannerValidationError) return { error: error.message };
    return { error: "배너를 저장하지 못했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/admins");
  return { error: null };
}

export async function deleteHomeBannerAction(variant: BannerVariant, slot: number): Promise<{ error: string | null }> {
  await requireAdmin();

  try {
    await deleteHomeBanner(prisma, variant, slot);
  } catch (error) {
    if (error instanceof HomeBannerValidationError) return { error: error.message };
    return { error: "배너를 삭제하지 못했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/admins");
  return { error: null };
}
