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

export async function getCurrentAdmin(): Promise<Admin | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getAdminBySessionToken(prisma, token);
}

export async function requireAdmin(): Promise<Admin> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new Error("관리자 로그인이 필요합니다");
  }
  return admin;
}
