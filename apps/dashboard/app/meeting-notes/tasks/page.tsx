import Link from "next/link";
import { redirect } from "next/navigation";
import { formatMeetingDate } from "@lolpamin/core";
import { AppShell } from "@/components/AppShell";
import { MeetingNotesTabs } from "@/components/meeting-notes/MeetingNotesTabs";
import { TaskRowCheckbox } from "@/components/meeting-notes/TaskRowCheckbox";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { loginPathFor } from "@/lib/auth/next-path";
import { prisma } from "@/lib/prisma";
import { listMeetingNoteTaskGroups, type MeetingNoteTaskRow } from "@/lib/queries/meeting-note-tasks";

export const dynamic = "force-dynamic";

const DUE_CLASS = { overdue: "font-bold text-danger-soft", soon: "font-bold text-orange" } as const;

function dueLabel(due: string): string {
  const [, month, day] = due.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function TaskRow({ row }: { row: MeetingNoteTaskRow }) {
  return (
    <li
      className={`grid grid-cols-[auto_minmax(0,1fr)_64px_260px] items-center gap-3 border-b border-ink/[.04] px-4 py-2 last:border-b-0 ${
        row.checked ? "opacity-50" : ""
      }`}
    >
      <TaskRowCheckbox
        key={`${row.noteId}:${row.line}:${row.checked}`}
        noteId={row.noteId}
        line={row.line}
        text={row.text}
        checked={row.checked}
      />
      <span className={`min-w-0 truncate text-[13.5px] ${row.checked ? "line-through" : "text-fg"}`}>
        {row.parentText && <span className="text-faint">{row.parentText} › </span>}
        {row.text}
      </span>
      <span className={`text-right font-mono text-[12.5px] ${row.dueLevel ? DUE_CLASS[row.dueLevel] : "text-muted"}`}>
        {row.due ? dueLabel(row.due) : ""}
      </span>
      <Link href={`/meeting-notes/${row.noteId}`} className="truncate text-[12.5px] text-faint hover:text-accent">
        {formatMeetingDate(row.meetingDate)} · {row.noteTitle}
      </Link>
    </li>
  );
}

export default async function MeetingNoteTasksPage({ searchParams }: { searchParams: { done?: string } }) {
  if (!(await getCurrentAdmin())) redirect(loginPathFor("/meeting-notes/tasks"));
  const includeDone = searchParams.done === "1";
  const groups = await listMeetingNoteTaskGroups(prisma, { includeDone, now: new Date() });
  const open = groups.reduce((sum, g) => sum + g.open, 0);

  return (
    <AppShell activeNav="meeting-notes" pageTitle="회의록" pageDesc="운영진 전용 · 회의에서 나온 할 일" desktopOnly>
      <div className="flex flex-col gap-4 px-7 pb-10 pt-6">
        <MeetingNotesTabs active="tasks" />
        <div className="flex items-center justify-between">
          <div className="text-[13px] text-faint">
            미완료 {open}건 · 담당자는 <code>@이름</code>, 기한은 <code>~11/14</code>
          </div>
          <Link
            href={includeDone ? "/meeting-notes/tasks" : "/meeting-notes/tasks?done=1"}
            className="flex items-center gap-1.5 text-[12.5px] text-faint hover:text-fg-2"
          >
            <input
              type="checkbox"
              checked={includeDone}
              readOnly
              tabIndex={-1}
              className="pointer-events-none accent-accent"
            />
            완료 포함
          </Link>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-ink/[.06] bg-surface px-5 py-10 text-[13.5px] text-faint">
            <span>{includeDone ? "할 일이 없습니다." : "남은 할 일이 없습니다."} 회의록에 이렇게 적으면 여기에 모입니다.</span>
            <code className="rounded bg-ink/[.06] px-2 py-1 font-mono text-[13px] text-fg-2">- [ ] @이름 할 일 ~11/14</code>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="overflow-hidden rounded-xl border border-ink/[.06] bg-surface">
              <h2 className="m-0 flex items-baseline gap-2 border-b border-ink/[.06] bg-surface-2 px-4 py-2.5 text-[14px] font-bold text-fg">
                {group.key === "" ? group.label : `@${group.label}`}
                <span className="text-[12px] font-normal text-faint">미완료 {group.open}건</span>
              </h2>
              <ul className="m-0 list-none p-0">
                {group.rows.map((row) => (
                  <TaskRow key={`${row.noteId}:${row.line}`} row={row} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
