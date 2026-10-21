import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { DB_NAME } from "@/lib/saas";

const SAFE_USER = { name: 1, email: 1, phone: 1, role: 1, schoolId: 1, companyId: 1, active: 1, createdAt: 1 } as const;

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role !== "company_admin" || !result.auth.companyId) return NextResponse.json({ error: "Acesso restrito ao administrador empresarial." }, { status: 403 });
  const db = (await clientPromise).db(DB_NAME);
  const companyId = result.auth.companyId;
  const [company, schools, users, subscriptions, privacyRequests] = await Promise.all([
    db.collection("companies").findOne({ _id: companyId }, { projection: { legalName: 1, tradeName: 1, cnpj: 1, email: 1, phone: 1, "responsible.name": 1, "responsible.email": 1, "responsible.phone": 1, "responsible.role": 1, status: 1, legalAcceptance: 1, createdAt: 1 } }),
    db.collection("schools").find({ companyId }, { projection: { name: 1, active: 1, createdAt: 1 } }).toArray(),
    db.collection("users").find({ companyId }, { projection: SAFE_USER }).toArray(),
    db.collection("subscriptions").find({ companyId }, { projection: { planCode: 1, status: 1, requestedMaxUnits: 1, maxUnits: 1, unitCount: 1, createdAt: 1 } }).toArray(),
    db.collection("privacyRequests").find({ companyId }, { projection: { type: 1, status: 1, createdAt: 1, updatedAt: 1 } }).toArray(),
  ]);
  const serialize = (value: unknown) => JSON.parse(JSON.stringify(value));
  return NextResponse.json({ generatedAt: new Date().toISOString(), scope: "company", company: serialize(company), schools: serialize(schools), users: serialize(users), subscriptions: serialize(subscriptions), privacyRequests: serialize(privacyRequests) }, { headers: { "Content-Disposition": `attachment; filename="superpontos-export-${companyId}.json"`, "Cache-Control": "no-store" } });
}
