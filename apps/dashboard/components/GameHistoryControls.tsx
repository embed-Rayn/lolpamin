import Link from "next/link";
import type { GameHistoryMode } from "@/lib/queries/game-history";

const MODES: Array<{ key: GameHistoryMode; label: string }> = [
  { key: "all", label: "전체" },
  { key: "RIFT", label: "협곡" },
  { key: "ARAM", label: "칼바람" },
];

export function historyHref(mode: GameHistoryMode, page: number): string {
  const params = new URLSearchParams();
  if (mode !== "all") params.set("mode", mode);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/match-history?${qs}` : "/match-history";
}

export function GameHistoryModeFilter({ mode }: { mode: GameHistoryMode }) {
  return (
    <div className="flex gap-1">
      {MODES.map((m) => (
        <Link
          key={m.key}
          // 모드를 바꾸면 1쪽부터 — 다른 필터의 3쪽은 이 필터에 없을 수 있다.
          href={historyHref(m.key, 1)}
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
  page,
  pageCount,
}: {
  mode: GameHistoryMode;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  const linkClass = "rounded-md border border-ink/[.09] px-2.5 py-1 font-mono text-[12.5px] text-faint hover:text-fg-2";
  const disabledClass = "rounded-md border border-ink/[.05] px-2.5 py-1 font-mono text-[12.5px] text-ghost-2";

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="쪽">
      {page > 1 ? (
        <Link href={historyHref(mode, page - 1)} className={linkClass}>
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
          <Link key={p} href={historyHref(mode, p)} className={linkClass}>
            {p}
          </Link>
        ),
      )}
      {page < pageCount ? (
        <Link href={historyHref(mode, page + 1)} className={linkClass}>
          ›
        </Link>
      ) : (
        <span className={disabledClass}>›</span>
      )}
    </nav>
  );
}
