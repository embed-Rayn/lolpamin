"use client";

export interface SortSelectOption {
  value: string;
  label: string;
}

// 카드 목록 위에 놓는 폰 전용 정렬 셀렉트. 표 헤더의 정렬 링크를 누를 곳이 없는 폰에서
// <select> 하나로 기준과 방향을 함께 고른다. value가 옵션 목록에 없으면(예: PC 헤더에서
// 셀렉트에 없는 조합으로 정렬해 둔 채 폰으로 들어온 경우) 첫 옵션을 선택 상태로 보여
// 준다 — parseMemberSort류가 모르는 URL 값을 기본값으로 접는 것과 같은 규칙이다.
export function SortSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SortSelectOption[];
  onChange: (value: string) => void;
}) {
  const selected = options.some((o) => o.value === value) ? value : options[0].value;
  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      aria-label="정렬 기준"
      className="w-full rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
