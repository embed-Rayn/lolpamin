import Link from "next/link";
import { CALENDAR_DOT_LIMIT, monthKey, shiftMonth, type CalendarDay, type YearMonth } from "@lolpamin/core";
import type { MatchCalendar as MatchCalendarData } from "@/lib/queries/match-calendar";
import { historyHref } from "@/components/GameHistoryControls";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 하루 판 수만큼 칸이 진해진다(calendarHeatLevel). 보라는 협곡(파랑)·칼바람(빨강) 점
// 어느 쪽과도 겹치지 않는 색이라 바탕으로 쓴다.
const HEAT = ["", "bg-purple/[.07]", "bg-purple/[.14]", "bg-purple/[.22]", "bg-purple/[.32]"] as const;

const calendarHref = (ym: YearMonth) => `/match-calendar?month=${monthKey(ym)}`;

function Dots({ day }: { day: CalendarDay }) {
  // 점이 넘치는 날은 셀 수 없으니 모드별 숫자로 바꾼다.
  if (day.total > CALENDAR_DOT_LIMIT) {
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10.5px] font-bold md:text-[12px]">
        {day.rift > 0 && <span className="text-rift">●{day.rift}</span>}
        {day.aram > 0 && <span className="text-aram">●{day.aram}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-[3px] md:gap-1">
      {Array.from({ length: day.rift }, (_, i) => (
        <span key={`r${i}`} className="h-[5px] w-[5px] rounded-full bg-rift md:h-2 md:w-2" />
      ))}
      {Array.from({ length: day.aram }, (_, i) => (
        <span key={`a${i}`} className="h-[5px] w-[5px] rounded-full bg-aram md:h-2 md:w-2" />
      ))}
    </div>
  );
}

function DayCell({ day, isFuture }: { day: CalendarDay; isFuture: boolean }) {
  const weekday = new Date(`${day.key}T00:00:00Z`).getUTCDay();
  const dayTone = weekday === 0 ? "text-aram" : weekday === 6 ? "text-rift" : "text-fg-2";
  const body = (
    <>
      <div className="flex items-start justify-between">
        <span className={`text-[11.5px] font-bold md:text-[13px] ${day.isToday ? "rounded-full bg-accent px-1.5 text-white" : dayTone}`}>
          {day.day}
        </span>
        {day.total > 0 && (
          <span className="hidden font-mono text-[12px] font-extrabold text-fg md:inline">{day.total}판</span>
        )}
      </div>
      {day.total > 0 && <Dots day={day} />}
    </>
  );
  const base = `flex min-h-[52px] flex-col justify-between gap-1 rounded-lg border p-1.5 md:min-h-[96px] md:rounded-xl md:p-2.5 ${HEAT[day.heat]}`;

  if (day.total === 0) {
    return <div className={`${base} border-ink/[.05] ${isFuture ? "opacity-40" : ""}`}>{body}</div>;
  }
  return (
    <Link
      href={historyHref("all", 1, day.key)}
      title={`${day.key} · 협곡 ${day.rift}판 · 칼바람 ${day.aram}판`}
      className={`${base} border-ink/[.08] transition-all hover:-translate-y-0.5 hover:border-purple/40 hover:shadow-md`}
    >
      {body}
    </Link>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
  className = "",
}: {
  label: string;
  value: number;
  unit: string;
  tone: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-xl border border-ink/[.06] bg-surface px-3.5 py-3 md:px-4 ${className}`}>
      <span className="text-[11.5px] font-medium text-faint md:text-[12px]">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className={`text-[22px] font-extrabold tracking-tight md:text-[28px] ${tone}`}>{value}</span>
        <span className="text-[12px] text-faint">{unit}</span>
      </span>
    </div>
  );
}

export function MatchCalendar({
  month,
  current,
  todayKey,
  data,
}: {
  month: YearMonth;
  current: YearMonth;
  todayKey: string;
  data: MatchCalendarData;
}) {
  const isCurrent = month.year === current.year && month.month === current.month;
  const navClass = "flex h-9 w-9 items-center justify-center rounded-lg border border-ink/[.09] text-[16px] text-fg-2";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={calendarHref(shiftMonth(month, -1))} className={`${navClass} hover:bg-hover`} aria-label="이전 달">
            ‹
          </Link>
          <h2 className="m-0 min-w-[150px] text-center text-[20px] font-extrabold tracking-tight md:text-[24px]">
            {month.year}년 {month.month}월
          </h2>
          {isCurrent ? (
            <span className={`${navClass} opacity-30`} aria-hidden>
              ›
            </span>
          ) : (
            <Link href={calendarHref(shiftMonth(month, 1))} className={`${navClass} hover:bg-hover`} aria-label="다음 달">
              ›
            </Link>
          )}
          {!isCurrent && (
            <Link href="/match-calendar" className="ml-1 text-[12.5px] font-bold text-accent-soft hover:underline">
              이번 달
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-[12.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rift" /> 협곡
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-aram" /> 칼바람
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-3">
        {/* 폰에서는 두 칸씩이라 다섯 개가 홀수로 남는다 — 대표 숫자를 한 줄 전체로. */}
        <Stat label="이번 달 내전" value={data.summary.total} unit="판" tone="text-fg" className="col-span-2 md:col-span-1" />
        <Stat label="협곡" value={data.summary.rift} unit="판" tone="text-rift" />
        <Stat label="칼바람" value={data.summary.aram} unit="판" tone="text-aram" />
        <Stat label="내전이 열린 날" value={data.summary.activeDays} unit="일" tone="text-purple" />
        <Stat label="함께한 회원" value={data.memberCount} unit="명" tone="text-fg" />
      </div>

      <div className="rounded-2xl border border-ink/[.06] bg-surface p-2 md:p-4">
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`pb-1 text-center text-[11.5px] font-bold md:text-[12.5px] ${
                i === 0 ? "text-aram" : i === 6 ? "text-rift" : "text-faint"
              }`}
            >
              {w}
            </div>
          ))}
          {data.weeks.flat().map((day, i) =>
            day === null ? <div key={`pad-${i}`} /> : <DayCell key={day.key} day={day} isFuture={day.key > todayKey} />,
          )}
        </div>
      </div>

      <p className="m-0 text-center text-[12px] text-faint">
        점 하나가 한 판입니다 · 칸이 진할수록 많이 한 날 · 날짜를 누르면 그날 경기 기록으로 갑니다
      </p>
    </div>
  );
}
