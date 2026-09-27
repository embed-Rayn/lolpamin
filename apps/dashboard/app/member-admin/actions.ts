"use server";

import { revalidatePath } from "next/cache";
import type { Lane, MemberTier } from "@lolpamin/db";
import { isLane, parseBirthYearInput, parseRiotId, TIER_SCORES } from "@lolpamin/core";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { updateMemberNote } from "@/lib/mutations/update-member-note";
import { updateMemberLane, type LaneSlot } from "@/lib/mutations/update-member-lane";
import { updateMemberPeakTier } from "@/lib/mutations/update-member-peak-tier";
import { updateMemberAge } from "@/lib/mutations/update-member-age";
import {
  getMasteryRefreshAvailability,
  refreshChampionMasteries,
  REFRESH_MASTERIES_ERRORS,
  type MasteryRefreshResult,
} from "@/lib/mutations/refresh-champion-masteries";
import { lookupRiotAccount } from "@/lib/riot-api/account";
import { lookupChampionMasteries } from "@/lib/riot-api/mastery";
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

  revalidatePath("/member-admin");
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

  revalidatePath("/member-admin");
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
  revalidatePath("/member-admin");
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

  revalidatePath("/member-admin");
  revalidatePath("/member-info");
  revalidatePath("/matches");
  return { error: null };
}

export async function updateMemberPeakTierAction(
  memberId: string,
  peakTier: MemberTier,
): Promise<{ error: string | null }> {
  await requireAdmin();

  // updateMemberTierAction과 같은 이유로 enum 값인지 여기서 확인한다.
  if (!Object.hasOwn(TIER_SCORES, peakTier)) {
    return { error: "알 수 없는 티어입니다." };
  }

  try {
    await updateMemberPeakTier(prisma, memberId, peakTier);
  } catch {
    return { error: "최고티어를 저장하지 못했습니다." };
  }

  revalidatePath("/member-admin");
  revalidatePath("/member-info");
  return { error: null };
}

export async function updateMemberAgeAction(memberId: string, raw: string): Promise<{ error: string | null }> {
  await requireAdmin();

  const parsed = parseBirthYearInput(raw);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await updateMemberAge(prisma, memberId, parsed.age);
  } catch {
    return { error: "나이를 저장하지 못했습니다." };
  }

  revalidatePath("/member-admin");
  revalidatePath("/member-info");
  return { error: null };
}

export interface MasteryRefreshStatus {
  allowed: boolean;
  // 직렬화해 클라이언트로 넘기려고 ISO 문자열로 준다.
  lastRefreshedAt: string | null;
  accountCount: number;
}

/** 버튼을 누르기 전에 보여 줄 상태 — 남은 하루 제한과 갱신 대상 수. */
export async function masteryRefreshStatusAction(): Promise<MasteryRefreshStatus> {
  await requireAdmin();
  const { allowed, lastRefreshedAt, accountCount } = await getMasteryRefreshAvailability(prisma);
  return { allowed, lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null, accountCount };
}

export async function refreshMasteriesAction(): Promise<{ result: MasteryRefreshResult | null; error: string | null }> {
  await requireAdmin();

  try {
    const result = await refreshChampionMasteries(prisma, lookupChampionMasteries);
    revalidatePath("/member-admin");
    revalidatePath("/member-info");
    revalidatePath("/matches");
    return { result, error: null };
  } catch (error) {
    // 하루 제한은 일부러 던진 안내다 — 그대로 보여 준다.
    if (error instanceof Error && error.message === REFRESH_MASTERIES_ERRORS.tooSoon) {
      return { result: null, error: error.message };
    }
    console.error(error);
    return { result: null, error: "숙련도 갱신 중 오류가 났습니다." };
  }
}
