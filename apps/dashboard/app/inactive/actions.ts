"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { parseLastActiveInput } from "@/lib/inactive/last-active-input";
import { updateMemberLastActive } from "@/lib/mutations/update-member-last-active";

export async function updateMemberLastActiveAction(
  memberId: string,
  raw: string,
): Promise<{ error: string | null }> {
  await requireAdmin();
  if (!memberId) return { error: "회원을 찾을 수 없습니다." };

  const parsed = parseLastActiveInput(raw, new Date());
  if (parsed.error !== null) return { error: parsed.error };

  try {
    await updateMemberLastActive(prisma, memberId, parsed.date);
  } catch {
    return { error: "저장하지 못했습니다." };
  }
  revalidatePath("/inactive");
  revalidatePath("/members");
  return { error: null };
}
