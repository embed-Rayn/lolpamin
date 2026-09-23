// YYYY-MM-DD in the server's local time — the value an <input type="date"> shows and
// what parseLastActiveInput reads back.
export function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
