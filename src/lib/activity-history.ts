import { ObjectId, type Db, type Document } from "mongodb";

import { ACTIVITY_COLLECTIONS } from "./activity-persistence-types.ts";

function sameId(left: unknown, right: unknown) {
  return left != null && right != null && String(left) === String(right);
}

function timestamp(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value ?? 0));
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

export function resolveActivityCreditedPoints(activity: Document, audits: Document[], pointEvents: Document[]): number | null {
  const activityAudits = audits
    .filter((audit) => sameId(audit.activityRecordId, activity._id) && audit.type !== "adjustment_cancelled")
    .sort((left, right) => timestamp(right.occurredAt) - timestamp(left.occurredAt));
  const latestAudit = activityAudits[0];

  if (latestAudit?.pointEventId) {
    const officialEvent = pointEvents.find((event) => sameId(event._id, latestAudit.pointEventId));
    if (Number.isFinite(Number(officialEvent?.points))) return Number(officialEvent?.points);
  }
  if (latestAudit && Number.isFinite(Number(latestAudit.creditedPointsDelta))) {
    return Number(latestAudit.creditedPointsDelta);
  }

  const latestOfficialEvent = pointEvents
    .filter((event) => sameId(event.activityRecordId, activity._id) && Number.isFinite(Number(event.points)))
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))[0];
  if (latestOfficialEvent) return Number(latestOfficialEvent.points);

  if (activity.status === "pending" || activity.status === "rejected") return 0;
  return null;
}

export async function loadActivityCreditedPoints(db: Db, activities: Document[]) {
  const objectIds = activities.map((activity) => String(activity._id)).filter(ObjectId.isValid).map((id) => new ObjectId(id));
  if (objectIds.length === 0) return new Map<string, number | null>();
  const variants: Array<ObjectId | string> = objectIds.flatMap((id) => [id, id.toHexString()]);
  const [audits, pointEvents] = await Promise.all([
    db.collection(ACTIVITY_COLLECTIONS.auditEvents).find({ activityRecordId: { $in: variants } }).toArray(),
    db.collection("pointEvents").find({ activityRecordId: { $in: variants }, source: "weekly_activity" }).toArray(),
  ]);
  return new Map(activities.map((activity) => [
    String(activity._id),
    resolveActivityCreditedPoints(activity, audits, pointEvents),
  ]));
}
