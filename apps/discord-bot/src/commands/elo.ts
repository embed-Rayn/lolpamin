import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { prisma } from "@lolpamin/db";
import { getMemberByDiscordId } from "../lib/get-member-by-discord-id";
import { getMemberRank } from "../lib/get-member-rank";

export const data = new SlashCommandBuilder()
  .setName("elo")
  .setDescription("내 ELO와 순위를 조회합니다");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await getMemberByDiscordId(prisma, interaction.user.id);

  if (!member) {
    await interaction.reply({
      content: "아직 계정이 연결되지 않았습니다. 관리자에게 문의해주세요.",
      ephemeral: true,
    });
    return;
  }

  const rank = await getMemberRank(prisma, member.elo);
  const name = member.realName ?? member.discordHandle ?? "회원";
  await interaction.reply(`**${name}** 님의 ELO: **${member.elo}** (전체 ${rank}위)`);
}
