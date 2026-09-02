export interface PlinkoPlan {
  // One ±1 per pin row. Multiplied by the pin spacing they are the ball's
  // horizontal hops.
  steps: (-1 | 1)[];
  // Leftover pixels the steps cannot express (the target rarely sits on an exact
  // multiple of the spacing). The renderer folds this into the last row so the
  // ball still lands dead centre in the slot.
  drift: number;
}

export function buildPlinkoPlan(
  rows: number,
  spacing: number,
  dx: number,
  nextIndex: (n: number) => number
): PlinkoPlan {
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new RangeError(`rows must be a positive integer, got ${rows}`);
  }

  // dx = (right - left) * spacing, with right + left = rows.
  const rightCount = clamp(Math.round((dx / spacing + rows) / 2), 0, rows);
  const steps: (-1 | 1)[] = [
    ...Array<1>(rightCount).fill(1),
    ...Array<-1>(rows - rightCount).fill(-1),
  ];
  shuffle(steps, nextIndex);

  const reached = steps.reduce((sum, s) => sum + s * spacing, 0);
  return { steps, drift: dx - reached };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shuffle<T>(items: T[], nextIndex: (n: number) => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextIndex(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}
