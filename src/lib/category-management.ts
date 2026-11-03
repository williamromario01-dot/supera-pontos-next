import { ObjectId, type Db, type Document, type ClientSession } from "mongodb";
import { isProtectedLegacyCategory, categoryBelongsToSchool, normalizeCategoryName, getCategoryScopeFilter } from "@/lib/category-scope";

export class CategoryConflict extends Error {}

export async function ensureCategoryManagementIndexes(db: Db) {
  await db.collection("categories").createIndex({ categoryNameKey: 1 }, { unique: true, name: "category_name_per_school", partialFilterExpression: { categoryNameKey: { $type: "string" } } });
}

export function resolvedCategoryType(category: Document): "official" | "extra" | null {
  // Only explicit, valid classifications are trusted. Names and creation dates are not types.
  for (const value of [category.categoryType, category.type]) {
    if (value === "official" || value === "extra") return value;
  }
  return null;
}

export function isSharedCategory(category: Document & { _id: unknown }) {
  return isProtectedLegacyCategory(category) && !ObjectId.isValid(String(category.schoolId));
}

export async function categoryOverride(db: Db, schoolId: ObjectId, categoryId: ObjectId, session?: ClientSession) {
  return db.collection("categoryOverrides").findOne({ schoolId, categoryId }, { session });
}

export async function operationalCategories<T extends Document & { _id: ObjectId }>(db: Db, schoolId: ObjectId, categories: T[]): Promise<T[]> {
  const local = await Promise.all(categories.map(async category => ({ ...category, ...(isSharedCategory(category) ? await categoryOverride(db, schoolId, category._id) : null), _id: category._id })));
  return local.filter(category => category.active !== false);
}

// All category mutations and new historical references contend on the same school document.
// MongoDB retries write conflicts; no process-local lock or check-then-delete race is used.
export async function lockCategorySchool(db: Db, schoolId: ObjectId, session: ClientSession) {
  const result = await db.collection("schools").updateOne(
    { _id: schoolId, active: { $ne: false }, status: { $ne: "archived" } },
    { $inc: { categoryRevision: 1 } }, { session },
  );
  if (result.matchedCount !== 1) throw new CategoryConflict("A unidade não está disponível para alterações.");
}

export async function activeAttendanceId(db: Db, schoolId: ObjectId, session?: ClientSession) {
  const school = await db.collection("schools").findOne({ _id: schoolId }, { session });
  if (school && Object.hasOwn(school, "attendanceCategoryId")) return school.attendanceCategoryId ? String(school.attendanceCategoryId) : null;
  const legacy = await db.collection("categories").findOne({ attendanceSchoolKey: String(schoolId), isAttendance: true, active: { $ne: false } }, { session });
  return legacy ? String(legacy._id) : null;
}

