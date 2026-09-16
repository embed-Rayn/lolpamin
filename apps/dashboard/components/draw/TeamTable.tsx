import type { TeamAssignment } from "@lolpamin/core";

const COLUMNS = [
  { key: "blue", label: "BLUE", color: "text-[#6FA8FF]", bg: "bg-[#16233A]" },
  { key: "red", label: "RED", color: "text-[#FF7A7A]", bg: "bg-[#3A1A1E]" },
] as const;

// Team draw result: two columns that fill top-down as marbles come home, so
// the table is readable mid-race as well as at the end.
export function TeamTable({ teams }: { teams: TeamAssignment }) {
  const rows = Math.max(teams.blue.length, teams.red.length);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/[.07] bg-[#12161F] p-4">
      <div className="text-[12px] font-bold tracking-wider text-[#5C6577]">팀 배정</div>
      <div className="grid grid-cols-2 gap-1.5">
        {COLUMNS.map((col) => (
          <div key={col.key} className={`rounded-lg py-1.5 text-center text-[12px] font-extrabold tracking-widest ${col.bg} ${col.color}`}>
            {col.label}
          </div>
        ))}
        {rows === 0 ? (
          <div className="col-span-2 py-6 text-center text-[13px] text-[#6E7889]">
            아직 뽑지 않았습니다.
          </div>
        ) : (
          Array.from({ length: rows }, (_, i) =>
            COLUMNS.map((col) => {
              const member = teams[col.key][i];
              return (
                <div
                  key={`${col.key}-${i}`}
                  className={`truncate rounded-lg px-2.5 py-2 text-center text-[14px] font-semibold ${
                    member ? "bg-[#161B26] text-[#E6EAF2]" : "bg-[#0E1117] text-[#3A4150]"
                  }`}
                >
                  {member?.label ?? "—"}
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}
