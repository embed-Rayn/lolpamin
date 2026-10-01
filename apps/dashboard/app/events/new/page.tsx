import { redirect } from "next/navigation";
import { loginPathFor } from "@/lib/auth/next-path";
import { AppShell } from "@/components/AppShell";
import { EventPostForm } from "@/components/events/EventPostForm";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { createEventPostAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEventPostPage() {
  if (!(await getCurrentAdmin())) redirect(loginPathFor("/events/new"));

  return (
    <AppShell activeNav="events" pageTitle="공지사항 글쓰기" pageDesc="새 글" desktopOnly>
      <div className="flex max-w-3xl flex-col gap-3 px-7 pb-10 pt-6">
        <p className="m-0 text-[13px] text-faint">
          제목과 내용을 먼저 저장하면 사진(일반 · 추후 공개)을 올리는 화면으로 넘어갑니다.
        </p>
        <EventPostForm submitLabel="저장하고 사진 올리기" onSubmit={createEventPostAction} openEditorAfterCreate />
      </div>
    </AppShell>
  );
}
