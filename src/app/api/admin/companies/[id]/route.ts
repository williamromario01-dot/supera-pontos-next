import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { DB_NAME } from "@/lib/saas";

const mask = (value: unknown) => { const text = String(value ?? ""); return text.length > 8 ? `${text.slice(0, 4)}…${text.slice(-4)}` : text ? "••••" : null; };

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (auth.auth.role !== "super_admin") return NextResponse.json({ error: "Acesso exclusivo do super administrador." }, { status: 403 });
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  const companyId = new ObjectId(id);
  const db = (await clientPromise).db(DB_NAME);
  const [company, subscription, schools, users, billingEvents, privacyRequests] = await Promise.all([
    db.collection("companies").findOne({ _id: companyId }, { projection: { legalName: 1, tradeName: 1, cnpj: 1, email: 1, phone: 1, status: 1, onboardingState: 1, createdAt: 1, legalAcceptance: 1 } }),
    db.collection("subscriptions").findOne({ companyId }, { sort: { createdAt: -1 }, projection: { status: 1, planCode: 1, requestedMaxUnits: 1, maxUnits: 1, unitCount: 1, pricePerUnitCents: 1, totalMonthlyCents: 1, providerCustomerId: 1, providerSubscriptionId: 1, createdAt: 1 } }),
    db.collection("schools").find({ companyId }, { projection: { name: 1, active: 1, createdAt: 1 } }).toArray(),
    db.collection("users").find({ companyId }, { projection: { name: 1, email: 1, role: 1, schoolId: 1, active: 1, createdAt: 1 } }).limit(500).toArray(),
    db.collection("billingEvents").find({ companyId }, { projection: { type: 1, status: 1, providerEventId: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(100).toArray(),
    db.collection("privacyRequests").find({ companyId }, { projection: { type: 1, status: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(100).toArray(),
  ]);
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const safeSubscription = subscription ? { ...subscription, providerCustomerId: mask(subscription.providerCustomerId), providerSubscriptionId: mask(subscription.providerSubscriptionId) } : null;
  return NextResponse.json({ company, subscription: safeSubscription, schools, users, billingEvents: billingEvents.map((item) => ({ ...item, providerEventId: mask(item.providerEventId) })), privacyRequests });
}
