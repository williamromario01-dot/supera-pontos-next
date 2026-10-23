import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { enforceRateLimits, getRateLimitClientId } from "@/lib/rate-limit";
import { ensurePushIndexes, hashPushEndpoint, parsePushSubscription } from "@/lib/push-subscriptions";

const DB_NAME = "supera_pontos";
const rules = (request: NextRequest, userId: string) => [{ namespace: "push-subscription", identity: `${getRateLimitClientId(request)}:${userId}`, limit: 20, windowMs: 60 * 60_000 }];

async function studentContext(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  if (result.auth.role !== "student" || !result.auth.schoolId) return { response: NextResponse.json({ error: "Disponível somente para alunos vinculados a uma escola." }, { status: 403 }) };
  const limited = await enforceRateLimits(rules(request, result.auth.userId.toString()), "closed");
  if (limited) return { response: limited };
  return { auth: result.auth };
}

export async function POST(request: NextRequest) {
  const context = await studentContext(request); if ("response" in context) return context.response;
  const body = await request.json();
  const subscription = parsePushSubscription(body.subscription);
  if (!subscription) return NextResponse.json({ error: "Subscription inválida." }, { status: 400 });
  const now = new Date(); const endpointHash = hashPushEndpoint(subscription.endpoint);
  const db = (await clientPromise).db(DB_NAME);
  await ensurePushIndexes(db);
  const existing = await db.collection("pushSubscriptions").findOne({ endpointHash }, { projection: { userId: 1 } });
  if (existing && !existing.userId?.equals(context.auth.userId)) return NextResponse.json({ error: "Este dispositivo já está vinculado a outra conta." }, { status: 409 });
  await db.collection("pushSubscriptions").updateOne({ endpointHash }, { $set: {
    userId: context.auth.userId, schoolId: context.auth.schoolId, endpoint: subscription.endpoint, keys: subscription.keys,
    expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null, active: true, updatedAt: now, lastUsedAt: now,
  }, $setOnInsert: { createdAt: now } }, { upsert: true });
  return NextResponse.json({ active: true });
}

export async function PUT(request: NextRequest) {
  const context = await studentContext(request); if ("response" in context) return context.response;
  const body = await request.json();
  if (typeof body.endpoint !== "string" || body.endpoint.length > 2048 || !body.endpoint.startsWith("https://")) return NextResponse.json({ error: "Endpoint inválido." }, { status: 400 });
  const db = (await clientPromise).db(DB_NAME);
  const subscription = await db.collection("pushSubscriptions").findOne({ endpointHash: hashPushEndpoint(body.endpoint), userId: context.auth.userId, schoolId: context.auth.schoolId, active: true }, { projection: { _id: 1 } });
  return NextResponse.json({ active: Boolean(subscription) });
}

export async function DELETE(request: NextRequest) {
  const context = await studentContext(request); if ("response" in context) return context.response;
  const body = await request.json();
  if (typeof body.endpoint !== "string" || body.endpoint.length > 2048 || !body.endpoint.startsWith("https://")) return NextResponse.json({ error: "Endpoint inválido." }, { status: 400 });
  const db = (await clientPromise).db(DB_NAME);
  await db.collection("pushSubscriptions").updateOne(
    { endpointHash: hashPushEndpoint(body.endpoint), userId: context.auth.userId, schoolId: context.auth.schoolId },
    { $set: { active: false, disabledAt: new Date(), updatedAt: new Date() }, $unset: { endpoint: "", keys: "" } },
  );
  return NextResponse.json({ active: false });
}
