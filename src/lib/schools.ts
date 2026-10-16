import type { Document, Filter, ObjectId } from "mongodb";

export function isSchoolArchived(school: unknown): boolean {
  return Boolean(
    school &&
    typeof school === "object" &&
    (school as Record<string, unknown>).status === "archived",
  );
}

export function isSchoolActive(school: unknown): boolean {
  if (!school || typeof school !== "object") return false;
  const record = school as Record<string, unknown>;
  return record.status !== "archived" && record.active !== false;
}

export function activeSchoolFilter(companyId?: ObjectId): Filter<Document> {
  return {
    ...(companyId ? { companyId } : {}),
    status: { $ne: "archived" },
    active: { $ne: false },
  };
}