export async function saveManagedCategory(db: Db, schoolId: ObjectId, category: Document & { _id: ObjectId }, fields: Document, expectedAttendance: unknown, session: ClientSession) {
  await lockCategorySchool(db, schoolId, session);
  const current = await db.collection("categories").findOne({ _id: category._id }, { session });
  if (!current || !categoryBelongsToSchool(current, schoolId)) throw new CategoryConflict("A categoria mudou ou não está mais disponível. Recarregue a lista.");
  const local = isSharedCategory(current) ? await db.collection("categoryOverrides").findOne({ schoolId, categoryId: category._id }, { session }) : null;
  const effective = { ...current, ...local };
  const { expectedVersion, ...changes } = fields;
  if (expectedVersion !== undefined && expectedVersion !== (effective.managementVersion ?? 0)) throw new CategoryConflict("Outra pessoa alterou esta categoria. Recarregue antes de salvar.");
  if (changes.isAttendance === true && (changes.active ?? effective.active) === false) throw new CategoryConflict("Reative a categoria antes de configurar a frequencia.");
  if (changes.name !== undefined) {
    const candidates = await db.collection("categories").find(getCategoryScopeFilter(schoolId), { session }).toArray();
    for (const candidate of candidates) {
      if (String(candidate._id) === String(category._id)) continue;
      const override = isSharedCategory(candidate) ? await db.collection("categoryOverrides").findOne({ schoolId, categoryId: candidate._id }, { session }) : null;
      if (normalizeCategoryName(String(override?.name ?? candidate.name)) === normalizeCategoryName(String(changes.name))) throw new CategoryConflict("Ja existe outra categoria com esse nome nesta unidade.");
    }
  }
  const attendanceId = await activeAttendanceId(db, schoolId, session);
  // Preserve the old selection even when an older client edits only the name.
  await db.collection("schools").updateOne({ _id: schoolId }, { $set: { attendanceCategoryId: attendanceId ? new ObjectId(attendanceId) : null } }, { session });
  if (fields.isAttendance !== undefined || fields.active === false) {
    if (expectedAttendance !== undefined && expectedAttendance !== attendanceId) throw new CategoryConflict("A categoria de frequência foi alterada por outra pessoa. Recarregue e confirme novamente.");
    const selecting = fields.isAttendance === true && fields.active !== false;
    if (selecting && attendanceId && attendanceId !== String(category._id) && expectedAttendance === undefined) throw new CategoryConflict("Já existe uma categoria de frequência. Confirme a substituição da atual.");
    if (selecting && attendanceId && attendanceId !== String(category._id)) {
      const previous = await db.collection("categories").findOne({ _id: new ObjectId(attendanceId) }, { session });
      if (previous && categoryBelongsToSchool(previous, schoolId)) {
        if (isSharedCategory(previous)) {
          await db.collection<Document & { _id: string }>("categoryOverrides").updateOne({ _id: `${schoolId}:${attendanceId}` }, { $set: { schoolId, categoryId: previous._id, isAttendance: false, attendanceSchoolKey: null } }, { upsert: true, session });
        } else {
          await db.collection("categories").updateOne({ _id: previous._id }, { $set: { isAttendance: false, attendanceSchoolKey: null } }, { session });
        }
      }
    }
    if (selecting || attendanceId === String(category._id)) {
      await db.collection("schools").updateOne({ _id: schoolId }, { $set: { attendanceCategoryId: selecting ? category._id : null } }, { session });
    }
  }
  // The school pointer is canonical. Never reuse the old unique key inside a transaction.
  const update: Document = { ...changes, managementVersion: (effective.managementVersion ?? 0) + 1, attendanceSchoolKey: null, categoryNameKey: `${schoolId}:${normalizeCategoryName(String(fields.name ?? current.name))}` };
  if (fields.isAttendance === true) update.attendanceHistoryProtected = true;
  if (isSharedCategory(current)) {
    await db.collection<Document & { _id: string }>("categoryOverrides").updateOne(
      { _id: `${schoolId}:${category._id}` },
      { $set: { ...update, schoolId, categoryId: category._id } }, { upsert: true, session },
    );
  } else {
    await db.collection("categories").updateOne({ _id: category._id }, { $set: update }, { session });
  }
}

export async function deleteManagedCategory(db: Db, schoolId: ObjectId, categoryId: ObjectId, session: ClientSession) {
  await lockCategorySchool(db, schoolId, session);
  const category = await db.collection("categories").findOne({ _id: categoryId }, { session });
  if (!category || !categoryBelongsToSchool(category, schoolId)) throw new CategoryConflict("A categoria mudou. Recarregue a lista.");
  if (isSharedCategory(category)) throw new CategoryConflict("Categoria compartilhada: personalize ou arquive apenas nesta unidade. O original está protegido.");
  if (await activeAttendanceId(db, schoolId, session) === String(categoryId)) throw new CategoryConflict("Esta é a categoria de frequência da unidade. Desmarque ou substitua antes de excluir ou arquivar.");
  const references = [categoryId, String(categoryId)];
  // Include legacy collections and closed report snapshots without modifying any history.
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const { name } of collections) {
    if (["categories", "categoryOverrides"].includes(name) || name.startsWith("system.")) continue;
    const dependency = await db.collection(name).findOne({ $or: [
      { categoryId: { $in: references } }, { categoryIds: { $in: references } },
      { "items.categoryId": { $in: references } }, { "categories.categoryId": { $in: references } },
      { "categories.id": { $in: references } }, { "goals.categoryId": { $in: references } },
      { "categoryMetrics.categoryId": { $in: references } },
      { "studentMetrics.categoryMetrics.categoryId": { $in: references } },
    ] }, { session, projection: { _id: 1 } });
    if (dependency) throw new CategoryConflict(`Esta categoria possui histórico ou dependências (${name}). Use Arquivar categoria para preservar os registros.`);
  }
  const result = await db.collection("categories").deleteOne({ _id: categoryId }, { session });
  if (result.deletedCount !== 1) throw new CategoryConflict("Não foi possível excluir a categoria. Recarregue a lista.");
}
