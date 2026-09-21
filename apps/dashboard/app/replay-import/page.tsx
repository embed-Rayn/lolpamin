import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ReplayImportForm } from "@/components/ReplayImportForm";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

// AppShell이 사이드바 배지를 위해 Postgres를 읽는다. 없으면 next build가 스냅샷을 굽는다.
export const dynamic = "force-dynamic";

export default async function ReplayImportPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  return (
    <AppShell
      activeNav="replay-import"
      pageTitle="리플레이 불러오기"
      pageDesc="롤 클라이언트의 .rofl 파일 업로드 → 참가자 매칭 → 내전 결과 저장"
      desktopOnly
    >
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <ReplayImportForm isAdmin={true} />
      </div>
    </AppShell>
  );
}
