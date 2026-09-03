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
      className={`flex items-center gap-2 rounded-lg py-1.5 pl-3 pr-2.5 text-[13.5px] transition-colors ${
        active ? "bg-[#20293A] text-white font-bold" : "text-[#95A0B2] font-medium hover:bg-[#1B2130] hover:text-[#E6EAF2]"
      }`}
    >
      <span className={`w-6 flex-none font-mono text-[12px] ${active ? "text-[#8FB4F5]" : "text-[#4E576A]"}`}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="rounded-full bg-[#ED7D31]/[.16] px-1.5 py-0.5 font-mono text-[12px] font-bold text-[#F2985C]">
          {badge}
        </span>
      )}
    </Link>
  );
}

export interface NavGroupLinkProps {
  href: string;
  number: string;
  label: string;
  active: boolean;
}

// A group heading. It is a link, not a label: clicking "1" lands on 1.1. `active`
// means the current page is somewhere inside the group, so the heading stays lit
// while one of its children is selected.
export function NavGroupLink({ href, number, label, active }: NavGroupLinkProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-bold tracking-wide transition-colors ${
        active ? "text-[#D5DEEC]" : "text-[#5C6577] hover:text-[#95A0B2]"
      }`}
    >
      <span className={`w-3 flex-none font-mono ${active ? "text-[#8FB4F5]" : "text-[#4E576A]"}`}>{number}</span>
      <span className="flex-1">{label}</span>
    </Link>
  );
}
