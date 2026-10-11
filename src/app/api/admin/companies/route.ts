import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { getPlan } from "@/lib/plans";
import { DB_NAME } from "@/lib/saas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (result.auth.role !== "super_admin") return NextResponse.json({ error: "Acesso exclusivo do super administrador." }, { status: 403 });
    const db = (await clientPromise).db(DB_NAME);
    const id = new URL(request.url).searchParams.get("id");
    const filter: Record<string, unknown> = {};
    if (id) {
      if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
      filter._id = new ObjectId(id);
    }
    const companyDocs = await db.collection("companies").find(filter).sort({ createdAt: -1 }).toArray();
    if (id && companyDocs.length === 0) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    const companies = await Promise.all(companyDocs.map(async (company) => {
      const [subscription, schools] = await Promise.all([
        db.collection("subscriptions").findOne({ companyId: company._id }, { sort: { createdAt: -1 } }),
        db.collection("schools").find({ companyId: company._id }, { projection: { name: 1, active: 1 } }).sort({ name: 1 }).toArray(),
      ]);
      const plan = getPlan(subscription?.planCode);
      return {
        id: company._id.toString(),
        cnpj: company.cnpj,
        legalName: company.legalName,
        tradeName: company.tradeName,
        responsible: company.responsible ? {
          name: company.responsible.name,
          email: company.responsible.email,
          role: company.responsible.role,
        } : null,
        status: company.status,
        createdAt: company.createdAt,
        units: schools.map((school) => ({ id: school._id.toString(), name: school.name, active: school.active !== false })),
        unitCount: schools.length,
        subscription: subscription ? {
          planCode: subscription.planCode,
          planName: plan?.name ?? subscription.planCode,
          status: subscription.status,
          maxUnits: Number(subscription.maxUnits ?? 0),
          requestedMaxUnits: Number(subscription.requestedMaxUnits ?? subscription.maxUnits ?? 0),
        } : null,
      };
    }));
    return NextResponse.json(id ? { company: companies[0] } : { companies, total: companies.length });
  } catch (error) {
    console.error("Erro ao consultar empresas:", error);
    return NextResponse.json({ error: "Erro interno ao consultar empresas." }, { status: 500 });
  }
}
