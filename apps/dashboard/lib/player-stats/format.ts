export function formatAvg(value: number): string {
  return value.toFixed(1);
}

export function formatKda(kda: number | null): string {
  return kda === null ? "Perfect" : kda.toFixed(2);
}

export function formatInt(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
