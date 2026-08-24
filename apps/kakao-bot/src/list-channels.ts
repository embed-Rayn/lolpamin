import { AuthApiClient, TalkClient } from "node-kakao";

const REQUIRED_ENV_VARS = ["KAKAO_EMAIL", "KAKAO_PASSWORD", "KAKAO_DEVICE_NAME", "KAKAO_DEVICE_UUID"] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

async function main() {
  const api = await AuthApiClient.create(process.env.KAKAO_DEVICE_NAME!, process.env.KAKAO_DEVICE_UUID!);
  const loginRes = await api.login(
    { email: process.env.KAKAO_EMAIL!, password: process.env.KAKAO_PASSWORD! },
    true
  );
  if (!loginRes.success) throw new Error(`Login failed with status: ${loginRes.status}`);

  const client = new TalkClient();
  const res = await client.login(loginRes.result);
  if (!res.success) throw new Error(`TalkClient login failed with status: ${res.status}`);

  console.log("Joined channels (channelId  displayName):");
  for (const channel of client.channelList.all()) {
    console.log(`${channel.channelId.toString()}  ${channel.getDisplayName()}`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to list channels:", error);
  process.exit(1);
});
