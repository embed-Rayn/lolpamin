const REQUIRED_ENV_VARS = ["DISCORD_TOKEN", "DISCORD_APP_ID", "DISCORD_GUILD_ID"] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

console.log("Env vars loaded OK. Client bootstrap comes in a later task.");
