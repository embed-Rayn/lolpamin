// The group writes a birth year as two digits ("94", "01"). Below 30 reads as the 2000s —
// nobody in the group was born in the 1920s, and a 2030s birth year is not a member.
export function fullBirthYear(year: number): number | null {
  if (!Number.isInteger(year) || year < 0) return null;
  if (year >= 1900) return year;
  if (year >= 100) return null;
  return year < 30 ? 2000 + year : 1900 + year;
}

const BIRTH_YEAR_INPUT_ERROR = "출생연도를 두 자리(예: 94) 또는 네 자리로 입력해 주세요.";

/**
 * An admin's typed birth year. Stored as two digits, the way imports fill Member.age from the
 * nickname, so a hand-entered value and an imported one look the same. Empty clears the column
 * and the screens fall back to the nickname.
 */
export function parseBirthYearInput(raw: string): { ok: true; age: number | null } | { ok: false; error: string } {
  const text = raw.trim();
  if (text === "") return { ok: true, age: null };
  if (!/^(\d{2}|\d{4})$/.test(text)) return { ok: false, error: BIRTH_YEAR_INPUT_ERROR };
  const full = fullBirthYear(Number(text));
  if (full === null) return { ok: false, error: BIRTH_YEAR_INPUT_ERROR };
  return { ok: true, age: full % 100 };
}

/** Two digits ("94", "01"), the way the group writes it in nicknames. */
export function birthYearLabel(birthYear: number | null): string {
  return birthYear === null ? "-" : String(birthYear % 100).padStart(2, "0");
}
