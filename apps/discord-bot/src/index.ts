import { Client, Collection, Events, GatewayIntentBits, type ChatInputCommandInteraction } from "discord.js";
import * as eloCommand from "./commands/elo";
import * as leaderboardCommand from "./commands/leaderboard";
import * as recordCommand from "./commands/record";

const REQUIRED_ENV_VARS = ["DISCORD_TOKEN", "DISCORD_APP_ID", "DISCORD_GUILD_ID"] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

interface Command {
  data: { name: string };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

const commands = new Collection<string, Command>();
for (const command of [eloCommand, leaderboardCommand, recordCommand]) {
  commands.set(command.data.name, command);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    const errorReply = { content: "명령어 실행 중 오류가 발생했습니다.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorReply);
    } else {
      await interaction.reply(errorReply);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
