import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { DB_NAME, normalizeDigits } from "@/lib/saas";

const ALLOWED_KEYS = new Set(["legalName", "tradeName", "phone", "address", "responsible"]);
const FORBIDDEN_KEYS = new Set(["_id", "companyId", "status", "cnpj", "subscription", "subscriptionId", "providerCustomerId", "providerSubscriptionId", "providerPaymentId", "requestedMaxUnits", "maxUnits", "unitCount", "quantityChange", "role", "active", "createdAt"]);

export async function PATCH(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { auth } = result;
    if (auth.role !== "company_admin" || !auth.companyId) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const companyId = auth.companyId;
    const body = await request.json();
    if (!body || typeof body !== "object" || Object.keys(body).some((key) => FORBIDDEN_KEYS.has(key) || !ALLOWED_KEYS.has(key))) return NextResponse.json({ error: "Campo não permitido." }, { status: 400 });
    const legalName = String(body.legalName ?? "").trim();
    const tradeName = String(body.tradeName ?? "").trim();
    const phone = normalizeDigits(body.phone);
    const address = String(body.address ?? "").trim();
    const responsibleName = String(body.responsible?.name ?? "").trim();
    const responsiblePhone = normalizeDigits(body.responsible?.phone);
    if (!legalName || legalName.length > 180 || !tradeName || tradeName.length > 180 || !responsibleName || responsibleName.length > 150 || address.length > 300 || phone.length < 10 || phone.length > 13 || responsiblePhone.length < 10 || responsiblePhone.length > 13) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    if (Object.keys(body.responsible ?? {}).some((key) => !["name", "phone"].includes(key))) return NextResponse.json({ error: "Campo não permitido." }, { status: 400 });
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const now = new Date();
        const company = await db.collection("companies").updateOne({ _id: companyId }, { $set: { legalName, tradeName, phone, address, "responsible.name": responsibleName, "responsible.phone": responsiblePhone, updatedAt: now } }, { session });
        const user = await db.collection("users").updateOne({ _id: auth.userId, companyId: companyId, role: "company_admin" }, { $set: { name: responsibleName, phone: responsiblePhone, updatedAt: now } }, { session });
        if (company.matchedCount !== 1 || user.matchedCount !== 1) throw new Error("PROFILE_NOT_FOUND");
      });
    } finally { await session.endSession(); }
    return NextResponse.json({ message: "Dados cadastrais atualizados." });
  } catch (error) {
    if (error instanceof Error && error.message === "PROFILE_NOT_FOUND") return NextResponse.json({ error: "Cadastro não encontrado." }, { status: 404 });
    return NextResponse.json({ error: "Erro interno ao atualizar cadastro." }, { status: 500 });
  }
}