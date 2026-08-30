export async function register(): Promise<void> {
  // edge 런타임에서는 Prisma를 쓸 수 없다. Node 런타임에서만 실행한다.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { prisma } = await import("@/lib/prisma");
  const { ensureBootstrapAdmin } = await import("@/lib/auth/bootstrap");
  await ensureBootstrapAdmin(prisma);
}
