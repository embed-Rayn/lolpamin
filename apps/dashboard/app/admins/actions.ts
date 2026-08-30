"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createAdmin, deleteAdmin } from "@/lib/mutations/admins";

interface AdminActionResult {
  error: string | null;
}

export async function createAdminAction(formData: FormData): Promise<AdminActionResult> {
  await requireAdmin();
  const acting = await requireAdmin();

  try {
    await createAdmin(prisma, {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      createdById: acting.id,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "관리자를 추가하지 못했습니다" };
  }

  revalidatePath("/admins");
  return { error: null };
}

export async function deleteAdminAction(targetId: string): Promise<AdminActionResult> {
  await requireAdmin();
  const acting = await requireAdmin();

  try {
    await deleteAdmin(prisma, targetId, acting.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "관리자를 삭제하지 못했습니다" };
  }

  revalidatePath("/admins");
  return { error: null };
}
