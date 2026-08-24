import * as readline from "node:readline";
import { AuthApiClient, KnownAuthStatusCode, util } from "node-kakao";

const REQUIRED_ENV_VARS = ["KAKAO_EMAIL", "KAKAO_PASSWORD", "KAKAO_DEVICE_NAME"] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

async function main() {
  const deviceUUID = process.env.KAKAO_DEVICE_UUID || util.randomWin32DeviceUUID();
  const form = {
    email: process.env.KAKAO_EMAIL!,
    password: process.env.KAKAO_PASSWORD!,
  };

  const api = await AuthApiClient.create(process.env.KAKAO_DEVICE_NAME!, deviceUUID);

  const loginRes = await api.login(form, true);
  if (loginRes.success) {
    console.log("This device is already registered. Save this KAKAO_DEVICE_UUID to .env:");
    console.log(deviceUUID);
    return;
  }
  if (loginRes.status !== KnownAuthStatusCode.DEVICE_NOT_REGISTERED) {
    throw new Error(`Login failed with status: ${loginRes.status}`);
  }

  const passcodeRes = await api.requestPasscode(form);
  if (!passcodeRes.success) {
    throw new Error(`Passcode request failed with status: ${passcodeRes.status}`);
  }

  const inputInterface = readline.createInterface({ input: process.stdin, output: process.stdout });
  const passcode = await new Promise<string>((resolve) =>
    inputInterface.question("Enter the passcode KakaoTalk sent you: ", resolve)
  );
  inputInterface.close();

  const registerRes = await api.registerDevice(form, passcode, true);
  if (!registerRes.success) {
    throw new Error(`Device registration failed with status: ${registerRes.status}`);
  }

  console.log("Device registered successfully. Save this KAKAO_DEVICE_UUID to .env:");
  console.log(deviceUUID);
}

main().catch((error) => {
  console.error("Device registration failed:", error);
  process.exit(1);
});
