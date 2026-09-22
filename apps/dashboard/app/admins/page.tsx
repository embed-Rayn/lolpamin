import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AdminPanel, type AdminRow } from "@/components/AdminPanel";
import { MmrConfigPanel } from "@/components/MmrConfigPanel";
import { RatingResetPanel } from "@/components/RatingResetPanel";
import { ThemePanel } from "@/components/ThemePanel";
import { BrandingPanel } from "@/components/BrandingPanel";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getBranding } from "@/lib/queries/branding";
import { getStoredMmrConfig } from "@/lib/queries/mmr-config";
import { SITE_SETTING_ID, getSiteTheme } from "@/lib/queries/site-theme";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const [admins, mmrConfig, theme, themeRow, branding] = await Promise.all([
    prisma.admin.findMany({ orderBy: { createdAt: "asc" } }),
    getStoredMmrConfig(prisma),
    getSiteTheme(prisma),
    prisma.siteSetting.findUnique({
      where: { id: SITE_SETTING_ID },
      select: { updatedAt: true, updatedById: true },
    }),
    getBranding(prisma),
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

  const themeUpdatedLabel = themeRow
    ? `${themeRow.updatedAt.toISOString().slice(0, 10)} · ${
        themeRow.updatedById ? byId.get(themeRow.updatedById) ?? "삭제된 관리자" : "알 수 없음"
      }`
    : null;

  return (
    <AppShell activeNav="admins" pageTitle="관리자 · 설정" pageDesc="계정, 스킨, MMR 계산식, 시즌 리셋" desktopOnly>
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <ThemePanel current={theme} updatedLabel={themeUpdatedLabel} />
        <BrandingPanel current={branding} updatedLabel={themeUpdatedLabel} />
        <AdminPanel rows={rows} />
        <MmrConfigPanel config={mmrConfig} updatedLabel={mmrUpdatedLabel} />
        <RatingResetPanel />
      </div>
    </AppShell>
  );
}
