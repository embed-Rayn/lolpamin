"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createAdmin, deleteAdmin } from "@/lib/mutations/admins";

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
