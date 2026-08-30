import "./globals.css";
import { prisma } from "@/lib/prisma";
import { ensureBootstrapAdminOnce } from "@/lib/auth/bootstrap";

export const metadata = {
  title: "롤파민 · 내부 운영 도구",
};

// 모든 페이지가 요청 시점의 DB 상태와 세션 쿠키를 읽는다. 정적 프리렌더 대상이 아니며,
// 빌드 시점에 DB에 접속하려다 실패하는 것을 막는다.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await ensureBootstrapAdminOnce(prisma);

  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
