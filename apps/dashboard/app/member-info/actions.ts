"use server";

import { revalidatePath } from "next/cache";
import type { Lane } from "@lolpamin/db";
import { isLane, parseRiotId } from "@lolpamin/core";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { updateMemberNote } from "@/lib/mutations/update-member-note";
import { updateMemberLane, type LaneSlot } from "@/lib/mutations/update-member-lane";
import { lookupRiotAccount } from "@/lib/riot-api/account";
import {
  isOwnedByOtherError,
  registerRiotAccount,
  removeRiotAccount,
  REGISTER_RIOT_ACCOUNT_ERRORS,
} from "@/lib/mutations/register-riot-account";

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
  lane: Lane | null,
): Promise<{ error: string | null }> {
  await requireAdmin();

  // 클라이언트가 보낸 문자열이므로 enum 값인지 여기서 확인한다 — updateMemberTierAction과 같은 이유.
  if ((slot !== "main" && slot !== "sub") || (lane !== null && !isLane(lane))) {
    return { error: "알 수 없는 라인입니다." };
  }

  try {
    await updateMemberLane(prisma, memberId, slot, lane);
  } catch {
    return { error: "라인을 저장하지 못했습니다." };
  }

  revalidatePath("/member-info");
  return { error: null };
}

// "use server" 모듈은 async 함수만 export할 수 있다 — 이 표는 내보내지 않는다.
const RIOT_LOOKUP_MESSAGES = {
  format: "이름#태그 형식으로 입력해 주세요.",
  not_found: "라이엇에 없는 계정입니다.",
  unauthorized: "Riot API 키가 만료됐거나 없습니다 (.env RIOT_API_KEY).",
  rate_limited: "잠시 후 다시 시도해 주세요.",
  unavailable: "잠시 후 다시 시도해 주세요.",
} as const;

export async function registerRiotAccountByLookupAction(
  memberId: string,
  text: string,
): Promise<{ error: string | null }> {
  await requireAdmin();

  const parsed = parseRiotId(text);
  if (!parsed) return { error: RIOT_LOOKUP_MESSAGES.format };

  const lookup = await lookupRiotAccount(parsed.gameName, parsed.tagLine);
  if (!lookup.ok) return { error: RIOT_LOOKUP_MESSAGES[lookup.reason] };

  try {
    await registerRiotAccount(prisma, memberId, lookup.account);
  } catch (error) {
    console.error(error);
    // 이름이 든 ownedByOther와 memberMissing만 그대로 보여준다. Prisma 예외는 영어 스택이라
    // 관리자 화면에 띄우지 않는다 — link-accounts/actions.ts의 messageFor와 같은 방침.
    if (
      error instanceof Error &&
      (isOwnedByOtherError(error) || error.message === REGISTER_RIOT_ACCOUNT_ERRORS.memberMissing)
    ) {
      return { error: error.message };
    }
    return { error: "라이엇 계정을 등록하지 못했습니다." };
  }

  // 계정이 붙으면 saveGameResult의 완화 조건이 바뀌므로 매치 입력 풀도 달라진다.
  revalidatePath("/member-info");
  revalidatePath("/matches");
  return { error: null };
}

export async function removeRiotAccountAction(riotAccountId: string): Promise<{ error: string | null }> {
  await requireAdmin();

  try {
    await removeRiotAccount(prisma, riotAccountId);
  } catch (error) {
    console.error(error);
    return { error: "라이엇 계정을 떼지 못했습니다." };
  }

  revalidatePath("/member-info");
  revalidatePath("/matches");
  return { error: null };
}
