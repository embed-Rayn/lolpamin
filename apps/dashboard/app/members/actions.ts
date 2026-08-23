"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { linkMembers } from "@/lib/mutations/link-members";

export async function linkMembersAction(formData: FormData): Promise<void> {
  const discordSideId = String(formData.get("discordSideId") ?? "");
  const kakaoSideId = String(formData.get("kakaoSideId") ?? "");
  if (!discordSideId || !kakaoSideId) {
    throw new Error("Select one Discord account and one KakaoTalk account before linking");
  }
  await linkMembers(prisma, discordSideId, kakaoSideId);
  revalidatePath("/members");
}
