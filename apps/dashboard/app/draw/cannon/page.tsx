import { AppShell } from "@/components/AppShell";
import { DrawScreen } from "@/components/draw/DrawScreen";
import { getLinkedMembers } from "@/lib/queries/linked-members";

// AppShell reads live DB rows for the sidebar badge; without this Next would
// bake a snapshot at build time.
export const dynamic = "force-dynamic";

export default async function CannonDrawPage() {
  const pool = await getLinkedMembers();

  return (
    <AppShell activeNav="draw-cannon" pageTitle="대포 뽑기" pageDesc="대포로 공을 쏘아 순서를 정합니다" desktopOnly>
      <DrawScreen pool={pool} variant="cannon" />
    </AppShell>
  );
}
