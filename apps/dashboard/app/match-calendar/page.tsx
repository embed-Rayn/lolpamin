import { currentMonth, parseMonthKey, gameDayKey } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { MatchCalendar } from "@/components/MatchCalendar";
import { getMatchCalendar } from "@/lib/queries/match-calendar";
import { prisma } from "@/lib/prisma";

// AppShell and the calendar query read live DB rows; without this Next prerenders
// them at build time and `next start` would serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function MatchCalendarPage({ searchParams }: { searchParams: { month?: string } }) {
  // Public on purpose: the page exists to show outsiders how active the group is.
  const now = new Date();
  const month = parseMonthKey(searchParams.month, now);
  const data = await getMatchCalendar(prisma, month, now);

  return (
    <AppShell activeNav="match-calendar" pageTitle="내전 캘린더" pageDesc="날마다 열린 내전을 협곡·칼바람으로 나눠 봅니다">
      <div className="px-4 pb-8 pt-4 md:px-7 md:pb-10 md:pt-6">
        <MatchCalendar month={month} current={currentMonth(now)} todayKey={gameDayKey(now)} data={data} />
      </div>
    </AppShell>
  );
}
