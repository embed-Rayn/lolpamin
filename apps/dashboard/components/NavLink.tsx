import Link from "next/link";

export interface NavLinkProps {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: string;
}

export function NavLink({ href, label, icon, active, badge }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
        active ? "bg-[#20293A] text-white font-bold" : "text-[#95A0B2] font-medium hover:bg-[#1B2130] hover:text-[#E6EAF2]"
      }`}
    >
      <span className={`w-4 text-center font-mono text-[11px] ${active ? "text-[#8FB4F5]" : "text-[#4E576A]"}`}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="rounded-full bg-[#ED7D31]/[.16] px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-[#F2985C]">
          {badge}
        </span>
      )}
    </Link>
  );
}
