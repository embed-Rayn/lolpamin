"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NavIcon, type NavIconName } from "./nav-icons";

export interface SidebarNavItem {
  key: string;
  href?: string;
  label: string;
  icon: NavIconName;
  badge?: string;
  // Not built yet: rendered as an inert row with a 추가 예정 tag.
  disabled?: boolean;
}

export interface SidebarNavGroup {
  key: string;
  label: string;
  icon: NavIconName;
  items: SidebarNavItem[];
}

const COLLAPSED_KEY = "lolpamin.nav.collapsed";

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(collapsed: Set<string>) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Private windows and blocked site data: the fold state just lives for this page.
  }
}

// Groups fold and unfold; the fold state is a per-browser convenience and lives
// in localStorage, so the server renders everything open and the client applies
// the stored folds after mount (a folded group in the server HTML would flash
// open on hydration anyway). The group holding the current page is always open
// on arrival, so a fold never hides where you are.
export function SidebarNav({ groups, activeNav }: { groups: SidebarNavGroup[]; activeNav: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = readCollapsed();
    const activeGroup = groups.find((g) => g.items.some((n) => n.key === activeNav));
    if (activeGroup) stored.delete(activeGroup.key);
    setCollapsed(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeCollapsed(next);
      return next;
    });
  }

  return (
    <nav className="flex flex-col gap-1">
      {groups.map((g) => {
        const isActiveGroup = g.items.some((n) => n.key === activeNav);
        const isOpen = !collapsed.has(g.key);
        return (
          <div key={g.key} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              aria-expanded={isOpen}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-bold transition-colors hover:bg-hover ${
                isActiveGroup ? "text-fg" : "text-fg-2"
              }`}
            >
              <NavIcon name={g.icon} size={18} className={isActiveGroup ? "text-accent" : "text-muted"} />
              <span className="flex-1 text-left">{g.label}</span>
              <NavIcon
                name="chevron-down"
                size={16}
                className={`text-ghost transition-transform ${isOpen ? "" : "-rotate-90"}`}
              />
            </button>

            {isOpen && (
              <div className="mb-2 flex flex-col gap-0.5 pl-1">
                {g.items.map((n) =>
                  n.disabled ? (
                    <div
                      key={n.key}
                      className="flex items-center gap-2.5 rounded-lg py-2 pl-3 pr-2.5 text-[13.5px] text-ghost"
                    >
                      <NavIcon name={n.icon} size={16} className="text-ghost-2" />
                      <span className="flex-1">{n.label}</span>
                      <span className="rounded-md bg-purple-tint px-1.5 py-0.5 text-[11px] font-semibold text-purple">
                        추가 예정
                      </span>
                    </div>
                  ) : (
                    <Link
                      key={n.key}
                      href={n.href!}
                      className={`flex items-center gap-2.5 rounded-lg py-2 pl-3 pr-2.5 text-[13.5px] transition-colors ${
                        activeNav === n.key
                          ? "bg-accent-tint font-bold text-accent-soft"
                          : "font-medium text-muted hover:bg-hover hover:text-fg"
                      }`}
                    >
                      <NavIcon
                        name={n.icon}
                        size={16}
                        className={activeNav === n.key ? "text-accent" : "text-faint"}
                      />
                      <span className="flex-1">{n.label}</span>
                      {n.badge && (
                        <span className="rounded-full bg-orange/[.16] px-1.5 py-0.5 font-mono text-[12px] font-bold text-orange">
                          {n.badge}
                        </span>
                      )}
                    </Link>
                  ),
                )}
              </div>
            )}
            <div className="mx-2 my-1 border-t border-ink/[.06]" />
          </div>
        );
      })}
    </nav>
  );
}
