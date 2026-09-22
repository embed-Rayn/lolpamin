import { NavIcon, type NavIconName } from "./nav-icons";

export interface StatCardProps {
  label: string;
  value: number | string;
  unit: string;
  colorClassName: string;
  // With an icon the card takes the reference layout: a tinted icon tile on the
  // left, label over the number on the right. Without one it stays a plain tile.
  icon?: NavIconName;
  // Tint for the icon glyph; defaults to the accent colour.
  iconClassName?: string;
  // Background of the icon tile; defaults to the accent tint.
  tileClassName?: string;
  description?: string;
}

export function StatCard({
  label,
  value,
  unit,
  colorClassName,
  icon,
  iconClassName,
  tileClassName,
  description,
}: StatCardProps) {
  if (!icon) {
    return (
      <div className="flex flex-col gap-1.5 rounded-[11px] border border-ink/[.06] bg-surface px-4 py-3.5">
        <div className="text-[12px] font-medium text-faint">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[23px] font-bold tracking-tight ${colorClassName}`}>{value}</span>
          <span className="text-[12px] text-faint">{unit}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-ink/[.06] bg-surface px-4 py-4 shadow-[0_1px_2px_rgb(var(--c-ink)/0.04)] md:gap-5 md:px-6 md:py-5">
      <div
        className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl md:h-[72px] md:w-[72px] ${
          tileClassName ?? "bg-accent-tint"
        } ${iconClassName ?? "text-accent"}`}
      >
        <NavIcon name={icon} size={34} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-[13px] font-medium text-muted md:text-[14px]">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className={`text-[28px] font-extrabold leading-none tracking-tight md:text-[36px] ${colorClassName}`}>
            {value}
          </span>
          <span className="text-[13px] text-faint md:text-[14px]">{unit}</span>
        </div>
        {description && <div className="truncate text-[12.5px] text-faint md:text-[13px]">{description}</div>}
      </div>
      <NavIcon name="chevron-down" size={16} className="ml-auto flex-none -rotate-90 text-ghost" />
    </div>
  );
}
