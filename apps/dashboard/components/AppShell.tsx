import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getInactiveMembers } from "@lolpamin/core";
import { effectiveKakaoNickname } from "@/lib/queries/inactive";
import { NavGroupLink, NavLink } from "./NavLink";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { HeaderAuth } from "./HeaderAuth";

export interface AppShellProps {
  activeNav:
    | "home"
    | "member-info"
    | "members"
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
  children: React.ReactNode;
}

export async function AppShell({ activeNav, pageTitle, pageDesc, children }: AppShellProps) {
  const [totalCount, allMembersForInactivity, currentAdmin] = await Promise.all([
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
  ]);
  const inactiveNavCount = getInactiveMembers(
    allMembersForInactivity.map((m) => ({ ...m, kakaoNickname: effectiveKakaoNickname(m) })),
    new Date(),
  ).length;

  // The sidebar is three groups and the displayed numbers come from position, so
  // adding or removing an item keeps 1.1 / 2.2 correct without hand-editing them.
  // A group heading is itself a link to that group's first navigable child.
  // `disabled` items (not-yet-built pages) render as an inert row instead of a
  // link, and admin-only items are simply left out of the array for a signed-out
  // visitor, which is why they don't need a `disabled` flag of their own.
  interface NavItem {
    key: AppShellProps["activeNav"] | string;
    href?: string;
    label: string;
    badge?: string;
    disabled?: boolean;
  }

  const memberItems: NavItem[] = [
    { key: "member-info", href: "/member-info", label: "회원 정보 페이지" },
    { key: "members", href: "/members", label: "협곡 MMR 랭킹" },
    { key: "aram", href: "/aram", label: "칼바람 MMR 랭킹" },
    { key: "inactive", href: "/inactive", label: "미활동 리포트", badge: String(inactiveNavCount) },
  ];

  // The rest of member management is operator-only: hidden from the sidebar
  // entirely for a signed-out visitor, and the pages themselves redirect to
  // /login if reached directly by URL.
  if (currentAdmin) {
    memberItems.push(
      { key: "kakao-import", href: "/kakao-import", label: "카톡 불러오기" },
      { key: "link-accounts", href: "/link-accounts", label: "계정 연결" },
      { key: "admins", href: "/admins", label: "관리자" },
    );
  }

  const matchItems: NavItem[] = [
    { key: "match-history", href: "/match-history", label: "내전 상세 기록" },
    { key: "player-stats", label: "플레이어별 통계", disabled: true },
    { key: "champion-stats", label: "챔피언 통계", disabled: true },
  ];

  if (currentAdmin) {
    matchItems.push(
      { key: "matches", href: "/matches", label: "게임결과 입력" },
      { key: "replay-import", href: "/replay-import", label: "리플레이 불러오기" },
      { key: "team-builder", href: "/team-builder", label: "수동 팀짜기" },
    );
  }

  const navGroups: Array<{ label: string; items: NavItem[] }> = [
    { label: "회원 관리", items: memberItems },
    { label: "경기기록", items: matchItems },
    {
      label: "뽑기 게임",
      items: [
        { key: "draw-cannon", href: "/draw/cannon", label: "대포뽑기" },
        { key: "draw-plinko", href: "/draw/plinko", label: "핀볼뽑기" },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen bg-[#0E1117] font-sans text-[#E6EAF2]">
      <aside className="sticky top-0 flex h-screen w-[250px] flex-none flex-col gap-6 border-r border-white/[.07] bg-[#12161F] p-3.5">
        <Link href="/" className="flex items-center gap-2.5 px-2">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-gradient-to-br from-[#4472C4] to-[#1E3461] text-[15px] font-extrabold text-white">
            롤
          </div>
          <div className="flex flex-col gap-px">
            <div className="text-[14.5px] font-bold">롤파민</div>
            <div className="text-[12px] text-[#6E7889]">내부 운영 도구</div>
          </div>
        </Link>

        <nav className="flex flex-col gap-4">
          {navGroups.map((g, gi) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <NavGroupLink
                href={g.items.find((n) => !n.disabled)?.href ?? "/"}
                number={String(gi + 1)}
                label={g.label}
                active={g.items.some((n) => n.key === activeNav)}
              />
              {g.items.map((n, ni) =>
                n.disabled ? (
                  <div
                    key={n.key}
                    className="flex items-center gap-2 rounded-lg py-1.5 pl-3 pr-2.5 text-[13.5px] text-[#4E576A]"
                  >
                    <span className="w-6 flex-none font-mono text-[12px] text-[#3A4152]">{`${gi + 1}.${ni + 1}`}</span>
                    <span className="flex-1">{n.label}</span>
                    <span className="rounded-full bg-white/[.04] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#5C6577]">
                      추가예정
                    </span>
                  </div>
                ) : (
                  <NavLink
                    key={n.key}
                    href={n.href!}
                    label={n.label}
                    icon={`${gi + 1}.${ni + 1}`}
                    active={activeNav === n.key}
                    badge={n.badge}
                  />
                ),
              )}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2.5">
          <div className="flex flex-col gap-2 rounded-[10px] border border-white/[.06] bg-[#161B26] p-3">
            <div className="text-[12px] font-semibold text-[#6E7889]">봇 연동 상태</div>
            <div className="flex items-center gap-1.5 text-[12.5px] text-[#B7C0D0]">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#70AD47]" />
              Discord Bot · 정상
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[58px] flex-none items-center justify-between border-b border-white/[.07] bg-[#0E1117]/85 px-7 backdrop-blur">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 text-[17px] font-bold">{pageTitle}</h1>
            <span className="text-[12.5px] text-[#6E7889]">{pageDesc}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-[12.5px] text-[#8A94A6]">
              회원 <span className="font-mono font-semibold text-[#E6EAF2]">{totalCount}</span>명
            </div>
            <HeaderAuth username={currentAdmin?.username ?? null} />
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
