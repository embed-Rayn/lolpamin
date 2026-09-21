import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function LoginPage() {
  if (await getCurrentAdmin()) {
    redirect("/rift");
  }

  return (
    <AppShell activeNav="rift" pageTitle="관리자 로그인" pageDesc="데이터를 변경하려면 로그인이 필요합니다">
      <div className="flex px-7 pb-10 pt-6">
        <LoginForm />
      </div>
    </AppShell>
  );
}
