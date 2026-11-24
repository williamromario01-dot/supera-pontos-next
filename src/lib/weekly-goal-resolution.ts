import { ObjectId, type ClientSession, type Db, type Document } from "mongodb";

const variants = (id: ObjectId) => [id, id.toHexString()];

export type WeeklyGoalResolution = { targetQuantity: number; unit: string | null; source: "student" | "class" | "school" | "category_default" };

function itemFrom(goal: Document | null, categoryId: ObjectId) {
  const item = Array.isArray(goal?.items) ? goal.items.find((row: Document) => String(row.categoryId) === categoryId.toHexString()) : null;
  return item && typeof item.goal === "number" && Number.isFinite(item.goal) && item.goal > 0 ? item : null;
}

export async function resolveWeeklyGoal(
  db: Pick<Db, "collection">,
  input: { schoolId: ObjectId; studentId: ObjectId; categoryId: ObjectId; weekStart: string; category: Document; session?: ClientSession },
): Promise<WeeklyGoalResolution> {
  const { schoolId, studentId, categoryId, weekStart, category, session } = input;
  const goals = db.collection("weeklyGoals");
  const individual = await goals.findOne({ schoolId: { $in: variants(schoolId) }, weekStart, studentId: { $in: variants(studentId) } }, { session });
  const individualItem = itemFrom(individual, categoryId);
  if (individualItem) return { targetQuantity: individualItem.goal, unit: individualItem.unit ?? null, source: "student" };

  const classes = await db.collection("classes").find({ schoolId: { $in: variants(schoolId) }, studentIds: { $in: variants(studentId) }, active: { $ne: false } }, { projection: { _id: 1 }, session }).toArray();
  if (classes.length) {
    const classGoal = await goals.findOne({ schoolId: { $in: variants(schoolId) }, weekStart, classId: { $in: classes.flatMap((row) => variants(row._id as ObjectId)) } }, { session });
    const classItem = itemFrom(classGoal, categoryId);
    if (classItem) return { targetQuantity: classItem.goal, unit: classItem.unit ?? null, source: "class" };
  }

  const schoolGoal = await goals.findOne({ schoolId: { $in: variants(schoolId) }, weekStart, $or: [{ classId: null }, { classId: { $exists: false } }], studentId: { $exists: false } }, { session });
  const schoolItem = itemFrom(schoolGoal, categoryId);
  if (schoolItem) return { targetQuantity: schoolItem.goal, unit: schoolItem.unit ?? null, source: "school" };
  const fallback = Number(category.weeklyGoal);
  if (!Number.isFinite(fallback) || fallback <= 0) throw new Error("Nenhuma meta semanal válida foi configurada para esta categoria.");
  return { targetQuantity: fallback, unit: typeof category.unit === "string" ? category.unit : null, source: "category_default" };
}
