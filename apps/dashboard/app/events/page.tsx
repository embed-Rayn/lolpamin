import Link from "next/link";
import { formatEventDate } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { NavIcon } from "@/components/nav-icons";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { listEventPosts } from "@/lib/queries/event-posts";

// AppShell과 글 목록 모두 살아 있는 DB 행을 읽는다.
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [posts, currentAdmin] = await Promise.all([listEventPosts(prisma), getCurrentAdmin()]);

  return (
    <AppShell activeNav="events" pageTitle="이벤트" pageDesc="내전 이벤트 소식">
      <div className="flex flex-col gap-4 px-4 pb-10 pt-5 md:px-7 md:pt-6">
        {currentAdmin && (
          <div className="flex justify-end">
            <Link
              href="/events/new"
              className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-bold text-white hover:bg-accent-hover"
            >
              새 글
            </Link>
          </div>
        )}
        {posts.length === 0 ? (
          <div className="rounded-xl border border-ink/[.06] bg-surface px-4 py-16 text-center text-[13.5px] text-faint">
            아직 등록된 이벤트가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/events/${post.id}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-ink/[.06] bg-surface hover:border-ink/[.14]"
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-inset">
                  {post.thumbnailSrc ? (
                    <img src={post.thumbnailSrc} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <NavIcon name="megaphone" size={36} className="text-faint" />
                  )}
                </div>
                <div className="flex flex-col gap-1 px-4 py-3">
                  <div className="truncate text-[15px] font-bold text-fg group-hover:text-accent">{post.title}</div>
                  <div className="text-[12.5px] text-faint">{formatEventDate(post.createdAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
