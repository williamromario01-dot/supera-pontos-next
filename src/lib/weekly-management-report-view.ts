export type VariationKind = "quantity" | "percentagePoints";
export type VariationDirection = "higherIsBetter" | "neutral";

export function calculateVariation(current: number | null | undefined, previous: number | null | undefined, kind: VariationKind, direction: VariationDirection = "neutral") {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  if (kind === "quantity" && previous === 0) return null;
  const value = kind === "percentagePoints" ? current - previous : ((current - previous) / Math.abs(previous)) * 100;
  const trend = value > 0 ? "up" : value < 0 ? "down" : "stable";
  const sentiment = direction === "neutral" || trend === "stable" ? "neutral" : (trend === "up" ? "positive" : "negative");
  return { value, trend, sentiment, suffix: kind === "percentagePoints" ? "p.p." : "%" } as const;
}

export function isoWeekNumber(civilDate: string): number {
  const [year, month, day] = civilDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

export function immediatelyPrecedes(previousWeekStart: string | undefined, currentWeekStart: string): boolean {
  if (!previousWeekStart) return false;
  const [year, month, day] = previousWeekStart.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10) === currentWeekStart;
}
