import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AdminPanel, type AdminRow } from "@/components/AdminPanel";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/current-admin";

export default async function AdminsPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const admins = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
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

  return (
    <AppShell activeNav="admins" pageTitle="관리자" pageDesc="대시보드를 변경할 수 있는 계정 관리">
      <div className="px-7 pb-10 pt-6">
        <AdminPanel rows={rows} />
      </div>
    </AppShell>
  );
}
