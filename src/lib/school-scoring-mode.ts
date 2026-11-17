import { ObjectId, type ClientSession, type Db, type Document, type MongoClient } from "mongodb";

import { getNextScoringModeEffectiveAt } from "./weekly-calendar.ts";

export const SCORING_MODE_COLLECTION = "schoolScoringModeChanges";
export type SchoolScoringMode = "legacy" | "automatic";
export type ScoringModeActorRole = "admin" | "super_admin";

export class ScoringModeAuthorizationError extends Error {}
export class ScoringModeConflictError extends Error {}
export class ScoringModeValidationError extends Error {}
export class SpecialPointBonusValidationError extends Error {}

export interface SchoolScoringModeChange {
  readonly _id: ObjectId;
  readonly companyId: ObjectId;
  readonly schoolId: ObjectId;
  readonly previousMode: SchoolScoringMode;
  readonly futureMode: SchoolScoringMode;
  readonly requestedBy: ObjectId;
  readonly requestedByRole: ScoringModeActorRole;
  readonly requestedAt: Date;
  readonly effectiveAt: Date;
  readonly idempotencyKey: string;
}

type ServiceDb = Pick<Db, "collection">;
type ServiceClient = Pick<MongoClient, "startSession">;

export const SCORING_MODE_INDEXES = [
  { keys: { schoolId: 1, effectiveAt: -1 } as const, options: { name: "school_scoring_mode_effective" } },
  { keys: { schoolId: 1, effectiveAt: 1 } as const, options: { name: "school_scoring_mode_one_change_per_effective_date", unique: true } },
  { keys: { schoolId: 1, idempotencyKey: 1 } as const, options: { name: "school_scoring_mode_idempotency", unique: true } },
] as const;

export function automaticActivityScoringEnabled(
  environment: { readonly AUTOMATIC_ACTIVITY_SCORING_ENABLED?: string } = process.env as { readonly AUTOMATIC_ACTIVITY_SCORING_ENABLED?: string },
): boolean {
  return environment.AUTOMATIC_ACTIVITY_SCORING_ENABLED === "true";
}

export function activityApprovalsEnabled(
  environment: { readonly ACTIVITY_APPROVALS_ENABLED?: string } = process.env as { readonly ACTIVITY_APPROVALS_ENABLED?: string },
): boolean {
  return environment.ACTIVITY_APPROVALS_ENABLED === "true";
}

export function scoringModeConfigurationEnabled(
  environment: { readonly SCORING_MODE_CONFIGURATION_ENABLED?: string } = process.env as { readonly SCORING_MODE_CONFIGURATION_ENABLED?: string },
): boolean {
  return environment.SCORING_MODE_CONFIGURATION_ENABLED === "true";
}

/** Special 100-point bonuses are explicitly tagged and never routed through either pedagogical engine. */
export function isSpecialPointBonus(category: Document, points: number): boolean {
  return category.scoringKind === "special_bonus" && points === 100;
}

/** Explicit classification, fixed value and request idempotency are all mandatory. */
export function resolveSpecialPointBonusIdempotencyKey(
  category: Document,
  points: number,
  value: unknown,
): string | null {
  if (category.scoringKind !== "special_bonus") return null;
  if (points !== 100) throw new SpecialPointBonusValidationError("BÃ´nus especiais devem ter exatamente 100 pontos.");
  const key = typeof value === "string" ? value.trim() : "";
  if (key.length < 8 || key.length > 160) throw new SpecialPointBonusValidationError("Informe uma chave de idempotÃªncia vÃ¡lida para o bÃ´nus especial.");
  return key;
}

export async function getEffectiveSchoolScoringMode(
  db: ServiceDb,
  schoolId: ObjectId,
  at: Date = new Date(),
  session?: ClientSession,
): Promise<SchoolScoringMode> {
  const change = await db.collection<SchoolScoringModeChange>(SCORING_MODE_COLLECTION).findOne(
    { schoolId, effectiveAt: { $lte: at } },
    { sort: { effectiveAt: -1 }, session },
  );
  return change?.futureMode ?? "legacy";
}

