import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import { runExemption } from "@/lib/billing-exemption-lifecycle";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");
  if (!expected || !supplied || Buffer.byteLength(supplied) !== Buffer.byteLength(`Bearer ${expected}`) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(`Bearer ${expected}`))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const db = (await clientPromise).db(DB_NAME);
  const now = new Date();
  const rows = await db.collection("subscriptions").find({ $or: [
    { "billingExemption.status": "scheduled", "billingExemption.startsAt": { $lte: now } },
    { "billingExemption.status": "active", "billingExemption.endsAt": { $type: "date", $lt: now } },
    { "billingExemption.status": { $in: ["resume_pending", "suspending"] } },
    { "billingExemption.reconciliationRequired": true },
  ] }).limit(20).toArray();
  let completed = 0, pending = 0;
  for (const sub of rows) {
    try { await runExemption(db, sub, "billing-exemption-reconciler", { reconcile: true }); completed++; }
    catch { pending++; }
  }
  return NextResponse.json({ completed, pending, hasMore: rows.length === 20 });
}

export const GET = POST;
