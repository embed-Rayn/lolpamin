import { formatEventDday } from "@lolpamin/core";

// D-DAY / D-N on a promoted post (accent, solid so it reads on top of a poster), 종료 once
// its event date is over (quiet).
export function EventDdayBadge({ daysLeft, className = "" }: { daysLeft: number; className?: string }) {
  const tone =
    daysLeft < 0
      ? "bg-surface/90 text-faint"
      : daysLeft === 0
        ? "bg-danger text-white"
        : "bg-accent text-white";
  return (
    <span className={`rounded-md px-2 py-0.5 font-mono text-[12px] font-extrabold shadow-sm ${tone} ${className}`}>
      {formatEventDday(daysLeft)}
    </span>
  );
}
