import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EventImageManager } from "@/components/events/EventImageManager";
import { EventPostForm } from "@/components/events/EventPostForm";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getEventPost } from "@/lib/queries/event-posts";
import { updateEventPostAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditEventPostPage({ params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) redirect("/login");
  const post = await getEventPost(prisma, params.id, true);
  if (!post) notFound();

  return (
    <AppShell activeNav="events" pageTitle="이벤트 수정" pageDesc={post.title} desktopOnly>
      <div className="flex max-w-4xl flex-col gap-4 px-7 pb-10 pt-6">
        <Link href={`/events/${post.id}`} className="text-[13px] text-faint hover:text-fg-2">
          ← 글 보기
        </Link>
        <EventPostForm
          initialTitle={post.title}
          initialBody={post.body}
          submitLabel="저장"
          onSubmit={updateEventPostAction.bind(null, post.id)}
        />
        <EventImageManager
          postId={post.id}
          kind="MAIN"
          label="일반 사진"
          hint="바로 보입니다 · 장당 5MB"
          images={post.mainImages}
        />
        <EventImageManager
          postId={post.id}
          kind="HIDDEN"
          label="추후 공개 사진"
          hint={post.revealed ? "공개됨 · 글 맨 위에 보입니다" : "공개 버튼을 누르기 전까지 운영자만 봅니다"}
          images={post.hiddenImages}
        />
      </div>
    </AppShell>
  );
}
