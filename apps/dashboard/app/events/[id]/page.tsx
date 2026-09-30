import Link from "next/link";
import { notFound } from "next/navigation";
import { formatEventDate } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { EventAdminBar } from "@/components/events/EventAdminBar";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getEventPost } from "@/lib/queries/event-posts";

export const dynamic = "force-dynamic";

export default async function EventPostPage({ params }: { params: { id: string } }) {
  const currentAdmin = await getCurrentAdmin();
  const isAdmin = currentAdmin !== null;
  const post = await getEventPost(prisma, params.id, isAdmin);
  if (!post) notFound();

  return (
    <AppShell activeNav="events" pageTitle="공지사항" pageDesc={post.title}>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-10 pt-5 md:px-7 md:pt-6">
        <Link href="/events" className="text-[13px] text-faint hover:text-fg-2">
          ← 공지사항
        </Link>
        <header className="flex flex-col gap-1">
          <h2 className="m-0 text-[20px] font-extrabold tracking-tight text-fg md:text-[24px]">{post.title}</h2>
          <div className="text-[12.5px] text-faint">{formatEventDate(post.createdAt)}</div>
        </header>

        {isAdmin && (
          <EventAdminBar postId={post.id} revealed={post.revealed} hiddenCount={post.hiddenImages.length} />
        )}

        {post.hiddenImages.map((image) => (
          <figure key={image.id} className="relative m-0">
            {/* Only admins receive unrevealed hidden images (getEventPost), so the badge is theirs alone. */}
            {!post.revealed && (
              <span className="absolute left-2 top-2 rounded-md bg-surface/90 px-2 py-0.5 text-[11.5px] font-bold text-danger-soft shadow-sm">
                공개 전
              </span>
            )}
            <img src={image.src} alt="" className="w-full rounded-xl border border-ink/[.06]" />
          </figure>
        ))}
        {post.mainImages.map((image) => (
          <img key={image.id} src={image.src} alt="" className="w-full rounded-xl border border-ink/[.06]" />
        ))}
        {post.body && (
          <p className="m-0 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-fg-2">{post.body}</p>
        )}
      </article>
    </AppShell>
  );
}
