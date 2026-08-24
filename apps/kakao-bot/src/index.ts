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

console.log("Env vars loaded OK. Client bootstrap comes in a later task.");
