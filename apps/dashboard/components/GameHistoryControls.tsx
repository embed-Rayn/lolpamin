import Link from "next/link";
import type { GameHistoryMode } from "@/lib/queries/game-history";

const MODES: Array<{ key: GameHistoryMode; label: string }> = [
  { key: "all", label: "전체" },
  { key: "RIFT", label: "협곡" },
  { key: "ARAM", label: "칼바람" },
];

export function historyHref(mode: GameHistoryMode, page: number, date: string | null = null): string {
  const params = new URLSearchParams();
  if (mode !== "all") params.set("mode", mode);
  if (date !== null) params.set("date", date);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/match-history?${qs}` : "/match-history";
}

export function GameHistoryModeFilter({ mode, date }: { mode: GameHistoryMode; date: string | null }) {
  return (
    <div className="flex gap-1">
      {MODES.map((m) => (
        <Link
          key={m.key}
          // 모드를 바꾸면 1쪽부터 — 다른 필터의 3쪽은 이 필터에 없을 수 있다.
          href={historyHref(m.key, 1, date)}
          className={`rounded-md border px-2.5 py-1 text-[12.5px] font-semibold ${
            mode === m.key
              ? "border-accent/45 bg-accent/[.18] text-accent-soft"
              : "border-ink/[.09] bg-transparent text-faint hover:text-fg-2"
          }`}
        >
          {m.label}
        </Link>
      ))}
    </div>
  );
}

// 쪽 번호는 현재 쪽 앞뒤 두 개와 양 끝만 보여준다. 빠진 구간은 "…"로 표시한다.
function pageNumbers(page: number, pageCount: number): Array<number | "gap"> {
  const wanted = new Set<number>([1, pageCount]);
  for (let p = page - 2; p <= page + 2; p += 1) {
    if (p >= 1 && p <= pageCount) wanted.add(p);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("gap");
    out.push(sorted[i]);
  }
  return out;
}

export function GameHistoryPagination({
  mode,
  date,
  page,
  pageCount,
}: {
  mode: GameHistoryMode;
  date: string | null;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  const linkClass = "rounded-md border border-ink/[.09] px-2.5 py-1 font-mono text-[12.5px] text-faint hover:text-fg-2";
  const disabledClass = "rounded-md border border-ink/[.05] px-2.5 py-1 font-mono text-[12.5px] text-ghost-2";

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="쪽">
      {page > 1 ? (
        <Link href={historyHref(mode, page - 1, date)} className={linkClass}>
          ‹
        </Link>
      ) : (
        <span className={disabledClass}>‹</span>
      )}
      {pageNumbers(page, pageCount).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-1 font-mono text-[12.5px] text-ghost">
            …
          </span>
        ) : p === page ? (
          <span
            key={p}
            className="rounded-md border border-accent/45 bg-accent/[.18] px-2.5 py-1 font-mono text-[12.5px] font-bold text-accent-soft"
          >
            {p}
          </span>
        ) : (
          <Link key={p} href={historyHref(mode, p, date)} className={linkClass}>
            {p}
          </Link>
        ),
      )}
      {page < pageCount ? (
        <Link href={historyHref(mode, page + 1, date)} className={linkClass}>
          ›
        </Link>
      ) : (
        <span className={disabledClass}>›</span>
      )}
    </nav>
  );
}

// 날짜 하나로 좁히기. 자바스크립트 없이 GET 폼으로 보낸다 — 모드는 숨은 칸으로 따라가고,
// 쪽은 1쪽부터다. /match-calendar의 날짜 칸이 같은 ?date=로 이 화면에 들어온다.
export function GameHistoryDateFilter({ mode, date }: { mode: GameHistoryMode; date: string | null }) {
  return (
    <form action="/match-history" className="flex items-center gap-1.5">
      {mode !== "all" && <input type="hidden" name="mode" value={mode} />}
      <input
        type="date"
        name="date"
        defaultValue={date ?? ""}
        aria-label="경기 날짜"
        className="rounded-md border border-ink/[.09] bg-inset px-2 py-[3px] font-mono text-[12.5px] text-fg outline-none focus:border-accent"
      />
      <button
        type="submit"
        className="rounded-md border border-ink/[.09] px-2.5 py-1 text-[12.5px] font-semibold text-faint hover:text-fg-2"
      >
        보기
      </button>
      {date !== null && (
        <Link
          href={historyHref(mode, 1)}
          className="rounded-md border border-accent/45 bg-accent/[.12] px-2.5 py-1 text-[12.5px] font-semibold text-accent-soft"
        >
          날짜 해제 ✕
        </Link>
      )}
    </form>
  );
}
