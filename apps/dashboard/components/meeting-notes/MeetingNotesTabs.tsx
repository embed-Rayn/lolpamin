import Link from "next/link";

const TABS = [
  { key: "notes", label: "회의록", href: "/meeting-notes" },
  { key: "tasks", label: "할 일", href: "/meeting-notes/tasks" },
] as const;

export function MeetingNotesTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="flex gap-1 border-b border-ink/[.06]" aria-label="회의록 보기">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`-mb-px border-b-2 px-3.5 py-2 text-[13.5px] font-bold ${
            tab.key === active ? "border-accent text-fg" : "border-transparent text-faint hover:text-fg-2"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
