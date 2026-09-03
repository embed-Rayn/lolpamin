"use server";

import { revalidatePath } from "next/cache";
import type { MemberTier } from "@lolpamin/db";
import { TIER_SCORES } from "@lolpamin/core";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { deleteMember, type DeleteMemberOutput } from "@/lib/mutations/delete-member";
import { updateMemberRealName } from "@/lib/mutations/update-member-real-name";
import { updateMemberTier } from "@/lib/mutations/update-member-tier";
import { updateMemberRiotId } from "@/lib/mutations/update-member-riot-id";

export async function deleteMemberAction(memberId: string): Promise<DeleteMemberOutput> {
  await requireAdmin();
  if (!memberId) {
    throw new Error("memberId is required");
  }
  const result = await deleteMember(prisma, memberId);
  revalidatePath("/members");
  revalidatePath("/inactive");
  revalidatePath("/link-accounts");
  revalidatePath("/matches");
  return result;
}

export async function updateMemberRealNameAction(
  memberId: string,
  realName: string
): Promise<{ error: string | null }> {
  await requireAdmin();

  try {
    await updateMemberRealName(prisma, memberId, realName);
  } catch {
    return { error: "실명을 저장하지 못했습니다." };
  }

  revalidatePath("/members");
  revalidatePath("/inactive");
  return { error: null };
}

export async function updateMemberTierAction(
  memberId: string,
  tier: MemberTier,
): Promise<{ error: string | null }> {
  await requireAdmin();

  // 클라이언트가 보낸 문자열이므로 enum 값인지 여기서 확인한다. Prisma도 거부하지만
  // 그쪽 예외는 영어 스택이 섞인 긴 문자열이라 관리자 화면에 띄울 것이 못 된다.
  if (!(tier in TIER_SCORES)) {
    return { error: "알 수 없는 티어입니다." };
  }

  try {
    await updateMemberTier(prisma, memberId, tier);
  } catch {
    return { error: "티어를 저장하지 못했습니다." };
  }

  revalidatePath("/members");
  revalidatePath("/team-builder");
  return { error: null };
}

export async function updateMemberRiotIdAction(
  memberId: string,
  riotId: string,
): Promise<{ error: string | null }> {
  await requireAdmin();

  try {
    await updateMemberRiotId(prisma, memberId, riotId);
  } catch {
    return { error: "Riot ID를 저장하지 못했습니다." };
  }

  revalidatePath("/members");
  revalidatePath("/team-builder");
  return { error: null };
}
