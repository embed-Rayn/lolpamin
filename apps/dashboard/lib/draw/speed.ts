// 뽑기 연출의 재생 속도. 슬라이더 한 칸이 어디에 있든 같은 배율을 곱하도록 로그스케일로
// 잡는다 — 선형이면 1x 아래(0.01~1)가 슬라이더의 4분의 1에 몰려 느린 쪽을 고를 수 없다.

export const MIN_SPEED = 0.01;
export const MAX_SPEED = 4;

// 슬라이더에 이름표를 붙일 자리. 값 자체는 연속이고 이 눈금에 붙지는 않는다.
export const SPEED_TICKS = [0.125, 0.25, 0.5, 1, 2] as const;

// 한 프레임이 가져갈 수 있는 실제 경과 시간의 상한. 탭을 가려두면 rAF가 멈췄다가 수 초짜리
// delta로 돌아오는데, 그대로 시뮬레이션하면 레이스가 한 프레임에 껑충 뛴다.
export const MAX_FRAME_MS = 100;

const RANGE = MAX_SPEED / MIN_SPEED;

function clamp01(t: number): number {
  if (!(t > 0)) return 0;
  return t > 1 ? 1 : t;
}

export function sliderToSpeed(t: number): number {
  return MIN_SPEED * RANGE ** clamp01(t);
}

export function speedToSlider(speed: number): number {
  return clamp01(Math.log(speed / MIN_SPEED) / Math.log(RANGE));
}

/** localStorage에서 읽은 값은 무엇이든 올 수 있으므로 범위 안으로 가둔다. */
export function clampSpeed(speed: number): number {
  if (Number.isNaN(speed)) return 1;
  if (speed < MIN_SPEED) return MIN_SPEED;
  if (speed > MAX_SPEED) return MAX_SPEED;
  return speed;
}

/** 이번 프레임이 시뮬레이션할 시간. 실제 경과에 배속을 곱하고 상한을 씌운다. */
export function frameBudget(realDeltaMs: number, speed: number): number {
  if (!(realDeltaMs > 0)) return 0;
  return Math.min(realDeltaMs, MAX_FRAME_MS) * speed;
}

/**
 * 쌓인 예산에서 고정 크기 물리 스텝을 꺼낸다. 스텝 크기를 배속에 따라 바꾸지 않는 것이
 * 중요하다 — 승자를 레이스 물리가 결정하므로, 스텝이 달라지면 같은 판이 배속에 따라 다른
 * 사람을 뽑는다.
 */
export function drainBudget(
  budgetMs: number,
  stepMs: number,
  maxSteps: number,
): { steps: number; rest: number } {
  if (stepMs <= 0 || maxSteps <= 0) return { steps: 0, rest: 0 };

  const wanted = Math.floor(budgetMs / stepMs);
  // 상한에 걸리면 남은 예산은 버린다. 들고 있으면 다음 프레임도 똑같이 상한에 걸려
  // 영영 따라잡지 못하고 예산만 늘어난다.
  if (wanted >= maxSteps) return { steps: maxSteps, rest: 0 };

  return { steps: wanted, rest: budgetMs - wanted * stepMs };
}
