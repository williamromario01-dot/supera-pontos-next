import { ObjectId, type Db, type Document } from "mongodb";
import webpush from "web-push";
import { addCivilDays } from "@/lib/planner";
import { ensurePushIndexes } from "@/lib/push-subscriptions";
import { getCivilDateInTimeZone, isWeeklyOccurrence, parseReminderMinutes, PLANNER_REMINDER_MINUTES, plannerDeliveryId, reminderScheduledAt, type PlannerReminderMinutes } from "@/lib/planner-reminder-core";

type ProcessingSummary = { events: number; deliveries: number; sent: number; invalid: number; temporaryFailures: number; skipped: number };
type DeliveryDocument = { _id: string; status: string; attempts: number; leaseExpiresAt?: Date; nextAttemptAt?: Date; sentAt?: Date; createdAt: Date; updatedAt: Date };

export function getPushServerConfiguration() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export async function resolvePlannerRecipientIds(db: Db, event: Document): Promise<ObjectId[]> {
  const schoolId = event.schoolId instanceof ObjectId ? event.schoolId : new ObjectId(String(event.schoolId));
  if (event.type === "personal") {
    const studentId = event.studentId instanceof ObjectId ? event.studentId : ObjectId.isValid(String(event.studentId)) ? new ObjectId(String(event.studentId)) : null;
    if (!studentId) return [];
    const student = await db.collection("users").findOne({ _id: studentId, schoolId: { $in: [schoolId, schoolId.toString()] }, role: "student", active: { $ne: false } }, { projection: { _id: 1 } });
    return student ? [studentId] : [];
  }
  if (event.audience === "class") {
    const classId = event.classId instanceof ObjectId ? event.classId : ObjectId.isValid(String(event.classId)) ? new ObjectId(String(event.classId)) : null;
    if (!classId) return [];
    const classDocument = await db.collection("classes").findOne({ _id: classId, schoolId: { $in: [schoolId, schoolId.toString()] } }, { projection: { studentIds: 1 } });
    const studentIds = Array.isArray(classDocument?.studentIds) ? classDocument.studentIds.flatMap((value: unknown) => ObjectId.isValid(String(value)) ? [new ObjectId(String(value))] : []) : [];
    if (!studentIds.length) return [];
    const students = await db.collection("users").find({ _id: { $in: studentIds }, schoolId: { $in: [schoolId, schoolId.toString()] }, role: "student", active: { $ne: false } }, { projection: { _id: 1 } }).toArray();
    return students.map((student) => student._id);
  }
  const students = await db.collection("users").find({ schoolId: { $in: [schoolId, schoolId.toString()] }, role: "student", active: { $ne: false } }, { projection: { _id: 1 } }).toArray();
  return students.map((student) => student._id);
}

function occurrenceDates(event: Document, firstDate: string, lastDate: string): string[] {
  const dates: string[] = [];
  for (let date = firstDate; date <= lastDate; date = addCivilDays(date, 1)) {
    if (event.recurrence === "weekly" ? isWeeklyOccurrence(String(event.startDate), date, typeof event.recurrenceEnd === "string" ? event.recurrenceEnd : null) : date === event.startDate) dates.push(date);
  }
  return dates;
}

function notificationPayload(event: Document, occurrenceDate: string, reminderMinutes: PlannerReminderMinutes) {
  const when = reminderMinutes === 0 ? "agora" : reminderMinutes === 1440 ? "amanhã" : `em ${reminderMinutes} minutos`;
  const prefix = event.type === "personal" ? "🧠" : "📢";
  const context = event.type === "personal" ? "Sua atividade" : event.audience === "class" ? "Evento da sua turma" : "Evento da unidade";
  return JSON.stringify({ type: "planner_reminder", title: `${prefix} ${String(event.title).slice(0, 90)} ${when}`, body: `${context} começa às ${event.startTime}.`, eventId: event._id.toString(), url: `/planner?eventId=${event._id.toString()}&date=${occurrenceDate}`, tag: `planner-${event._id}-${occurrenceDate}-${reminderMinutes}` });
}

