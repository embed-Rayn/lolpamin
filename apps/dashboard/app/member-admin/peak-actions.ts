"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { initializeMemberPeakTier, PeakInitializationError } from "@/lib/mutations/initialize-member-peak-tier";

export async function initializePeakTierAction(memberId: string): Promise<{ error?: string; skipped?: boolean; stopBatch?: boolean }> {
  await requireAdmin();
  if (typeof memberId !== "string" || !memberId || memberId.length > 150) return { error: "회원을 확인해 주세요." };
  try {
    const result = await initializeMemberPeakTier(prisma, memberId);
    revalidatePath("/member-admin");
    revalidatePath("/member-info");
    return result;
  } catch (error) {
    return error instanceof PeakInitializationError ? { error: error.message, stopBatch: error.stopBatch } : { error: "조회 결과를 저장하지 못했습니다. 다시 시도해 주세요.", stopBatch: true };
  }
}
