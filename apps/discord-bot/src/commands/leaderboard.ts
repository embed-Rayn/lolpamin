import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { prisma } from "@lolpamin/db";
import { getLeaderboard } from "../lib/get-leaderboard";

const LEADERBOARD_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName("랭킹")
  .setDescription(`ELO 상위 ${LEADERBOARD_SIZE}명을 보여줍니다`);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const entries = await getLeaderboard(prisma, LEADERBOARD_SIZE);

  if (entries.length === 0) {
    await interaction.reply("아직 등록된 회원이 없습니다.");
    return;
  }

  const lines = entries.map((e) => `${e.rank}. ${e.name} — ${e.elo}`).join("\n");
  await interaction.reply(`**ELO 랭킹 TOP ${entries.length}**\n${lines}`);
}
