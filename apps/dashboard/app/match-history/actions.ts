"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { cancelGameResult, CANCEL_GAME_RESULT_ERRORS } from "@/lib/mutations/cancel-game-result";

// cancelGameResult가 일부러 던지는 한글 안내만 그대로 보여준다. Prisma 예외는 영어
// 스택이 섞인 긴 문자열이라 관리자 화면에 띄우지 않는다 — link-accounts와 같은 방침.
function messageFor(error: unknown, expected: readonly string[], fallback: string): string {
  return error instanceof Error && expected.includes(error.message) ? error.message : fallback;
}

export async function cancelGameResultAction(gameResultId: string): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  try {
    await cancelGameResult(prisma, gameResultId, admin.id);
  } catch (error) {
    console.error(error);
    return {
      error: messageFor(error, Object.values(CANCEL_GAME_RESULT_ERRORS), "되돌리지 못했습니다."),
    };
  }

  // 취소는 mmr을 되돌리고 내전 횟수를 바꾸므로 점수를 보여주는 화면이 모두 달라진다.
  revalidatePath("/match-history");
  revalidatePath("/rift");
  revalidatePath("/inactive");
  revalidatePath("/matches");
  return { error: null };
}
