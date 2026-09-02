"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { deleteMember, type DeleteMemberOutput } from "@/lib/mutations/delete-member";
import { updateMemberRealName } from "@/lib/mutations/update-member-real-name";

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
