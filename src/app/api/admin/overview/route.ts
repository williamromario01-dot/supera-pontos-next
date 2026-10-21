import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { DB_NAME } from "@/lib/saas";
import type { Collection, Document } from "mongodb";

export const dynamic = "force-dynamic";

async function grouped(collection: Collection<Document>, field: string) {
  return collection.aggregate<{ _id: string | null; count: number }>([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }]).toArray();
}

export async function GET(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (result.auth.role !== "super_admin") return NextResponse.json({ error: "Acesso exclusivo do super administrador." }, { status: 403 });
    const db = (await clientPromise).db(DB_NAME);
    const [companies, companyStatuses, subscriptions, schoolsActive, schoolsArchived, admins, educators, students, categories, classes, scores, incompleteOnboarding, pastDue, scheduledCancellation, noSchool, pendingPrivacy] = await Promise.all([
      db.collection("companies").countDocuments(), grouped(db.collection("companies"), "status"), grouped(db.collection("subscriptions"), "status"),
      db.collection("schools").countDocuments({ active: { $ne: false } }), db.collection("schools").countDocuments({ active: false }),
      db.collection("users").countDocuments({ role: { $in: ["company_admin", "admin"] } }), db.collection("users").countDocuments({ role: "educator" }), db.collection("users").countDocuments({ role: "student" }),
      db.collection("categories").countDocuments(), db.collection("classes").countDocuments(), db.collection("pointEvents").countDocuments(),
      db.collection("companies").countDocuments({ onboardingState: { $nin: ["completed"] } }), db.collection("subscriptions").countDocuments({ status: "past_due" }),
      db.collection("subscriptions").countDocuments({ status: "cancellation_scheduled" }),
      db.collection("companies").aggregate([{ $lookup: { from: "schools", localField: "_id", foreignField: "companyId", as: "schools" } }, { $match: { "schools.0": { $exists: false } } }, { $count: "count" }]).toArray(),
      db.collection("privacyRequests").countDocuments({ status: { $in: ["requested", "in_review"] } }),
    ]);
    const map = (items: Array<{ _id: string | null; count: number }>) => Object.fromEntries(items.map((item) => [item._id ?? "unknown", item.count]));
    return NextResponse.json({ totals: { companies, schoolsActive, schoolsArchived, admins, educators, students, categories, classes, scoreEntries: scores }, byStatus: { companies: map(companyStatuses), subscriptions: map(subscriptions) }, attention: { incompleteOnboarding, pastDue, scheduledCancellation, companiesWithoutSchool: noSchool[0]?.count ?? 0, pendingPrivacy } });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os indicadores." }, { status: 500 });
  }
}
