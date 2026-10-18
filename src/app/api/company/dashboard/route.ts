import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { getPricingQuote, quantityLabel } from "@/lib/plans";
import { DB_NAME } from "@/lib/saas";
import { isSchoolActive } from "@/lib/schools";
import { getSubscriptionAccessState } from "@/lib/subscription-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { auth } = result;
    if (auth.role !== "company_admin" || !auth.companyId) return NextResponse.json({ error: "Acesso exclusivo do responsável empresarial." }, { status: 403 });

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const company = await db.collection("companies").findOne({ _id: auth.companyId });
    if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    const subscription = await db.collection("subscriptions").findOne({ companyId: auth.companyId }, { sort: { createdAt: -1 } });
    const requestedUnits = Number(subscription?.requestedMaxUnits ?? subscription?.maxUnits ?? 0);
    const pricing = getPricingQuote(requestedUnits);
    const requestedSchoolId = new URL(request.url).searchParams.get("schoolId");
    const schoolFilter: Record<string, unknown> = { companyId: auth.companyId };
    if (requestedSchoolId) {
      if (!ObjectId.isValid(requestedSchoolId)) return NextResponse.json({ error: "Unidade inválida." }, { status: 400 });
      schoolFilter._id = new ObjectId(requestedSchoolId);
    }
    const schoolDocs = await db.collection("schools").find(schoolFilter).sort({ name: 1 }).toArray();
    if (requestedSchoolId && schoolDocs.length === 0) return NextResponse.json({ error: "Unidade não encontrada nesta empresa." }, { status: 404 });

    const schools = await Promise.all(schoolDocs.map(async (school) => {
      const [students, educators, classes, studentDocs] = await Promise.all([
        db.collection("users").countDocuments({ schoolId: school._id, role: "student" }),
        db.collection("users").countDocuments({ schoolId: school._id, role: "educator" }),
        db.collection("classes").countDocuments({ schoolId: school._id }),
        db.collection("users").find({ schoolId: school._id, role: "student" }, { projection: { _id: 1 } }).toArray(),
      ]);
      const studentIds = studentDocs.map((student) => student._id);
      const totals = studentIds.length
        ? await db.collection("pointEvents").aggregate([
            { $match: { studentId: { $in: studentIds } } },
            { $group: { _id: null, points: { $sum: "$points" } } },
          ]).toArray()
        : [];
      return {
        id: school._id.toString(),
        name: school.name,
        description: school.description ?? "",
        address: school.address ?? "",
        status: school.status === "archived" ? "archived" : "active",
        active: isSchoolActive(school),
        archivedAt: school.archivedAt ?? null,
        metrics: { students, educators, classes, pointsDistributed: Number(totals[0]?.points ?? 0) },
      };
    }));
    const metrics = schools.reduce((total, school) => ({
      students: total.students + school.metrics.students,
      educators: total.educators + school.metrics.educators,
      classes: total.classes + school.metrics.classes,
      pointsDistributed: total.pointsDistributed + school.metrics.pointsDistributed,
    }), { students: 0, educators: 0, classes: 0, pointsDistributed: 0 });
    const access = getSubscriptionAccessState(subscription);

    return NextResponse.json({
      company: {
        id: company._id.toString(), cnpj: company.cnpj, legalName: company.legalName,
        tradeName: company.tradeName, email: company.email, phone: company.phone,
        status: company.status,
        responsible: company.responsible ? {
          name: company.responsible.name,
          email: company.responsible.email,
          phone: company.responsible.phone,
          role: company.responsible.role,
        } : null,
      },
      subscription: subscription ? {
        id: subscription._id.toString(), planCode: subscription.planCode,
        planName: requestedUnits > 0 ? quantityLabel(requestedUnits) : subscription.planCode, status: subscription.status,
        maxUnits: Number(subscription.maxUnits ?? 0),
        requestedMaxUnits: requestedUnits,
        pricePerUnitCents: Number(subscription.pricePerUnitCents ?? pricing?.pricePerUnitCents ?? 0),
        totalMonthlyCents: Number(subscription.totalMonthlyCents ?? pricing?.totalMonthlyCents ?? 0),
        billingInterval: subscription.billingInterval,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      } : null,
      access: {
        state: access.state,
        daysPastDue: access.daysPastDue,
        gracePeriodEndsAt: access.gracePeriodEndsAt,
        cancellationEffectiveAt: access.cancellationEffectiveAt,
      },
      usage: { usedUnits: schools.filter((school) => school.active).length, maxUnits: Number(subscription?.maxUnits ?? 0) },
      metrics,
      schools,
    });
  } catch (error) {
    console.error("Erro no painel empresarial:", error);
    return NextResponse.json({ error: "Erro interno ao carregar o painel empresarial." }, { status: 500 });
  }
}
