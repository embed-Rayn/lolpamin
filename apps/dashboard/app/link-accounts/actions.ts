"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { absorbMember } from "@/lib/mutations/absorb-member";
import { releaseMember } from "@/lib/mutations/release-member";
import { fetchGuildMembers } from "@/lib/discord/fetch-guild-members";
import { importDiscordMembers, type ImportDiscordMembersResult } from "@/lib/mutations/import-discord-members";

export async function absorbMemberAction(loserId: string, survivorId: string): Promise<{ error: string | null }> {
  await requireAdmin();

  if (!loserId || !survivorId) {
    return { error: "연결할 카톡 계정과 상대를 각각 하나씩 골라주세요." };
  }

  try {
    await absorbMember(prisma, loserId, survivorId);
  } catch (error) {
    console.error(error);
    return { error: error instanceof Error ? error.message : "연결하지 못했습니다." };
  }

  revalidatePath("/link-accounts");
  revalidatePath("/members");
  return { error: null };
}

export async function releaseMemberAction(tombstoneId: string): Promise<{ error: string | null }> {
  await requireAdmin();

  if (!tombstoneId) {
    return { error: "끊을 별칭을 골라주세요." };
  }

  try {
    await releaseMember(prisma, tombstoneId);
  } catch (error) {
    console.error(error);
    return { error: error instanceof Error ? error.message : "연결을 끊지 못했습니다." };
  }

  revalidatePath("/link-accounts");
  revalidatePath("/members");
  return { error: null };
}

export interface ImportDiscordMembersActionResult {
  result: ImportDiscordMembersResult | null;
  error: string | null;
}

export async function importDiscordMembersAction(): Promise<ImportDiscordMembersActionResult> {
  await requireAdmin();

  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) {
    return { result: null, error: "DISCORD_TOKEN 또는 DISCORD_GUILD_ID가 설정되지 않았습니다." };
  }

  try {
    const members = await fetchGuildMembers(token, guildId);
    const result = await importDiscordMembers(prisma, members);
    revalidatePath("/link-accounts");
    revalidatePath("/members");
    return { result, error: null };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : "디스코드 회원을 가져오지 못했습니다." };
  }
}
