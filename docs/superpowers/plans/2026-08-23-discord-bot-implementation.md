# Discord Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/discord-bot`, a read-only Discord bot that exposes three guild-scoped slash commands (`/elo`, `/랭킹`, `/전적`) backed directly by the existing `@lolpamin/db` Member/GameParticipant tables — no ELO calculation happens here, only display.

**Architecture:** A single always-on Node process using discord.js v14's Gateway client (not HTTP interactions — no interaction-endpoint signature verification needed). Database-reading logic lives in small, framework-free `lib/*.ts` functions that take a `PrismaClient` and return plain data; command modules are thin discord.js adapters that call those functions and format a reply. A separate one-off script registers the three slash commands to the guild.

**Tech Stack:** discord.js v14, TypeScript, `@lolpamin/db` (existing Prisma client), `tsx` (dev/run), Vitest (integration tests for `lib/*.ts` only).

**Spec:** `docs/superpowers/specs/2026-08-23-discord-kakao-integration-design.md`

## Global Constraints

- discord-bot is **read-only**: it never writes to the database and never calculates ELO — ELO is computed and stored by the dashboard (`packages/core` + `apps/dashboard`), per the spec's component-responsibility section.
- Commands are **guild-scoped** (registered to one specific server via `DISCORD_GUILD_ID`), not global — this is a single-guild internal tool, and guild commands propagate instantly instead of taking up to an hour.
- No automated tests for discord.js-specific code (client bootstrap, command dispatch, interaction replies) — only the `lib/*.ts` database-reading functions get integration tests, matching the pattern already used in `apps/dashboard`.
- Required env vars (already set in the repo-root `.env`, not committed): `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, plus the existing `DATABASE_URL`/`DATABASE_URL_TEST`.
- `DISCORD_PUBLIC_KEY` is not used by this plan (it's only needed for HTTP-interactions-mode bots, which this is not) — it stays in `.env` for possible future use, unreferenced by any code here.

---

## File Structure

```
apps/discord-bot/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                          # client bootstrap, command dispatch, error handling
    deploy-commands.ts                # one-off script: registers the 3 slash commands to the guild
    commands/
      elo.ts                          # /elo
      leaderboard.ts                  # /랭킹
      record.ts                       # /전적 @멤버
    lib/
      get-member-by-discord-id.ts
      get-member-by-discord-id.test.ts
      get-member-rank.ts
      get-member-rank.test.ts
      get-leaderboard.ts
      get-leaderboard.test.ts
```

---

### Task 1: `apps/discord-bot` scaffold

**Files:**
- Create: `apps/discord-bot/package.json`
- Create: `apps/discord-bot/tsconfig.json`
- Create: `apps/discord-bot/vitest.config.ts`
- Create: `apps/discord-bot/src/index.ts` (placeholder that verifies env vars, expanded in Task 6)

**Interfaces:**
- Consumes: `prisma` from `@lolpamin/db` (already exists).
- Produces: a package that later tasks add commands/lib functions into; a working `npm run dev --workspace=discord-bot` command.

- [ ] **Step 1: Create `apps/discord-bot/package.json`**

```json
{
  "name": "discord-bot",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx --env-file=../../.env watch src/index.ts",
    "start": "tsx --env-file=../../.env src/index.ts",
    "deploy-commands": "tsx --env-file=../../.env src/deploy-commands.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@lolpamin/db": "*",
    "discord.js": "^14.16.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/discord-bot/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/discord-bot/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // lib/*.test.ts files share one real Postgres test database
    // (DATABASE_URL_TEST) and each resets it in beforeEach — running
    // test files in parallel races those resets against each other's
    // inserts (see apps/dashboard/vitest.config.ts for the same issue).
    fileParallelism: false,
  },
});
```

- [ ] **Step 4: Create a placeholder `apps/discord-bot/src/index.ts`**

```typescript
const REQUIRED_ENV_VARS = ["DISCORD_TOKEN", "DISCORD_APP_ID", "DISCORD_GUILD_ID"] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

