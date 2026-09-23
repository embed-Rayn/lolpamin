import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getInactiveMembers } from "@lolpamin/core";
import { effectiveKakaoNickname } from "@/lib/queries/inactive";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getBranding } from "@/lib/queries/branding";
import { BrandLogo } from "./BrandLogo";
import { HeaderAuth } from "./HeaderAuth";
import { MobileDrawer } from "./MobileDrawer";
import { NavIcon } from "./nav-icons";
import { SidebarNav, type SidebarNavGroup } from "./SidebarNav";

export interface AppShellProps {
  activeNav:
    | "home"
    | "member-info"
    | "rift"
    | "aram"
    | "matches"
    | "replay-import"
    | "team-builder"
    | "match-history"
    | "inactive"
    | "kakao-import"
    | "link-accounts"
    | "admins"
    | "draw-cannon"
    | "draw-plinko";
  pageTitle: string;
  pageDesc: string;
  // 이 화면은 폭이 넓어야 쓸 수 있다(경기 입력, 리플레이, 팀짜기, 카톡 불러오기, 계정
  // 연결, 관리자, 뽑기 두 개). 폰에서는 children 대신 안내 카드를 보여주고, children은
  // DOM에 남겨(hidden md:block) "데스크톱 사이트 보기"로는 계속 볼 수 있게 한다.
  desktopOnly?: boolean;
  children: React.ReactNode;
}

