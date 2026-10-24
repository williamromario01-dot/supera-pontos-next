import { NextRequest, NextResponse } from "next/server";
import type { ObjectId } from "mongodb";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { deriveCompanyOnboardingState, onboardingStepForState } from "@/lib/company-onboarding";
import { getPricingQuote } from "@/lib/plans";
import { DB_NAME } from "@/lib/saas";
import { activeSchoolFilter } from "@/lib/schools";
import { getAsaasEnvironment } from "@/lib/asaas";
import { getBillingProviderLink } from "@/lib/billing-provider-links";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const { auth } = result;
    if (auth.role !== "company_admin" || !auth.companyId) {
      return NextResponse.json(
        { error: "Acesso exclusivo do responsável empresarial." },
        { status: 403 },
      );
    }

    const db = (await clientPromise).db(DB_NAME);
    const [company, subscription, schools] = await Promise.all([
      db.collection("companies").findOne({ _id: auth.companyId }),
      db.collection("subscriptions").findOne(
        { companyId: auth.companyId },
        { sort: { createdAt: -1 } },
      ),
      db.collection("schools").find(
        activeSchoolFilter(auth.companyId),
        { projection: { name: 1, address: 1 } },
      ).sort({ createdAt: 1 }).toArray(),
    ]);
    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    }

    const schoolIds = schools.map((school) => school._id as ObjectId);
    const scopedUsers = schoolIds.length ? { schoolId: { $in: schoolIds } } : { _id: { $exists: false } };
    const [admins, educators, students, classes, categories, studentDocs] = await Promise.all([
      db.collection("users").countDocuments({ ...scopedUsers, role: "admin" }),
      db.collection("users").countDocuments({ ...scopedUsers, role: "educator" }),
      db.collection("users").countDocuments({ ...scopedUsers, role: "student" }),
      db.collection("classes").countDocuments(schoolIds.length ? { schoolId: { $in: schoolIds } } : { _id: { $exists: false } }),
      db.collection("categories").countDocuments(schoolIds.length ? { schoolId: { $in: schoolIds } } : { _id: { $exists: false } }),
      db.collection("users").find(
        { ...scopedUsers, role: "student" },
        { projection: { _id: 1 } },
      ).toArray(),
    ]);
    const studentIds = studentDocs.map((student) => student._id);
    const pointEvents = studentIds.length
      ? await db.collection("pointEvents").countDocuments({ studentId: { $in: studentIds } })
      : 0;
    const counts = {
      activeSchools: schools.length,
      admins,
      educators,
      students,
      classes,
      categories,
      pointEvents,
    };
    const environment = getAsaasEnvironment();
    const providerLink = subscription ? await getBillingProviderLink(db, subscription, environment) : null;
    const billingSubscription = subscription && providerLink
      ? { ...subscription, providerCustomerId: providerLink.providerCustomerId, providerSubscriptionId: providerLink.providerSubscriptionId, providerPaymentId: providerLink.providerPaymentId }
      : environment === "production" && subscription
        ? { ...subscription, providerCustomerId: undefined, providerSubscriptionId: undefined, providerPaymentId: undefined }
        : subscription;
    const state = deriveCompanyOnboardingState(company, billingSubscription, counts);
    const pricing = getPricingQuote(subscription?.requestedMaxUnits);

    return NextResponse.json({
      state,
      currentStep: onboardingStepForState(state),
      completed: state === "completed",
      company: {
        legalName: company.legalName,
        tradeName: company.tradeName,
        cnpj: company.cnpj,
        email: company.email,
        phone: company.phone,
        status: company.status,
      },
      plan: pricing ? {
        requestedUnits: pricing.requestedUnits,
        pricePerUnitCents: pricing.pricePerUnitCents,
        totalMonthlyCents: pricing.totalMonthlyCents,
        status: subscription?.status ?? "pending",
        activeUnitsLimit: Number(subscription?.maxUnits ?? 0),
      } : null,
      payment: {
        pending: typeof billingSubscription?.providerPaymentId === "string" && billingSubscription.status !== "active",
      },
      counts,
      schools: schools.map((school) => ({
        id: school._id.toString(),
        name: school.name,
        address: school.address ?? "",
      })),
    });
  } catch (error) {
    console.error("Erro ao carregar onboarding empresarial:", error);
    return NextResponse.json(
      { error: "Erro interno ao carregar a configuração inicial." },
      { status: 500 },
    );
  }
}