async function claimDelivery(db: Db, id: string, base: Record<string, unknown>, now: Date): Promise<boolean> {
  const deliveries = db.collection<DeliveryDocument>("plannerReminderDeliveries");
  try {
    await deliveries.insertOne({ _id: id, ...base, status: "processing", attempts: 1, leaseExpiresAt: new Date(now.getTime() + 2 * 60_000), createdAt: now, updatedAt: now } as DeliveryDocument);
    return true;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("E11000")) throw error;
    const claimed = await deliveries.findOneAndUpdate(
      { _id: id, $or: [{ status: "temporary_failure", nextAttemptAt: { $lte: now } }, { status: "processing", leaseExpiresAt: { $lte: now } }] },
      { $set: { status: "processing", leaseExpiresAt: new Date(now.getTime() + 2 * 60_000), updatedAt: now }, $inc: { attempts: 1 }, $unset: { nextAttemptAt: "" } },
      { returnDocument: "after" },
    );
    return Boolean(claimed);
  }
}

export async function processPlannerReminders(db: Db, now = new Date()): Promise<ProcessingSummary> {
  const configuration = getPushServerConfiguration();
  if (!configuration) throw new Error("PUSH_NOT_CONFIGURED");
  webpush.setVapidDetails(configuration.subject, configuration.publicKey, configuration.privateKey);
  await ensurePushIndexes(db);
  const deliveries = db.collection<DeliveryDocument>("plannerReminderDeliveries");
  const summary: ProcessingSummary = { events: 0, deliveries: 0, sent: 0, invalid: 0, temporaryFailures: 0, skipped: 0 };
  const firstDate = getCivilDateInTimeZone(new Date(now.getTime() - 5 * 60_000));
  const lastDate = getCivilDateInTimeZone(new Date(now.getTime() + 1450 * 60_000));
  const events = await db.collection("plannerEvents").find({ completed: { $ne: true }, reminderMinutes: { $in: [...PLANNER_REMINDER_MINUTES] }, startDate: { $lte: lastDate }, $or: [{ recurrence: "once", startDate: { $gte: firstDate } }, { recurrence: "weekly", $or: [{ recurrenceEnd: null }, { recurrenceEnd: { $gte: firstDate } }] }] }).toArray();
  summary.events = events.length;
  for (const event of events) {
    const reminderMinutes = parseReminderMinutes(event.reminderMinutes);
    if (reminderMinutes === null || reminderMinutes === undefined || typeof event.startTime !== "string") continue;
    for (const occurrenceDate of occurrenceDates(event, firstDate, lastDate)) {
      const scheduledAt = reminderScheduledAt(occurrenceDate, event.startTime, reminderMinutes);
      if (scheduledAt.getTime() < now.getTime() - 5 * 60_000 || scheduledAt.getTime() > now.getTime() + 60_000) continue;
      const userIds = await resolvePlannerRecipientIds(db, event);
      if (!userIds.length) continue;
      const subscriptions = await db.collection("pushSubscriptions").find({ userId: { $in: userIds }, schoolId: { $in: [event.schoolId, event.schoolId.toString()] }, active: true }).toArray();
      for (const subscription of subscriptions) {
        const id = plannerDeliveryId({ eventId: event._id.toString(), occurrenceDate, userId: subscription.userId.toString(), subscriptionId: subscription._id.toString(), reminderMinutes, scheduledAt });
        const base = { eventId: event._id, occurrenceDate, userId: subscription.userId, schoolId: event.schoolId, subscriptionId: subscription._id, reminderMinutes, scheduledAt };
        if (!(await claimDelivery(db, id, base, now))) { summary.skipped += 1; continue; }
        summary.deliveries += 1;
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, notificationPayload(event, occurrenceDate, reminderMinutes), { TTL: 60 * 60 });
          await deliveries.updateOne({ _id: id }, { $set: { status: "sent", sentAt: new Date(), updatedAt: new Date() }, $unset: { leaseExpiresAt: "", nextAttemptAt: "" } });
          await db.collection("pushSubscriptions").updateOne({ _id: subscription._id }, { $set: { lastSuccessAt: new Date(), updatedAt: new Date() } });
          summary.sent += 1;
        } catch (error) {
          const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
          if (statusCode === 404 || statusCode === 410) {
            await db.collection("pushSubscriptions").updateOne({ _id: subscription._id, userId: subscription.userId }, { $set: { active: false, disabledAt: new Date(), updatedAt: new Date() }, $unset: { endpoint: "", keys: "" } });
            await deliveries.updateOne({ _id: id }, { $set: { status: "subscription_invalid", updatedAt: new Date() }, $unset: { leaseExpiresAt: "" } });
            summary.invalid += 1;
          } else {
            await deliveries.updateOne({ _id: id }, { $set: { status: "temporary_failure", nextAttemptAt: new Date(now.getTime() + 30_000), updatedAt: new Date() }, $unset: { leaseExpiresAt: "" } });
            summary.temporaryFailures += 1;
          }
        }
      }
    }
  }
  return summary;
}
