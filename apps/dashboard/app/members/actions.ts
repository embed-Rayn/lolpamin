"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { deleteMember, type DeleteMemberOutput } from "@/lib/mutations/delete-member";

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
