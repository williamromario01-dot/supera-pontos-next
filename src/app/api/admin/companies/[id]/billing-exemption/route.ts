import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import {
  ALLOWED_EXEMPTION_MONTHS,
  calculateMonthsEnd,
  parseDateOnly,
  type BillingExemptionType,
} from "@/lib/billing-exemption";
import { ExemptionError, inspectExemptionProvider, parseExemptionDecision, runExemption } from "@/lib/billing-exemption-lifecycle";

type Context = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest, id: string) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) {
    return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }
  if (result.auth.role !== "super_admin") {
    return {
      response: NextResponse.json(
        { error: "Acesso exclusivo do super administrador." },
        { status: 403 },
      ),
    };
  }
  if (!ObjectId.isValid(id)) {
    return { response: NextResponse.json({ error: "Empresa inválida." }, { status: 400 }) };
  }
  return { auth: result.auth, companyId: new ObjectId(id) };
}

function parseGrant(body: unknown, now: Date) {
  if (!body || typeof body !== "object") return null;
  const item = body as Record<string, unknown>;
  if (item.confirm !== true) return null;
  const type = item.type as BillingExemptionType;
  const reason = typeof item.reason === "string" ? item.reason.trim() : "";
  const startsAt = parseDateOnly(item.startsAt);
  if (!["period", "months", "indefinite"].includes(type) || !startsAt || reason.length < 3 || reason.length > 500) {
    return null;
  }
  let endsAt: Date | null = null;
  let months: number | null = null;
  if (type === "period") {
    endsAt = parseDateOnly(item.endsAt, true);
    if (!endsAt || endsAt < startsAt) return null;
  } else if (type === "months") {
    months = Number(item.months);
    if (!ALLOWED_EXEMPTION_MONTHS.includes(months as typeof ALLOWED_EXEMPTION_MONTHS[number])) {
      return null;
    }
    endsAt = calculateMonthsEnd(startsAt, months);
  }
  return {
    type,
    reason,
    startsAt,
    endsAt,
    months,
    initialStatus: startsAt > now ? "scheduled" as const : "active" as const,
  };
}

async function upsertExemption(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const authorization = await authorize(request, id);
  if ("response" in authorization) return authorization.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const now = new Date();
  const item = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const reconcile = item.action === "reconcile" && item.confirm === true;
  const grant = reconcile ? undefined : parseGrant(body, now);
  if (!grant && !reconcile) {
    return NextResponse.json(
      { error: "Dados inválidos ou confirmação explícita ausente." },
      { status: 400 },
    );
  }
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const [company, subscription] = await Promise.all([
    db.collection("companies").findOne({ _id: authorization.companyId }),
    db.collection("subscriptions").findOne(
      { companyId: authorization.companyId },
      { sort: { createdAt: -1 } },
    ),
  ]);
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  if (!subscription) return NextResponse.json({ error: "Assinatura local não encontrada." }, { status: 409 });

  try {
    const decision = item.decision === undefined ? undefined : parseExemptionDecision(item.decision);
    if (decision === null) return NextResponse.json({ error: "Política de cobranças inválida." }, { status: 400 });
    const result = await runExemption(db, subscription, authorization.auth.userId, { grant: grant ?? undefined, decision, reconcile });
    return NextResponse.json({ ...result, message: `Estado da isenção: ${result.status}.` });
  } catch (error) { return failure(error); }
}

export const POST = upsertExemption;
export const PATCH = upsertExemption;

function failure(error: unknown) {
  return NextResponse.json({ error: "Operação não concluída. Revise a situação do provedor.", code: error instanceof ExemptionError ? error.code : "EXEMPTION_RECONCILIATION_REQUIRED" }, { status: error instanceof ExemptionError ? error.status : 503 });
}

export async function GET(request: NextRequest, context: Context) {
  const authorization = await authorize(request, (await context.params).id);
  if ("response" in authorization) return authorization.response;
  const db = (await clientPromise).db(DB_NAME);
  const subscription = await db.collection("subscriptions").findOne({ companyId: authorization.companyId }, { sort: { createdAt: -1 } });
  if (!subscription) return NextResponse.json({ error: "Assinatura local não encontrada." }, { status: 404 });
  try { return NextResponse.json(await inspectExemptionProvider(db, subscription)); } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest, context: Context) {
  const authorization = await authorize(request, (await context.params).id);
  if ("response" in authorization) return authorization.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const item = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (item.confirm !== true || typeof item.reason !== "string" || item.reason.trim().length < 3 || item.reason.length > 500) return NextResponse.json({ error: "Motivo e confirmação obrigatórios." }, { status: 400 });
  const db = (await clientPromise).db(DB_NAME);
  const subscription = await db.collection("subscriptions").findOne({ companyId: authorization.companyId }, { sort: { createdAt: -1 } });
  if (!subscription) return NextResponse.json({ error: "Assinatura local não encontrada." }, { status: 404 });
  try {
    const result = await runExemption(db, subscription, authorization.auth.userId, { endReason: item.reason });
    return NextResponse.json({ ...result, message: "Isenção encerrada; retomada verificada sem cobrança retroativa." });
  } catch (error) { return failure(error); }
}
