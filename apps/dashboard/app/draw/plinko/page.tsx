import { AppShell } from "@/components/AppShell";
import { DrawScreen } from "@/components/draw/DrawScreen";
import { getLinkedMembers } from "@/lib/queries/linked-members";

export const dynamic = "force-dynamic";

export default async function PlinkoDrawPage() {
  const pool = await getLinkedMembers();

  return (
    <AppShell
      activeNav="draw-plinko"
      pageTitle="핀볼 뽑기"
      pageDesc="핀 사이로 공을 떨어뜨려 순서를 정합니다"
      desktopOnly
    >
      <DrawScreen pool={pool} variant="plinko" />
    </AppShell>
  );
}
