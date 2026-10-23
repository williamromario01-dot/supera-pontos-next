import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { DB_NAME } from "@/lib/saas";
import { PRIVACY_VERSION, TERMS_VERSION, requiresLegalReacceptance } from "@/lib/legal";

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role !== "company_admin" || !result.auth.companyId) return NextResponse.json({ error: "Acesso restrito ao administrador empresarial." }, { status: 403 });
  const companyId = result.auth.companyId;
  const db = (await clientPromise).db(DB_NAME);
  const company = await db.collection("companies").findOne(
    { _id: companyId },
    { projection: { legalAcceptance: 1 } },
  );
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const history = await db.collection("legalAcceptances").find(
    { companyId },
    { projection: { termsVersion: 1, privacyVersion: 1, acceptedAt: 1, acceptedByRole: 1, source: 1 } },
  ).sort({ acceptedAt: -1 }).limit(25).toArray();
  return NextResponse.json({
    current: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    accepted: company.legalAcceptance ?? null,
    reacceptanceRequired: requiresLegalReacceptance(company.legalAcceptance),
    history,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role !== "company_admin" || !result.auth.companyId) return NextResponse.json({ error: "Acesso restrito ao administrador empresarial." }, { status: 403 });
  const companyId = result.auth.companyId;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (body.acceptsTerms !== true || body.acceptsPrivacy !== true) return NextResponse.json({ error: "Os dois aceites são obrigatórios." }, { status: 400 });
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const company = await db.collection("companies").findOne(
    { _id: companyId },
    { projection: { legalAcceptance: 1 } },
  );
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  if (!requiresLegalReacceptance(company.legalAcceptance)) return NextResponse.json({ message: "As versões vigentes já estão aceitas.", reacceptanceRequired: false });
  const now = new Date();
  const legalAcceptance = {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    acceptedAt: now,
    acceptedByUserId: result.auth.userId,
    acceptedByEmail: String(result.auth.user.email ?? ""),
    acceptedByRole: "company_admin",
    companyId,
    source: "company_reacceptance",
  };
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection("legalAcceptances").insertOne(legalAcceptance, { session });
      await db.collection("companies").updateOne(
        { _id: companyId },
        { $set: { legalAcceptance, updatedAt: now } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return NextResponse.json({ message: "Aceite registrado.", reacceptanceRequired: false });
}
