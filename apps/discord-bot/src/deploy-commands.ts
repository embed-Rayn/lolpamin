import { REST, Routes } from "discord.js";
import * as eloCommand from "./commands/elo";
import * as leaderboardCommand from "./commands/leaderboard";
import * as recordCommand from "./commands/record";

const REQUIRED_ENV_VARS = ["DISCORD_TOKEN", "DISCORD_APP_ID", "DISCORD_GUILD_ID"] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const commandPayloads = [eloCommand.data.toJSON(), leaderboardCommand.data.toJSON(), recordCommand.data.toJSON()];

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

async function main() {
  const appId = process.env.DISCORD_APP_ID!;
  const guildId = process.env.DISCORD_GUILD_ID!;

  const result = await rest.put(Routes.applicationGuildCommands(appId, guildId), {
    body: commandPayloads,
  });

  console.log(`Registered ${(result as unknown[]).length} guild commands:`, commandPayloads.map((c) => c.name));
}

main().catch((error) => {
  console.error("Failed to register commands:", error);
  process.exit(1);
});
