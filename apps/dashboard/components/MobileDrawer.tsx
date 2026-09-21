"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NavIcon } from "./nav-icons";
import { SidebarNav, type SidebarNavGroup } from "./SidebarNav";

// 헤더 왼쪽 ≡ 버튼과 드로어 패널을 함께 소유한다. 열림 상태는 useState 하나이고
// 서버가 알 필요가 없다 — AppShell은 서버 컴포넌트로 남는다.
//
// 패널은 항상 DOM에 있고(translate-x로 화면 밖에 둔다) 열릴 때 CSS transition으로
// 슬라이드한다. {open && <patch/>}로 조건부 마운트하면 첫 등장이 즉시 나타나 버려서
// 트랜지션을 탈 기회가 없다.
export function MobileDrawer({ groups, activeNav }: { groups: SidebarNavGroup[]; activeNav: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // 패널 안의 링크를 누르면 닫는다. SidebarNav 내부를 건드리지 않고 패널의 클릭을
  // 위임받아 <a>인지만 본다.
  function onPanelClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a")) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-fg md:hidden"
      >
        <NavIcon name="menu" size={22} />
      </button>

      <div className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-ink/40 motion-safe:transition-opacity motion-safe:duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        <div
          onClick={onPanelClick}
          className={`absolute inset-y-0 left-0 flex w-[280px] flex-col gap-5 overflow-y-auto bg-[rgb(var(--sidebar-bg))] px-3.5 py-5 shadow-xl motion-safe:transition-transform motion-safe:duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-2">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-accent-tint text-accent">
                <NavIcon name="gamepad" size={20} />
              </div>
              <div className="text-[16px] font-extrabold tracking-tight text-fg">롤파민</div>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="메뉴 닫기"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted hover:bg-hover"
            >
              <NavIcon name="x" size={18} />
            </button>
          </div>
          <SidebarNav groups={groups} activeNav={activeNav} />
        </div>
      </div>
    </>
  );
}
