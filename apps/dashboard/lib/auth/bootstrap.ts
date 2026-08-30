import type { PrismaClient } from "@lolpamin/db";
import { createAdmin } from "@/lib/mutations/admins";

// 배포 직후 로그인할 계정이 하나도 없는 상태를 벗어나기 위한 1회성 경로다.
// 관리자가 한 명이라도 있으면 아무 것도 하지 않으므로, 환경변수를 지우지 않아도
// 기존 계정을 덮어쓰지는 않는다. 그래도 부트스트랩 후에는 지우는 것을 권한다.
export async function ensureBootstrapAdmin(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env
): Promise<"created" | "skipped"> {
  const username = env.ADMIN_BOOTSTRAP_USERNAME?.trim();
  const password = env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!username || !password) return "skipped";

  if ((await prisma.admin.count()) > 0) return "skipped";

  try {
    await createAdmin(prisma, { username, password, createdById: null });
    console.log(`[bootstrap] 최초 관리자 "${username}" 생성됨`);
    return "created";
  } catch (error) {
    // 동시에 두 프로세스가 시도하면 username unique 제약이 두 번째를 막는다.
    // 그 경우에도 기동은 계속돼야 한다.
    console.error("[bootstrap] 최초 관리자 생성 실패:", error);
    return "skipped";
  }
}
