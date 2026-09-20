import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { KakaoImportForm } from "@/components/KakaoImportForm";
import { KakaoImportGuide } from "@/components/KakaoImportGuide";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export const dynamic = "force-dynamic";

export default async function KakaoImportPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  return (
    <AppShell activeNav="kakao-import" pageTitle="카톡 불러오기" pageDesc="카카오톡에서 내보낸 대화 txt 업로드 → 활동 반영">
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <KakaoImportGuide />
        <KakaoImportForm isAdmin={true} />
      </div>
    </AppShell>
  );
}
