import { AppShell } from "@/components/AppShell";
import { DrawScreen } from "@/components/draw/DrawScreen";
import { getLinkedMembers } from "@/lib/queries/linked-members";

// AppShell reads live DB rows for the sidebar badge; without this Next would
// bake a snapshot at build time.
export const dynamic = "force-dynamic";

export default async function BallDrawPage() {
  const pool = await getLinkedMembers();

  return (
    <AppShell activeNav="draw-ball" pageTitle="공 뽑기" pageDesc="추첨기에서 공을 뽑아 순서를 정합니다">
      <DrawScreen pool={pool} variant="ball" />
    </AppShell>
  );
}
