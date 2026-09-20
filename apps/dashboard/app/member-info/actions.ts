"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { updateMemberNote } from "@/lib/mutations/update-member-note";

export async function updateMemberNoteAction(
  memberId: string,
  note: string,
): Promise<{ error: string | null }> {
  await requireAdmin();

  try {
    await updateMemberNote(prisma, memberId, note);
  } catch {
    return { error: "비고를 저장하지 못했습니다." };
  }

  revalidatePath("/member-info");
  return { error: null };
}
