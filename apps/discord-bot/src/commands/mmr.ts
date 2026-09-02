import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { prisma } from "@lolpamin/db";
import { getDisplayName } from "@lolpamin/core";
import { getMemberByDiscordId } from "../lib/get-member-by-discord-id";
import { getMemberRank } from "../lib/get-member-rank";

export const data = new SlashCommandBuilder()
  .setName("mmr")
  .setDescription("내 MMR과 순위를 조회합니다");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await getMemberByDiscordId(prisma, interaction.user.id);

  if (!member) {
    await interaction.reply({
      content: "아직 계정이 연결되지 않았습니다. 관리자에게 문의해주세요.",
      ephemeral: true,
    });
    return;
  }

  const rank = await getMemberRank(prisma, member.mmr);
  const name = getDisplayName(member);
  await interaction.reply(`**${name}** 님의 MMR: **${member.mmr}** (전체 ${rank}위)`);
}