export async function requireSchoolScoringMode(
  db: ServiceDb,
  schoolId: ObjectId,
  required: SchoolScoringMode,
  at: Date = new Date(),
  session?: ClientSession,
): Promise<void> {
  const effective = await getEffectiveSchoolScoringMode(db, schoolId, at, session);
  if (effective !== required) throw new ScoringModeConflictError(`school scoring mode is ${effective}; ${required} engine is not allowed`);
}

export interface ScheduleScoringModeInput {
  readonly companyId: ObjectId;
  readonly schoolId: ObjectId;
  readonly actorId: ObjectId;
  readonly actorRole: ScoringModeActorRole;
  readonly futureMode: SchoolScoringMode;
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export async function scheduleSchoolScoringMode(
  client: ServiceClient,
  db: ServiceDb,
  input: ScheduleScoringModeInput,
): Promise<{ duplicate: boolean; change: SchoolScoringModeChange }> {
  if (![input.companyId, input.schoolId, input.actorId].every((value) => value instanceof ObjectId)) throw new ScoringModeValidationError("companyId, schoolId and actorId must be ObjectIds");
  if (input.actorRole !== "admin" && input.actorRole !== "super_admin") throw new ScoringModeAuthorizationError("profile cannot change the scoring mode");
  if (input.futureMode !== "legacy" && input.futureMode !== "automatic") throw new ScoringModeValidationError("invalid scoring mode");
  const key = input.idempotencyKey?.trim();
  if (!key || key.length < 8 || key.length > 160) throw new ScoringModeValidationError("idempotencyKey must contain 8 to 160 characters");
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new ScoringModeValidationError("now must be valid");
  const effectiveAt = getNextScoringModeEffectiveAt(now);
  const session = client.startSession();
  let outcome: { duplicate: boolean; change: SchoolScoringModeChange } | null = null;
  try {
    await session.withTransaction(async () => {
      const schools = db.collection("schools");
      const changes = db.collection<SchoolScoringModeChange>(SCORING_MODE_COLLECTION);
      const school = await schools.findOne({ _id: input.schoolId, companyId: input.companyId, active: { $ne: false }, status: { $ne: "archived" } }, { session });
      if (!school) throw new ScoringModeAuthorizationError("school is outside the authorized company");
      const duplicate = await changes.findOne({ schoolId: input.schoolId, idempotencyKey: key }, { session });
      if (duplicate) {
        if (!duplicate.requestedBy.equals(input.actorId) || duplicate.futureMode !== input.futureMode) throw new ScoringModeConflictError("idempotency key belongs to another request");
        outcome = { duplicate: true, change: duplicate };
        return;
      }
      const scheduled = await changes.findOne({ schoolId: input.schoolId, effectiveAt }, { session });
      if (scheduled) throw new ScoringModeConflictError("a scoring mode change is already scheduled for this effective date");
      const previousMode = await getEffectiveSchoolScoringMode(db, input.schoolId, effectiveAt, session);
      if (previousMode === input.futureMode) throw new ScoringModeConflictError("requested mode is already scheduled or effective");
      const change: SchoolScoringModeChange = {
        _id: new ObjectId(), companyId: input.companyId, schoolId: input.schoolId,
        previousMode, futureMode: input.futureMode, requestedBy: input.actorId,
        requestedByRole: input.actorRole, requestedAt: now, effectiveAt, idempotencyKey: key,
      };
      await changes.insertOne(change, { session });
      outcome = { duplicate: false, change };
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new ScoringModeConflictError("scoring mode request conflicts with an existing request");
    throw error;
  } finally { await session.endSession(); }
  if (!outcome) throw new ScoringModeConflictError("scoring mode transaction produced no result");
  return outcome;
}

export function serializeScoringModeChange(change: SchoolScoringModeChange): Document {
  return { ...change, _id: change._id.toHexString(), companyId: change.companyId.toHexString(), schoolId: change.schoolId.toHexString(), requestedBy: change.requestedBy.toHexString() };
}
