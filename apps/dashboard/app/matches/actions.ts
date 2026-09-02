"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { saveGameResult, type SaveGameResultInput } from "@/lib/mutations/save-game-result";

export async function saveGameResultAction(input: SaveGameResultInput) {
  await requireAdmin();
  const result = await saveGameResult(prisma, input);
  revalidatePath("/matches");
  revalidatePath("/members");
  return result;
}
