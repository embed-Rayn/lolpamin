"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { linkMembers } from "@/lib/mutations/link-members";
import { fetchGuildMembers } from "@/lib/discord/fetch-guild-members";
import { importDiscordMembers, type ImportDiscordMembersResult } from "@/lib/mutations/import-discord-members";

export async function linkMembersAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const discordSideId = String(formData.get("discordSideId") ?? "");
  const kakaoSideId = String(formData.get("kakaoSideId") ?? "");
  if (!discordSideId || !kakaoSideId) {
    throw new Error("Select one Discord account and one KakaoTalk account before linking");
  }
  await linkMembers(prisma, discordSideId, kakaoSideId);
  revalidatePath("/link-accounts");
  revalidatePath("/members");
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
