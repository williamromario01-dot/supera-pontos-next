import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import { PLATFORM_BRANDING, resolveEffectiveBranding } from "@/lib/tenant-branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const { auth } = result;
  if (auth.role === "super_admin") {
    return NextResponse.json({
      branding: PLATFORM_BRANDING,
      permissions: { canEditCompany: false, canEditUnit: false },
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const db = (await clientPromise).db(DB_NAME);
  const school = auth.schoolId
    ? await db.collection("schools").findOne(
        {
          _id: auth.schoolId,
          ...(auth.companyId ? { companyId: auth.companyId } : {}),
        },
        { projection: { companyId: 1, branding: 1 } },
      )
    : null;
  const companyId = school?.companyId ?? auth.companyId ?? null;
  const company = companyId
    ? await db.collection("companies").findOne(
        { _id: companyId },
        { projection: { branding: 1 } },
      )
    : null;
  if (!company) {
    return NextResponse.json({
      branding: PLATFORM_BRANDING,
      permissions: { canEditCompany: false, canEditUnit: false },
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({
    branding: resolveEffectiveBranding(company, school),
    permissions: {
      canEditCompany: auth.role === "company_admin",
      canEditUnit: auth.role === "admin" && company.branding?.allowUnitBranding === true,
      canEditUnitDisplayName: auth.role === "admin" && company.branding?.allowUnitDisplayName === true,
      allowUnitBranding: company.branding?.allowUnitBranding === true,
      allowUnitDisplayName: company.branding?.allowUnitDisplayName === true,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
