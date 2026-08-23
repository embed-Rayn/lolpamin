"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { saveGameResult, type SaveGameResultInput } from "@/lib/mutations/save-game-result";

export async function saveGameResultAction(input: SaveGameResultInput) {
  const result = await saveGameResult(prisma, input);
  revalidatePath("/matches");
  revalidatePath("/members");
  return result;
}