console.log("Env vars loaded OK. Client bootstrap comes in a later task.");
```

- [ ] **Step 5: Install dependencies and verify env vars load**

Run: `npm install`
Run: `npm run dev --workspace=discord-bot`
Expected: prints `Env vars loaded OK. Client bootstrap comes in a later task.` and exits (nothing is watching yet since there's no long-running client). If it throws `Missing required env var`, double check `.env` at the repo root has all four `DISCORD_*` values set.

- [ ] **Step 6: Commit**

```bash
git add apps/discord-bot/package.json apps/discord-bot/tsconfig.json apps/discord-bot/vitest.config.ts apps/discord-bot/src/index.ts package.json package-lock.json
git commit -m "chore(discord-bot): scaffold app and verify env vars load"
```

---

### Task 2: `lib/get-member-by-discord-id.ts`

**Files:**
- Create: `apps/discord-bot/src/lib/get-member-by-discord-id.ts`
- Create: `apps/discord-bot/src/lib/get-member-by-discord-id.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `Member` types from `@lolpamin/db`.
- Produces: `getMemberByDiscordId(prisma: PrismaClient, discordUserId: string): Promise<Member | null>` — used by `commands/elo.ts` and `commands/record.ts` (Task 5).

- [ ] **Step 1: Write the failing integration test**

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getMemberByDiscordId } from "./get-member-by-discord-id";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getMemberByDiscordId", () => {
  it("returns the member matching the given discordUserId", async () => {
    const created = await prisma.member.create({
      data: { discordUserId: "d-123", kakaoUserId: "k-123", realName: "김도현", elo: 1500 },
    });

    const found = await getMemberByDiscordId(prisma, "d-123");

    expect(found?.id).toBe(created.id);
    expect(found?.realName).toBe("김도현");
  });

  it("returns null when no member has that discordUserId", async () => {
    const found = await getMemberByDiscordId(prisma, "does-not-exist");
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL_TEST="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test" npx vitest run --root apps/discord-bot src/lib/get-member-by-discord-id.test.ts`
Expected: FAIL — `Cannot find module './get-member-by-discord-id'`

- [ ] **Step 3: Write the implementation**

```typescript
import type { Member, PrismaClient } from "@lolpamin/db";

export async function getMemberByDiscordId(
  prisma: PrismaClient,
  discordUserId: string
): Promise<Member | null> {
  return prisma.member.findUnique({ where: { discordUserId } });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL_TEST="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test" npx vitest run --root apps/discord-bot src/lib/get-member-by-discord-id.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot/src/lib/get-member-by-discord-id.ts apps/discord-bot/src/lib/get-member-by-discord-id.test.ts
git commit -m "feat(discord-bot): add getMemberByDiscordId lookup"
```

---

### Task 3: `lib/get-member-rank.ts`

**Files:**
- Create: `apps/discord-bot/src/lib/get-member-rank.ts`
- Create: `apps/discord-bot/src/lib/get-member-rank.test.ts`

**Interfaces:**
- Consumes: `PrismaClient` from `@lolpamin/db`.
- Produces: `getMemberRank(prisma: PrismaClient, elo: number): Promise<number>` (1-indexed rank among all members) — used by `commands/elo.ts` (Task 5).

- [ ] **Step 1: Write the failing integration test**

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getMemberRank } from "./get-member-rank";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getMemberRank", () => {
  it("returns 1 when no one has a higher elo", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", elo: 1000 } });
    const rank = await getMemberRank(prisma, 1500);
    expect(rank).toBe(1);
  });

  it("returns 1 + count of members with a strictly higher elo", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", elo: 1700 } });
    await prisma.member.create({ data: { discordUserId: "d-2", elo: 1600 } });
    await prisma.member.create({ data: { discordUserId: "d-3", elo: 1500 } });

    const rank = await getMemberRank(prisma, 1500);
    expect(rank).toBe(3);
  });

  it("ties do not count as higher", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", elo: 1500 } });
    await prisma.member.create({ data: { discordUserId: "d-2", elo: 1500 } });

    const rank = await getMemberRank(prisma, 1500);
    expect(rank).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL_TEST="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test" npx vitest run --root apps/discord-bot src/lib/get-member-rank.test.ts`
Expected: FAIL — `Cannot find module './get-member-rank'`

- [ ] **Step 3: Write the implementation**

```typescript
import type { PrismaClient } from "@lolpamin/db";

export async function getMemberRank(prisma: PrismaClient, elo: number): Promise<number> {
  const higherCount = await prisma.member.count({ where: { elo: { gt: elo } } });
  return higherCount + 1;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL_TEST="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test" npx vitest run --root apps/discord-bot src/lib/get-member-rank.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot/src/lib/get-member-rank.ts apps/discord-bot/src/lib/get-member-rank.test.ts
git commit -m "feat(discord-bot): add getMemberRank helper"
```

---

### Task 4: `lib/get-leaderboard.ts`

**Files:**
- Create: `apps/discord-bot/src/lib/get-leaderboard.ts`
- Create: `apps/discord-bot/src/lib/get-leaderboard.test.ts`

**Interfaces:**
- Consumes: `PrismaClient` from `@lolpamin/db`.
- Produces: `LeaderboardEntry = { rank: number; name: string; elo: number }` and `getLeaderboard(prisma: PrismaClient, limit: number): Promise<LeaderboardEntry[]>` — used by `commands/leaderboard.ts` (Task 5).

- [ ] **Step 1: Write the failing integration test**

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { getLeaderboard } from "./get-leaderboard";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getLeaderboard", () => {
  it("returns members ordered by elo descending with 1-indexed rank", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", realName: "낮음", elo: 1200 } });
    await prisma.member.create({ data: { discordUserId: "d-2", realName: "높음", elo: 1800 } });
    await prisma.member.create({ data: { discordUserId: "d-3", realName: "중간", elo: 1500 } });

    const result = await getLeaderboard(prisma, 10);

    expect(result).toEqual([
      { rank: 1, name: "높음", elo: 1800 },
      { rank: 2, name: "중간", elo: 1500 },
      { rank: 3, name: "낮음", elo: 1200 },
    ]);
  });

  it("respects the limit", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", realName: "A", elo: 1000 } });
    await prisma.member.create({ data: { discordUserId: "d-2", realName: "B", elo: 1100 } });
    await prisma.member.create({ data: { discordUserId: "d-3", realName: "C", elo: 1200 } });

    const result = await getLeaderboard(prisma, 2);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("C");
    expect(result[1].name).toBe("B");
  });

  it("falls back to discordHandle then kakaoNickname when realName is missing", async () => {
    await prisma.member.create({ data: { discordUserId: "d-1", discordHandle: "handle_only", elo: 1000 } });

    const result = await getLeaderboard(prisma, 10);

    expect(result[0].name).toBe("handle_only");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL_TEST="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test" npx vitest run --root apps/discord-bot src/lib/get-leaderboard.test.ts`
Expected: FAIL — `Cannot find module './get-leaderboard'`

- [ ] **Step 3: Write the implementation**

```typescript
import type { PrismaClient } from "@lolpamin/db";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  elo: number;
}

export async function getLeaderboard(
  prisma: PrismaClient,
  limit: number
): Promise<LeaderboardEntry[]> {
  const members = await prisma.member.findMany({
    orderBy: { elo: "desc" },
    take: limit,
  });

  return members.map((m, index) => ({
    rank: index + 1,
    name: m.realName ?? m.discordHandle ?? m.kakaoNickname ?? "이름 미확인",
    elo: m.elo,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL_TEST="postgresql://lolpamin:lolpamin@localhost:5432/lolpamin_test" npx vitest run --root apps/discord-bot src/lib/get-leaderboard.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot/src/lib/get-leaderboard.ts apps/discord-bot/src/lib/get-leaderboard.test.ts
git commit -m "feat(discord-bot): add getLeaderboard query"
```

---

### Task 5: Command modules (`/elo`, `/랭킹`, `/전적`)

**Files:**
- Create: `apps/discord-bot/src/commands/elo.ts`
- Create: `apps/discord-bot/src/commands/leaderboard.ts`
- Create: `apps/discord-bot/src/commands/record.ts`

**Interfaces:**
- Consumes: `getMemberByDiscordId` (Task 2), `getMemberRank` (Task 3), `getLeaderboard` (Task 4), `prisma` from `@lolpamin/db`.
- Produces: each module exports `data: SlashCommandBuilder` and `execute(interaction: ChatInputCommandInteraction): Promise<void>` — used by `src/index.ts` (Task 6) and `src/deploy-commands.ts` (Task 7).

No automated tests here per the Global Constraints — discord.js interaction objects aren't mocked in this plan. Verification happens in Task 8's manual smoke test.

- [ ] **Step 1: Create `apps/discord-bot/src/commands/elo.ts`**

```typescript
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
```

- [ ] **Step 2: Create `apps/discord-bot/src/commands/leaderboard.ts`**

```typescript
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
```

- [ ] **Step 3: Create `apps/discord-bot/src/commands/record.ts`**

```typescript
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
  const name = member.realName ?? member.discordHandle ?? "회원";
  await interaction.reply(`**${name}** — ELO ${member.elo}, 내전 ${gameCount}회`);
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit --project apps/discord-bot/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot/src/commands/elo.ts apps/discord-bot/src/commands/leaderboard.ts apps/discord-bot/src/commands/record.ts
git commit -m "feat(discord-bot): add /elo, /랭킹, /전적 command modules"
```

---

### Task 6: Client bootstrap and command dispatch

**Files:**
- Modify: `apps/discord-bot/src/index.ts` (replace the Task 1 placeholder)

**Interfaces:**
- Consumes: `data`/`execute` from `commands/elo.ts`, `commands/leaderboard.ts`, `commands/record.ts` (Task 5).
- Produces: a running discord.js client that dispatches `InteractionCreate` events to the matching command's `execute`.

- [ ] **Step 1: Replace `apps/discord-bot/src/index.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project apps/discord-bot/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/discord-bot/src/index.ts
git commit -m "feat(discord-bot): add client bootstrap and interaction dispatch"
```

---

### Task 7: Register slash commands to the guild

**Files:**
- Create: `apps/discord-bot/src/deploy-commands.ts`

**Interfaces:**
- Consumes: `data` from `commands/elo.ts`, `commands/leaderboard.ts`, `commands/record.ts` (Task 5); `DISCORD_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID` env vars.
- Produces: nothing consumed by other tasks — this is a one-off operational script, re-run whenever a command's `data` changes.

- [ ] **Step 1: Create `apps/discord-bot/src/deploy-commands.ts`**

```typescript
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
```

- [ ] **Step 2: Run it against the real guild**

Run: `npm run deploy-commands --workspace=discord-bot`
Expected: `Registered 3 guild commands: [ 'elo', '랭킹', '전적' ]`

If this fails with a validation error naming `랭킹` or `전적`, Discord's API rejected the Korean command name (discord.js validates names locally, but the API is the final authority). If that happens: rename the commands to ASCII (`ranking`, `record`) in `commands/leaderboard.ts` / `commands/record.ts` (Task 5), keep the Korean text in `.setDescription()` and in the reply strings, and re-run this step.

- [ ] **Step 3: Commit**

```bash
git add apps/discord-bot/src/deploy-commands.ts
git commit -m "feat(discord-bot): add slash command deployment script"
```

---

### Task 8: Manual smoke test against the real server

**Files:** none — verification only.

**Interfaces:** none — this task consumes everything built in Tasks 1–7 and produces nothing further.

- [ ] **Step 1: Seed the dev database if it's empty**

Run: `npm run seed --workspace=@lolpamin/db`
Expected: `Seeded 9 members.`

- [ ] **Step 2: Start the bot**

Run: `npm run dev --workspace=discord-bot`
Expected: `Logged in as <bot-name>#<discriminator>` printed within a few seconds, process keeps running (this is a long-running command — leave it running in this terminal for the rest of this task).

- [ ] **Step 3: Test `/랭킹` in the Discord server**

In the guild the bot was invited to, type `/랭킹` and send it.
Expected: an embed-less message listing up to 10 seeded members ordered by ELO descending, e.g. starting with `1. 정우성 — 1701`.

- [ ] **Step 4: Test `/elo` as an unregistered user**

Type `/elo` and send it.
Expected: an ephemeral (only-you-can-see) reply: "아직 계정이 연결되지 않았습니다. 관리자에게 문의해주세요." — this confirms the not-found path, the interaction round-trip, and the DB connection all work correctly, even without your own Discord account being seeded.

- [ ] **Step 5: Test `/전적 @멤버` on another server member**

Type `/전적` and mention any real member of the server (yourself or someone else) in the `멤버` option, then send it.
Expected: an ephemeral reply saying that user is not registered (unless you've manually linked their `discordUserId` in the `Member` table, in which case it shows their ELO and game count instead — both outcomes are correct behavior).

- [ ] **Step 6 (optional): Full happy-path check**

To see `/elo` and `/전적` return real data instead of the "not registered" message, temporarily point one seeded member's `discordUserId` at your own real Discord account ID:

Run: `docker compose exec postgres psql -U lolpamin -c "UPDATE \"Member\" SET \"discordUserId\"='<your-real-discord-user-id>' WHERE \"discordHandle\"='dohyun_kr';"`

Then re-run `/elo` — expect it to show 김도현's seeded ELO (1482) and rank under your own account. Revert afterward with the seed script (Step 1) so the dev database stays in its documented baseline state.

- [ ] **Step 7: Stop the bot and confirm no errors were logged**

Press Ctrl+C in the terminal running `npm run dev --workspace=discord-bot`.
Check the terminal output from Steps 2–6 for any `Error executing` lines — there should be none.
