import { ObjectId, type Document, type Filter } from "mongodb";
import { getSchoolObjectId } from "@/lib/auth";

export const LEGACY_CATEGORY_SCHOOL_ID =
  "6ab7dd70428f96c0cae8f35c";

const LEGACY_CATEGORY_IDS = [
  "6aaec880615f95e32eb71819",
  "6aaec880615f95e32eb7181a",
  "6aaec881615f95e32eb7181b",
  "6aaec881615f95e32eb7181c",
  "6ac3b84d693951ab9696a54b",
] as const;

const legacyCategoryIdSet = new Set<string>(LEGACY_CATEGORY_IDS);
const legacyCategoryObjectIds = LEGACY_CATEGORY_IDS.map(
  (id) => new ObjectId(id),
);

export function isProtectedLegacyCategory(
  category: Pick<Document, "_id">,
): boolean {
  return legacyCategoryIdSet.has(String(category._id));
}

export function getEffectiveCategorySchoolId(
  category: Pick<Document, "_id"> & { schoolId?: unknown },
): ObjectId | null {
  const persistedSchoolId = getSchoolObjectId(category.schoolId);
  if (persistedSchoolId) return persistedSchoolId;
  if (isProtectedLegacyCategory(category)) {
    return new ObjectId(LEGACY_CATEGORY_SCHOOL_ID);
  }
  return null;
}

export function categoryBelongsToSchool(
  category: Pick<Document, "_id"> & { schoolId?: unknown },
  schoolId: ObjectId,
): boolean {
  return Boolean(
    getEffectiveCategorySchoolId(category)?.equals(schoolId),
  );
}

export function getCategoryScopeFilter(
  schoolId: ObjectId,
): Filter<Document> {
  const filters: Filter<Document>[] = [
    { schoolId: { $in: [schoolId, schoolId.toString()] } },
  ];

  if (schoolId.toString() === LEGACY_CATEGORY_SCHOOL_ID) {
    filters.push({ _id: { $in: legacyCategoryObjectIds } });
  }

  return { $or: filters };
}

export function normalizeCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase("pt-BR");
}

export function buildScopedCategorySlug(
  schoolId: ObjectId,
  name: string,
): string {
  const nameSlug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "categoria";

  return `${schoolId.toString()}-${nameSlug}`;
}
