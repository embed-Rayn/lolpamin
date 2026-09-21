"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { THEMES, THEME_LABELS, type Theme } from "@lolpamin/core";
import { setSiteThemeAction } from "@/app/admins/actions";

// 스킨별 미리보기 색. 여기 하드코딩한 hex는 "이 스킨을 고르면 어떻게 보이는가"를 그리는
// 견본이라 현재 스킨의 토큰을 따라가면 안 된다 — 다크 스킨에서 봐도 클린 견본은 희어야 한다.
const SWATCH: Record<Theme, { page: string; surface: string; accent: string; text: string }> = {
  clean: { page: "#F3F6FB", surface: "#FFFFFF", accent: "#3B7DE0", text: "#1B2333" },
  pink: { page: "#FFF0F5", surface: "#FFFBFD", accent: "#EC5C8E", text: "#3A2530" },
  dark: { page: "#0E1117", surface: "#151A24", accent: "#4472C4", text: "#E6EAF2" },
};

export function ThemePanel({ current, updatedLabel }: { current: Theme; updatedLabel: string | null }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Theme>(current);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function choose(theme: Theme) {
    if (theme === selected || isPending) return;
    setSelected(theme);
    setError(null);
    startTransition(async () => {
      const result = await setSiteThemeAction(theme);
      if (result.error) {
        setError(result.error);
        setSelected(current);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-ink/[.06] bg-surface">
      <div className="flex items-center justify-between border-b border-ink/[.06] px-5 py-3.5">
        <div>
          <h2 className="m-0 text-[14.5px] font-bold">사이트 스킨</h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-faint">
            모든 방문자에게 같은 스킨이 보입니다. 고르면 바로 저장됩니다.
          </p>
        </div>
        <div className="text-[12px] text-faint">{updatedLabel ? `마지막 변경 ${updatedLabel}` : "기본값"}</div>
      </div>
      <div className="grid grid-cols-3 gap-3 p-5">
        {THEMES.map((theme) => {
          const s = SWATCH[theme];
          const active = selected === theme;
          return (
            <button
              key={theme}
              type="button"
              onClick={() => choose(theme)}
              disabled={isPending}
              aria-pressed={active}
              className={`flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
                active ? "border-accent bg-accent-tint" : "border-ink/[.09] hover:border-ink/[.2]"
              }`}
            >
              <div
                className="flex h-24 gap-2 overflow-hidden rounded-lg border p-2"
                style={{ background: s.page, borderColor: "rgba(0,0,0,.08)" }}
              >
                <div className="flex w-1/3 flex-col gap-1.5 rounded-md p-1.5" style={{ background: s.surface }}>
                  <div className="h-1.5 w-3/4 rounded" style={{ background: s.accent }} />
                  <div className="h-1.5 w-1/2 rounded opacity-40" style={{ background: s.text }} />
                  <div className="h-1.5 w-2/3 rounded opacity-40" style={{ background: s.text }} />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-6 rounded-md" style={{ background: s.surface }} />
                  <div className="flex-1 rounded-md" style={{ background: s.surface }} />
                </div>
              </div>
              <div>
                <div className={`text-[13.5px] font-bold ${active ? "text-accent-soft" : "text-fg"}`}>
                  {THEME_LABELS[theme].name}
                  {theme === "clean" && <span className="ml-1.5 text-[11px] font-semibold text-faint">기본</span>}
                </div>
                <div className="text-[12px] text-faint">{THEME_LABELS[theme].description}</div>
              </div>
            </button>
          );
        })}
      </div>
      {error && <div className="px-5 pb-4 text-[12.5px] text-danger-soft">{error}</div>}
    </section>
  );
}
