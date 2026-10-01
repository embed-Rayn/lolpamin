import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { safeNextPath } from "@/lib/auth/next-path";

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNextPath(searchParams.next);
  if (await getCurrentAdmin()) {
    redirect(next);
  }

  return (
    <AppShell activeNav="rift" pageTitle="관리자 로그인" pageDesc="데이터를 변경하려면 로그인이 필요합니다">
      <div className="flex px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
        <LoginForm next={next} />
      </div>
    </AppShell>
  );
}
