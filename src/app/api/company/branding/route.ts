import { NextRequest, NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import {
  BRANDING_LOGO_MAX_BYTES,
  detectBrandingImageType,
  resolveEffectiveBranding,
  sanitizeBrandingInput,
} from "@/lib/tenant-branding";

async function context(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) {
    return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }
  if (result.auth.role !== "company_admin" || !result.auth.companyId) {
    return { response: NextResponse.json({ error: "Acesso exclusivo do responsável empresarial." }, { status: 403 }) };
  }
  const companyId = result.auth.companyId;
  const db = (await clientPromise).db(DB_NAME);
  const company = await db.collection("companies").findOne({ _id: companyId });
  if (!company) {
    return { response: NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 }) };
  }
  return { auth: result.auth, companyId, db, company };
}

export async function GET(request: NextRequest) {
  const value = await context(request);
  if ("response" in value) return value.response;
  return NextResponse.json({
    branding: value.company.branding ?? null,
    effectiveBranding: resolveEffectiveBranding(value.company, null),
    allowUnitBranding: value.company.branding?.allowUnitBranding === true,
  });
}

export async function PATCH(request: NextRequest) {
  const value = await context(request);
  if ("response" in value) return value.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const branding = sanitizeBrandingInput(body);
  if (!branding || !body || typeof body !== "object") {
    return NextResponse.json({ error: "Cores inválidas." }, { status: 400 });
  }
  const allowUnitBranding = (body as Record<string, unknown>).allowUnitBranding;
  if (allowUnitBranding !== undefined && typeof allowUnitBranding !== "boolean") {
    return NextResponse.json({ error: "Permissão de unidades inválida." }, { status: 400 });
  }
  const now = new Date();
  const fields: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(branding).map(([key, item]) => [`branding.${key}`, item])),
    "branding.updatedAt": now,
    "branding.updatedBy": value.auth.userId,
    updatedAt: now,
  };
  if (typeof allowUnitBranding === "boolean") {
    fields["branding.allowUnitBranding"] = allowUnitBranding;
  }
  await value.db.collection("companies").updateOne(
    { _id: value.companyId },
    { $set: fields },
  );
  const company = await value.db.collection("companies").findOne({ _id: value.companyId });
  return NextResponse.json({
    message: "Identidade visual da empresa atualizada.",
    branding: company?.branding ?? null,
    effectiveBranding: resolveEffectiveBranding(company, null),
  });
}

export async function POST(request: NextRequest) {
  const value = await context(request);
  if ("response" in value) return value.response;
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Selecione uma imagem." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > BRANDING_LOGO_MAX_BYTES) {
    return NextResponse.json({ error: "A logo deve ter no máximo 512 KB." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedType = detectBrandingImageType(bytes);
  if (!detectedType || detectedType !== file.type.toLowerCase()) {
    return NextResponse.json({ error: "Formato inválido. Envie PNG, JPEG ou WebP válido." }, { status: 400 });
  }
  const extension = detectedType === "image/png" ? "png" : detectedType === "image/webp" ? "webp" : "jpg";
  const pathname = `companies/${value.companyId.toString()}/branding/logo-${crypto.randomUUID()}.${extension}`;
  const blob = await put(pathname, Buffer.from(bytes), {
    access: "public",
    addRandomSuffix: false,
    contentType: detectedType,
  });
  const now = new Date();
  const oldPathname = typeof value.company.branding?.logoPathname === "string"
    ? value.company.branding.logoPathname
    : null;
  await value.db.collection("companies").updateOne(
    { _id: value.companyId },
    { $set: {
      "branding.logoUrl": blob.url,
      "branding.logoPathname": blob.pathname,
      "branding.updatedAt": now,
      "branding.updatedBy": value.auth.userId,
      updatedAt: now,
    } },
  );
  await value.db.collection("brandingAssets").insertOne({
    scope: "company",
    companyId: value.companyId,
    url: blob.url,
    pathname: blob.pathname,
    contentType: detectedType,
    size: file.size,
    createdBy: value.auth.userId,
    createdAt: now,
  });
  if (oldPathname) await del(oldPathname).catch(() => undefined);
  return NextResponse.json({ message: "Logo atualizada.", logoUrl: blob.url }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const value = await context(request);
  if ("response" in value) return value.response;
  const oldPathname = typeof value.company.branding?.logoPathname === "string"
    ? value.company.branding.logoPathname
    : null;
  await value.db.collection("companies").updateOne(
    { _id: value.companyId },
    { $unset: { branding: "" }, $set: { updatedAt: new Date() } },
  );
  if (oldPathname) await del(oldPathname).catch(() => undefined);
  return NextResponse.json({
    message: "Identidade padrão do SUPERPONTOS restaurada.",
    effectiveBranding: resolveEffectiveBranding(null, null),
  });
}
