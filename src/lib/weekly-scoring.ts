import type {
  PointsDifference,
  ProportionalPointsInput,
} from "./weekly-scoring-types.ts";

function requireNonNegativeFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative finite number`);
  }
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
}

/**
 * Calculates the cumulative points earned by an approved quantity in one week.
 * The result is always rounded up and capped at the configured maximum.
 */
export function calculateProportionalPoints({
  approvedQuantity,
  targetQuantity,
  maximumPoints,
}: ProportionalPointsInput): number {
  requireNonNegativeFinite(approvedQuantity, "approvedQuantity");
  requireNonNegativeInteger(maximumPoints, "maximumPoints");
  if (!Number.isFinite(targetQuantity) || targetQuantity <= 0) {
    throw new RangeError("targetQuantity must be a positive finite number");
  }

  if (approvedQuantity === 0 || maximumPoints === 0) return 0;
  return Math.min(
    maximumPoints,
    Math.ceil((approvedQuantity * maximumPoints) / targetQuantity),
  );
}

/** Calculates the event delta, preserving negative differences for corrections. */
export function calculatePointsDifference(
  previouslyCreditedPoints: number,
  newlyCalculatedPoints: number,
): PointsDifference {
  requireNonNegativeInteger(previouslyCreditedPoints, "previouslyCreditedPoints");
  requireNonNegativeInteger(newlyCalculatedPoints, "newlyCalculatedPoints");

  return {
    previouslyCreditedPoints,
    newlyCalculatedPoints,
    difference: newlyCalculatedPoints - previouslyCreditedPoints,
  };
}
