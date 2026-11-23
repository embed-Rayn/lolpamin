"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import {
  addTournamentImage,
  deleteTournamentImage,
  moveTournamentImage,
  renameTournamentTeam,
  TournamentValidationError,
} from "@/lib/tournament/mutations";

interface TournamentActionResult {
  error: string | null;
}

// Validation messages are written for the operator; anything else (a Prisma error in
// English) is replaced by a short Korean fallback.
function toMessage(error: unknown): string {
  if (error instanceof TournamentValidationError) return error.message;
  console.error(error);
  return "저장 중 오류가 발생했습니다.";
}

export async function renameTournamentTeamAction(slot: number, name: string): Promise<TournamentActionResult> {
  const acting = await requireAdmin();
  try {
    await renameTournamentTeam(prisma, Number(slot), String(name ?? ""), acting.id);
  } catch (error) {
    return { error: toMessage(error) };
  }
  // Team names also label tournament rows on /match-history.
  revalidatePath("/tournament");
  revalidatePath("/match-history");
  return { error: null };
}

// One file per call: each stays under the 20mb server-action body limit.
export async function addTournamentImageAction(formData: FormData): Promise<TournamentActionResult> {
  await requireAdmin();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "이미지 파일을 골라주세요." };
  try {
    await addTournamentImage(prisma, { bytes: Buffer.from(await file.arrayBuffer()), type: file.type });
  } catch (error) {
    return { error: toMessage(error) };
  }
  revalidatePath("/tournament");
  return { error: null };
}

export async function deleteTournamentImageAction(id: string): Promise<TournamentActionResult> {
  await requireAdmin();
  try {
    await deleteTournamentImage(prisma, String(id));
  } catch (error) {
    return { error: toMessage(error) };
  }
  revalidatePath("/tournament");
  return { error: null };
}

export async function moveTournamentImageAction(
  id: string,
  direction: "up" | "down",
): Promise<TournamentActionResult> {
  await requireAdmin();
  try {
    await moveTournamentImage(prisma, String(id), direction);
  } catch (error) {
    return { error: toMessage(error) };
  }
  revalidatePath("/tournament");
  return { error: null };
}
