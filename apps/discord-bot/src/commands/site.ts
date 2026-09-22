import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

const SITE_URL = "https://lolpamin.xyz";

export const data = new SlashCommandBuilder()
  .setName("사이트")
  .setDescription("롤파민 사이트 주소를 알려줍니다");

// The only command that touches neither Prisma nor the member tables.
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply(`**롤파민** 사이트 → ${SITE_URL}`);
}
