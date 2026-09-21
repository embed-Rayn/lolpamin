"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { saveGameResult, type SaveGameResultInput } from "@/lib/mutations/save-game-result";

export async function saveGameResultAction(input: SaveGameResultInput) {
  const admin = await requireAdmin();
  // createdById는 세션에서만 온다. 클라이언트가 보낸 값을 쓰면 아무나 남의 이름으로
  // 입력 기록을 남길 수 있다.
  const result = await saveGameResult(prisma, { ...input, createdById: admin.id });
  revalidatePath("/matches");
  revalidatePath("/match-history");
  revalidatePath("/rift");
  return result;
}
