export interface StatCardProps {
  label: string;
  value: number | string;
  unit: string;
  colorClassName: string;
}

export function StatCard({ label, value, unit, colorClassName }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[11px] border border-white/[.06] bg-[#151A24] px-4 py-3.5">
      <div className="text-[12px] font-medium text-[#7A8496]">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono text-[23px] font-bold tracking-tight ${colorClassName}`}>{value}</span>
        <span className="text-[12px] text-[#6E7889]">{unit}</span>
      </div>
    </div>
  );
}
