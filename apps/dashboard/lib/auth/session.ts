import { createHash, randomBytes } from "node:crypto";
import type { Admin, PrismaClient } from "@lolpamin/db";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 쿠키에는 원문 토큰이, DB에는 이 해시만 들어간다. DB 덤프가 유출돼도
// 그것만으로는 남의 세션 쿠키를 만들어낼 수 없다.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  prisma: PrismaClient,
  adminId: string,
  now: Date = new Date()
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await prisma.adminSession.create({
    data: { tokenHash: hashToken(token), adminId, expiresAt },
  });

  return { token, expiresAt };
}

export async function getAdminBySessionToken(
  prisma: PrismaClient,
  token: string,
  now: Date = new Date()
): Promise<Admin | null> {
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: true },
  });
  if (!session) return null;

  if (session.expiresAt <= now) {
    await prisma.adminSession.delete({ where: { id: session.id } });
    return null;
  }

  return session.admin;
}

export async function destroySession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}
