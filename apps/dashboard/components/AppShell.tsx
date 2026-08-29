import { prisma } from "@/lib/prisma";
import { getInactiveMembers } from "@lolpamin/core";
import { NavLink } from "./NavLink";

export interface AppShellProps {
  activeNav: "members" | "matches" | "inactive" | "kakao-import";
  pageTitle: string;
  pageDesc: string;
  children: React.ReactNode;
}

export async function AppShell({ activeNav, pageTitle, pageDesc, children }: AppShellProps) {
  const [totalCount, allMembersForInactivity] = await Promise.all([
    prisma.member.count(),
    prisma.member.findMany({ select: { id: true, kakaoUserId: true, lastActiveAt: true, createdAt: true } }),
  ]);
  const inactiveNavCount = getInactiveMembers(allMembersForInactivity, new Date()).length;

  const navItems = [
    { key: "members" as const, href: "/members", label: "회원 관리", icon: "01" },
    { key: "matches" as const, href: "/matches", label: "게임 결과 입력", icon: "02" },
    { key: "inactive" as const, href: "/inactive", label: "미활동 리포트", icon: "03", badge: String(inactiveNavCount) },
    { key: "kakao-import" as const, href: "/kakao-import", label: "카톡 내보내기", icon: "04" },
  ];

  return (
    <div className="flex min-h-screen bg-[#0E1117] font-sans text-[#E6EAF2]">
      <aside className="sticky top-0 flex h-screen w-[232px] flex-none flex-col gap-6 border-r border-white/[.07] bg-[#12161F] p-3.5">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-gradient-to-br from-[#4472C4] to-[#1E3461] text-sm font-extrabold text-white">
            롤
          </div>
          <div className="flex flex-col gap-px">
            <div className="text-[13.5px] font-bold">롤파민</div>
            <div className="text-[10.5px] text-[#6E7889]">내부 운영 도구</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          <div className="px-2 pb-2 text-[10px] font-bold tracking-wider text-[#5C6577]">운영</div>
          {navItems.map((n) => (
            <NavLink key={n.key} href={n.href} label={n.label} icon={n.icon} active={activeNav === n.key} badge={n.badge} />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2.5">
          <div className="flex flex-col gap-2 rounded-[10px] border border-white/[.06] bg-[#161B26] p-3">
            <div className="text-[10.5px] font-semibold text-[#6E7889]">봇 연동 상태</div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#B7C0D0]">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#70AD47]" />
              Discord Bot · 정상
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[58px] flex-none items-center justify-between border-b border-white/[.07] bg-[#0E1117]/85 px-7 backdrop-blur">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 text-[15.5px] font-bold">{pageTitle}</h1>
            <span className="text-[11.5px] text-[#6E7889]">{pageDesc}</span>
          </div>
          <div className="text-[11.5px] text-[#8A94A6]">
            회원 <span className="font-mono font-semibold text-[#E6EAF2]">{totalCount}</span>명
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
