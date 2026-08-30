import { AppShell } from "@/components/AppShell";
import { KakaoImportForm } from "@/components/KakaoImportForm";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function KakaoImportPage() {
  const isAdmin = (await getCurrentAdmin()) !== null;

  return (
    <AppShell activeNav="kakao-import" pageTitle="카톡 내보내기" pageDesc="카카오톡 대화 내보내기 txt 업로드 → 활동 반영">
      <div className="px-7 pb-10 pt-6">
        <KakaoImportForm isAdmin={isAdmin} />
      </div>
    </AppShell>
  );
}
