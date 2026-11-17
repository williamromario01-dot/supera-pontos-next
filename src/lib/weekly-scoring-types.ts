export const WEEKLY_SCORING_TIME_ZONE = "America/Sao_Paulo" as const;

/** Configuration copied into the first weekly record and immutable afterwards. */
export interface WeeklyScoringConfigurationSnapshot {
  readonly schoolId: string;
  readonly categoryId: string;
  readonly targetQuantity: number;
  readonly maximumPoints: number;
  readonly frozenAt: Date;
}

/** Identity of a Monday-to-Sunday activity week in the official time zone. */
export interface ActivityWeek {
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly startsAt: Date;
  readonly endsAtExclusive: Date;
  readonly closesAt: Date;
  readonly timeZone: typeof WEEKLY_SCORING_TIME_ZONE;
}

/** Inputs required to calculate a category's cumulative weekly total. */
export interface ProportionalPointsInput {
  readonly approvedQuantity: number;
  readonly targetQuantity: number;
  readonly maximumPoints: number;
}

/** An auditable delta; a negative value represents points to be reversed. */
export interface PointsDifference {
  readonly previouslyCreditedPoints: number;
  readonly newlyCalculatedPoints: number;
  readonly difference: number;
}
