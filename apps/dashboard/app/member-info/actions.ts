"use server";

import { revalidatePath } from "next/cache";
import type { MemberLane } from "@lolpamin/db";
import { isMemberLane } from "@lolpamin/core";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { updateMemberNote } from "@/lib/mutations/update-member-note";
import { updateMemberLane, type LaneSlot } from "@/lib/mutations/update-member-lane";

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

export async function updateMemberLaneAction(
  memberId: string,
  slot: LaneSlot,
  lane: MemberLane | null,
): Promise<{ error: string | null }> {
  await requireAdmin();

  // 클라이언트가 보낸 값이므로 여기서 좁힌다. Prisma도 거부하지만 그쪽 예외는 영어
  // 스택이 섞인 긴 문자열이라 관리자 화면에 띄울 것이 못 된다 — 티어 액션과 같다.
  if (lane !== null && !isMemberLane(lane)) {
    return { error: "알 수 없는 라인입니다." };
  }
  if (slot !== "primary" && slot !== "secondary") {
    return { error: "알 수 없는 라인 칸입니다." };
  }

  try {
    await updateMemberLane(prisma, memberId, slot, lane);
  } catch {
    return { error: "라인을 저장하지 못했습니다." };
  }

  revalidatePath("/member-info");
  return { error: null };
}
