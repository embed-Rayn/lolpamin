import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { prisma } from "@lolpamin/db";
import { getMemberByDiscordId } from "../lib/get-member-by-discord-id";

export const data = new SlashCommandBuilder()
  .setName("전적")
  .setDescription("멤버의 ELO와 내전 참여 횟수를 조회합니다")
  .addUserOption((option) =>
    option.setName("멤버").setDescription("조회할 디스코드 유저").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("멤버", true);
  const member = await getMemberByDiscordId(prisma, targetUser.id);

  if (!member) {
    await interaction.reply({
      content: `${targetUser.username}님은 등록되지 않은 회원입니다.`,
      ephemeral: true,
    });
    return;
  }

  const gameCount = await prisma.gameParticipant.count({ where: { memberId: member.id } });
  // Deliberately no kakaoNickname fallback (unlike getDisplayName elsewhere) — this
  // command exposes another member's identity in a public, non-ephemeral reply, and
  // raw kakaoNickname values often embed real name/age.
  const name = member.realName ?? member.discordHandle ?? "회원";
  await interaction.reply(`**${name}** — ELO ${member.elo}, 내전 ${gameCount}회`);
}
