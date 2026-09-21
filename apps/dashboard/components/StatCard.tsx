import { NavIcon, type NavIconName } from "./nav-icons";

export interface StatCardProps {
  label: string;
  value: number | string;
  unit: string;
  colorClassName: string;
  // With an icon the card takes the reference layout: a tinted icon tile on the
  // left, label over the number on the right. Without one it stays a plain tile.
  icon?: NavIconName;
  // Tint for the icon tile; defaults to the accent colour.
  iconClassName?: string;
}

export function StatCard({ label, value, unit, colorClassName, icon, iconClassName }: StatCardProps) {
  if (!icon) {
    return (
      <div className="flex flex-col gap-1.5 rounded-[11px] border border-ink/[.06] bg-surface px-4 py-3.5">
        <div className="text-[12px] font-medium text-faint">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className={`font-mono text-[23px] font-bold tracking-tight ${colorClassName}`}>{value}</span>
          <span className="text-[12px] text-faint">{unit}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5 rounded-2xl border border-ink/[.06] bg-surface px-6 py-5 shadow-[0_1px_2px_rgb(var(--c-ink)/0.04)]">
      <div
        className={`flex h-[72px] w-[72px] flex-none items-center justify-center rounded-2xl bg-accent-tint ${
          iconClassName ?? "text-accent"
        }`}
      >
        <NavIcon name={icon} size={34} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-[14px] font-medium text-muted">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-[36px] font-extrabold leading-none tracking-tight ${colorClassName}`}>{value}</span>
          <span className="text-[14px] text-faint">{unit}</span>
        </div>
      </div>
    </div>
  );
}
