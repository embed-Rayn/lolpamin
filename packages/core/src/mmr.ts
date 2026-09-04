export const MMR_K = 40;

// Everyone who shows up gains a bonus on top of the win/loss swing, so playing
// is always worth something and winning is worth a little more. It makes the
// system deliberately non-zero-sum.
export const WIN_POINT = 3;
export const LOSS_POINT = 1;

export type TeamSide = "BLUE" | "RED";

// The tunable half of the formula. Stored in the database and edited on /admins;
// the constants above are only the fallback for a database that has no row yet.
export interface MmrConfig {
  k: number;
  winPoint: number;
  lossPoint: number;
}

export const DEFAULT_MMR_CONFIG: MmrConfig = {
  k: MMR_K,
  winPoint: WIN_POINT,
  lossPoint: LOSS_POINT,
};

export const MMR_K_MIN = 1;
export const MMR_K_MAX = 200;
export const MMR_POINT_MIN = 0;
export const MMR_POINT_MAX = 50;

interface ConfigField {
  // 붙여 쓸 조사까지 담아 둔다 — "K값은"과 "승리 점수는"는 받침이 달라 조립으로 만들 수 없다.
  subject: string;
  value: (config: MmrConfig) => number;
  min: number;
  max: number;
}

const CONFIG_FIELDS: ConfigField[] = [
  { subject: "K값은", value: (c) => c.k, min: MMR_K_MIN, max: MMR_K_MAX },
  { subject: "승리 점수는", value: (c) => c.winPoint, min: MMR_POINT_MIN, max: MMR_POINT_MAX },
  { subject: "패배 점수는", value: (c) => c.lossPoint, min: MMR_POINT_MIN, max: MMR_POINT_MAX },
];

/**
 * Returns every problem with a config, as Korean messages ready for the form.
 * An empty array means the config is usable.
 */
export function validateMmrConfig(config: MmrConfig): string[] {
  const errors: string[] = [];

  for (const field of CONFIG_FIELDS) {
    const value = field.value(config);
    if (!Number.isInteger(value)) {
      errors.push(`${field.subject} 정수여야 합니다`);
    } else if (value < field.min || value > field.max) {
      errors.push(`${field.subject} ${field.min} 이상 ${field.max} 이하여야 합니다`);
    }
  }

  // 패점이 승점보다 크면 지는 쪽이 더 벌어 승리 유인이 뒤집힌다. 두 값 각각은
  // 범위 안이라 개별 검사로는 잡힐 수 없어 조합으로 따로 막는다.
  if (errors.length === 0 && config.lossPoint > config.winPoint) {
    errors.push("패배 점수는 승리 점수보다 클 수 없습니다");
  }

  return errors;
}

export interface TeamMmrInput {
  blueRatings: number[];
  redRatings: number[];
  winner: TeamSide;
  config?: MmrConfig;
}

export interface TeamMmrResult {
  blueDelta: number;
  redDelta: number;
  expectedBlueWinRate: number;
}

function average(ratings: number[]): number {
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

export function calculateTeamMmrChange({
  blueRatings,
  redRatings,
  winner,
  config = DEFAULT_MMR_CONFIG,
}: TeamMmrInput): TeamMmrResult {
  if (blueRatings.length === 0 || redRatings.length === 0) {
    throw new Error("Both teams must have at least one player");
  }

  const blueAvg = average(blueRatings);
  const redAvg = average(redRatings);
  const expectedBlueWinRate = 1 / (1 + Math.pow(10, (redAvg - blueAvg) / 400));

  const blueScore = winner === "BLUE" ? 1 : 0;
  const redScore = 1 - blueScore;

  const bluePoint = winner === "BLUE" ? config.winPoint : config.lossPoint;
  const redPoint = winner === "RED" ? config.winPoint : config.lossPoint;

  const blueDelta = Math.round(config.k * (blueScore - expectedBlueWinRate)) + bluePoint;
  const redDelta = Math.round(config.k * (redScore - (1 - expectedBlueWinRate))) + redPoint;

  return { blueDelta, redDelta, expectedBlueWinRate };
}

// Quarterly soft reset: every rating is pulled halfway back to the base, so the
// season's standings survive as an ordering while the gaps compress and a new
// quarter is winnable for everyone.
export const SOFT_RESET_BASE = 1000;
export const SOFT_RESET_RATIO = 0.5;

export function applySoftReset(mmr: number): number {
  return Math.round(SOFT_RESET_BASE + (mmr - SOFT_RESET_BASE) * SOFT_RESET_RATIO);
}
