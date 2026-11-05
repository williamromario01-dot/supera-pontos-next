import { NextRequest, NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { ObjectId } from "mongodb";
import { authenticateRequest, hasSchoolAccess } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import {
  BRANDING_LOGO_MAX_BYTES,
  detectBrandingImageType,
  resolveEffectiveBranding,
  sanitizeBrandingInput,
  validateDisplayName,
  validateShortName,
} from "@/lib/tenant-branding";

type Context = { params: Promise<{ id: string }> };
const UNIT_PATCH_FIELDS = new Set([
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "brandGradientStart",
  "brandGradientEnd",
  "displayName",
  "shortName",
]);

async function routeContext(request: NextRequest, route: Context) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) {
    return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }
  const { id } = await route.params;
  if (
    result.auth.role !== "admin" ||
    !ObjectId.isValid(id) ||
    !hasSchoolAccess(result.auth, id)
  ) {
    return { response: NextResponse.json({ error: "Acesso restrito ao administrador desta unidade." }, { status: 403 }) };
  }
  const schoolId = new ObjectId(id);
  const db = (await clientPromise).db(DB_NAME);
  const school = await db.collection("schools").findOne({
    _id: schoolId,
    ...(result.auth.companyId ? { companyId: result.auth.companyId } : {}),
  });
  if (!school) return { response: NextResponse.json({ error: "Unidade não encontrada." }, { status: 404 }) };
  const company = await db.collection("companies").findOne({ _id: school.companyId });
  if (!company) return { response: NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 }) };
  if (
    company.branding?.allowUnitBranding !== true &&
    company.branding?.allowUnitDisplayName !== true
  ) {
    return { response: NextResponse.json({ error: "A empresa não permite personalização por unidade." }, { status: 403 }) };
  }
  return { auth: result.auth, db, company, school, schoolId };
}

export async function GET(request: NextRequest, route: Context) {
  const value = await routeContext(request, route);
  if ("response" in value) return value.response;
  return NextResponse.json({
    branding: value.school.branding ?? null,
    effectiveBranding: resolveEffectiveBranding(value.company, value.school),
    permissions: {
      canEditVisualBranding: value.company.branding?.allowUnitBranding === true,
      canEditDisplayName: value.company.branding?.allowUnitDisplayName === true,
    },
  });
}

export async function PATCH(request: NextRequest, route: Context) {
  const value = await routeContext(request, route);
  if ("response" in value) return value.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Configuração de identidade inválida." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).length === 0 ||
    Object.keys(input).some((key) => !UNIT_PATCH_FIELDS.has(key))
  ) {
    return NextResponse.json({ error: "Campo de identidade não permitido." }, { status: 400 });
  }
  const colorFields = ["primaryColor", "secondaryColor", "accentColor", "brandGradientStart", "brandGradientEnd"];
  const updatesColors = colorFields.some((key) => Object.hasOwn(input, key));
  const updatesDisplayName = Object.hasOwn(input, "displayName") || Object.hasOwn(input, "shortName");
  if (updatesColors && value.company.branding?.allowUnitBranding !== true) {
    return NextResponse.json({ error: "A empresa não permite cores personalizadas por unidade." }, { status: 403 });
  }
  if (updatesDisplayName && value.company.branding?.allowUnitDisplayName !== true) {
    return NextResponse.json({ error: "A empresa não permite nome interno personalizado por unidade." }, { status: 403 });
  }
  const branding = sanitizeBrandingInput(body);
  if (!branding) return NextResponse.json({ error: "Cores inválidas." }, { status: 400 });
  const displayName = Object.hasOwn(input, "displayName") ? validateDisplayName(input.displayName) : null;
  const shortName = Object.hasOwn(input, "shortName") ? validateShortName(input.shortName) : null;
  if (displayName && !displayName.valid) {
    return NextResponse.json({ error: displayName.error }, { status: 400 });
  }
  if (shortName && !shortName.valid) return NextResponse.json({ error: shortName.error }, { status: 400 });
  const now = new Date();
  const fields: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(branding).map(([key, item]) => [`branding.${key}`, item])),
    "branding.updatedAt": now,
    "branding.updatedBy": value.auth.userId,
    updatedAt: now,
  };
  if (displayName?.valid && displayName.value) {
    fields["branding.displayName"] = displayName.value;
  }
  if (shortName?.valid && shortName.value) fields["branding.shortName"] = shortName.value;
  const update: {
    $set: Record<string, unknown>;
    $unset?: Record<string, "">;
  } = { $set: fields };
  if (displayName?.valid && displayName.value === null) {
    update.$unset = { "branding.displayName": "" };
  }
  if (shortName?.valid && shortName.value === null) update.$unset = { ...update.$unset, "branding.shortName": "" };
  await value.db.collection("schools").updateOne(
    { _id: value.schoolId, companyId: value.school.companyId },
    update,
  );
  const school = await value.db.collection("schools").findOne(
    { _id: value.schoolId, companyId: value.school.companyId },
  );
  return NextResponse.json({
    message: "Identidade visual da unidade atualizada.",
    branding: school?.branding ?? null,
    effectiveBranding: resolveEffectiveBranding(value.company, school),
  });
}

