import "./globals.css";
import { prisma } from "@/lib/prisma";
import { ensureBootstrapAdminOnce } from "@/lib/auth/bootstrap";

export const metadata = {
  title: "롤파민 · 내부 운영 도구",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await ensureBootstrapAdminOnce(prisma);

  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
