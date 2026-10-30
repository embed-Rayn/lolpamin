import { parseTaskLine } from "./meeting-note-tasks";

const unchecked = (line: string) => (parseTaskLine(line) ? line.replace(/\[[xX]\]/, "[ ]") : line);

// When a save is refused because the note moved, and all that moved was checkbox state (a
// tick from the view page or the task board), carry those ticks into my edited body instead
// of making me resolve a conflict. null means the server changed more than checkboxes.
// A tick lands only on a line of mine holding the same task text in the same state the base
// had, and only when exactly one such line exists. A tick it cannot place (I reworded the
// task, or two lines share its text) is counted in `skipped` — saving anyway would revert it
// silently, so the caller must not auto-save when skipped > 0. A task I already set the same
// way counts as neither.
export function rebaseMeetingNoteToggles(
  baseBody: string,
  serverBody: string,
  myBody: string,
): { body: string; applied: number; skipped: number } | null {
  const base = baseBody.split(/\r?\n/);
  const server = serverBody.split(/\r?\n/);
  if (base.length !== server.length) return null;
  if (base.some((line, i) => unchecked(line) !== unchecked(server[i]))) return null;

  const mine = myBody.split(/(\r?\n)/);
  let applied = 0;
  let skipped = 0;
  base.forEach((line, i) => {
    const before = parseTaskLine(line);
    const after = parseTaskLine(server[i]);
    if (!before || !after || before.checked === after.checked) return;
    const matches: number[] = [];
    let alreadySet = false;
    for (let j = 0; j < mine.length; j += 2) {
      const own = parseTaskLine(mine[j]);
      if (!own || own.rest !== before.rest) continue;
      if (own.checked === before.checked) matches.push(j);
      else alreadySet = true;
    }
    if (matches.length !== 1) {
      if (!(matches.length === 0 && alreadySet)) skipped += 1;
      return;
    }
    mine[matches[0]] = mine[matches[0]].replace(/\[[ xX]\]/, after.checked ? "[x]" : "[ ]");
    applied += 1;
  });
  return { body: mine.join(""), applied, skipped };
}
