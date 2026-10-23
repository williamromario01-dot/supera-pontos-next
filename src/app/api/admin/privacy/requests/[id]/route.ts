import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { DB_NAME } from "@/lib/saas";
import { enforceRateLimits, getRateLimitClientId, rateLimitRules } from "@/lib/rate-limit";

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  requested: ["in_review", "rejected"],
  in_review: ["completed", "rejected"],
  completed: [],
  rejected: [],
};

type PrivacyRequestDocument = {
  _id: ObjectId;
  companyId: ObjectId;
  status: string;
  statusHistory?: Array<{ status: string; at: Date; by: ObjectId }>;
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role !== "super_admin") return NextResponse.json({ error: "Acesso exclusivo do super administrador." }, { status: 403 });
  const limited = await enforceRateLimits(rateLimitRules("privacy-request", getRateLimitClientId(request), result.auth.userId.toString()), "closed");
  if (limited) return limited;
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const status = String(body.status ?? "");
  const resolution = String(body.resolution ?? "").trim();
  if (!["in_review", "completed", "rejected"].includes(status) || resolution.length > 2000) return NextResponse.json({ error: "Atualização inválida." }, { status: 400 });
  if ((status === "completed" || status === "rejected") && !resolution) return NextResponse.json({ error: "Informe a resolução da solicitação." }, { status: 400 });
  const db = (await clientPromise).db(DB_NAME);
  const requestId = new ObjectId(id);
  const privacyRequests = db.collection<PrivacyRequestDocument>("privacyRequests");
  const current = await privacyRequests.findOne({ _id: requestId }, { projection: { status: 1, companyId: 1 } });
  if (!current) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  if (!ALLOWED_TRANSITIONS[String(current.status)]?.includes(status)) return NextResponse.json({ error: "Transição de status não permitida." }, { status: 409 });
  const now = new Date();
  const set: Record<string, unknown> = { status, handledBy: result.auth.userId, updatedAt: now };
  if (resolution) set.resolution = resolution;
  if (status === "in_review") set.reviewedAt = now;
  if (status === "completed") set.completedAt = now;
  if (status === "rejected") set.rejectedAt = now;
  const updated = await privacyRequests.updateOne(
    { _id: requestId, companyId: current.companyId, status: current.status },
    { $set: set, $push: { statusHistory: { status, at: now, by: result.auth.userId } } },
  );
  if (updated.modifiedCount !== 1) return NextResponse.json({ error: "A solicitação foi alterada por outro processo." }, { status: 409 });
  return NextResponse.json({ request: { id, companyId: current.companyId, status, resolution: resolution || null, updatedAt: now } });
}
