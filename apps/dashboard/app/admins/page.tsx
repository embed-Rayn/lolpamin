import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AdminPanel, type AdminRow } from "@/components/AdminPanel";
import { MmrConfigPanel } from "@/components/MmrConfigPanel";
import { MmrSoftResetButton } from "@/components/MmrSoftResetButton";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getStoredMmrConfig } from "@/lib/queries/mmr-config";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const [admins, mmrConfig] = await Promise.all([
    prisma.admin.findMany({ orderBy: { createdAt: "asc" } }),
    getStoredMmrConfig(prisma),
  ]);
  const byId = new Map(admins.map((a) => [a.id, a.username]));

  const rows: AdminRow[] = admins.map((admin) => ({
    id: admin.id,
    username: admin.username,
    createdByLabel: admin.createdById
      ? byId.get(admin.createdById) ?? "삭제된 관리자"
      : "최초 관리자",
    createdAtLabel: admin.createdAt.toISOString().slice(0, 10),
    isSelf: admin.id === currentAdmin.id,
  }));

  const mmrUpdatedLabel = mmrConfig.updatedAt
    ? `${mmrConfig.updatedAt.toISOString().slice(0, 10)} · ${
        mmrConfig.updatedById ? byId.get(mmrConfig.updatedById) ?? "삭제된 관리자" : "알 수 없음"
      }`
    : null;

  return (
    <AppShell activeNav="admins" pageTitle="관리자" pageDesc="대시보드를 변경할 수 있는 계정 관리">
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <AdminPanel rows={rows} />
        <MmrConfigPanel config={mmrConfig} updatedLabel={mmrUpdatedLabel} />
        <MmrSoftResetButton />
      </div>
    </AppShell>
  );
}