export async function POST(request: NextRequest, route: Context) {
  const value = await routeContext(request, route);
  if ("response" in value) return value.response;
  if (value.company.branding?.allowUnitBranding !== true) {
    return NextResponse.json({ error: "A empresa não permite logo personalizada por unidade." }, { status: 403 });
  }
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma imagem." }, { status: 400 });
  if (file.size <= 0 || file.size > BRANDING_LOGO_MAX_BYTES) {
    return NextResponse.json({ error: "A logo deve ter no máximo 512 KB." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedType = detectBrandingImageType(bytes);
  if (!detectedType || detectedType !== file.type.toLowerCase()) {
    return NextResponse.json({ error: "Formato inválido. Envie PNG, JPEG ou WebP válido." }, { status: 400 });
  }
  const extension = detectedType === "image/png" ? "png" : detectedType === "image/webp" ? "webp" : "jpg";
  const pathname = `schools/${value.schoolId.toString()}/branding/logo-${crypto.randomUUID()}.${extension}`;
  const blob = await put(pathname, Buffer.from(bytes), {
    access: "public",
    addRandomSuffix: false,
    contentType: detectedType,
  });
  const now = new Date();
  const oldPathname = typeof value.school.branding?.logoPathname === "string"
    ? value.school.branding.logoPathname
    : null;
  await value.db.collection("schools").updateOne(
    { _id: value.schoolId, companyId: value.school.companyId },
    { $set: {
      "branding.logoUrl": blob.url,
      "branding.logoPathname": blob.pathname,
      "branding.updatedAt": now,
      "branding.updatedBy": value.auth.userId,
      updatedAt: now,
    } },
  );
  await value.db.collection("brandingAssets").insertOne({
    scope: "unit",
    companyId: value.school.companyId,
    schoolId: value.schoolId,
    url: blob.url,
    pathname: blob.pathname,
    contentType: detectedType,
    size: file.size,
    createdBy: value.auth.userId,
    createdAt: now,
  });
  if (oldPathname) await del(oldPathname).catch(() => undefined);
  return NextResponse.json({ message: "Logo da unidade atualizada.", logoUrl: blob.url }, { status: 201 });
}

export async function DELETE(request: NextRequest, route: Context) {
  const value = await routeContext(request, route);
  if ("response" in value) return value.response;
  if (value.company.branding?.allowUnitBranding !== true) {
    return NextResponse.json({ error: "A empresa não permite restaurar a identidade visual da unidade." }, { status: 403 });
  }
  const oldPathname = typeof value.school.branding?.logoPathname === "string"
    ? value.school.branding.logoPathname
    : null;
  await value.db.collection("schools").updateOne(
    { _id: value.schoolId, companyId: value.school.companyId },
    { $unset: { branding: "" }, $set: { updatedAt: new Date() } },
  );
  if (oldPathname) await del(oldPathname).catch(() => undefined);
  return NextResponse.json({
    message: "A unidade voltou a herdar a identidade da empresa.",
    effectiveBranding: resolveEffectiveBranding(value.company, null),
  });
}
