import { AuthApiClient, TalkClient } from "node-kakao";
import { prisma } from "@lolpamin/db";
import { extractMentionedKakaoUserIds } from "./lib/extract-mentions";
import { computeReconnectDelayMs } from "./lib/compute-reconnect-delay";
import { recordMemberActivity } from "./lib/record-member-activity";

const REQUIRED_ENV_VARS = [
  "KAKAO_EMAIL",
  "KAKAO_PASSWORD",
  "KAKAO_DEVICE_NAME",
  "KAKAO_DEVICE_UUID",
  "KAKAO_OPEN_CHATROOM_ID",
] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

let reconnectAttempt = 0;

async function connect(): Promise<void> {
  const api = await AuthApiClient.create(process.env.KAKAO_DEVICE_NAME!, process.env.KAKAO_DEVICE_UUID!);
  const loginRes = await api.login(
    { email: process.env.KAKAO_EMAIL!, password: process.env.KAKAO_PASSWORD! },
    true
  );
  if (!loginRes.success) {
    throw new Error(`Kakao login failed with status: ${loginRes.status}`);
  }

  const client = new TalkClient();
  const res = await client.login(loginRes.result);
  if (!res.success) {
    throw new Error(`TalkClient login failed with status: ${res.status}`);
  }

  await prisma.$connect();
  reconnectAttempt = 0;
  console.log("Kakao bot logged in and watching for mentions.");

  client.on("chat", async (data, channel) => {
    if (channel.channelId.toString() !== process.env.KAKAO_OPEN_CHATROOM_ID) return;

    const kakaoUserIds = extractMentionedKakaoUserIds(data.mentions);
    for (const kakaoUserId of kakaoUserIds) {
      try {
        await recordMemberActivity(prisma, {
          kakaoUserId,
          mentionedAt: data.sendAt,
          rawMessage: data.text || null,
        });
      } catch (error) {
        console.error(`Failed to record activity for ${kakaoUserId}:`, error);
      }
    }
  });

  client.on("disconnected", (reason) => {
    console.error(`Disconnected (reason: ${reason}). Scheduling reconnect.`);
    scheduleReconnect();
  });

  client.on("error", (error) => {
    console.error("Client error:", error);
  });
}

function scheduleReconnect(): void {
  const delayMs = computeReconnectDelayMs(reconnectAttempt);
  reconnectAttempt++;
  console.log(`Reconnecting in ${delayMs}ms (attempt ${reconnectAttempt}).`);
  setTimeout(() => {
    connect().catch((error) => {
      console.error("Reconnect attempt failed:", error);
      scheduleReconnect();
    });
  }, delayMs);
}

connect().catch((error) => {
  console.error("Initial connection failed:", error);
  scheduleReconnect();
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
