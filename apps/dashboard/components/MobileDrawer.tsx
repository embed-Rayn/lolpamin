"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavIcon } from "./nav-icons";
import { SidebarNav, type SidebarNavGroup } from "./SidebarNav";

// 헤더 왼쪽 ≡ 버튼과 드로어 패널을 함께 소유한다. 열림 상태는 useState 하나이고
// 서버가 알 필요가 없다 — AppShell은 서버 컴포넌트로 남는다.
//
// 패널은 항상 DOM에 있고(translate-x로 화면 밖에 둔다) 열릴 때 CSS transition으로
// 슬라이드한다. {open && <patch/>}로 조건부 마운트하면 첫 등장이 즉시 나타나 버려서
// 트랜지션을 탈 기회가 없다.
//
// 오버레이+패널은 createPortal로 document.body 바로 아래에 그린다. 이 컴포넌트를
// 부르는 자리가 AppShell의 <header>인데, 그 헤더에 backdrop-blur(backdrop-filter)가
// 걸려 있다 — filter/backdrop-filter가 있는 조상은 그 아래 position: fixed 자손의
// containing block이 되어 버린다. 포털 없이 여기서 바로 fixed를 쓰면 "뷰포트 전체"가
// 아니라 "56px짜리 헤더 상자" 기준으로 inset: 0이 걸려, 오버레이가 화면을 덮지 못하고
// 헤더 높이만큼 눌린 채로 렌더된다 — 좁은 화면에서 ≡를 눌러도 드로어가 제대로 안 뜨고
// 화면 뒤로 숨는 것처럼 보이던 원인이다. body에 직접 붙이면 헤더의 필터와 무관해진다.
export function MobileDrawer({ groups, activeNav }: { groups: SidebarNavGroup[]; activeNav: string }) {
  const [open, setOpen] = useState(false);
  // document는 서버에 없다. 마운트된 뒤에만 포털 타깃이 있다고 보고, 그 전에는
  // 오버레이를 아예 그리지 않는다(버튼은 그 전에도 항상 그린다).
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const overlay = (
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
  );

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

      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
