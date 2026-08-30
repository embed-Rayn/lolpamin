import { cache } from "react";
import { cookies } from "next/headers";
import type { Admin } from "@lolpamin/db";
import { prisma } from "@/lib/prisma";
import { getAdminBySessionToken } from "./session";

export const SESSION_COOKIE_NAME = "lolpamin_session";

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    // 현재 배포는 평문 HTTP다. HTTPS로 올릴 때 COOKIE_SECURE=true로 켠다.
    secure: process.env.COOKIE_SECURE === "true",
    expires: expiresAt,
  };
}

// React의 cache()는 요청(렌더 패스) 범위로 메모이즈한다. AppShell과 각 페이지가
// 모두 이 함수를 호출하므로, cache가 없으면 렌더당 세션 조회가 두 번 나간다.
// cache()로 감싸면 같은 요청 안에서는 첫 호출 결과를 공유해 한 번만 조회한다.
export const getCurrentAdmin = cache(async (): Promise<Admin | null> => {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getAdminBySessionToken(prisma, token);
});

export async function requireAdmin(): Promise<Admin> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new Error("관리자 로그인이 필요합니다");
  }
  return admin;
}
