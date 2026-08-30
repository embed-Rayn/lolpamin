"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/current-admin";

export interface LoginFormState {
  error: string | null;
}

const INVALID_CREDENTIALS = "아이디 또는 비밀번호가 올바르지 않습니다";

// 존재하지 않는 아이디로 로그인을 시도할 때도 같은 비용의 해시 검증을 수행한다.
// 그러지 않으면 응답 시간 차이로 어떤 아이디가 실재하는지 알아낼 수 있다.
// 첫 await 이전에 이 프라미스가 reject되면 Node의 기본 정책상 처리되지 않은 거부로
// 프로세스가 죽을 수 있으므로 .catch를 붙인다. 대체값으로는 빈 문자열을 쓰는데,
// verifyPassword는 형식이 잘못된 저장값에 대해 항상 false를 반환하므로 타이밍
// 동등화 목적은 유지하면서도 로그인은 안전하게 실패한다.
const dummyHashPromise = hashPassword("dummy-password-for-timing-equalization").catch(() => "");

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: INVALID_CREDENTIALS };
  }

  const admin = await prisma.admin.findUnique({ where: { username } });
  const passwordHash = admin?.passwordHash ?? (await dummyHashPromise);
  const passwordMatches = await verifyPassword(password, passwordHash);

  if (!admin || !passwordMatches) {
    return { error: INVALID_CREDENTIALS };
  }

  const { token, expiresAt } = await createSession(prisma, admin.id);
  cookies().set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));

  redirect("/members");
}

export async function logoutAction(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await destroySession(prisma, token);
  }
  cookies().delete(SESSION_COOKIE_NAME);
  redirect("/members");
}