export async function AppShell({ activeNav, pageTitle, pageDesc, desktopOnly, children }: AppShellProps) {
  const [totalCount, allMembersForInactivity, currentAdmin, branding] = await Promise.all([
    prisma.member.count({ where: { mergedIntoId: null } }),
    prisma.member.findMany({
      where: { mergedIntoId: null },
      // absorbed는 미활동 후보 판정용 — 흡수한 회원의 카톡 닉네임은 묘비에 남으므로
      // 자기 행만 보면 연결을 끝낸 회원이 사이드바 배지에서 통째로 빠진다.
      select: {
        id: true,
        kakaoUserId: true,
        kakaoNickname: true,
        lastActiveAt: true,
        createdAt: true,
        // 최신순 — effectiveKakaoNickname이 첫 번째를 현재 닉네임으로 집는다.
        absorbed: { select: { kakaoNickname: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    getCurrentAdmin(),
    getBranding(prisma),
  ]);
  const inactiveNavCount = getInactiveMembers(
    allMembersForInactivity.map((m) => ({ ...m, kakaoNickname: effectiveKakaoNickname(m) })),
    new Date(),
  ).length;

  // Four groups after the reference design. Operator-only items are left out of
  // the arrays for a signed-out visitor (the pages themselves redirect to /login
  // when reached by URL), and `disabled` marks pages that are not built yet.
  const memberItems: SidebarNavGroup["items"] = [
    { key: "member-info", href: "/member-info", label: "회원 정보", icon: "user-list" },
    { key: "rift", href: "/rift", label: "협곡 MMR 랭킹", icon: "crown" },
    { key: "aram", href: "/aram", label: "칼바람 MMR 랭킹", icon: "swords" },
    { key: "inactive", href: "/inactive", label: "미활동 회원", icon: "user-clock", badge: String(inactiveNavCount) },
  ];

  const matchItems: SidebarNavGroup["items"] = [
    { key: "match-history", href: "/match-history", label: "내전 기록", icon: "file-search" },
    { key: "matches", href: "/matches", label: "내전 팀 빌더", icon: "crown" },
    { key: "player-stats", label: "플레이어 통계", icon: "bar-chart", disabled: true },
    { key: "champion-stats", label: "챔피언 통계", icon: "trophy", disabled: true },
  ];
  if (currentAdmin) {
    matchItems.push(
      { key: "replay-import", href: "/replay-import", label: "리플레이 불러오기", icon: "film" },
      { key: "team-builder", href: "/team-builder", label: "수동 팀짜기", icon: "grid" },
    );
  }

  const groups: SidebarNavGroup[] = [
    { key: "members", label: "회원 · 랭킹", icon: "users", items: memberItems },
    { key: "matches", label: "경기 기록", icon: "gamepad", items: matchItems },
    {
      key: "draw",
      label: "추첨",
      icon: "gift",
      items: [
        { key: "draw-cannon", href: "/draw/cannon", label: "대포 뽑기", icon: "cube" },
        { key: "draw-plinko", href: "/draw/plinko", label: "핀볼 뽑기", icon: "dice" },
      ],
    },
  ];
  if (currentAdmin) {
    groups.push({
      key: "ops",
      label: "운영 관리",
      icon: "gear",
      items: [
        { key: "kakao-import", href: "/kakao-import", label: "카톡 불러오기", icon: "message" },
        { key: "link-accounts", href: "/link-accounts", label: "계정 연결", icon: "link" },
        { key: "admins", href: "/admins", label: "관리자 · 설정", icon: "shield" },
      ],
    });
  }

  const activeGroup = groups.find((g) => g.items.some((n) => n.key === activeNav));

  return (
    <div className="flex min-h-screen bg-page font-sans text-fg">
      <aside className="sticky top-0 hidden h-screen w-[260px] flex-none flex-col gap-5 overflow-y-auto border-r border-ink/[.07] bg-[rgb(var(--sidebar-bg))] px-3.5 py-5 md:flex">
        <Link href="/" className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-accent-tint text-accent">
            <BrandLogo logoSvg={branding.logoSvg} size={22} />
          </div>
          <div className="flex flex-col gap-px">
            <div className="text-[17px] font-extrabold tracking-tight text-fg">{branding.siteName}</div>
            <div className="text-[12px] text-faint">{branding.siteTagline}</div>
          </div>
        </Link>

        <SidebarNav groups={groups} activeNav={activeNav} />

        <div className="mt-auto flex flex-col gap-2.5">
          <div className="flex flex-col gap-2 rounded-[10px] border border-ink/[.06] bg-surface-3 p-3">
            <div className="text-[12px] font-semibold text-faint">봇 연동 상태</div>
            <div className="flex items-center gap-1.5 text-[12.5px] text-fg-2">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-success" />
              Discord Bot · 정상
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 flex-none items-center justify-between gap-3 border-b border-ink/[.07] bg-[rgb(var(--header-bg)/0.9)] px-3 backdrop-blur md:h-[72px] md:px-7">
          <div className="flex min-w-0 items-center gap-2.5 md:flex-col md:items-stretch md:gap-0.5">
            <MobileDrawer
              groups={groups}
              activeNav={activeNav}
              logoSvg={branding.logoSvg}
              siteName={branding.siteName}
            />
            <h1 className="m-0 truncate text-[16px] font-extrabold tracking-tight md:text-[20px]">{pageTitle}</h1>
            <div className="hidden items-center gap-1.5 text-[12.5px] text-faint md:flex">
              <Link href="/" className="hover:text-fg-2">
                홈
              </Link>
              {activeGroup && (
                <>
                  <span className="text-ghost">›</span>
                  <span>{activeGroup.label}</span>
                </>
              )}
              <span className="text-ghost">›</span>
              <span className="text-muted">{pageDesc}</span>
            </div>
          </div>
          <div className="flex flex-none items-center gap-4">
            <div className="hidden text-[12.5px] text-muted md:block">
              회원 <span className="font-mono font-semibold text-fg">{totalCount}</span>명
            </div>
            <HeaderAuth username={currentAdmin?.username ?? null} />
          </div>
        </header>

        {desktopOnly ? (
          <>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center md:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-tint text-accent">
                <NavIcon name="gear" size={28} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-[16px] font-bold text-fg">이 화면은 PC에서 이용해 주세요</div>
                <div className="max-w-xs text-[13px] leading-relaxed text-faint">
                  경기 입력·리플레이·계정 연결·뽑기는 화면이 넓어야 합니다.
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/"
                  className="rounded-lg border border-ink/[.1] px-3.5 py-2 text-[13px] font-bold text-fg-2 hover:bg-hover"
                >
                  홈으로
                </Link>
                <Link
                  href="/rift"
                  className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-bold text-white hover:bg-accent-hover"
                >
                  협곡 랭킹
                </Link>
              </div>
            </div>
            <div className="hidden md:block">{children}</div>
          </>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
